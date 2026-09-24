## ADDED Requirements

### Requirement: Title chunk for chapter heading semantics

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

### Requirement: Online TF-IDF weighting for keyword scoring

The system SHALL compute per-query unit IDF weights online from the loaded book chunks and apply them in keyword scoring, replacing the fixed `PROPER_NOUN_BOOST` for non-identifier units in the chapter retrieval path.

#### Scenario: IDF computation per query

- **GIVEN** a query Q and the book's loaded chunks (content + title) for `queryChapters`
- **WHEN** the system computes IDF
- **THEN** for every non-identifier unit in `extractQueryUnits(Q)`, the system SHALL count `df` = number of distinct chapters whose ANY chunk's `textSnippet` contains the unit (case-insensitive)
- **AND** `idf = log((N+1) / (df+1)) / log(N+1)` where `N` is the total number of chapters with chunks
- **AND** the resulting weights map SHALL be in the range `[0, 1]`, with rare units close to 1 and units appearing in every chapter close to 0
- **AND** identifier units (Arabic / Chinese numerals / circled / Roman) SHALL NOT receive an IDF entry — they continue to use `IDENTIFIER_BOOST`

#### Scenario: IDF weight applied as unit multiplier

- **GIVEN** a query unit U with computed `idf` weight, AND a hit (`unitScore > 0`) in the haystack
- **WHEN** the per-unit multiplier is selected
- **THEN** the multiplier SHALL be `0.5 + 1.5 × idf`, mapping idf 0→0.5× (suppress common words) and idf 1→2.0× (boost rare words)
- **AND** the multiplier SHALL be applied via `unitScore = min(1, unitScore × multiplier)` (clamp at 1)

#### Scenario: Multiplier priority is mutually exclusive

- **GIVEN** a query unit U
- **WHEN** the per-unit multiplier is selected
- **THEN** priority SHALL be: identifier → idfWeights → properNouns (each takes precedence over the next; **no compounding**)
- **AND** when both `idfWeights` and `properNouns` would apply, only `idfWeights` is used (data-driven supersedes config-driven for the chapter retrieval path)
- **AND** when neither IDF nor properNouns apply, multiplier defaults to 1 (raw match score)

### Requirement: Identifier-aware keyword extraction and mismatch penalty

The system SHALL recognize chapter / volume identifiers (Arabic numerals, Chinese numerals, circled numbers ① – ⑳, Roman numerals Ⅰ – Ⅹ) as a distinct strong-signal class in keyword scoring, AND SHALL penalize chapters whose title misses identifiers that appear in the query.

#### Scenario: Single-character identifiers are emitted as keyword units

- **GIVEN** a query containing a circled number such as `⑥` or a Roman numeral such as `Ⅴ`
- **WHEN** the system extracts query units for keyword scoring
- **THEN** the identifier character SHALL be emitted as its own unit despite being one character long
- **AND** the partial-match routine SHALL accept length-1 units via direct `includes` check (the `length >= 2` filter SHALL apply only to general CJK / alphanumeric runs)

#### Scenario: Identifier hits are boosted above proper-noun hits

- **GIVEN** a query unit that satisfies `isIdentifierUnit` (Arabic / Chinese numeral / circled / Roman) AND that hits the haystack
- **WHEN** the per-unit score is computed
- **THEN** the unit's match score SHALL be multiplied by `IDENTIFIER_BOOST = 3.0` and clamped to `[0, 1]`
- **AND** when the same unit also matches the proper-noun set, the boost taken SHALL be `max(IDENTIFIER_BOOST, PROPER_NOUN_BOOST)`, not the product (no compounding)

#### Scenario: Chapter missing query identifier is penalized

- **GIVEN** a query that contains at least one identifier (extracted via the same identifier rules) AND a candidate chapter
- **WHEN** the candidate chapter's title (chapter title + volume title, lowercased) does NOT contain ALL of those identifiers
- **THEN** that chapter's `total` score SHALL be multiplied by `IDENTIFIER_MISMATCH_PENALTY = 0.3`
- **AND** when the title contains all identifiers, no penalty SHALL be applied
- **AND** when the query contains no identifiers, no penalty path SHALL be reached (regression guarantee for non-numeric queries)

### Requirement: Chapter chunks use a separate version identifier

The system SHALL track chapter chunks under a `CHAPTER_MODEL_VERSION` distinct from the shared `MODEL_VERSION`, so that chunking-strategy changes (target size, splitting rules) trigger chapter re-embedding without invalidating memory embeddings.

#### Scenario: Chapter chunks store CHAPTER_MODEL_VERSION

- **WHEN** the system writes a chapter chunk via `writeChunksForChapter`
- **THEN** the `model` field SHALL be `${MODEL_VERSION}@${CHAPTER_CHUNK_LAYOUT_VERSION}` (e.g., `gte-multilingual-base@256@mean@cs400`)
- **AND** memory embeddings continue to write `model: MODEL_VERSION` (no chunking suffix)

#### Scenario: queryChapters and backlog scan compare against CHAPTER_MODEL_VERSION

- **WHEN** filtering chunks for query or detecting stale records
- **THEN** the comparison SHALL use `CHAPTER_MODEL_VERSION` (not the bare `MODEL_VERSION`)
- **AND** chunks with old chunking layout SHALL be treated as stale and re-enqueued by the backlog scan

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
  - a `properNouns` set: every non-empty trimmed `name`, `translation.translation`, and `aliases[].name` / `aliases[].translation.translation` from terminologies and characterSettings
  - `aliasGroups`: each terminology / character contributes one synonym group containing all of its name forms (Japanese name + Chinese translation + each alias's name + each alias's translation)
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

## MODIFIED Requirements

### Requirement: Chunk segmentation rules

The system SHALL split chapter content into chunks along paragraph boundaries with a target size of approximately 400 characters (paragraph-level granularity, typically 1–3 paragraphs per chunk).

#### Scenario: Accumulate paragraphs up to target size

- **GIVEN** a chapter with multiple paragraphs
- **WHEN** building chunks
- **THEN** the system accumulates paragraphs until the running character count reaches or exceeds the `CHUNK_TARGET_CHARS` target (400)
- **AND** the next paragraph starts a new chunk
- **AND** individual paragraphs are never split across chunks

#### Scenario: Oversized paragraph becomes a single chunk

- **GIVEN** a paragraph whose text exceeds `CHUNK_TARGET_CHARS`
- **WHEN** building chunks
- **THEN** the paragraph occupies its own chunk
- **AND** no chunk merging or truncation is performed at the paragraph level

### Requirement: Chapter chunk embedding storage

The system SHALL store per-chapter embeddings as multiple chunk vectors in a dedicated IndexedDB object store independent from the Book / Chapter object graph. Each chunk SHALL be tagged with a `kind` discriminator distinguishing title chunks from content chunks.

#### Scenario: Store chunk vector with metadata

- **GIVEN** a chapter has been processed by the embedding pipeline
- **WHEN** a chunk vector is persisted
- **THEN** the record includes `chapterId`, `bookId`, `kind` (`'content' | 'title'`), `chunkIndex`, 256-dimensional `vector`, `textSnippet` of the chunk's first 200 characters, `model` (the embedding model version), and `updatedAt` timestamp
- **AND** the record is keyed by `${chapterId}:${kind}:${chunkIndex}`
- **AND** the store exposes indexes `by-chapterId` and `by-bookId` for efficient lookup

#### Scenario: Schema migration from v10 to v11

- **GIVEN** an existing IndexedDB at version 10 with `chapter-embeddings` records keyed by `${chapterId}:${chunkIndex}` and lacking the `kind` field
- **WHEN** the database opens at version 11
- **THEN** the upgrade transaction SHALL iterate every existing record
- **AND** assign `kind: 'content'` to each
- **AND** rewrite each under the new key `${chapterId}:content:${chunkIndex}`
- **AND** the `by-chapterId` and `by-bookId` indexes SHALL continue to function (field names unchanged)
- **AND** the entire migration SHALL execute within a single upgrade transaction; any failure rolls back to v10

#### Scenario: Embeddings are not part of book serialization

- **GIVEN** chapter embeddings exist in the local database
- **WHEN** the system serializes a book for Gist sync or JSON export
- **THEN** chapter embeddings SHALL NOT be included in the serialized output
- **AND** no embedding data leaves the device via sync

### Requirement: query_chapter AI tool

The system SHALL expose an AI tool named `query_chapter` that performs hybrid (semantic + keyword) search over a book's chapter embeddings.

#### Scenario: Tool schema

- **GIVEN** the AI task supports book tools
- **WHEN** the tool set is registered
- **THEN** `query_chapter` accepts `{ query: string, limit?: number }` with default `limit` of 5
- **AND** the tool is scoped to the current book via the handler's injected `bookId`

#### Scenario: Hybrid ranking pipeline

- **GIVEN** a user-provided natural-language query
- **WHEN** `query_chapter` executes
- **THEN** the query is embedded using the same model/version as the stored chunks
- **AND** for each chapter the system computes a `total` score per the "Hybrid scoring for chapter retrieval" requirement
- **AND** the top `limit` chapters are returned ordered by descending `total`

#### Scenario: Response shape

- **GIVEN** a successful hybrid search
- **WHEN** building the tool response
- **THEN** each match returns `{ chapter_id, title, score, preview }`
- **AND** `score` is the hybrid `total` (range `[0, 1]`)
- **AND** `preview` is the `textSnippet` of the highest-scoring content chunk in that chapter (or the title chunk's snippet when no content chunks exist)
- **AND** the response is a JSON-serializable object

#### Scenario: Embedding service unavailable

- **GIVEN** the embedding service is not ready or has failed to load
- **WHEN** `query_chapter` is invoked
- **THEN** the tool returns a structured error indicating the service is unavailable
- **AND** the tool does not crash the surrounding AI task

#### Scenario: All chunks are stale (model version mismatch)

- **GIVEN** every chunk in the book has a `model` field different from the current `MODEL_VERSION`
- **WHEN** `query_chapter` is invoked
- **THEN** the tool returns a structured error indicating the chapter vector space is being rebuilt
- **AND** the error message instructs the user to retry later or check the rebuild progress

### Requirement: Embedding input composition

The system SHALL compose each `content` chunk's embedding input by concatenating original text and selected translation per paragraph. Title chunks follow the separate "Title chunk for chapter heading semantics" requirement.

#### Scenario: Paragraph has selected translation

- **GIVEN** a paragraph with a non-empty `selectedTranslationId` pointing to a translation
- **WHEN** composing a content chunk's embedding input
- **THEN** the paragraph contributes `${originalText}\n${selectedTranslationText}` to the input
- **AND** paragraphs within a chunk are joined by blank lines

#### Scenario: Paragraph lacks translation

- **GIVEN** a paragraph with no translation or an empty selected translation
- **WHEN** composing a content chunk's embedding input
- **THEN** the paragraph contributes only its original text
- **AND** the chapter remains searchable via original-language queries

### Requirement: Backlog scan on model change or first launch

The system SHALL scan for missing or stale chapter embeddings — including missing title chunks — and enqueue them without blocking the UI.

#### Scenario: First load of a book after feature adoption

- **GIVEN** a book whose chapters have no embeddings yet
- **WHEN** the book detail page loads
- **THEN** the system scans all chapters of that book
- **AND** chapters without embeddings are enqueued in background

#### Scenario: Embedding model version upgrade

- **GIVEN** the persisted chunk records have a `model` field different from the current `MODEL_VERSION`
- **WHEN** a book is opened
- **THEN** chapters with stale chunks are enqueued for re-embedding
- **AND** stale records are replaced atomically per chapter on completion

#### Scenario: Missing title chunk after backfill

- **GIVEN** a chapter with up-to-date content chunks (matching `MODEL_VERSION`) but lacking a title chunk
- **WHEN** the backlog scan runs
- **THEN** the chapter SHALL be enqueued for full re-embedding
- **AND** the resulting embed operation SHALL produce both a fresh title chunk and refreshed content chunks atomically
- **AND** chapters that genuinely have no non-empty paragraphs (cannot produce a title chunk) SHALL NOT be re-enqueued repeatedly
