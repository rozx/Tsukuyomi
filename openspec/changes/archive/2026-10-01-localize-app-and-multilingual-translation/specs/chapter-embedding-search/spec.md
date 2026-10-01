## MODIFIED Requirements

### Requirement: Embedding input composition

The system SHALL compose each `content` chunk's embedding input by concatenating original text and selected translation for the cache's target language per paragraph; translations in other languages SHALL be excluded. Title chunks follow the separate "Title chunk for chapter heading semantics" requirement.

#### Scenario: Paragraph has selected translation

- **GIVEN** a paragraph with a non-empty language-specific selection pointing to a translation in that same target language
- **WHEN** composing a content chunk's embedding input
- **THEN** the paragraph contributes `${originalText}\n${selectedTranslationText}` to the input
- **AND** paragraphs within a chunk are joined by blank lines

#### Scenario: Paragraph lacks translation

- **GIVEN** a paragraph with no translation or an empty selected translation
- **WHEN** composing a content chunk's embedding input
- **THEN** the paragraph contributes only its original text
- **AND** the chapter remains searchable via original-language queries

### Requirement: Hybrid scoring for chapter retrieval

The system SHALL compute chapter retrieval scores by combining a population-aware semantic signal and a literal keyword signal, replacing the previous pure max-cosine ranking.

#### Scenario: Per-chunk semantic normalization

- **GIVEN** a query embedded with the current `MODEL_VERSION`
- **WHEN** the system computes raw cosine similarity for every chunk in the book (both `content` and `title` kinds whose `model` matches `MODEL_VERSION`)
- **THEN** the system SHALL z-score normalize the raw similarities across the entire chunk pool
- **AND** the normalized values SHALL be mapped to `[0, 1]` via `(z + Z_CLAMP) / (2 × Z_CLAMP)` clamped to the bounds, where `Z_CLAMP = 2`
- **AND** if there are fewer than 2 valid chunks, OR the standard deviation of raw cosines is below `SPREAD_FLOOR = 0.02`, the normalized semantic SHALL be 0 for the entire batch (signaling semantic-unusable, fall back to keyword-only)

#### Scenario: Per-chapter semantic aggregation (title vs content, content blends max with top-K mean)

- **GIVEN** the per-chunk normalized semantic values for a chapter
- **WHEN** the system aggregates to the chapter level
- **THEN** `content_semantic` SHALL be `α × content_max + (1 - α) × content_top3_mean` with `α = 0.6` (or 0 if there are no content chunks)
- **AND** `content_max` is the maximum normalized similarity over content chunks
- **AND** `content_top3_mean` is the mean of the top-`min(3, N)` content chunk normalized similarities
- **AND** the chapter's `semantic` score SHALL be `max(title_norm, content_semantic)`
- **AND** `title_norm` is the normalized similarity of that chapter's title chunk (0 if no title chunk exists)
- **AND** because `top3_mean ≤ max` within a chapter, max-of-three-tracks would never let the "broadly relevant" signal surface — the linear blend at the content level is what gives top3_mean real weight

#### Scenario: Per-chapter keyword scoring with alias-expanded query and proper-noun boost

- **GIVEN** a query string, a book with `terminologies` and `characterSettings` (each may have `aliases`), and a chapter with title `T`, optional volume title `V`, and content chunks with `textSnippet`
- **WHEN** the system computes the keyword signal
- **THEN** the system SHALL build an alias index from the book containing:
  - a `properNouns` set: every non-empty original name plus selected-target-language terminology, character and alias translation from the book; translations in other languages SHALL be excluded
  - `aliasGroups`: each terminology / character contributes one synonym group containing its original name forms and the requested target language's translated name forms
- **AND** the system SHALL alias-expand the query: for every group whose name forms appear as a substring of the original query, append all OTHER forms in the group to the query string (separated by spaces) so that a Chinese query mentioning "莉莉花园" also matches a chunk containing "リリーガーデン" (and vice versa)
- **AND** during keyword scoring, when a query unit (CJK run / alphanumeric word) is itself a member of `properNouns`, that unit's per-unit match score SHALL be multiplied by `PROPER_NOUN_BOOST = 2.0` and clamped to `[0, 1]`
- **AND** `title_kw` SHALL be the keyword score of the alias-expanded query against `"${T} ${V}".trim()` with proper-noun boost applied
- **AND** `content_kw` SHALL be `max over content chunks of` the keyword score of the alias-expanded query against `chunk.textSnippet` with proper-noun boost applied (0 if no content chunks)
- **AND** the chapter's `keyword` score SHALL be `min(1, title_kw + content_kw × 0.4)` — title and content hits add (capped at 1.0), so a chapter that hits in BOTH title and content scores higher than one that only hits title
- **AND** when the book has no terminologies and no characterSettings, the alias index is empty, alias-expansion is a no-op, no unit is boosted, and the keyword formula degrades to behave as before (title-only or content-only hits still score correctly)

#### Scenario: Final score and ranking

- **GIVEN** per-chapter `semantic` and `keyword` values
- **WHEN** the system computes the final ranking score
- **THEN** `total = 0.65 × semantic + 0.35 × keyword`
- **AND** chapters SHALL be ranked by `total` descending
- **AND** the top `limit` chapters SHALL be returned

#### Scenario: Preview selection

- **GIVEN** a chapter selected as a top match
- **WHEN** the response includes a `preview` field
- **THEN** the preview SHALL be the `textSnippet` of the highest-scoring **content** chunk in that chapter
- **AND** when no content chunks exist (only a title chunk), the preview SHALL be the title chunk's `textSnippet`

### Requirement: Title chunk for chapter heading semantics

Title text SHALL resolve from the same target language used for the content cache, falling back to the original title when that language has no translation; title chunk metadata SHALL identify that language.

The system SHALL embed each chapter's title together with its first paragraph as a dedicated `title` chunk, distinct from the content chunks, to support title-driven and theme-driven semantic queries.

#### Scenario: Compose title chunk input

- **GIVEN** a chapter with a non-empty title and at least one non-empty paragraph
- **WHEN** the system embeds the chapter
- **THEN** the title chunk's embedding input SHALL be `[章] ${chapterTitle}\n\n${firstNonEmptyParagraphText}` truncated to 300 characters
- **AND** "first non-empty paragraph" SHALL skip leading empty/whitespace-only paragraphs
- **AND** the volume title SHALL NOT be included in the embedding input (it is reserved for the keyword channel)

#### Scenario: Title chunk persistence

- **WHEN** a title chunk is persisted
- **THEN** the record SHALL have `kind: 'title'`, `chunkIndex: 0`
- **AND** the record SHALL be keyed by `${chapterId}:title:0`
- **AND** the record SHALL include the same `chapterId`, `bookId`, 256-dimensional `vector`, `textSnippet` (first 200 chars of the embedded text), `model`, `updatedAt` fields as content chunks

#### Scenario: Chapter without paragraphs

- **GIVEN** a chapter with no non-empty paragraphs
- **WHEN** the system attempts to embed the chapter
- **THEN** no title chunk SHALL be persisted for that chapter
- **AND** the absence is not treated as an error

#### Scenario: Chapter with paragraphs but empty title

- **GIVEN** a chapter whose title is empty or whitespace-only
- **WHEN** the system embeds the chapter
- **THEN** the title chunk's embedding input SHALL be only `${firstNonEmptyParagraphText}` (no `[章]` prefix when title is missing)
- **AND** the title chunk SHALL still be persisted for content-driven heading retrieval

## ADDED Requirements

### Requirement: 章节检索缓存具有语言归属

章节向量、标题及片段缓存 SHALL 标记其目标语言及相关内容版本；每次查询现算的别名索引 SHALL 使用执行目标语言；仅匹配查询执行目标语言的缓存可参与检索。书籍目标改变后 SHALL 使不匹配缓存失效并通过现有后台队列重建，查询 SHALL 明确返回重建/不可用状态而不泄漏其他语言片段。共享记忆向量 SHALL 保留。

#### Scenario: 目标语言变化后查询

- **GIVEN** 缓存包含简中译文，书籍目标已切英文
- **WHEN** 英文任务查询章节
- **THEN** SHALL 使用英文缓存或返回重建状态，不能把简中片段当作英文参考

#### Scenario: 旧任务仍查询旧目标

- **GIVEN** 英文任务仍在运行，书籍切繁中且缓存已重建为繁中
- **WHEN** 旧任务执行章节语义查询
- **THEN** SHALL 明确表示英文缓存不可用，并允许任务用原文及英文读取工具继续，不使用繁中缓存代替

#### Scenario: 旧语言计算晚于新语言完成

- **GIVEN** 英文向量开始计算后书籍切换繁中，新的繁中向量已完成
- **WHEN** 旧英文计算尝试提交
- **THEN** 系统 SHALL 核对语言和输入版本并丢弃过时结果，不覆盖当前繁中缓存
