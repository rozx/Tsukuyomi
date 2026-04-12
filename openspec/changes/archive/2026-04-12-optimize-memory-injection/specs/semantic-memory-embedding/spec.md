## ADDED Requirements

### Requirement: Local embedding service using Transformers.js

The system SHALL provide a local text embedding service backed by `@huggingface/transformers` v3 and the `onnx-community/embeddinggemma-300m-ONNX` model, producing 256-dimensional vectors via Matryoshka truncation.

#### Scenario: Service produces fixed-dimension vectors

- **GIVEN** the embedding service has completed initialization
- **WHEN** `embed(text)` is called with a text string
- **THEN** the returned vector has exactly `256` dimensions
- **AND** the vector is L2-normalized

#### Scenario: Service runs entirely offline after first download

- **GIVEN** the model weights have been downloaded once
- **WHEN** the application is subsequently opened without network
- **THEN** the embedding service initializes successfully from cached weights
- **AND** all embedding operations work without network access

#### Scenario: Service loads library via dynamic import

- **GIVEN** the application starts
- **WHEN** no code path has yet invoked embedding
- **THEN** the `@huggingface/transformers` library is NOT included in the main JavaScript bundle
- **AND** the library is only fetched when `EmbeddingService.init()` is called

#### Scenario: Service uses Matryoshka truncation to 256 dimensions

- **GIVEN** the model produces 768-dimensional raw output
- **WHEN** the service returns a vector
- **THEN** the first 256 dimensions of the raw output are used
- **AND** the truncated vector is re-normalized to unit length

### Requirement: Cosine similarity computation

The system SHALL provide a cosine similarity function for comparing two embedding vectors.

#### Scenario: Identical vectors produce similarity 1.0

- **GIVEN** two identical L2-normalized vectors
- **WHEN** `cosineSimilarity(a, b)` is called
- **THEN** the result is `1.0` (within floating-point tolerance)

#### Scenario: Orthogonal vectors produce similarity 0.0

- **GIVEN** two L2-normalized orthogonal vectors
- **WHEN** `cosineSimilarity(a, b)` is called
- **THEN** the result is approximately `0.0`

### Requirement: Batched embedding for throughput

The system SHALL support batched embedding requests to improve throughput when processing multiple memories.

#### Scenario: Batch processes multiple texts in single call

- **GIVEN** an array of 8 text strings
- **WHEN** `embedBatch(texts)` is called
- **THEN** the returned array contains 8 vectors in the same order as the input
- **AND** each vector is 256-dimensional and L2-normalized

#### Scenario: Batch size is tunable via queue configuration

- **GIVEN** the embedding queue uses `BATCH_SIZE = 8` by default
- **WHEN** the queue processes backlog memories
- **THEN** each `embedBatch` call receives at most 8 texts

### Requirement: Memory embedding persistence

The system SHALL persist computed embeddings with the memory record, tagged by the model version that produced them.

#### Scenario: Embedding is stored with model version

- **GIVEN** a memory is embedded for the first time
- **WHEN** the embedding queue writes the result back
- **THEN** `memory.embedding` is set to a 256-element `number[]`
- **AND** `memory.embeddingModel` is set to `"embeddinggemma-300m@256"`

#### Scenario: Version mismatch invalidates embedding

- **GIVEN** a memory has `embeddingModel = "embeddinggemma-300m@256"`
- **AND** the current model version constant is different
- **WHEN** the memory is evaluated for injection
- **THEN** the stored embedding is treated as absent
- **AND** the memory is re-enqueued for embedding

#### Scenario: Embedding writeback does not alter lastEdited

- **GIVEN** a memory is being updated solely to store its freshly computed embedding
- **WHEN** `updateMemory` is called with the new embedding
- **THEN** `memory.lastEdited` is NOT modified
- **AND** Gist sync is not triggered by the embedding writeback

### Requirement: Asynchronous embedding queue

The system SHALL process embedding tasks asynchronously in a background queue that does not block user-facing operations.

#### Scenario: Queue accepts tasks and returns immediately

- **GIVEN** a memory has just been created
- **WHEN** `EmbeddingQueue.enqueue(memoryId)` is called
- **THEN** the call returns immediately without waiting for embedding to complete
- **AND** the memory's CRUD response is not delayed

#### Scenario: Queue yields to UI between batches

- **GIVEN** the queue is processing a backlog of 200 memories
- **WHEN** a batch of 8 memories completes
- **THEN** the queue yields control to the event loop before starting the next batch
- **AND** the UI remains responsive to user interactions

#### Scenario: Queue can be paused and resumed

- **GIVEN** the queue is actively processing memories
- **WHEN** `pause()` is called
- **THEN** no new batches are started
- **AND** the currently in-flight batch completes normally
- **AND** `resume()` continues from the paused position

#### Scenario: Queue emits progress events with ETA

- **GIVEN** the queue is processing a backlog
- **WHEN** a batch completes
- **THEN** a `progress` event is emitted with `{ total, completed, etaMs }`
- **AND** `etaMs` is computed from the throughput of the most recent 5 batches

#### Scenario: Task cancellation removes queued work

- **GIVEN** memory `m_abc` is in the queue waiting to be processed
- **WHEN** `EmbeddingQueue.cancel('m_abc')` is called
- **THEN** the task is removed from the queue
- **AND** no embedding is computed for `m_abc`

### Requirement: Embedding trigger points

The system SHALL enqueue embedding tasks at well-defined lifecycle points only, avoiding wasteful full-catalog scans.

#### Scenario: Memory creation triggers embedding

- **GIVEN** a new memory is saved via `MemoryService.createMemory`
- **WHEN** the save completes successfully
- **THEN** the memory is enqueued for embedding
- **AND** the enqueue call does not block the create operation

#### Scenario: Memory update triggers embedding only on text change

- **GIVEN** an existing memory is updated via `MemoryService.updateMemory`
- **WHEN** only non-text metadata fields changed (e.g., `lastAccessedAt`)
- **THEN** no embedding task is enqueued
- **WHEN** `summary` or `content` changed
- **THEN** an embedding task is enqueued

#### Scenario: Opening a book triggers lazy backfill for that book

- **GIVEN** the user navigates to a book details page
- **WHEN** the page mounts
- **THEN** the system scans the book's memories for missing or stale embeddings
- **AND** such memories are enqueued for embedding
- **AND** the scan does not include other books

#### Scenario: Model download completion triggers backfill for open book

- **GIVEN** the user has just downloaded the embedding model for the first time
- **WHEN** the download and initialization complete
- **AND** a book is currently open
- **THEN** that book's backfill scan runs immediately

#### Scenario: Memory deletion cancels pending embedding

- **GIVEN** memory `m_abc` is pending in the embedding queue
- **WHEN** the memory is deleted via `MemoryService.deleteMemory`
- **THEN** the pending embedding task is cancelled

#### Scenario: Disabling semantic retrieval pauses queue

- **GIVEN** the embedding queue is active
- **WHEN** the user sets `memoryInjection.enableSemantic = false`
- **THEN** the queue is paused
- **AND** existing embeddings are NOT cleared

#### Scenario: App startup does not trigger global scan

- **GIVEN** the application starts up
- **WHEN** no book has been opened yet
- **THEN** no embedding scan or backfill occurs
- **AND** the embedding service is not initialized

### Requirement: Model lifecycle user controls

The system SHALL provide explicit user controls for downloading, monitoring, and re-initializing the embedding model.

#### Scenario: Download button initiates model fetch

- **GIVEN** the model has not been downloaded yet
- **WHEN** the user clicks "下载模型" in the memory injection settings tab
- **THEN** the embedding service begins downloading the model
- **AND** the UI transitions to a "下载中" state with a progress bar

#### Scenario: Download progress is displayed in real time

- **GIVEN** the model is currently downloading
- **WHEN** download progress advances
- **THEN** the UI displays percentage complete and bytes downloaded / total bytes
- **AND** the progress updates come from the Transformers.js `progress_callback`

#### Scenario: Ready state shows model version

- **GIVEN** the model is loaded and initialized
- **WHEN** the user views the memory injection settings tab
- **THEN** the status line reads "已就绪 (EmbeddingGemma-300m)"
- **AND** a "重新加载" button is available for manual refresh

#### Scenario: Failed state shows error and retry

- **GIVEN** the model failed to download or initialize
- **WHEN** the user views the memory injection settings tab
- **THEN** the status shows an error message with details
- **AND** a "重试" button is available
- **AND** clicking retry re-attempts initialization

### Requirement: First-time feature introduction

The system SHALL show a one-time gentle toast introducing the semantic retrieval feature the first time the user opens the settings dialog after upgrading.

#### Scenario: Toast appears on first settings dialog open

- **GIVEN** the user has not yet seen the feature introduction
- **WHEN** the user opens the settings dialog for the first time
- **THEN** a toast appears with text "新功能:语义记忆检索" and actions "了解更多" / "稍后"
- **AND** the toast does not block interaction with the settings dialog

#### Scenario: "Learn more" navigates to the memory injection tab

- **GIVEN** the introduction toast is visible
- **WHEN** the user clicks "了解更多"
- **THEN** the settings dialog switches to the memory injection tab
- **AND** the toast is dismissed
- **AND** the introduction is marked as seen

#### Scenario: "Later" dismisses and marks as seen

- **GIVEN** the introduction toast is visible
- **WHEN** the user clicks "稍后"
- **THEN** the toast is dismissed
- **AND** the introduction is marked as seen
- **AND** the toast will not appear again on subsequent dialog opens

#### Scenario: Toast does not appear when feature was introduced previously

- **GIVEN** the user has previously dismissed or acted on the introduction toast
- **WHEN** the user opens the settings dialog again
- **THEN** no introduction toast appears

### Requirement: Embedding storage excluded from remote sync

The system SHALL exclude embedding vectors from Gist synchronization to avoid cross-device dimension or model version conflicts.

#### Scenario: Gist serialization strips embedding fields

- **GIVEN** a memory has `embedding` and `embeddingModel` fields set
- **WHEN** the memory is serialized for Gist sync upload
- **THEN** the `embedding` and `embeddingModel` fields are omitted from the serialized payload

#### Scenario: Gist deserialization leaves embedding absent

- **GIVEN** a memory is downloaded from Gist and merged into local storage
- **WHEN** the merge completes
- **THEN** the memory has no `embedding` field
- **AND** the memory will be enqueued for embedding the next time its book is opened
