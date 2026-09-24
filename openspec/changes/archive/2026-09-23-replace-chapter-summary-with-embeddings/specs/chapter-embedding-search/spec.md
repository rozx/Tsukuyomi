## ADDED Requirements

### Requirement: Chapter chunk embedding storage

The system SHALL store per-chapter embeddings as multiple chunk vectors in a dedicated IndexedDB object store independent from the Book / Chapter object graph.

#### Scenario: Store chunk vector with metadata

- **GIVEN** a chapter has been processed by the embedding pipeline
- **WHEN** a chunk vector is persisted
- **THEN** the record includes `chapterId`, `bookId`, `chunkIndex`, 256-dimensional `vector`, `textSnippet` of the chunk's first 200 characters, `model` (the embedding model version), and `updatedAt` timestamp
- **AND** the record is keyed by `${chapterId}:${chunkIndex}`
- **AND** the store exposes indexes `by-chapterId` and `by-bookId` for efficient lookup

#### Scenario: Embeddings are not part of book serialization

- **GIVEN** chapter embeddings exist in the local database
- **WHEN** the system serializes a book for Gist sync or JSON export
- **THEN** chapter embeddings SHALL NOT be included in the serialized output
- **AND** no embedding data leaves the device via sync

### Requirement: Chunk segmentation rules

The system SHALL split chapter content into chunks along paragraph boundaries with a target size of approximately 1500 characters.

#### Scenario: Accumulate paragraphs up to target size

- **GIVEN** a chapter with multiple paragraphs
- **WHEN** building chunks
- **THEN** the system accumulates paragraphs until the running character count reaches or exceeds ~1500 characters
- **AND** the next paragraph starts a new chunk
- **AND** individual paragraphs are never split across chunks

#### Scenario: Oversized paragraph becomes a single chunk

- **GIVEN** a paragraph whose text exceeds 1500 characters
- **WHEN** building chunks
- **THEN** the paragraph occupies its own chunk
- **AND** no chunk merging or truncation is performed at the paragraph level

### Requirement: Embedding input composition

The system SHALL compose each chunk's embedding input by concatenating original text and selected translation per paragraph.

#### Scenario: Paragraph has selected translation

- **GIVEN** a paragraph with a non-empty `selectedTranslationId` pointing to a translation
- **WHEN** composing the chunk's embedding input
- **THEN** the paragraph contributes `${originalText}\n${selectedTranslationText}` to the input
- **AND** paragraphs within a chunk are joined by blank lines

#### Scenario: Paragraph lacks translation

- **GIVEN** a paragraph with no translation or an empty selected translation
- **WHEN** composing the chunk's embedding input
- **THEN** the paragraph contributes only its original text
- **AND** the chapter remains searchable via original-language queries

### Requirement: query_chapter AI tool

The system SHALL expose an AI tool named `query_chapter` that performs semantic search over a book's chapter embeddings.

#### Scenario: Tool schema

- **GIVEN** the AI task supports book tools
- **WHEN** the tool set is registered
- **THEN** `query_chapter` accepts `{ query: string, limit?: number }` with default `limit` of 5
- **AND** the tool is scoped to the current book via the handler's injected `bookId`

#### Scenario: Semantic ranking over chunks

- **GIVEN** a user-provided natural-language query
- **WHEN** `query_chapter` executes
- **THEN** the query is embedded using the same model/version as the stored chunks
- **AND** cosine similarity is computed against every chunk vector of the current book
- **AND** per-chapter score equals the maximum chunk similarity within that chapter
- **AND** the top `limit` chapters are returned ordered by descending score

#### Scenario: Response shape

- **GIVEN** a successful semantic search
- **WHEN** building the tool response
- **THEN** each match returns `{ chapter_id, title, score, preview }`
- **AND** `preview` is the `textSnippet` of the highest-scoring chunk in that chapter
- **AND** the response is a JSON-serializable object

#### Scenario: Embedding service unavailable

- **GIVEN** the embedding service is not ready or has failed to load
- **WHEN** `query_chapter` is invoked
- **THEN** the tool returns a structured error indicating the service is unavailable
- **AND** the tool does not crash the surrounding AI task

### Requirement: Debounced embedding update on content change

The system SHALL maintain chapter embeddings automatically in response to content edits using per-chapter debounced enqueueing.

#### Scenario: Paragraph original or translated text changes

- **GIVEN** a paragraph's `text` or any of its translations is modified
- **WHEN** the change is persisted
- **THEN** the owning chapter is marked dirty
- **AND** the chapter enters a 60-second debounce window, extended on subsequent edits
- **AND** on window expiry the chapter is enqueued for full re-embedding

#### Scenario: New chapter created

- **GIVEN** a chapter is newly created via scraper import or manual addition
- **WHEN** the chapter is persisted
- **THEN** the chapter is enqueued for embedding immediately without debounce

#### Scenario: Chapter deleted

- **GIVEN** a chapter is deleted
- **WHEN** the deletion is persisted
- **THEN** all embedding records whose `chapterId` matches are removed from the store
- **AND** any pending queue entries for that chapter are cancelled

### Requirement: Backlog scan on model change or first launch

The system SHALL scan for missing or stale chapter embeddings and enqueue them without blocking the UI.

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

### Requirement: Unified embedding queue scheduling

The system SHALL reuse the existing memory embedding queue to schedule chapter embeddings, sharing the pipeline and progress infrastructure.

#### Scenario: Queue accepts chapter targets

- **GIVEN** a chapter needs embedding
- **WHEN** the embedding queue is called
- **THEN** the queue item identifies a kind (`memory` or `chapter`) and the target id
- **AND** the queue processes memory and chapter items under the same pipeline warmup and pause/resume controls

#### Scenario: Progress event breakdown

- **GIVEN** the queue emits progress events
- **WHEN** UI subscribers consume the event
- **THEN** the event payload includes totals for the combined queue
- **AND** the payload includes a per-kind breakdown with `memory` and `chapter` totals/completed/pending

### Requirement: Batch embeddings popup UI

The system SHALL provide a popup UI that surfaces chapter and memory embedding progress and allows the user to backfill or recompute.

#### Scenario: Popup shows both kinds

- **GIVEN** the user opens the batch embeddings popup on a book detail page
- **WHEN** the popup renders
- **THEN** it shows a "Chapter embeddings" section with completed / pending / ETA
- **AND** it shows a "Memory embeddings" section with completed / pending / ETA
- **AND** both sections reflect live queue progress

#### Scenario: Backfill action

- **GIVEN** a book has chapters or memories lacking embeddings
- **WHEN** the user clicks the "Backfill missing" button for a kind
- **THEN** the system enqueues all missing targets for that kind on the current book
- **AND** the progress section updates to reflect the new pending count

#### Scenario: Recompute all chapters

- **GIVEN** the user wants to force a full rebuild of chapter embeddings
- **WHEN** the user clicks "Recompute all" in the chapter section
- **THEN** every chapter of the current book is enqueued regardless of current state
