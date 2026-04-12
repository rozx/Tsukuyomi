## MODIFIED Requirements

### Requirement: Automatic memory discovery from chunk entities

The system SHALL identify entities present in a chunk and use them as a keyword signal for memory relevance scoring, replacing the previous attachment-based retrieval.

#### Scenario: Extract entities from chunk text

- **GIVEN** a chunk of text to be translated
- **WHEN** building the translation context
- **THEN** system extracts all terms present in the chunk from the book's `terminologies` table
- **AND** system extracts all characters present in the chunk from the book's `characterSettings` table
- **AND** entity extraction uses `findUniqueTermsInText` and `findUniqueCharactersInText`

#### Scenario: Extracted entities feed the keyword signal

- **GIVEN** entities have been extracted from chunk text
- **WHEN** scoring candidate memories
- **THEN** the scoring function uses the extracted entity names as the keyword source
- **AND** `keywordHitRatio` is computed as the fraction of extracted entities whose names appear in a memory's summary and content

#### Scenario: Memory candidates come from all book memories

- **GIVEN** a chunk is being scored
- **WHEN** the system needs candidate memories
- **THEN** the candidate pool is the full memory list for the book, fetched via `MemoryService.getAllBookMemories`
- **AND** candidates are NOT filtered by any attachment relationship

### Requirement: Memory limit in context

The system SHALL limit the size of injected memories using a character budget and score-based selection, replacing the previous LRU-based item count limit.

#### Scenario: Many memories are candidates for a chunk

- **GIVEN** many memories in the book are candidates for the current chunk
- **AND** a configured character budget (default 2000 characters)
- **WHEN** building the context
- **THEN** candidates are scored using the three-signal relevance formula (semantic + keyword + recency)
- **AND** memories below the minimum score threshold are discarded
- **AND** remaining memories are selected in descending score order
- **AND** selection stops when the character budget would be exceeded
- **AND** selection stops when the hard cap of 25 items is reached

#### Scenario: Budget respects user settings

- **GIVEN** the user has set `memoryInjection.charBudget = 3000`
- **WHEN** building the context
- **THEN** up to 3000 characters of memory content can be injected

#### Scenario: No eligible candidates fall back to recent memories

- **GIVEN** no memories score above the threshold for the current chunk
- **WHEN** building the context
- **THEN** the 5 most recently accessed memories for the book are injected as fallback

## REMOVED Requirements

### Requirement: Memory deduplication in context

**Reason**: Deduplication is no longer needed at the context-builder layer. With the removal of the attachment system, memories are no longer fetched via multiple per-entity queries; they are fetched once via `getAllBookMemories`, which returns each memory exactly once by construction. The scoring path cannot produce duplicates.

**Migration**: No code migration required. The `uniqueMemories` Map-based deduplication in the old `getRelatedMemoriesForChunk` implementation is removed along with the attachment-based retrieval path.

## ADDED Requirements

### Requirement: Single-query book memory fetch with TTL cache

The system SHALL fetch all memories for a book in a single IndexedDB query, cached for a short TTL, replacing the previous pattern of multiple per-entity `getMemoriesByAttachment` calls per chunk.

#### Scenario: First fetch populates cache

- **GIVEN** the in-memory book memory cache is empty for book `b1`
- **WHEN** `getAllBookMemories('b1')` is called
- **THEN** the system queries IndexedDB once by `by-bookId` index
- **AND** the result is stored in the cache with a 60-second expiration

#### Scenario: Subsequent chunk fetches reuse cache

- **GIVEN** `getAllBookMemories('b1')` was called 10 seconds ago and cached
- **WHEN** a subsequent chunk in the same translation task needs memories for `b1`
- **THEN** the cached result is returned without hitting IndexedDB

#### Scenario: Write operations invalidate cache

- **GIVEN** memories for book `b1` are cached
- **WHEN** `createMemory`, `updateMemory`, or `deleteMemory` completes for book `b1`
- **THEN** the cache entry for `b1` is removed
- **AND** the next fetch re-reads from IndexedDB

### Requirement: Optional semantic signal in chunk context building

The system SHALL compute a chunk embedding and apply semantic similarity scoring when semantic retrieval is enabled and the embedding service is ready.

#### Scenario: Semantic path active

- **GIVEN** `memoryInjection.enableSemantic = true`
- **AND** `EmbeddingService` is initialized and ready
- **WHEN** building the chunk context
- **THEN** the system computes an embedding for the chunk text once
- **AND** the embedding is compared against each candidate memory's stored embedding
- **AND** the resulting cosine similarity contributes to the score

#### Scenario: Semantic path inactive

- **GIVEN** `memoryInjection.enableSemantic = false` OR `EmbeddingService` is not ready
- **WHEN** building the chunk context
- **THEN** no chunk embedding is computed
- **AND** `semanticSim` is treated as `0` for all candidates
- **AND** scoring proceeds normally with the keyword and recency signals

#### Scenario: Chunk embedding reused within task

- **GIVEN** a translation task processes multiple chunks with identical text
- **WHEN** the same chunk text is scored more than once in the same task
- **THEN** the chunk embedding is computed only once and reused

### Requirement: Score breakdown persistence for transparency

The system SHALL persist per-memory score breakdowns on the translation result so that the UI can display how each injected memory was selected.

#### Scenario: Score breakdown stored with translation

- **GIVEN** a translation task completes and memories were injected via scoring
- **WHEN** the translation result is persisted
- **THEN** `translation.memoryScoreBreakdown` contains an entry for each injected memory
- **AND** each entry records the raw value and weighted contribution for semantic, keyword, and recency signals
- **AND** each entry records the total score

#### Scenario: Score breakdown excluded from Gist sync

- **GIVEN** a translation has `memoryScoreBreakdown` set
- **WHEN** the translation is serialized for Gist upload
- **THEN** the `memoryScoreBreakdown` field is omitted from the serialized payload

#### Scenario: AI-invoked memories have no breakdown

- **GIVEN** a memory was fetched during translation by the AI calling `get_memory` or `search_memories`
- **AND** that memory was NOT also part of the pre-computed injection
- **WHEN** the translation is persisted
- **THEN** that memory appears in `referencedMemories` but not in `memoryScoreBreakdown`
