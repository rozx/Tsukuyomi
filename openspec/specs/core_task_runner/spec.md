# core_task_runner Specification

## Purpose
定义 AI 任务工具循环协调器（`TaskLoopSession`，`task-runner.ts`）的职责边界：它只负责编排状态机、工具分派、提示策略与流式适配器，并保证消息历史顺序、review 阶段的数据库交叉校验、网络中断的传播方式，以及退化检测与性能指标不被破坏。

## Requirements

### Requirement: Coordinator Internal Run Execution (Metrics: <100 LOC)

The coordinator's `run()` function SHALL stay under 100 lines of code and SHALL delegate turn execution to sub-components (`StateMachineEngine`, `ToolDispatcher`, `PromptPolicy`, `LLMStreamAdapter`) instead of implementing inline tool parsing or prompt logic.

#### Scenario: Run loop delegates each turn

- **GIVEN** a task loop execution process initializing a turn
- **WHEN** the coordinator orchestrates the sub-components
- **THEN** `run()` contains fewer than 100 lines of code
- **AND** it only bounds the turn count, calls `executeTurn()`, and finalizes metrics and the result, without inline tool parsing or prompt logic

### Requirement: Golden Transcript Invariant (Message History Sequence)

The coordinator SHALL append multi-tool responses to the message history in a fixed order: assistant message, tool results, then deferred user messages.

#### Scenario: Multi-tool response is recorded in order

- **GIVEN** an array of tools correctly returned from the AI response
- **WHEN** the Coordinator processes these multi-tool responses
- **THEN** it pushes `{ role: 'assistant', tool_calls: [...] }` to the message array first
- **AND** it dispatches the tools sequentially with the `ToolDispatcher`
- **AND** it pushes one `{ role: 'tool', content, tool_call_id }` message per tool call, in tool-call order
- **AND** it pushes any pending user messages collected during dispatch after all tool messages

### Requirement: Review Integrity and Database Cross-check

During the `review` state the coordinator SHALL confirm missing paragraphs against the database before rejecting the phase.

#### Scenario: Missing paragraph is cross-checked with the database

- **GIVEN** the task is inside the `review` state loop and verifying completeness
- **WHEN** the initial in-memory check indicates a missing paragraph
- **THEN** the Coordinator calls `crossCheckMissingWithDB()` to query the actual stored paragraphs before rejecting the phase
- **AND** only paragraphs confirmed missing in the database are reported back to the AI

#### Scenario: Database cross-check fails

- **GIVEN** the database query inside `crossCheckMissingWithDB()` throws
- **WHEN** the cross-check handles the error
- **THEN** it conservatively returns all originally missing paragraph IDs

### Requirement: Network Aborts Boundaries

Stream cancellations and HTTP errors SHALL propagate out of the task loop without being retried inside the runner.

#### Scenario: Stream is aborted or the request fails

- **GIVEN** a stream cancellation occurs through the AbortController or a `4xx/5xx` HTTP error happens
- **WHEN** the error surfaces during `executeTurn()`
- **THEN** the LLM loop stops and the error is re-thrown to the caller
- **AND** the runner does not retry the turn internally

### Requirement: Execution Invariants Protection

The coordinator SHALL preserve the output degradation guard and all performance metrics counters.

#### Scenario: Degraded output is detected

- **GIVEN** an AI response that repeats characters abnormally
- **WHEN** `detectRepeatingCharacters()` flags the response during a turn
- **THEN** the turn throws an error instead of accepting the degraded output

#### Scenario: Metrics are finalized

- **GIVEN** a task loop that ran one or more turns
- **WHEN** the loop finishes
- **THEN** metrics for planning, working and review durations and the rejected write-tool count are recorded in the result
