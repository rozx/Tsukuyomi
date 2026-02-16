## Why

当前 AI 任务执行逻辑（tool call loop、状态管理、chain of thought）完全由自定义代码实现，主要集中在 `task-runner.ts` 的 `TaskLoopSession` 类（约 800 行）。这种方式存在以下问题：

1. **状态转换逻辑分散**: `planning` → `working` → `review` → `end` 的状态管理嵌在 `while` 循环和多层 `if/else` 中，难以可视化和调试
2. **调试困难**: 当 AI Agent 在 tool call loop 中"卡住"或产生意外行为时，缺乏结构化的 trace 和 step-by-step 回放能力
3. **扩展性受限**: 添加新的状态节点（如 "research"、"critique"）需要修改核心循环逻辑，容易引入 regression
4. **缺乏暂停/恢复能力**: 如果任务中途中断（用户关闭页面、网络错误），无法从断点恢复，需要重新开始
5. **tool call 编排手动化**: 重试、并发 tool call 处理、tool call 限制等逻辑都是手动实现

通过迁移到 LangGraph.js，可以将状态机逻辑声明式定义为图（Graph），每个节点是独立的处理函数，边是条件转换。同时获得内置的 checkpoint、trace、human-in-the-loop 支持。

## What Changes

- **替换核心执行引擎**: 将 `task-runner.ts` 中的 `TaskLoopSession` 类和 `executeToolCallLoop` 函数替换为 LangGraph `StateGraph`
- **重构状态管理**: 将 `planning` / `working` / `review` / `end` 状态转换从命令式 `if/else` 改为声明式 graph edges
- **保留现有工具**: `ToolRegistry`、所有工具定义（`translation-tools.ts`、`paragraph-tools.ts` 等）保持不变，仅调整调用方式以适配 LangGraph 的 tool node
- **保留 AI Provider 层**: `AIServiceFactory`、`OpenAIService`、`GeminiService` 不受影响，LangGraph 通过自定义 model wrapper 调用现有 provider
- **保留流式处理**: `stream-handler.ts` 中的降级检测和流回调逻辑保留，集成到 LangGraph 节点内
- **新增依赖**: 添加 `@langchain/langgraph` 和 `@langchain/core` 包
- **新增 Graph 定义**: 为翻译、润色、校对等任务类型定义独立的 StateGraph 或共用一个参数化 Graph
- **迁移 text-task-processor**: `text-task-processor.ts` 中的 chunk 循环逻辑保留，但内部调用改为 LangGraph graph invoke
- **保留业务逻辑**: 批量翻译验证、引号检测、productivity monitor 等业务逻辑完全保留

## Capabilities

### New Capabilities

- `langgraph-task-engine`: LangGraph 任务执行引擎 - 基于 StateGraph 的声明式 AI 任务状态管理和 tool call 编排
- `langgraph-checkpoint`: 任务断点恢复 - 利用 LangGraph checkpointer 实现任务暂停/恢复能力
- `langgraph-tracing`: 任务执行追踪 - 利用 LangGraph 的内置 trace 能力提供 step-by-step 执行记录

### Modified Capabilities

- `ai-task-state-machine`: 从命令式状态管理迁移到 LangGraph 声明式 graph edges
- `ai-tool-call-loop`: 从手动 while 循环迁移到 LangGraph 内置的 tool node 和条件路由

### Removed Capabilities

_(leave empty - 功能不减少，仅替换底层实现)_

## Impact

- **受影响文件**:
  - `src/services/ai/tasks/utils/task-runner.ts` - **核心重构**: `TaskLoopSession` 类替换为 LangGraph `StateGraph` 定义
  - `src/services/ai/tasks/utils/text-task-processor.ts` - **适配修改**: `executeToolCallLoop` 调用改为 graph invoke
  - `src/services/ai/tasks/utils/tool-executor.ts` - **适配修改**: 调整为 LangGraph tool node 格式
  - `src/services/ai/tasks/utils/productivity-monitor.ts` - **微调**: 集成到 graph 节点回调中
  - `src/services/ai/tools/index.ts` - **微调**: `ToolRegistry.handleToolCall` 适配 LangGraph tool 格式
  - `src/services/ai/tasks/translation-service.ts` - **微调**: 调用方式可能微调
  - `src/services/ai/tasks/polish-service.ts` - **微调**: 调用方式可能微调
  - `src/services/ai/tasks/proofreading-service.ts` - **微调**: 调用方式可能微调
  - `src/services/ai/tasks/assistant-service.ts` - **微调**: 助手模式可能需要独立的 graph

- **不受影响**:
  - `src/services/ai/providers/` - AI Provider 层完全不变
  - `src/services/ai/tools/translation-tools.ts` 等工具定义 - 工具逻辑不变
  - `src/services/ai/tasks/utils/stream-handler.ts` - 流处理逻辑保留
  - `src/services/ai/tasks/utils/context-builder.ts` - 上下文构建逻辑保留
  - `src/services/ai/tasks/utils/chunk-formatter.ts` - Chunk 格式化逻辑保留

- **新增依赖**: `@langchain/langgraph`, `@langchain/core`（需评估包大小对 Electron 打包的影响）

- **风险点**:
  - LangGraph 默认使用 LangChain 的 model wrapper，但项目已有自定义 `AIServiceFactory`，需要编写适配层
  - Electron + Quasar 环境下的 Node.js polyfill 兼容性需要验证
  - LangGraph 的 streaming 机制与现有 `TextGenerationStreamCallback` 的集成需要仔细设计
