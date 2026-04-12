## ADDED Requirements

### Requirement: Three-signal memory relevance scoring

The system SHALL compute a relevance score for each candidate memory using a weighted combination of three signals: semantic similarity, keyword hit ratio, and recency decay.

#### Scenario: Score combines all three signals

- **GIVEN** a candidate memory and a chunk of text being translated
- **WHEN** the scoring function is invoked
- **THEN** the score equals `3.0 × semanticSim + 2.0 × keywordHitRatio + 1.0 × recencyFactor`
- **AND** the result is a non-negative number with theoretical maximum of `1.0`

#### Scenario: Keyword hit ratio counts chunk entity names found in memory text

- **GIVEN** the chunk contains entity names `['田中', '魔法学院']` extracted from the book's terminologies and characterSettings tables
- **AND** a memory's `summary + content` contains the substring `田中` but not `魔法学院`
- **WHEN** keywordHitRatio is computed
- **THEN** the value is `0.5`

#### Scenario: Keyword hit ratio handles chunk with no known entities

- **GIVEN** the chunk contains no entities found in the book's terminologies or characterSettings tables
- **WHEN** keywordHitRatio is computed
- **THEN** the value is `0`
- **AND** scoring proceeds normally using the other two signals

#### Scenario: Recency factor applies exponential decay

- **GIVEN** a memory with `lastAccessedAt = now - 30 days`
- **WHEN** recencyFactor is computed
- **THEN** the value is approximately `exp(-1) ≈ 0.368`

#### Scenario: Recency factor for fresh memory approaches 1

- **GIVEN** a memory with `lastAccessedAt ≈ now`
- **WHEN** recencyFactor is computed
- **THEN** the value is approximately `1.0`

#### Scenario: Semantic similarity with missing embedding degrades to zero

- **GIVEN** a memory has no `embedding` field or `embeddingModel` does not match the current model version
- **WHEN** semanticSim is computed
- **THEN** the value is `0`
- **AND** the memory is still eligible for selection based on keyword and recency signals

#### Scenario: Semantic similarity uses cosine between normalized vectors

- **GIVEN** both the chunk embedding and memory embedding are L2-normalized 256-dimensional vectors
- **WHEN** semanticSim is computed
- **THEN** the value equals the dot product of the two vectors
- **AND** the value is clamped to the range `[0, 1]`

### Requirement: Minimum score threshold filters noise

The system SHALL discard candidate memories whose total score falls below a configurable minimum threshold.

#### Scenario: Memory below threshold is excluded

- **GIVEN** a memory's total score is `0.2`
- **AND** the configured `minScoreThreshold` is `0.3`
- **WHEN** the memory is evaluated for injection
- **THEN** the memory is excluded from the final selection

#### Scenario: Memory at or above threshold is eligible

- **GIVEN** a memory's total score is `0.3`
- **AND** the configured `minScoreThreshold` is `0.3`
- **WHEN** the memory is evaluated for injection
- **THEN** the memory is eligible for budget-based selection

#### Scenario: Default threshold reflects three-signal maximum

- **GIVEN** no user override has been applied to the threshold
- **WHEN** the scoring system initializes
- **THEN** `minScoreThreshold` defaults to `0.3`
- **AND** this default represents approximately 5% of the theoretical maximum score (1.0)

### Requirement: Character budget controls injection size

The system SHALL limit the total characters of injected memory summaries using a configurable budget, selecting by descending score until the budget is exhausted.

#### Scenario: Greedy fill respects character budget

- **GIVEN** eligible memories sorted by score descending
- **AND** a character budget of 2000
- **WHEN** the selection fills memories one by one
- **THEN** adding a memory that would exceed 2000 characters stops the selection
- **AND** all previously added memories remain selected

#### Scenario: Hard item cap prevents pathological overflow

- **GIVEN** a character budget large enough to fit more than 25 memories
- **WHEN** the selection fills memories
- **THEN** the selection stops at 25 items regardless of remaining budget

#### Scenario: Budget is user-configurable

- **GIVEN** the user sets `memoryInjection.charBudget` to `3500`
- **WHEN** the injection logic runs
- **THEN** the character budget used is `3500`

### Requirement: Empty-selection fallback preserves baseline context

The system SHALL provide fallback memories when scoring produces no eligible candidates, ensuring the AI has some context.

#### Scenario: All candidates filtered by threshold

- **GIVEN** all candidate memories score below `minScoreThreshold`
- **WHEN** the injection logic completes selection
- **THEN** the system falls back to the 5 most recently accessed memories for the book
- **AND** these fallback memories are injected regardless of score

#### Scenario: Book has no memories at all

- **GIVEN** the book has zero memories
- **WHEN** the injection logic runs
- **THEN** the returned context string is empty
- **AND** no `【相关记忆】` header is included

### Requirement: Graceful degradation when semantic embedding unavailable

The system SHALL compute scores correctly when the semantic signal is unavailable for any reason.

#### Scenario: Semantic retrieval disabled in settings

- **GIVEN** the user has set `memoryInjection.enableSemantic = false`
- **WHEN** memories are scored
- **THEN** `semanticSim` is treated as `0` for all memories
- **AND** keyword and recency signals are computed normally
- **AND** the theoretical maximum score reduces to `2.0 + 1.0 = 3.0`

#### Scenario: Embedding model failed to load

- **GIVEN** `EmbeddingService` is in a failed state after attempting to load
- **WHEN** memories are scored
- **THEN** the scoring proceeds without semantic similarity
- **AND** the translation task is not blocked by the failure

### Requirement: User-configurable injection settings

The system SHALL expose character budget, semantic enablement, and minimum score threshold as user-adjustable settings.

#### Scenario: Settings persist across sessions

- **GIVEN** the user adjusts `memoryInjection.charBudget` in the settings dialog
- **WHEN** the settings dialog is closed and the app is reopened
- **THEN** the previously set budget value is still in effect

#### Scenario: Advanced settings are collapsed by default

- **GIVEN** the user opens the memory injection settings tab
- **WHEN** the tab first renders
- **THEN** the `minScoreThreshold` control is hidden inside a collapsed "高级选项" section
- **AND** the character budget and semantic toggle are immediately visible

### Requirement: Score breakdown data structure

The system SHALL produce a structured score breakdown for each selected memory, recording both raw signal values and their weighted contributions.

#### Scenario: Breakdown records all three signals

- **GIVEN** a memory was selected via the scoring system
- **WHEN** the score breakdown is constructed
- **THEN** it contains numeric fields `semantic`, `keyword`, `recency` for raw values
- **AND** it contains numeric fields `semanticWeighted`, `keywordWeighted`, `recencyWeighted` for weighted contributions
- **AND** it contains a `total` field equal to the sum of weighted contributions
