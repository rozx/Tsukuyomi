## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Tool context includes chunk boundaries

The system SHALL extend the `ToolContext` interface to include optional chunk boundary information for enforcing paragraph access restrictions during chunked processing, and the boundary identity MUST be paragraph-ID based.

#### Scenario: Tool context with paragraph-ID chunk boundaries

- **WHEN** a translation task processes a chunk of paragraphs
- **THEN** the `ToolContext` passed to tool handlers SHALL contain `chunkBoundaries` with:
  - `allowedParagraphIds`: A Set of `paragraph_id` values that are within the current chunk
  - `firstParagraphId`: The first `paragraph_id` in the current chunk (for error messages)
  - `lastParagraphId`: The last `paragraph_id` in the current chunk (for error messages)

#### Scenario: Tool context without chunk boundaries (AI Assistant)

- **WHEN** a non-chunked context calls tools (e.g., AI assistant chat, standalone tool usage)
- **THEN** the `ToolContext` SHALL NOT contain `chunkBoundaries`
- **AND** tools SHALL allow access to any paragraphs without restriction

### Requirement: Chunk boundaries propagation

The system SHALL propagate paragraph-ID based chunk boundary information through the tool execution chain from task services to individual tool handlers.

#### Scenario: Translation service propagation with paragraph IDs

- **WHEN** `TranslationService.translate()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the `ToolCallLoopConfig` SHALL include these paragraph IDs
- **AND** `executeToolCallLoop()` SHALL pass them to `ToolRegistry.handleToolCall()`
- **AND** tool handlers SHALL receive them in `ToolContext.chunkBoundaries`

#### Scenario: Polish service propagation with paragraph IDs

- **WHEN** `PolishService.polish()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers

#### Scenario: Proofreading service propagation with paragraph IDs

- **WHEN** `ProofreadingService.proofread()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers
