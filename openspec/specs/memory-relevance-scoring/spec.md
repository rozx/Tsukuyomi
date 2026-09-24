# memory-relevance-scoring Specification

## Purpose
定义翻译上下文注入记忆时的相关性打分与选取（`memory-scoring.ts`）：语义、关键词、时间衰减三信号融合，语义不可用时降级为关键词 + 时间衰减，再经绝对阈值、相对排名和字符预算三道筛选决定注入哪些记忆。

## Requirements

### Requirement: Three-signal relevance score

Each memory SHALL receive a `ScoreBreakdown` with raw `semantic`, `keyword`, and `recency` signals, their weighted values, and a `total` in `[0, 1]`.

#### Scenario: Semantic mode weights

- **GIVEN** query embeddings are available for the chunk
- **WHEN** memories are scored
- **THEN** `total = 0.85 × semantic + 0.10 × keyword + 0.05 × recency`
- **AND** `scoringMode` is `'semantic'`

#### Scenario: Fallback mode weights

- **GIVEN** no query embeddings are available (embedding disabled, not ready, or the semantic sub-switch is off)
- **WHEN** memories are scored
- **THEN** `semanticWeighted` is 0 and `total = 0.75 × keyword + 0.25 × recency`
- **AND** `scoringMode` is `'fallback'`

#### Scenario: Recency decay

- **GIVEN** a memory whose `lastAccessedAt` is `ageDays` in the past
- **WHEN** its recency signal is computed
- **THEN** `recency = exp(-ageDays / 30)`, falling back to `createdAt` when `lastAccessedAt` is missing

### Requirement: Semantic signal from segmented embeddings

The semantic signal SHALL compare the memory's segment vectors with the query segment vectors, and only vectors produced by the current embedding version SHALL count.

#### Scenario: Summary and content segments

- **GIVEN** a memory whose first vector is its summary and the rest are content segments
- **WHEN** similarity to one query vector is computed
- **THEN** the score is `max(summarySimilarity, 0.7 × bestContent + 0.3 × secondBestContent)`

#### Scenario: Multiple query vectors

- **GIVEN** several query vectors (chapter title context plus chunk segments)
- **WHEN** the memory's semantic similarity is aggregated
- **THEN** it equals `0.6 × bestQueryScore + 0.4 × meanQueryScore`

#### Scenario: Outdated memory embedding

- **GIVEN** a memory whose `embeddingModel` differs from the current memory embedding version
- **WHEN** it is scored in semantic mode
- **THEN** its semantic signal is 0

### Requirement: Batch scoring calibrates ranks

When scoring all memories of a book together, the system SHALL convert semantic and keyword signals into rank-fusion scores and SHALL calibrate the semantic rank by absolute and relative confidence.

#### Scenario: Semantic confidence calibration

- **GIVEN** raw cosine similarities for a batch of memories
- **WHEN** the semantic signal is computed
- **THEN** it is the normalized RRF rank score (`k = 10`) multiplied by a confidence that is 0 at or below cosine 0.3 and saturates at 0.65
- **AND** for batches of 4 or more, the confidence is further scaled by how far the value is above the batch median (full at +0.08)

#### Scenario: Keyword rank fusion

- **GIVEN** raw keyword hit ratios for a batch of memories
- **WHEN** the keyword contribution is computed
- **THEN** it is the raw hit ratio multiplied by its normalized RRF rank score and the mode's keyword weight
- **AND** memories with no keyword hit get no keyword contribution

### Requirement: Keyword signal

The keyword signal SHALL be the stronger of the entity hit ratio and the natural-language query score.

#### Scenario: Entity and query sources

- **GIVEN** the chunk's terms, characters, and character aliases, and an optional chapter-level query text
- **WHEN** a memory's keyword signal is computed
- **THEN** it is `max(entityHitRatio, queryKeywordScore)`
- **AND** `entityHitRatio` is the fraction of entity names that appear literally in the memory's summary or content
- **AND** `queryKeywordScore` matches query units against the memory, weighting summary hits 1.0 and content hits 0.5

### Requirement: Selection pipeline

Memories SHALL be selected for injection by an absolute threshold, then relative ranking, then a character budget.

#### Scenario: Absolute threshold

- **GIVEN** scored memories
- **WHEN** selection starts
- **THEN** memories with `total` below `minScoreThreshold` (default 0.3) are discarded

#### Scenario: Relative ranking

- **GIVEN** memories that passed the absolute threshold
- **WHEN** relative ranking is applied
- **THEN** only the top 8 by `total` are kept
- **AND** any of those scoring more than 0.06 below the top score are discarded

#### Scenario: Character budget

- **GIVEN** the ranked candidates
- **WHEN** they are filled greedily in score order
- **THEN** filling stops once the summaries would exceed `charBudget` (default 2000 characters) or 25 items
- **AND** the first candidate is always kept even if it alone exceeds the budget

#### Scenario: No relevant memories

- **GIVEN** no memory passes the threshold
- **WHEN** selection finishes
- **THEN** no memories are injected; the system does not pad the list with recently accessed memories

### Requirement: User-configurable injection settings

`settings.memoryInjection` SHALL let the user set `charBudget`, `minScoreThreshold`, and `enableSemantic`.

#### Scenario: Settings override defaults

- **GIVEN** the user set a positive `charBudget` or a numeric `minScoreThreshold`
- **WHEN** memories are selected
- **THEN** those values replace the defaults

#### Scenario: Semantic sub-switch off

- **GIVEN** `memoryInjection.enableSemantic` is `false`
- **WHEN** memories are scored
- **THEN** no query embeddings are computed and scoring runs in fallback mode
