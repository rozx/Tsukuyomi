# ai-tool-call-loop Specification (Delta)

## Purpose

将 AI 工具调用循环从手动 while 循环迁移到 LangGraph 内置的 tool node 和条件路由机制。保留所有现有的工具调用限制、鉴权检查和结果处理逻辑。

## Requirements

### Requirement: 工具调用路由

系统 MUST 通过 LangGraph 的条件边实现工具调用路由，替代现有 `executeTurn()` 中的 `if (result.toolCalls)` 分支。

#### Scenario: LLM 返回工具调用

- **GIVEN** agent 节点返回包含 tool_calls 的 message
- **WHEN** 条件边函数评估
- **THEN** 系统 MUST 路由到 `tools` 节点
- **AND THEN** tools 节点 MUST 顺序执行所有 tool calls

#### Scenario: LLM 返回纯文本响应

- **GIVEN** agent 节点返回不包含 tool_calls 的 message
- **WHEN** 条件边函数评估
- **THEN** 系统 MUST 路由到 `stateRouter` 节点（而非 tools）

### Requirement: 工具调用限制保留

系统 MUST 在 tool node 中保留现有的工具调用次数限制逻辑（`TOOL_CALL_LIMITS`）。

#### Scenario: 工具调用次数超限

- **GIVEN** 某工具已被调用达到其上限次数（由 `TOOL_CALL_LIMITS` 定义）
- **WHEN** LLM 再次请求调用该工具
- **THEN** tool node MUST 返回 `getToolLimitReachedPrompt` 作为 tool 提示
- **AND THEN** tool node MUST NOT 执行该工具的实际处理函数

### Requirement: 工具授权检查保留

系统 MUST 在 tool node 中保留现有的工具授权检查逻辑（`allowedToolNames`）。

#### Scenario: 调用未授权工具

- **GIVEN** LLM 请求调用一个不在 `tools` 列表中的工具
- **WHEN** tool node 处理该 tool call
- **THEN** tool node MUST 返回 `getUnauthorizedToolPrompt` 作为 tool 提示
- **AND THEN** tool node MUST NOT 执行该工具

### Requirement: 工具结果捕获

系统 MUST 在 tool node 执行后，从工具结果中捕获状态信息（与现有 `captureToolCallResult` 逻辑一致）。

#### Scenario: 捕获 update_task_status 结果

- **GIVEN** tool node 执行了 `update_task_status` 工具且结果成功
- **WHEN** 工具结果被处理
- **THEN** 系统 MUST 更新 state 中的 `pendingStatusUpdate` 或直接更新 `workflowStatus`

#### Scenario: 捕获 add_translation_batch 结果

- **GIVEN** tool node 执行了 `add_translation_batch` 工具且结果成功
- **WHEN** 工具结果被处理
- **THEN** 系统 MUST 从工具参数中提取段落翻译并更新 state.accumulatedParagraphs
- **AND THEN** 系统 MUST 触发 `onParagraphsExtracted` 回调

#### Scenario: 捕获 update_chapter_title 结果

- **GIVEN** tool node 执行了 `update_chapter_title` 工具且结果成功
- **WHEN** 工具结果被处理
- **THEN** 系统 MUST 更新 state.titleTranslation

### Requirement: Productive Tool 计数

系统 MUST 保留现有的 "productive tool" 概念（`PRODUCTIVE_TOOLS`），在检测到 productive 工具调用后重置连续状态计数器。

#### Scenario: Productive tool 调用重置计数

- **GIVEN** tool node 执行了一个 productive tool（如 `add_translation_batch`）
- **WHEN** 工具执行完成
- **THEN** 系统 MUST 重置 state.consecutiveStatusCounts 中的所有计数器为 0

### Requirement: Planning 阶段工具信息收集

系统 MUST 保留 planning 阶段的工具结果收集逻辑，用于生成 planning summary。

#### Scenario: Planning 阶段收集上下文工具结果

- **GIVEN** 当前 workflowStatus 为 `planning`
- **WHEN** AI 调用 `list_terms`、`list_characters`、`search_memory_by_keywords` 等上下文工具
- **THEN** 系统 MUST 将工具名和结果收集到 state 中
- **AND THEN** 当从 planning 转到 working 时，系统 MUST 生成 planningSummary
