# tool_dispatch_system Specification

## Purpose
定义 `ToolDispatcher`（`tool-dispatcher/`）如何在 AI 任务循环中分派工具调用：统一的处理器返回契约、按任务状态限制写入类工具、工具调用次数上限，以及对重复翻译批次的容错。

## Requirements

### Requirement: Unified ToolExecutionResult Contract

Every `ToolHandler` SHALL return the unified `ToolExecutionResult` shape to the `ToolDispatcher`, never a raw string.

#### Scenario: Handler returns its result

- **GIVEN** a `ToolHandler` implementation executing a raw `AIToolCall`
- **WHEN** returning its result
- **THEN** it returns a `ToolExecutionResult` carrying optional `toolMessage`, `pendingUserMessage`, and `hasProductiveTool`
- **AND** the dispatcher does not need to parse the result a second way downstream

### Requirement: State Protections (Data Writes Guardrails)

For translation, polish, and proofreading tasks, data-write tools (`create_term`, `update_term`, `create_character`, `update_character`, `create_memory`, `update_memory`) SHALL only run in the `planning` and `review` statuses.

#### Scenario: Write tool during planning or review

- **GIVEN** a data-write tool call
- **WHEN** the task status is `planning` or `review` (or a legacy persisted `preparing`)
- **THEN** the tool is executed

#### Scenario: Write tool during working

- **GIVEN** a data-write tool call
- **WHEN** the task status is `working`
- **THEN** the tool is not executed and the AI receives the status-restricted prompt
- **AND** `metrics.workingRejectedWriteCount` is incremented

#### Scenario: Write tool during end

- **GIVEN** a data-write tool call
- **WHEN** the task status is `end`
- **THEN** the tool is not executed and the AI receives the status-restricted prompt

### Requirement: Tool Limit Counting & Ejection

When a tool reaches its limit in `TOOL_CALL_LIMITS`, the dispatcher SHALL skip execution and return the limit-reached prompt.

#### Scenario: Tool call over its limit

- **GIVEN** a tool whose call count has reached its `TOOL_CALL_LIMITS` entry (or the default limit)
- **WHEN** the dispatcher evaluates another call to it
- **THEN** the handler is not executed
- **AND** the AI receives the tool-limit-reached prompt from `PromptPolicy`

### Requirement: Duplicate Batch Tolerance (add_translation_batch)

`add_translation_batch` handling SHALL tolerate repeated or already-translated paragraph IDs.

#### Scenario: Batch repeats paragraph IDs

- **GIVEN** `TranslationBatchHandler` processes an `add_translation_batch` payload containing repeated or already-translated paragraph IDs
- **WHEN** updating the local translation maps
- **THEN** those IDs are overwritten with the new values
- **AND** no exception is raised and the loop keeps running
