# langgraph-tracing Specification

## Purpose

利用 LangGraph 内置的 tracing 能力提供 AI 任务执行的 step-by-step 追踪记录，改善调试体验。

## Requirements

### Requirement: 节点级别执行日志

系统 MUST 在每个 Graph 节点执行时记录关键信息，用于调试和分析。

#### Scenario: Agent 节点执行日志

- **GIVEN** agent 节点被执行
- **WHEN** LLM 调用完成
- **THEN** 系统 MUST 记录：LLM 模型名称、输入 token 数（估算）、输出 token 数（估算）、响应时间
- **AND THEN** 日志 MUST 通过 `console.log` 输出（保持与现有方式一致）

#### Scenario: Tool 节点执行日志

- **GIVEN** tool 节点执行一次工具调用
- **WHEN** 工具调用完成
- **THEN** 系统 MUST 记录：工具名称、执行时间、结果摘要（前 100 字符）
- **AND THEN** 日志 MUST 与现有 `ToolRegistry.handleToolCall` 的日志保持一致

### Requirement: 性能指标收集

系统 MUST 在 Graph 执行过程中收集性能指标，并在执行结束后输出。

#### Scenario: 通过 State 收集指标

- **GIVEN** Graph 正在执行
- **WHEN** 各节点执行完毕
- **THEN** 系统 MUST 更新 state.metrics 中的对应字段（planningTime, workingTime, reviewTime, toolCallTime, toolCallCount）
- **AND THEN** Graph 结束后 MUST 输出与现有 `finalizeMetrics()` 相同格式的指标日志

### Requirement: LangSmith 集成（可选/后续）

系统 SHOULD 为后续 LangSmith 集成预留接口，但第一阶段不强制要求。

#### Scenario: 无 LangSmith 配置时

- **GIVEN** 环境变量中未设置 LANGCHAIN_API_KEY
- **WHEN** Graph 执行
- **THEN** 系统 MUST 正常工作，不依赖 LangSmith
- **AND THEN** 所有 tracing 信息 MUST 仅通过本地日志输出
