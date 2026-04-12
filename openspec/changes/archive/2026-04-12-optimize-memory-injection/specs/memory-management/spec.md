## REMOVED Requirements

### Requirement: Memory creation with optional attachments

**Reason**: The entire memory attachment system is removed in this change. Memories no longer have an `attachedTo` field, so attachment specification at creation time is no longer meaningful. Relevance to specific entities is now determined at injection time via keyword and semantic scoring rather than stored as a relationship.

**Migration**: The `attached_to` parameter is removed from the `create_memory` AI tool. Existing memories' `attachedTo` field is physically deleted during the IndexedDB v8→v9 schema upgrade (see "Hard migration clears legacy attachedTo data" requirement in the change's memory-management delta). Gist sync strips the field on both upload and download paths as defensive double-safety. See change design doc Decision 11 for details.

### Requirement: Memory update with attachment modification

**Reason**: Same as above - attachments no longer exist as a concept.

**Migration**: The `attached_to` parameter is removed from the `update_memory` AI tool. Update operations only accept text fields (`summary`, `content`) and metadata.

### Requirement: AI guidance for attachment usage

**Reason**: With attachments removed, the AI no longer needs guidance on when and how to use them. The memory workflow prompt rules (`getMemoryWorkflowRules` in `common.ts`) are simplified accordingly.

**Migration**: The attachment best-practices section of the memory workflow prompt is deleted. AI is instructed to write concise, reusable memories with no attachment concerns.

## ADDED Requirements

### Requirement: Memory data model includes optional embedding fields

The `Memory` model SHALL include optional `embedding` and `embeddingModel` fields to support local semantic retrieval.

#### Scenario: New memory created without embedding

- **GIVEN** the AI creates a memory via `create_memory`
- **WHEN** `MemoryService.createMemory` persists the record
- **THEN** `embedding` is initially absent or undefined
- **AND** `embeddingModel` is initially absent or undefined

#### Scenario: Embedding fields are optional

- **GIVEN** a legacy memory without embedding fields is loaded from IndexedDB
- **WHEN** the memory is used anywhere in the application
- **THEN** the missing embedding fields do not cause runtime errors
- **AND** the memory continues to function for all non-semantic operations

#### Scenario: Embedding stored as plain number array

- **GIVEN** a memory's embedding is written to IndexedDB
- **WHEN** the record is inspected
- **THEN** `embedding` is a plain `number[]` of length 256
- **AND** `embeddingModel` is a string identifying the model version

### Requirement: Memory data model excludes attachedTo field

The `Memory` TypeScript interface and the `TsukuyomiDB.memories` schema SHALL NOT declare an `attachedTo` field. Legacy records in storage are migrated to remove the field during the database schema upgrade.

#### Scenario: TypeScript interface has no attachedTo

- **GIVEN** the `Memory` interface is imported in any source file
- **WHEN** a developer tries to access `memory.attachedTo`
- **THEN** TypeScript reports a type error
- **AND** the field cannot be read or written through normal code paths

### Requirement: Hard migration clears legacy attachedTo data

The system SHALL perform a one-time IndexedDB schema upgrade that physically removes the `attachedTo` field from all existing memory records, ensuring no zombie data remains after upgrade.

#### Scenario: Database version bumps from 8 to 9

- **GIVEN** the application has been upgraded to a version containing this change
- **WHEN** `getDB()` is first called after the upgrade
- **THEN** the IndexedDB `DB_VERSION` constant is `9`
- **AND** the `upgrade` callback detects `oldVersion < 9`
- **AND** the migration branch runs

#### Scenario: Migration strips attachedTo from every memory record

- **GIVEN** the `memories` object store contains records with legacy `attachedTo` fields
- **WHEN** the v9 migration runs
- **THEN** the migration iterates every record in `memories` via a cursor
- **AND** for each record, the `attachedTo` field is deleted before writing back via `cursor.update`
- **AND** no record retains the `attachedTo` field after the migration transaction commits

#### Scenario: Migration is atomic

- **GIVEN** the v9 migration is running
- **WHEN** an error occurs partway through
- **THEN** the entire IDB upgrade transaction aborts
- **AND** the database remains at version 8 with all `attachedTo` data intact
- **AND** the next startup retries the migration

#### Scenario: Migration leaves records with no attachedTo unchanged

- **GIVEN** a memory record created after the upgrade already has no `attachedTo` field
- **WHEN** the v9 migration runs (e.g., on a fresh install where no records exist)
- **THEN** no records require modification
- **AND** the migration completes in near-zero time

#### Scenario: Gist sync strips attachedTo as defensive measure

- **GIVEN** the local database has completed v9 migration
- **WHEN** a memory is serialized for Gist sync upload
- **THEN** the serialized payload does not contain `attachedTo` (even though the local record already has none)

#### Scenario: Gist sync deserializes legacy payloads safely

- **GIVEN** a Gist payload from an older client version contains memory records with `attachedTo` fields
- **WHEN** the deserializer merges the payload into local storage
- **THEN** the `attachedTo` field is stripped before the record is written to IndexedDB
- **AND** the merged record has no `attachedTo` field

### Requirement: Automatic embedding queue integration on memory CRUD

`MemoryService` SHALL integrate with the embedding queue so that memory lifecycle events automatically trigger appropriate embedding actions.

#### Scenario: Create enqueues embedding

- **GIVEN** `MemoryService.createMemory` is called with valid data
- **WHEN** the memory is successfully persisted
- **THEN** `EmbeddingQueue.enqueue(memoryId)` is invoked
- **AND** the create call returns without waiting for embedding completion

#### Scenario: Update enqueues only on text change

- **GIVEN** an existing memory is updated
- **WHEN** only non-text fields changed
- **THEN** no embedding task is enqueued
- **WHEN** `summary` or `content` changed
- **THEN** an embedding task is enqueued

#### Scenario: Delete cancels embedding

- **GIVEN** a memory has a pending embedding task
- **WHEN** `MemoryService.deleteMemory` is called for that memory
- **THEN** `EmbeddingQueue.cancel(memoryId)` is invoked before the delete completes

#### Scenario: Embedding writeback suppresses lastEdited update

- **GIVEN** the embedding queue updates a memory to store its computed embedding
- **WHEN** the writeback calls a specialized method `updateMemoryEmbeddingOnly`
- **THEN** `lastEdited` is NOT modified
- **AND** the memory's Gist sync dirty flag is not set

### Requirement: Memory panel displays embedding status

`MemoryPanel` and `MemoryCard` SHALL display the embedding status of each memory so users can see backfill progress at a glance.

#### Scenario: Card shows ready badge when embedding current

- **GIVEN** a memory has `embedding` set and `embeddingModel` matches the current version
- **WHEN** the card renders
- **THEN** the card displays a green "已向量化" badge

#### Scenario: Card shows pending badge when embedding missing

- **GIVEN** a memory has no `embedding` OR is in the embedding queue
- **WHEN** the card renders
- **THEN** the card displays a yellow "待向量化" badge

#### Scenario: Card shows stale badge on version mismatch

- **GIVEN** a memory has `embedding` set but `embeddingModel` does not match the current version
- **WHEN** the card renders
- **THEN** the card displays a red "版本过期" badge

#### Scenario: Badge tooltip explains state

- **GIVEN** the user hovers over any badge
- **WHEN** the tooltip appears
- **THEN** the tooltip text explains the state in natural language

### Requirement: Memory panel batch re-embedding action

`MemoryPanel` SHALL provide a toolbar button to trigger full re-embedding of all memories in the current book.

#### Scenario: Batch button triggers full re-embedding

- **GIVEN** the user views the memory panel for book `b1`
- **WHEN** the user clicks "重新向量化本书"
- **THEN** all memories of `b1` have their `embedding` and `embeddingModel` cleared
- **AND** all memories are enqueued for re-embedding
- **AND** the backfill progress banner becomes visible at the top of the panel

#### Scenario: Filter to show only un-embedded memories

- **GIVEN** the user enables the "仅显示未向量化" filter in the memory panel
- **WHEN** the list updates
- **THEN** only memories with missing or stale embeddings are displayed

#### Scenario: Progress banner displays queue status

- **GIVEN** the embedding queue is actively processing memories for the current book
- **WHEN** the user views the memory panel
- **THEN** a status banner displays current progress `X / Y 条记忆` and estimated remaining time
- **AND** the banner includes a "暂停" button

### Requirement: Memory detail dialog shows embedding metadata

`MemoryDetailDialog` SHALL display the embedding metadata for the current memory and provide a manual re-embedding action when appropriate.

#### Scenario: Dialog footer shows embedding version and timestamp

- **GIVEN** a memory has `embedding` and `embeddingModel` set
- **WHEN** the detail dialog opens for that memory
- **THEN** the dialog footer displays the model version and last embedding time in subdued text

#### Scenario: Manual embed button appears when vector missing

- **GIVEN** a memory has no embedding or has a stale version
- **WHEN** the detail dialog opens for that memory
- **THEN** a "为此记忆生成向量" button is shown
- **AND** clicking the button enqueues the memory with high priority

#### Scenario: Manual embed button hidden when vector current

- **GIVEN** a memory has a current embedding
- **WHEN** the detail dialog opens
- **THEN** no manual embed button is shown

### Requirement: `MemoryService.getAllBookMemories` single-query helper

`MemoryService` SHALL expose a `getAllBookMemories(bookId)` method that fetches all memories for a book in one query, backed by a short TTL cache.

#### Scenario: Single IndexedDB query for whole book

- **GIVEN** the cache is empty or expired for book `b1`
- **WHEN** `getAllBookMemories('b1')` is called
- **THEN** exactly one IndexedDB query is performed using the `by-bookId` index

#### Scenario: Cache hit within TTL returns stored array

- **GIVEN** the cache for book `b1` was populated 10 seconds ago
- **AND** the TTL is 60 seconds
- **WHEN** `getAllBookMemories('b1')` is called again
- **THEN** the cached array is returned without touching IndexedDB

#### Scenario: Write operations invalidate cache

- **GIVEN** the cache for book `b1` is populated
- **WHEN** `createMemory`, `updateMemory`, or `deleteMemory` completes for `b1`
- **THEN** the cache entry for `b1` is removed immediately
