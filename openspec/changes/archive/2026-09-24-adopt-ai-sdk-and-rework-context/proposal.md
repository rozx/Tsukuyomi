## Why

两块自研代码同时在「重复造轮子」且脆弱：

1. **厂商适配层**（`providers/openai-service.ts` + `providers/gemini-service.ts` + `core/base-ai-service.ts`，约 1,700 行）手写 SSE 消费、tool_call 增量拼接、`reasoning_content` / `<think>` 提取、消息格式转换——Vercel AI SDK（`ai` v7 + `@ai-sdk/*`）已成熟解决。`@google/generative-ai` 已被 Google 标记为 legacy，且不支持自定义 baseUrl / fetch，导致 Gemini 生成请求绕过 CORS 代理与 baseUrl；Gemini thought signature 从未真正回传。
2. **助手上下文管理**：用量全靠本地估算（gpt-tokenizer × 1.6），上下文窗口来自「问模型自己有多大」的探测；压缩有 7 套相互叠加的机制（发送前 70% 摘要、循环内 85% 摘要、工具消息裁剪、逐条收缩、退回最近 5 条、超限报错恢复，以及执行模式每次请求前按估算直接暂停），外加 UI 与服务两套估算、`toolCallTokenOverhead` 差值修正、按消息条数（180 / 200）的触发；摘要是「全量重置」且在部分路径上直接拼接，失败时生成无意义的降级摘要并静默丢弃历史。导入 agent 还有第三套独立的压缩触发。

换掉厂商层后能拿到厂商实测的 token 用量，这正是重做上下文管理的前提，因此合并在同一个 change 里分阶段完成。

## What Changes

### 阶段一：厂商层迁移到 AI SDK

- **新增** AI SDK 驱动的 `AIService` 实现：`'openai'` provider 走 `@ai-sdk/openai-compatible`，`'gemini'` provider 走 `@ai-sdk/google`；仅当 spike 证明通用 provider 不足时，才按 baseUrl 域名分流到 `@ai-sdk/deepseek` / `@ai-sdk/moonshotai`。保留生成与模型列表接口；后续用户补充将模型资料迁至目录，并移除模型自述探测接口。
- **保留** 应用内部的 `ChatMessage` / `AIToolCall` / `AITool` 格式，只在适配层边界转换。`AIToolCall` 新增**可选**字段承载 provider 元数据（Gemini thought signature），旧数据天然兼容。
- **保留** 现有全部兼容行为：显式 `tool_choice: 'auto'`、空 content 占位、DeepSeek `reasoning_content` 回传、`<think>` 标签分离、无 id 工具调用补 id、`max_tokens` 夹紧、baseUrl 补 `/v1`、`/api/ai/` 相对路径、按模型 CORS 代理、自定义请求头、空响应抛 `AIEmptyResponseError`、取消语义、工具参数以**原始字符串**交给 `tool-call-invoker`。
- **修复** Gemini：生成请求开始尊重 baseUrl、自定义请求头与按模型的 CORS 代理开关（与 `model-cors-toggle` 既有要求及 Gemini 模型列表请求的现有行为对齐）；thought signature 真实回传。
- **新增** `TextGenerationResult.usage`（可选）：透传厂商实测的 input / output / reasoning / cached token 数。
- **BREAKING（边缘）** 放弃旧式 `delta.function_call` 流式格式兼容；spike 若发现在用服务依赖它再补救。
- 以运行时开关并行保留新旧实现做 spike，用真实服务跑兼容矩阵，达标后删除旧实现与 `openai`、`@google/generative-ai` 依赖。

### 阶段二：上下文窗口来源

- **新增** 随应用打包的模型上限目录（由 [models.dev](https://models.dev) 数据生成的精简快照，离线可用，懒加载），按模型 id 查上下文窗口与输出上限。
- **修改** 模型配置的「自动获取」：只查 models.dev 目录，查不到保留原值并提示手动填写；`AIModel` 新增可选 `limitsSource`（`catalog` / `probe` / `manual`）。用户手动填写的值永远优先；来源为探测或未知的旧数据，运行时若目录有记录则以目录为准。

### 阶段三：统一的上下文度量与压缩

- **新增** 统一的上下文度量：以上一次请求的厂商实测 `inputTokens` 为锚点，只对锚点之后新增的内容做估算，估算系数按该模型的「实测 / 估算」比值自校准。UI 进度条、任务面板与压缩触发共用这一个度量；删除 `toolCallTokenOverhead` 修正与 UI / 服务两套估算。
- **新增** 单一压缩算法（纯函数模块，与循环实现无关）：`上下文 > 窗口 − 预留` 时触发；从最新往回保留「近期预算」内的消息；切点只落在不会拆开工具调用与结果的边界；被切掉的部分由模型**更新**已有的结构化摘要（目标 / 约束与偏好 / 进展 / 关键决定 / 用户问答 / 下一步 / 关键标识），而非拼接或摘要的摘要；摘要输入过大时分段迭代。
- **修改** 触发点收敛为三处，共用同一算法：发送前（预判）、工具循环的每一步之间（预判）、厂商返回上下文超限错误时（恢复，只重试一次）。窗口未知时只做恢复型压缩，不再用消息条数当替代信号。
- **删除** 按消息条数触发压缩（`MESSAGE_LIMIT_THRESHOLD` 180）、「退回最近 5 条」、降级拼接摘要、摘要截断猜测、执行模式按估算硬停等路径；摘要失败时不丢历史，直接把错误告知用户。每会话 200 条可见消息的存储上限保留，但不再触发压缩。
- **修改** 导入 agent 的压缩改用同一度量与同一算法（保留其「有待执行工具调用时不可压缩」与上下文超限暂停后自动恢复的语义；手动压缩仍总结全部可总结内容）。

## Capabilities

### New Capabilities

- `ai-provider-adapter`：厂商适配层对上层的行为契约——流式正文 / 思考内容分离、工具调用、兼容规则、Gemini 思考模式与 thought signature、token 用量上报、错误 / 空响应 / 取消 / 重试、请求路由、模型列表、独立可用性测试与思考等级。
- `model-context-limits`：模型上下文窗口与输出上限的来源、优先级与查找规则（打包目录、未收录提示、手动覆盖、旧探测数据兼容）。
- `assistant-context-management`：助手与导入 agent 的上下文度量、压缩触发、保留近期消息的压缩算法、结构化摘要的生成与更新、超限恢复、UI 用量展示与会话持久化。

### Modified Capabilities

（无。`model-cors-toggle` 与 `model-custom-headers` 的既有 requirement 不变，本变更只是让 Gemini 生成请求真正满足它们。`ai-ask-user-tool` 要求「本轮工具操作摘要」包含问答，新的结构化摘要以「用户问答」一节继续满足，不改该 spec。）

## Impact

**代码**

- 新增：`src/services/ai/providers/ai-sdk/`（厂商层）；`src/services/ai/context/`（上下文度量、压缩算法、摘要生成）；`src/services/ai/model-limits/`（目录查找）+ 生成快照的脚本 `scripts/update-model-limits.ts`
- 修改：`ai-service-factory.ts`、`types/ai-service.ts`、`types/ai-model.ts`（`limitsSource`）、`assistant-service.ts`（移除内嵌的估算 / 摘要 / 裁剪 / 恢复逻辑，改调新模块）、`tasks/utils/assistant-execution.ts`（删除估算硬停）、`tasks/utils/task-runner.ts` / `llm-stream-adapter.ts`（把 `usage` 传给任务面板）、`composables/ai-page/useAIPage.ts`（保存 `limitsSource`）、`composables/chat/useChatSending.ts` / `useChatSummarizer.ts` / `useInternalSummarization.ts`、`composables/right-panel/useRightPanel.ts`、`utils/ai-context-utils.ts`、`utils/chat-session-context.ts`、`stores/chat-sessions.ts`、`services/import/import-agent-compaction.ts`、`components/dialogs/AIModelDialog.vue`、`services/ai/tasks/utils/text-task-processor.ts`（任务面板用量）
- 删除：`openai-service.ts`、`gemini-service.ts`、`core/base-ai-service.ts`；`assistant-service.ts` 中的 `evaluateTokenBudget`、`ensureSummaryFitsInContext`、`getFallbackMessages`、`createFallbackSummary`、`trimToolMessagesIfNeeded`、`reduceMessagesToFitContext` / `shrinkMessagesToFit`、循环内摘要与超限恢复的整套私有方法

**数据**

- `ChatSession`（localStorage）：新增可选的实测用量锚点；`toolCallTokenOverhead` 不再读写（旧值忽略）；`summary` 字段语义不变（结构化摘要文本）；`apiMessageHistory` 在压缩后保留近期消息而非清空。旧会话无需迁移。
- `AIModel`（IndexedDB + Gist 同步）：新增可选 `limitsSource`，旧数据与旧客户端兼容。
- 导入任务检查点：压缩后保留近期消息而非清空。

**依赖**

- 新增 `ai`、`@ai-sdk/openai-compatible`、`@ai-sdk/google`、`zod`；条件新增 `@ai-sdk/deepseek`、`@ai-sdk/moonshotai`
- 移除 `openai`、`@google/generative-ai`
- 升级 `gpt-tokenizer`（major）、`@huggingface/transformers`、`jsonrepair`

**非目标**

- 不把 assistant / task-runner 的工具循环迁到 `ToolLoopAgent`（压缩模块与循环实现无关，以后迁移时直接挂进 `prepareStep`）
- 不改翻译 / 润色 / 校对任务的上下文策略（只把任务面板的用量显示换成实测值）
- 不改 Gist 同步格式；不做运行时联网刷新模型目录
- 不升级与 AI 无关的依赖（Vue / Pinia / PrimeVue / Electron / Tailwind 等的 major 升级另开 change）

## 2026-09-24 用户补充

模型配置资料只从 models.dev 目录获取，目录未收录时保留手动输入，不再询问模型自身上限。新增独立可用性测试，以及可持久化并传入实际请求的思考等级选项。
