# semantic-memory-embedding Specification

## Purpose
定义本地语义嵌入（`embedding-service.ts` + `embedding-queue.ts`）：基于 Transformers.js 在本机生成记忆与章节向量，异步排队批量处理，向量带版本号存储并在版本变化时重算，且只保存在本地、不参与远端同步。

## Requirements

### Requirement: Local embedding service

The system SHALL generate embeddings locally with `@huggingface/transformers` and the `onnx-community/gte-multilingual-base` model, producing L2-normalized 768-dimensional CLS-pooled vectors. The model SHALL be loaded through a dynamic import so it stays out of the main bundle.

#### Scenario: Vector version identifier

- **GIVEN** the embedding service is ready
- **WHEN** it reports its model version
- **THEN** the version string encodes model, dimensions, and pooling (`gte-multilingual-base@768@cls@raw`)
- **AND** memory vectors are tagged with that version plus the memory segmentation suffix (`@ms2`)

### Requirement: Global local-embedding switch

`settings.enableLocalEmbedding` SHALL gate all local embedding work and SHALL default to off.

#### Scenario: Switch is off

- **GIVEN** `enableLocalEmbedding` is `false`
- **WHEN** the app starts or embedding jobs are enqueued
- **THEN** the model is not downloaded or warmed up
- **AND** queued jobs are kept but not processed until the switch is turned on
- **AND** memory scoring runs in fallback mode and `query_chapter` reports the feature as disabled

### Requirement: Asynchronous embedding queue

`EmbeddingQueue` SHALL embed memories and chapters in the background without blocking the UI.

#### Scenario: Memory batching

- **GIVEN** memories waiting in the queue
- **WHEN** the queue runs
- **THEN** each memory's summary is embedded as its own segment and its content is split into at most 12 short segments
- **AND** segments are embedded in batches of 8 and the vectors are written back to the memory with the current version

#### Scenario: Chapter jobs

- **GIVEN** a chapter waiting in the queue
- **WHEN** the queue runs
- **THEN** the chapter is embedded on its own by `ChapterEmbeddingService`, never mixed into a memory batch

#### Scenario: Progress and completion events

- **GIVEN** the queue is processing jobs
- **WHEN** a batch completes
- **THEN** progress events with memory and chapter counts are emitted
- **AND** each embedded memory dispatches an `embedding-updated` memory change event

### Requirement: Stale embedding detection

A memory's embeddings SHALL be treated as stale when they are missing, were produced by a different version, or do not cover long content with multiple segments.

#### Scenario: Version changed

- **GIVEN** a memory embedded with an older version string
- **WHEN** the backlog is scanned
- **THEN** the memory is enqueued again

### Requirement: Embeddings excluded from remote sync

Embedding vectors SHALL stay local.

#### Scenario: Uploading memories

- **GIVEN** memories with `embeddings` and `embeddingModel`
- **WHEN** data is uploaded to the sync backend
- **THEN** those fields (and translation `memoryScoreBreakdown`) are stripped from the payload
- **AND** each device recomputes embeddings locally
