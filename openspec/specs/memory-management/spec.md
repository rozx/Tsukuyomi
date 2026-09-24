# memory-management Specification

## Purpose
定义书籍记忆（Memory）的数据模型与 `MemoryService` 的增删改查行为：记忆不再挂载实体，只携带可选的本地语义向量；写操作联动嵌入队列，按书读取走带 TTL 的缓存，并设有每本书的容量上限。

## Requirements

### Requirement: Memory data model

A `Memory` SHALL consist of `id`, `bookId`, `content`, `summary`, `createdAt`, `lastAccessedAt`, and the optional local fields `embeddings` (`number[][]`, one vector per segment) and `embeddingModel` (the version string that produced them). It SHALL NOT carry entity attachments.

#### Scenario: Memory created without embeddings

- **GIVEN** a new memory has just been created
- **WHEN** it is stored in IndexedDB
- **THEN** `embeddings` and `embeddingModel` are absent until the embedding queue processes it

#### Scenario: Legacy attachedTo data is ignored

- **GIVEN** a stored or synced memory record that still contains a legacy `attachedTo` field
- **WHEN** it is read or uploaded to sync
- **THEN** the `attachedTo` field is dropped and not exposed on the `Memory` object

### Requirement: Memory CRUD triggers embedding

Memory writes through `MemoryService` SHALL keep the embedding queue in step with memory text.

#### Scenario: Create memory

- **GIVEN** the AI or the user creates a memory
- **WHEN** `MemoryService.createMemory` succeeds
- **THEN** the memory is enqueued in `EmbeddingQueue`

#### Scenario: Update memory text

- **GIVEN** an existing memory
- **WHEN** `MemoryService.updateMemory` changes its `summary` or `content`
- **THEN** the memory is re-enqueued for embedding
- **AND** an update that leaves both fields unchanged does not re-enqueue it

#### Scenario: Delete memory

- **GIVEN** a memory with a pending embedding job
- **WHEN** `MemoryService.deleteMemory` removes it
- **THEN** the pending job for that memory is cancelled

### Requirement: Per-book memory capacity

Each book SHALL hold at most 500 memories.

#### Scenario: Creating a memory at capacity

- **GIVEN** a book that already has 500 memories
- **WHEN** a new memory is created
- **THEN** the memory with the oldest `lastAccessedAt` is deleted first

### Requirement: Single-query book memory fetch with TTL cache

`MemoryService.getAllBookMemories(bookId)` SHALL return every memory of a book, including embedding fields, from a single query cached for 60 seconds.

#### Scenario: Repeated reads within the TTL

- **GIVEN** `getAllBookMemories` was called for a book less than 60 seconds ago
- **WHEN** it is called again and no memory of that book changed
- **THEN** the cached list is returned without a new IndexedDB query

#### Scenario: Mutation keeps the cache consistent

- **GIVEN** a cached memory list for a book
- **WHEN** a memory of that book is created, updated, deleted, or receives new embeddings
- **THEN** subsequent reads reflect the change

### Requirement: Memory panel embedding status and batch re-embedding

The book memory panel SHALL show each memory's embedding status and offer a book-wide re-embedding action.

#### Scenario: Status badge on memory card

- **GIVEN** the memory panel lists memories
- **WHEN** a card renders
- **THEN** it shows a status dot: ready (embedded with the current version), pending (no embeddings yet), or stale (embedded with an outdated version or segmentation)

#### Scenario: Re-embed the whole book

- **GIVEN** the user is viewing a book's memory panel
- **WHEN** the user triggers "重新向量化本书"
- **THEN** `EmbeddingQueue.enqueueBacklog(bookId)` enqueues every memory of the book that is missing or has stale embeddings
