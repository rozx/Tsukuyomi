# prompt_policy Specification

## Purpose
定义 `PromptPolicy`（`prompt-policy.ts`）作为 AI 任务循环中所有状态转换提示与工具拒绝文案的唯一来源，使提示词逻辑与网络/循环状态解耦，并保证拒绝文案稳定。

## Requirements

### Requirement: Transition Prompt Isolation

Prompt modifiers for status transitions SHALL be produced by an isolated `PromptPolicy` layer that does not depend on the `TaskLoopSession` network state.

#### Scenario: Building a transition prompt

- **GIVEN** a task executing a valid `transition(prev, next)`
- **WHEN** building the LLM message history modifier
- **THEN** `PromptPolicy` evaluates the contextual modifiers (for example the brief-planning warning or the missing paragraphs payload)
- **AND** it does so without reading the loop's stream, abort controller, or network state

### Requirement: Refusal Error Formulation

Simulated tool-return strings for rejected tool calls SHALL come from `PromptPolicy` so their wording stays identical across call sites.

#### Scenario: Tool call is rejected by the dispatcher

- **GIVEN** a tool call rejected by the `ToolDispatcher` because it is unauthorized for the task type, restricted in the current status, or over its call limit
- **WHEN** the dispatcher builds the tool message returned to the AI
- **THEN** it uses `getUnauthorizedToolPrompt`, `getStatusRestrictedToolPrompt`, or `getToolLimitReachedPrompt` from `PromptPolicy` respectively
