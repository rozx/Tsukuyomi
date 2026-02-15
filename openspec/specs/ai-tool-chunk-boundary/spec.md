### Requirement: Tool context includes chunk boundaries

The system SHALL extend the `ToolContext` interface to include optional chunk boundary information for enforcing paragraph access restrictions during chunked processing.

#### Scenario: Tool context with chunk boundaries

- **WHEN** a translation task processes a chunk of paragraphs
- **THEN** the `ToolContext` passed to tool handlers SHALL contain `chunkBoundaries` with:
  - `allowedParagraphIds`: A Set of paragraph IDs that are within the current chunk
  - `firstParagraphId`: The first paragraph ID in the current chunk (for error messages)
  - `lastParagraphId`: The last paragraph ID in the current chunk (for error messages)

#### Scenario: Tool context without chunk boundaries (AI Assistant)

- **WHEN** a non-chunked context calls tools (e.g., AI assistant chat, standalone tool usage)
- **THEN** the `ToolContext` SHALL NOT contain `chunkBoundaries`
- **AND** tools SHALL allow access to any paragraphs without restriction

#### Scenario: Translation task with chunk boundaries

- **GIVEN** a translation task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` with the current chunk's paragraph IDs
- **AND** paragraph access SHALL be restricted to those IDs

#### Scenario: Polish task with chunk boundaries

- **GIVEN** a polish task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` restricting paragraph access

#### Scenario: Proofreading task with chunk boundaries

- **GIVEN** a proofreading task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` restricting paragraph access

### Requirement: Chunk work items expose canonical paragraph IDs

系统 SHALL 在 Translation/Polish/Proofreading 的分块构建结果中，为每个待处理段落提供可直接用于提交的 `paragraph_id`。

#### Scenario: Translation chunk rendering includes paragraph IDs

- **WHEN** 系统构建翻译任务的待处理段落块
- **THEN** 每个待处理段落条目 MUST 包含其 `paragraph_id`
- **AND THEN** 若展示 `index`，其语义 SHALL 仅限阅读定位，不可作为提交主键

#### Scenario: Polish and proofreading chunk rendering includes paragraph IDs

- **WHEN** 系统构建润色或校对任务的待处理段落块
- **THEN** 每个待处理段落条目 MUST 包含其 `paragraph_id`
- **AND THEN** 模型可直接复制该 `paragraph_id` 调用 `add_translation_batch`

### Requirement: Chunk display index aligns with chapter original index

The system SHALL render each paragraph label in chunk text using the paragraph's original chapter index (including empty paragraphs), while still filtering empty paragraphs out of the task payload.

#### Scenario: Chapter contains empty paragraphs between non-empty paragraphs

- **WHEN** a task chunk is built from chapter paragraphs like [non-empty, empty, non-empty, empty, non-empty]
- **THEN** the chunk SHALL include only non-empty paragraphs for processing
- **AND THEN** displayed labels SHALL use original chapter indexes such as `[0]`, `[2]`, `[4]`

#### Scenario: Chapter has no empty paragraphs

- **WHEN** a task chunk is built from chapter paragraphs without empty entries
- **THEN** displayed labels SHALL match original chapter indexes
- **AND THEN** labels may appear continuous (for example `[0]`, `[1]`, `[2]`)

#### Scenario: Index is display-only in chunk context

- **WHEN** chunk text is shown to the model with both `[index]` and `[ID: paragraph_id]`
- **THEN** the index SHALL be treated as a location hint only
- **AND THEN** submission workflows SHALL continue using `paragraph_id` as the only valid identifier

### Requirement: get_next_paragraphs respects chunk boundaries

The system SHALL enforce chunk boundaries on the `get_next_paragraphs` tool, rejecting requests that would return paragraphs outside the current chunk.

#### Scenario: Request within chunk boundaries

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P3 and count 2
- **THEN** the tool SHALL return paragraphs P4 and P5

#### Scenario: Request exceeds chunk boundaries

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P4 and count 5
- **THEN** the tool SHALL return an error:
  - `success: false`
  - `error` message explaining the boundary restriction and current chunk range

#### Scenario: Request from last paragraph in chunk

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P5
- **THEN** the tool SHALL return an error indicating no more paragraphs in current chunk

### Requirement: get_previous_paragraphs respects chunk boundaries

The system SHALL enforce chunk boundaries on the `get_previous_paragraphs` tool, rejecting requests that would return paragraphs outside the current chunk.

#### Scenario: Previous paragraphs within chunk

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_previous_paragraphs` with paragraph_id P4 and count 2
- **THEN** the tool SHALL return paragraphs P3 and P2

#### Scenario: Previous paragraphs exceed chunk boundaries

- **GIVEN** the current chunk contains paragraphs [P3, P4, P5] (not starting from P1)
- **WHEN** AI calls `get_previous_paragraphs` with paragraph_id P3 and count 5
- **THEN** the tool SHALL return an error explaining the boundary restriction

### Requirement: get_paragraph_position optional boundaries

The system SHALL enforce chunk boundaries on the optional `include_next` and `include_previous` parameters of `get_paragraph_position` when chunk boundaries are provided.

#### Scenario: include_next within boundaries

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_paragraph_position` with paragraph_id P2, include_next=true, next_count=2
- **THEN** the tool SHALL return position info including P3 and P4 in `next_paragraphs`

#### Scenario: include_next exceeds boundaries

- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_paragraph_position` with paragraph_id P4, include_next=true, next_count=5
- **THEN** the tool SHALL return position info with only P5 in `next_paragraphs`
- **AND** SHALL NOT include paragraphs beyond P5

### Requirement: Boundary error messages

The system SHALL provide clear, actionable error messages when boundary violations occur.

#### Scenario: Boundary violation error format

- **WHEN** a tool rejects a request due to chunk boundary violation
- **THEN** the error response SHALL include:
  - Explanation that the request exceeds current translation range
  - The first and last paragraph IDs of the current allowed range
  - A suggestion to focus on the current chunk's paragraphs

### Requirement: Chunk boundaries propagation

The system SHALL propagate chunk boundary information through the tool execution chain from task services to individual tool handlers.

#### Scenario: Translation service propagation

- **WHEN** `TranslationService.translate()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the `ToolCallLoopConfig` SHALL include these paragraph IDs
- **AND** `executeToolCallLoop()` SHALL pass them to `ToolRegistry.handleToolCall()`
- **AND** tool handlers SHALL receive them in `ToolContext.chunkBoundaries`

#### Scenario: Polish service propagation

- **WHEN** `PolishService.polish()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers

#### Scenario: Proofreading service propagation

- **WHEN** `ProofreadingService.proofread()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers
