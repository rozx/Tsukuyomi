# ai-context-building Specification

## Purpose
定义 AI 任务上下文的构建方式：按相关性打分从本书记忆中选取并格式化注入分块提示词，章节 UI 预览与实际注入共用同一选取结果；章节摘要不再注入，章节语义通过 `query_chapter` 按需获取。

## Requirements

### Requirement: Relevance-scored memory injection for chunks

When building the context for a translation chunk, the system SHALL select memories with `selectRelevantMemoriesForChunk` according to the `memory-relevance-scoring` capability, instead of discovering them through entity attachments.

#### Scenario: Selecting memories for a chunk

- **GIVEN** a chunk of text, the terms and characters present in it, and an optional chapter-level semantic query (chapter title original and translation)
- **WHEN** the chunk context is built
- **THEN** all memories of the book are loaded via `MemoryService.getAllBookMemories`
- **AND** terms, characters, and character aliases become the keyword entities
- **AND** the chapter query and the chunk text are embedded as query vectors when embedding is available
- **AND** the memories are scored and selected by threshold, relative ranking, and character budget

#### Scenario: Book has no memories

- **GIVEN** a book with no memories
- **WHEN** the chunk context is built
- **THEN** no memory section is added

### Requirement: Memory context formatting in prompts

Selected memories SHALL be injected as a single `【相关记忆】` section listing each memory's ID and summary.

#### Scenario: Formatting selected memories

- **GIVEN** memories were selected for a chunk
- **WHEN** the memory section is rendered
- **THEN** it is `【相关记忆】` followed by one line per memory in the form `  - [<id>] <summary>`, in score order
- **AND** memory content is not inlined; the AI can fetch it with `get_memory`

#### Scenario: Scoring fails

- **GIVEN** relevance scoring throws an error
- **WHEN** the chunk context is built
- **THEN** the system falls back to the most recently accessed memories (up to 15) in the same format

### Requirement: Memory preview matches injection

The chapter memory preview in the book details page SHALL use the same selection as prompt injection.

#### Scenario: Previewing a chapter's memories

- **GIVEN** the user opens a chapter in the book details page
- **WHEN** the memory preview refreshes
- **THEN** it calls `selectRelevantMemoriesForChunk` with the chapter's paragraphs, used terms, used characters, and chapter query
- **AND** the previewed memories and score breakdowns match what a translation of that text would inject

#### Scenario: Score breakdowns recorded for translation results

- **GIVEN** memories were selected for a chunk during translation
- **WHEN** the translated paragraphs are returned
- **THEN** the selected memory IDs are merged into `referencedMemories`
- **AND** their breakdowns are attached as `memoryScoreBreakdown`

### Requirement: Chapter summary is not injected automatically

The system SHALL NOT inject chapter summaries into AI task prompts. The previous-chapter summary and the current-chapter summary context blocks are removed.

#### Scenario: Previous chapter context minimized to title only

- **GIVEN** a translation chunk is being built for chapter N
- **WHEN** the previous chapter (N-1) exists
- **THEN** the prompt MAY include only the previous chapter's title for continuity awareness
- **AND** the prompt MUST NOT include any summary text for the previous chapter

#### Scenario: Single-paragraph default context excludes chapter summary

- **GIVEN** a single-paragraph polish or proofread task is being prepared
- **WHEN** the default context is assembled
- **THEN** the context MUST NOT include a chapter-summary section
- **AND** the existing terminology / character / surrounding-paragraphs sections are unaffected

### Requirement: AI discovers chapter context via query_chapter

The system SHALL inform AI tasks that chapter-level semantic context must be requested on demand via the `query_chapter` tool rather than arriving pre-injected.

#### Scenario: Translation / polish / proofread system prompt advertises the tool

- **GIVEN** a translation, polish, or proofread system prompt is being assembled
- **WHEN** the tool-use guidance section is rendered
- **THEN** the prompt describes `query_chapter` as the way to locate semantically relevant chapters for the current task
- **AND** the prompt notes that `get_chapter_info` returns full chapter content but no summary

#### Scenario: No fallback injection when tool is unavailable

- **GIVEN** the embedding service has failed to initialize
- **WHEN** a task prompt is built
- **THEN** the system does not substitute a chapter summary or any generated context in place of the missing tool
- **AND** the AI proceeds with whatever context was otherwise provided
