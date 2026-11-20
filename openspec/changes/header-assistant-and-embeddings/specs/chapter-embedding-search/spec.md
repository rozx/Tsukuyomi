## MODIFIED Requirements

### Requirement: Batch embeddings popup UI

The system SHALL surface chapter and memory embedding progress and actions in the "Background · Embeddings" section of the header task center (see `header-task-center`), replacing the standalone embeddings drawer. The section SHALL be available on every page while local embedding is enabled, and SHALL show per-book statistics and actions only on a book detail page.

#### Scenario: Popup shows both kinds

- **GIVEN** local embedding is enabled and the user opens the task center on a book detail page
- **WHEN** the background embeddings section is expanded
- **THEN** it shows the current book's chapter embeddings (completed / total) and memory embeddings (completed / total) as two progress bars
- **AND** it shows the queue's pending count and ETA
- **AND** both reflect live queue progress

#### Scenario: Backfill action

- **GIVEN** a book has chapters or memories lacking embeddings
- **WHEN** the user clicks "Backfill missing" in the background embeddings section
- **THEN** the system enqueues all missing chapter and memory targets of the current book
- **AND** the progress updates to reflect the new pending count

#### Scenario: Recompute all chapters

- **GIVEN** the user wants to force a full rebuild of chapter embeddings
- **WHEN** the user chooses "Rebuild this book's chapter embeddings" from the section's overflow menu
- **THEN** every chapter of the current book is enqueued regardless of current state

#### Scenario: Opened outside a book page

- **GIVEN** local embedding is enabled and the user is not on a book detail page
- **WHEN** the user opens the task center
- **THEN** the background embeddings section shows only the global queue status (pending count, the book and kind being processed, ETA) and a hint that per-book actions are available after opening a book

#### Scenario: Local embedding disabled

- **GIVEN** local embedding is disabled
- **WHEN** the user opens the task center
- **THEN** the background embeddings section is not rendered

#### Scenario: Pause and resume the embedding queue

- **GIVEN** the embedding queue has pending items
- **WHEN** the user pauses or resumes from the section header
- **THEN** the embedding queue pauses or resumes, independently of the chapter task queue

#### Scenario: Stale vectors after a model version change

- **GIVEN** stored chapter or memory vectors were produced by an older model version
- **WHEN** the section renders
- **THEN** it shows how many vectors are stale with a "Rebuild" action that enqueues them

#### Scenario: Test query from the overflow menu

- **GIVEN** the user is on a book detail page with local embedding enabled
- **WHEN** the user chooses "Test query" from the section's overflow menu
- **THEN** the system opens the test query dialog for the current book

#### Scenario: Model backend status lives in settings

- **WHEN** the user wants to see the active embedding backend (WebGPU or WASM) and the model / chapter model versions
- **THEN** the system shows them in the embedding settings, not in the task center
