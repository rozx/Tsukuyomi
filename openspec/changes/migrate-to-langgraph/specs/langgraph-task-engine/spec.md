# langgraph-task-engine Specification

## Purpose

基于 LangGraph StateGraph 的声明式 AI 任务执行引擎，替换现有 `TaskLoopSession` 的命令式 while 循环。提供节点（Node）和边（Edge）的声明式图定义，实现 planning → working → review → end 的任务状态机。

## Requirements

### Requirement: StateGraph 定义和编译

系统 MUST 提供一个参数化的 `StateGraph`，支持翻译、润色、校对三种任务类型。Graph 结构通过 `TaskType` 参数控制状态转换规则。

#### Scenario: 构建翻译任务 Graph

- **GIVEN** TaskType 为 `translation`
- **WHEN** 系统构建 StateGraph
- **THEN** Graph MUST 包含以下节点：`agent`、`tools`、`stateRouter`
- **AND THEN** Graph MUST 支持 `planning → working → review → end` 和 `review → working` 的状态转换

#### Scenario: 构建润色/校对任务 Graph

- **GIVEN** TaskType 为 `polish` 或 `proofreading`
- **WHEN** 系统构建 StateGraph
- **THEN** Graph MUST 包含以下节点：`agent`、`tools`、`stateRouter`
- **AND THEN** Graph MUST 支持 `planning → working → end` 的状态转换
- **AND THEN** Graph MUST 禁止 `working → review` 的转换

### Requirement: Agent Node（LLM 调用节点）

系统 MUST 提供一个 agent 节点，通过现有 `AIServiceFactory` 调用 LLM，并将结果转换为 LangGraph 的 message 格式。

#### Scenario: Agent 节点调用 LLM 并返回文本

- **GIVEN** Graph state 中包含 messages 和 tools 定义
- **WHEN** agent 节点被执行
- **THEN** 系统 MUST 调用 `config.generateText()` 生成响应
- **AND THEN** 系统 MUST 将响应转换为 LangGraph message 格式追加到 state.messages

#### Scenario: Agent 节点处理流式回调

- **GIVEN** agent 节点正在执行 LLM 调用
- **WHEN** LLM 返回流式数据
- **THEN** 系统 MUST 通过现有 `createStreamCallback` 处理流式数据
- **AND THEN** 系统 MUST 执行降级检测（重复字符检测）

#### Scenario: Agent 节点返回 tool calls

- **GIVEN** LLM 响应包含 tool_calls
- **WHEN** agent 节点完成执行
- **THEN** 返回的 message MUST 包含 tool_calls 信息
- **AND THEN** Graph 的条件边 MUST 将执行路由到 `tools` 节点

### Requirement: Tool Node（工具执行节点）

系统 MUST 提供一个自定义 tool 节点，通过现有 `ToolRegistry.handleToolCall()` 执行工具调用。

#### Scenario: 执行单个工具调用

- **GIVEN** 最后一条 assistant message 包含一个 tool call
- **WHEN** tool 节点被执行
- **THEN** 系统 MUST 调用 `ToolRegistry.handleToolCall()` 执行该工具
- **AND THEN** 系统 MUST 将结果作为 `role: "tool"` 的 message 追加到 state.messages

#### Scenario: 执行多个工具调用

- **GIVEN** 最后一条 assistant message 包含多个 tool calls
- **WHEN** tool 节点被执行
- **THEN** 系统 MUST 顺序执行所有 tool calls
- **AND THEN** 系统 MUST 将所有结果作为独立的 tool messages 追加到 state.messages

#### Scenario: 工具调用被拒绝（未授权或超限）

- **GIVEN** tool call 的工具名不在允许列表中，或已达调用次数上限
- **WHEN** tool 节点尝试执行该 tool call
- **THEN** 系统 MUST 返回错误提示消息（而非抛出异常）
- **AND THEN** 错误提示 MUST 作为 tool message 追加到 state.messages

### Requirement: State Router Node（状态路由节点）

系统 MUST 提供一个 stateRouter 节点，负责检测工具调用结果中的状态变更、注入状态提示词，并决定是否继续循环。

#### Scenario: 检测到 `update_task_status` 工具的状态变更

- **GIVEN** tool results 中包含 `update_task_status` 的成功响应
- **WHEN** stateRouter 节点处理该结果
- **THEN** 系统 MUST 更新 state.workflowStatus 为新状态
- **AND THEN** 系统 MUST 验证状态转换的有效性

#### Scenario: 检测到 `add_translation_batch` 的成功结果

- **GIVEN** tool results 中包含 `add_translation_batch` 的成功响应
- **WHEN** stateRouter 节点处理该结果
- **THEN** 系统 MUST 更新 state.accumulatedParagraphs 中的段落翻译
- **AND THEN** 系统 MUST 触发 `onParagraphsExtracted` 回调

#### Scenario: 注入状态提示词

- **GIVEN** 当前 workflowStatus 为 `planning`
- **WHEN** stateRouter 节点需要继续循环
- **THEN** 系统 MUST 注入对应的 planning 阶段提示词到 messages
- **AND THEN** 条件边 MUST 将执行路由回 `agent` 节点

### Requirement: 条件边（路由逻辑）

系统 MUST 提供条件边函数控制 Graph 的执行流。

#### Scenario: Agent 输出包含 tool calls 时路由到 tools

- **GIVEN** agent 节点返回的 message 包含 tool_calls
- **WHEN** 条件边函数评估路由
- **THEN** 系统 MUST 路由到 `tools` 节点

#### Scenario: Agent 输出不含 tool calls 时路由到 stateRouter

- **GIVEN** agent 节点返回的 message 不包含 tool_calls
- **WHEN** 条件边函数评估路由
- **THEN** 系统 MUST 路由到 `stateRouter` 节点

#### Scenario: stateRouter 判断任务结束

- **GIVEN** 当前 workflowStatus 为 `end`
- **WHEN** stateRouter 条件边函数评估路由
- **THEN** 系统 MUST 路由到 `END`（图终止）

### Requirement: Custom State Annotation

系统 MUST 定义自定义 State Annotation 扩展 `MessagesAnnotation`，包含任务状态机所需的全部状态字段。

#### Scenario: State 包含必要字段

- **GIVEN** 系统初始化一个新的 Graph 执行
- **WHEN** State 被创建
- **THEN** State MUST 包含：`messages`, `workflowStatus`, `taskType`, `accumulatedParagraphs`, `titleTranslation`, `planningSummary`, `consecutiveStatusCounts`, `toolCallCounts`, `metrics`, `config`

### Requirement: 接口兼容性

系统 MUST 保持与现有 `executeToolCallLoop` 相同的输入/输出接口，使 `text-task-processor.ts` 的调用方无需大幅修改。

#### Scenario: 输入参数兼容

- **GIVEN** 调用方传入 `ToolCallLoopConfig`
- **WHEN** 系统执行 LangGraph graph
- **THEN** 系统 MUST 接受现有的 `ToolCallLoopConfig` 参数
- **AND THEN** 系统 MUST 将参数映射到 Graph 的初始 State

#### Scenario: 输出结果兼容

- **GIVEN** Graph 执行完毕
- **WHEN** 系统返回结果
- **THEN** 返回值 MUST 符合 `ToolCallLoopResult` 接口
- **AND THEN** 包含 `responseText`, `status`, `paragraphs`, `titleTranslation`, `planningSummary`, `metrics`
