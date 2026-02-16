# Tasks: migrate-to-langgraph

## 1. 依赖安装与环境验证

- [ ] 1.1 安装 `@langchain/langgraph` 和 `@langchain/core` 依赖
  - 运行 `bun add @langchain/langgraph @langchain/core`
  - 验证安装成功且无版本冲突
- [ ] 1.2 验证 Electron 兼容性
  - 创建一个最小测试脚本，在 Electron 渲染进程中 import `StateGraph` 和 `Annotation`
  - 确认无 Node.js 原生模块依赖导致的打包问题
  - 验证 `quasar dev` 启动无报错
- [ ] 1.3 确认 tree-shaking 和包大小
  - 检查实际引入的 `@langchain/core` 模块大小
  - 确认只导入所需模块（`Annotation`, `MessagesAnnotation`, `StateGraph`, `START`, `END`）

## 2. State Annotation 定义

- [ ] 2.1 创建 `src/services/ai/tasks/utils/graph/state.ts`
  - 定义 `TranslationStateAnnotation`，扩展 `MessagesAnnotation`
  - 包含字段：`workflowStatus`, `taskType`, `accumulatedParagraphs`, `titleTranslation`, `planningSummary`, `consecutiveStatusCounts`, `toolCallCounts`, `metrics`, `config`
  - 为 `accumulatedParagraphs` 实现 merge reducer
  - 导出 State 类型 `typeof TranslationStateAnnotation.State`
- [ ] 2.2 定义 message 类型转换工具函数
  - 实现 `convertToGraphMessage(result: TextGenerationResult)` — 将现有 AI 响应转为 LangGraph message 格式
  - 实现 `convertToolCallToGraphFormat(toolCall: AIToolCall)` — 转换工具调用格式
  - 实现 `convertToolResultToGraphFormat(result: AIToolCallResult)` — 转换工具结果格式
  - 确保 `tool_call_id` 正确映射

## 3. Agent Node 实现

- [ ] 3.1 创建 `src/services/ai/tasks/utils/graph/nodes/agent-node.ts`
  - 实现 `agentNode` 函数，调用 `state.config.generateText()` 生成 LLM 响应
  - 集成现有 `createStreamCallback` 处理流式数据和降级检测
  - 使用 `convertToGraphMessage` 将响应转为 Graph message
  - 处理 AbortController 信号（取消支持）
  - 更新 `state.metrics` 中的 LLM 调用时间
- [ ] 3.2 处理 LLM 调用错误
  - 捕获 `generateText` 异常，转为错误 message（而非让 Graph 崩溃）
  - 实现与现有 `handleTaskError` 相同的错误分类逻辑

## 4. Tool Node 实现

- [ ] 4.1 创建 `src/services/ai/tasks/utils/graph/nodes/tool-node.ts`
  - 实现 `toolNode` 函数，从最后一条 assistant message 提取 tool_calls
  - 顺序执行每个 tool call，调用 `ToolRegistry.handleToolCall()`
  - 传递完整上下文参数（`bookId`, `handleAction`, `paragraphIds`, `aiProcessingStore` 等）
  - 将结果转为 `role: "tool"` 的 message 数组返回
- [ ] 4.2 实现工具调用限制检查
  - 在执行前检查 `state.toolCallCounts` 是否超过 `TOOL_CALL_LIMITS`
  - 超限时返回 `getToolLimitReachedPrompt` 作为 tool message（不执行实际工具）
  - 更新 `state.toolCallCounts` 计数
- [ ] 4.3 实现工具授权检查
  - 检查 tool call 的工具名是否在 `state.config.tools` 列表中
  - 未授权时返回 `getUnauthorizedToolPrompt` 作为 tool message
- [ ] 4.4 实现工具结果捕获
  - 检测 `update_task_status` 结果，标记 state 中的 `pendingStatusUpdate`
  - 检测 `add_translation_batch` 结果，提取段落翻译更新 `accumulatedParagraphs`，触发 `onParagraphsExtracted` 回调
  - 检测 `update_chapter_title` 结果，更新 `titleTranslation`
  - 检测 productive tool 调用，重置 `consecutiveStatusCounts`

## 5. State Router Node 实现

- [ ] 5.1 创建 `src/services/ai/tasks/utils/graph/nodes/state-router.ts`
  - 实现 `stateRouterNode` 函数，处理工具执行后和纯文本响应后的状态路由
  - 根据 `pendingStatusUpdate` 更新 `workflowStatus`
  - 递增 `consecutiveStatusCounts` 中当前状态的计数
- [ ] 5.2 实现 planning 状态逻辑
  - 检查 `consecutiveStatusCounts.planning >= MAX_CONSECUTIVE_STATUS`
  - 达到上限时注入强制转换提示词（`getForceTransitionPrompt`）
  - 正常时注入 planning 状态提示词
  - 从 planning 转到 working 时生成 `planningSummary`
- [ ] 5.3 实现 working 状态逻辑
  - 调用 `verifyParagraphCompleteness` 检查所有段落翻译完整性
  - 根据验证结果注入 `getWorkingFinishedPrompt` 或 `getWorkingContinuePrompt`
  - 检查 `consecutiveStatusCounts.working` 上限
- [ ] 5.4 实现 review 状态逻辑
  - 检查缺失的段落翻译，发现则回退到 working 并注入 `getMissingParagraphsPrompt`
  - 检查 `consecutiveStatusCounts.review >= MAX_CONSECUTIVE_STATUS`，达到上限时注入 `getReviewLoopPrompt`
  - 正常时注入 review 状态提示词

## 6. 条件边函数

- [ ] 6.1 创建 `src/services/ai/tasks/utils/graph/edges/conditions.ts`
  - 实现 `shouldCallToolsOrRoute(state)` — agent 节点后的路由：有 tool_calls → `tools`，无 → `stateRouter`
  - 实现 `routeAfterStateRouter(state)` — stateRouter 节点后的路由：`end` → `END`，其他 → `agent`
- [ ] 6.2 验证条件边覆盖所有分支
  - 确保 Translation 任务支持：planning → working → review ⇄ working → end
  - 确保 Polish/Proofreading 任务支持：planning → working → end（无 review）

## 7. Graph 构建与导出

- [ ] 7.1 创建 `src/services/ai/tasks/utils/graph/index.ts`
  - 实现 `createTaskGraph(taskType: TaskType)` 工厂函数
  - 使用 `StateGraph(TranslationStateAnnotation)` 构建图
  - 添加节点：`agent`, `tools`, `stateRouter`
  - 添加边：`START → agent`，`tools → stateRouter`
  - 添加条件边：`agent → shouldCallToolsOrRoute`，`stateRouter → routeAfterStateRouter`
  - 编译并返回可执行图（第一阶段无 checkpointer）
- [ ] 7.2 实现 `executeToolCallLoopV2` 桥接函数
  - 接受现有 `ToolCallLoopConfig` 参数
  - 将参数映射为 Graph 的初始 State
  - 构建初始 messages 数组（system prompt + user prompt）
  - 调用 `graph.invoke(initialState)`
  - 将 Graph 最终 State 转换为 `ToolCallLoopResult` 返回
  - 处理 AbortController 取消逻辑

## 8. task-runner.ts 重构

- [ ] 8.1 重写 `executeToolCallLoop` 函数
  - 内部调用 `executeToolCallLoopV2`
  - 保持函数签名完全不变（`ToolCallLoopConfig → ToolCallLoopResult`）
  - 逐步弃用旧的 `TaskLoopSession` 类
- [ ] 8.2 保留现有导出接口
  - `ToolCallLoopConfig` 类型导出不变
  - `ToolCallLoopResult` 类型导出不变
  - `executeToolCallLoop` 函数签名不变
- [ ] 8.3 清理旧代码
  - 在功能验证完毕后，移除 `TaskLoopSession` 类
  - 移除 `executeTurn` 方法
  - 移除手动状态跟踪逻辑

## 9. text-task-processor.ts 适配

- [ ] 9.1 修改 `processTextTask` 中对 `executeToolCallLoop` 的调用
  - 确认调用参数无需变更（接口兼容）
  - 验证 chunk 循环逻辑仍然正确
  - 确认 `onParagraphsExtracted` 回调在 Graph 内部被正确触发

## 10. 性能指标与日志

- [ ] 10.1 在 agent-node 中收集 LLM 调用时间
  - 记录每次 `generateText` 的耗时
  - 按 workflowStatus 分类累计（planningTime, workingTime, reviewTime）
- [ ] 10.2 在 tool-node 中收集工具调用时间
  - 记录每次 `handleToolCall` 的耗时
  - 累计到 `metrics.toolCallTime` 和 `metrics.toolCallCount`
- [ ] 10.3 Graph 执行结束后输出指标
  - 在 `executeToolCallLoopV2` 返回前调用 `finalizeMetrics()`
  - 输出与现有格式一致的性能日志

## 11. 测试

- [ ] 11.1 编写 State Annotation 单元测试
  - 测试默认值初始化
  - 测试 `accumulatedParagraphs` 的 merge reducer
  - 测试 `consecutiveStatusCounts` 的递增和重置
- [ ] 11.2 编写 Agent Node 单元测试
  - Mock `generateText`，验证 message 格式转换正确
  - 测试 tool_calls 的正确传递
  - 测试流式回调被正确调用
- [ ] 11.3 编写 Tool Node 单元测试
  - Mock `ToolRegistry.handleToolCall`，验证调用参数
  - 测试工具调用限制逻辑
  - 测试工具授权检查逻辑
  - 测试 `add_translation_batch` 结果捕获
- [ ] 11.4 编写 State Router 单元测试
  - 测试各状态的路由逻辑
  - 测试连续状态计数和强制转换
  - 测试 `verifyParagraphCompleteness` 集成
- [ ] 11.5 编写端到端集成测试
  - Mock LLM 返回预定义的 tool call 序列
  - 验证完整的 `planning → working → review → end` 流程
  - 验证 `ToolCallLoopResult` 包含正确的输出数据
  - 验证 Translation 和 Polish 两种任务类型的行为差异
- [ ] 11.6 回归测试
  - 运行现有 `task-runner.test.ts` 套件（如存在），确保通过
  - 运行现有 `text-task-processor.test.ts` 套件（如存在），确保通过
  - 手动执行一次完整的翻译任务，验证端到端行为
