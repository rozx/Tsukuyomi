# Tasks

> 每个实现任务遵循 TDD：先写会失败的测试 → 实现 → 转绿。每组结束跑 `bun run lint && bun run type-check && bun run quality-check`。

## 1. 依赖升级（单独提交）

- [x] 1.1 升级 `gpt-tokenizer` 到 ^4，核对 v4 的 `countTokens` 签名与模型参数，按需调整 `src/utils/ai-token-utils.ts`；用固定中日文样本记录升级前后的计数差异（写进本任务备注），验证：`bunx vitest run ai-token token-summary` 通过
- [x] 1.2 升级 `@huggingface/transformers` 到 ^4.3、`jsonrepair` 到 ^3.15，验证：`bunx vitest run embedding tool-call-invoker` 通过
- [x] 1.3 记录基线：`bun run build:spa` 的主 chunk 体积写进本任务备注（给 5.3 对比用），验证：全量 `bun run test` 与质量检查通过后提交

### 第 1 组执行记录（2026-09-24）

- 实际安装：`gpt-tokenizer@4.0.0`、`@huggingface/transformers@4.3.0`、`jsonrepair@3.15.0`。
- v3.4.0 与 v4.0.0 的 `countTokens(input: string | Iterable<ChatMessage>, encodeOptions?: EncodeOptions): number` 签名相同。现有入口先转纯文本再计数，无需传模型参数，也无需修改运行时代码。
- 固定样本（v3.4.0 → v4.0.0）：`月光洒在书页上，翻译仍在继续。` 15 → 15；`月明かりが本のページを照らし、翻訳は続いている。` 20 → 20；`こんにちは、世界！你好，世界！` 8 → 8，差值均为 0。
- 定向验证：`bunx vitest run ai-token token-summary embedding tool-call-invoker`，14 个文件、170 个测试全部通过。
- `bun run lint && bun run type-check && bun run quality-check` 通过；Fallow 本次变更无新增 CI 问题。
- 全量 `bun run test`：239 个文件通过、1 个跳过；2,603 个测试通过、5 个跳过，无失败。
- 升级后、迁移 AI SDK 前的 SPA 构建成功；主 chunk `assets/index-B5tUfDu3.js` 为 230,658 字节（225.25 KiB），独立 gzip 测量为 78,983 字节。后续 5.3 以此作为同口径基线。

## 2. 契约测试基建（针对现有实现，先绿）

- [x] 2.1 在 `src/__tests__/ai-provider/` 下建立 fetch stub 与 SSE fixture 工具（OpenAI 兼容 chat.completions 流、Gemini `streamGenerateContent` 流、`/models` 响应），mock `ProxyService.getProxiedUrlForAI`，验证：一个 smoke 用例能驱动现有 `OpenAIService` 与 `GeminiService` 各完成一次生成
- [x] 2.2 用 `describe.each` 为现有实现编写特征化用例，覆盖 spec 中现有实现已满足的场景（流式正文、reasoning 分离、跨 delta `<think>` 内容、分片工具参数、截断参数原样返回、缺 id 补 id、空名丢弃、仅工具调用无正文、空响应错误、prompt-only、`tool_choice`、占位 content、空消息丢弃、`reasoning_content: null`、`max_tokens` 夹紧、baseUrl 规范化、`/api/ai/`、自定义头、模型列表、配置探测三种回复），验证：43 项在旧实现上通过，另 1 项标签拆分缺陷明确记录为 expected fail；lint、type-check、quality-check 通过

## 3. AI SDK 实现（开关默认 legacy）

第 2 组特征测试实测：旧 OpenAI 实现支持 think 内容跨 delta，但不支持标签本身拆分（`<thi` / `nk>思考</th` / `ink>回答` 会把完整标签和思考混入正文）。该用例在旧实现上明确标为已知失败，新实现必须正常通过；这也是任务 3.6 的回归要求。最终 spec 不变。

- [x] 3.1 新增依赖 `ai@^7`、`@ai-sdk/openai-compatible`、`@ai-sdk/google`、`zod@^4`，验证：`bun install` 成功且 type-check 通过
- [x] 3.2 `AIToolCall` 新增可选 `providerMetadata`，`TextGenerationResult` 新增可选 `usage`，验证：type-check 通过，现有聊天记录读写测试不受影响
- [x] 3.3 在 `src/services/ai/providers/ai-sdk/` 实现纯函数：baseUrl 规范化、配置 JSON 解析（从 `base-ai-service.ts` 迁出，旧实现改为引用同一份）、`ChatMessage[] → ModelMessage[]` 转换（含占位、空消息丢弃、tool result 配对、Gemini signature 写回与首个缺失时的占位），验证：对应单测通过
- [x] 3.4 实现 CORS 代理 fetch 与 OpenAI 兼容的 `transformRequestBody`（`tool_choice`、按 tool_call id 回填 `reasoning_content`、tool 消息 `name`、`max_tokens` 夹紧），验证：直接断言改写后 body 的单测通过
- [x] 3.5 实现 model 工厂（OpenAI 兼容：`includeUsage` + `extractReasoningMiddleware`；Gemini：baseURL/headers/代理 fetch、`models/` 前缀、thinking 开关、100s 默认超时），验证：单测断言请求 URL / headers / providerOptions
- [x] 3.6 实现流收集器（`fullStream` → `TextGenerationChunk` 回调 + 最终结果：原始参数串按 id 累积、`tool-call` 兜底、providerMetadata、usage、单个 done chunk、空响应错误、取消错误可识别），验证：单测覆盖 spec 的流式 / 工具调用 / 取消场景
- [x] 3.7 组装 `AiSdkAIService`（`streamText` 单步、无 `execute`、`maxRetries: 2`；模型列表与配置探测按 D6），`AIServiceFactory` 读 `localStorage['tsukuyomi.aiProviderBackend']`（默认 `legacy`，读失败回退默认），验证：第 2 组契约用例对新实现全部通过
- [x] 3.8 为新行为补仅对新实现断言的用例并转绿：Gemini thought signature 回传、Gemini 生成请求走代理 / baseUrl / 自定义头、usage 透传与缺省、瞬时错误重试 2 次 / 非瞬时错误不重试且 message 含厂商原文，验证：用例先红后绿

### 第 3 组执行记录（2026-09-24）

- 新增依赖的锁定版本：`ai@7.0.113`、`@ai-sdk/openai-compatible@3.0.55`、`@ai-sdk/google@4.0.79`、`zod@4.6.5`。
- 配置解析与消息/请求边界先运行缺实现的失败测试，再实现转绿。迁移开关与新行为测试在工厂仍返回 legacy 时明确失败，再接入新实现转绿。
- 契约与边界测试：5 个文件，129 项通过、1 项旧实现已知失败（think 标签本身跨 delta）。新实现没有预期失败或跳过。
- 新实现回归还覆盖：工具参数截断与格式保持、无 delta 的 tool-call 兜底、响应式会话 metadata、signature 往返、仅部分 usage 上报、流块模型名、408/409 不重试、429/5xx 最多重试两次、浏览器连接错误重试、输出后流失败不重试、取消后不发完成通知、原生与标签 reasoning 同时出现。
- `bun run lint`、`bun run type-check`、`bun run quality-check`、`bun run build:spa` 通过。
- 全量 `bun run test`：244 个文件通过、1 个跳过；2,732 个测试通过、1 个旧实现预期失败、5 个跳过，无意外失败。最终仅修正测试异步生成器的 lint 写法，并定向复验该文件 2 项通过。
- 第 1 组已单独本地提交：`fff0e3cb`；第 2–3 组代码保留在工作区，尚未完成任务 5.5 的阶段一收尾提交。

## 4. Spike：真实服务兼容矩阵（gate）

- [ ] 4.1 在 dev 环境把开关切到 `ai-sdk`，对每个服务跑同一段含多轮工具调用的 assistant 对话和一次整章翻译，逐项记录结果到本任务备注：DeepSeek（reasoning 多轮回传）、Kimi（`reasoning` 字段、空 content）、OpenRouter（`reasoning_details`、`tool_choice`）、一个本地 / 自建 OpenAI 兼容服务、Gemini 2.x/3.x（thinking + 工具调用 + signature，分别开关 CORS 代理）；每项同时记录是否返回 usage
- [ ] 4.2 对 4.1 中失败项按 design D4 / Risks 处理（专用 provider 分流或 SSE 改写；旧式 `function_call` 仅在确有服务依赖时补），每个修复先补复现测试，验证：失败项复测通过
- [ ] 4.3 用超长上下文触发一次 assistant token 超限，确认现有超限恢复路径在新实现下仍能识别错误并走摘要，并把各服务返回的超限错误原文记录到本任务备注（供 7.3 做测试样本），验证：UI 中任务正常恢复
- [ ] 4.4 Gate 结论写进本任务备注（全部通过 / 已知限制），通过后把开关默认值改为 `ai-sdk`，验证：不设 localStorage 时走新实现

### Gate 当前状态（2026-09-24）

- 用户已导入 6 个模型，均经同一个自建 OpenAI 兼容路由：GPT-6 Luna、GPT-6 Sol、DeepSeek V4 Pro、DeepSeek V4.1 Flash、GLM 5.3 Flash、GLM 5.3。路由模型列表还提供 `kimi-k3`。已开始真实验证；原生 Gemini 与 OpenRouter 直连配置仍缺失，已向用户确认是否补充或调整验收范围。
- 实际助手入口暴露 AI SDK 7 的指令约束：`messages` 不允许包含 system 消息。已先用非空 system 消息复现失败，再由适配器提取到 `instructions`，并覆盖多条指令顺序。修复后两种 provider 的契约测试及 lint、type-check、quality-check 均通过；全量测试为 2,738 通过、1 个 legacy 预期失败、5 个跳过。
- 验证书籍采用独立的四段日文合成文本，每个模型使用自己的章节。首个无章节关联的测试和一次过低请求数上限的测试已识别为测试设置问题，未据此判断厂商兼容性；后续使用真实章节、增量保存回调和有界完整任务循环验证落盘。
- 经当前兼容路由，GPT-6 Luna、GPT-6 Sol、DeepSeek V4 Pro、DeepSeek V4.1 Flash、GLM 5.3、Kimi K3 均通过两轮工具调用的助手测试和四段整章翻译，已读回 4/4 已选译文。六种模型均观测到 usage。FlashX 受上游订阅权限限制，未算通过。
- 真实超限测试发现 GPT-6 Luna 的 `context window` 错误不含 `token`，因此提前完成任务 7.3。复测为首次 HTTP 400 → 85 字摘要 → 一次重试成功，共 3 次请求；摘要事件各一次。DeepSeek Flash 同类超长输入仅返回 HTTP 400 与模型名，无法可靠识别，明确记录为未恢复。
- 已从真实助手输入框完成一次两轮工具对话并保存完整 6 条 API 历史，也在书籍页面核对六章 100% 与一章未测试的状态。完整结果与去敏感证据见 [validation/spike-report.md](validation/spike-report.md)。
- 原定直连矩阵仍未覆盖，且存在上述限制；任务 4.1–4.4 保持未勾选。临时测试拦截与 localStorage 开关已清理，代码默认仍为 `legacy`。除为 gate 提前完成的 7.3 外，第 5–10 组尚未实施。

## 5. 删除旧实现与收尾

- [ ] 5.1 删除 `openai-service.ts`、`gemini-service.ts`、`core/base-ai-service.ts` 与开关逻辑，移除 `openai`、`@google/generative-ai` 依赖，契约测试去掉 legacy 维度，验证：`bun run test` 全绿，全仓无旧模块引用
- [ ] 5.2 若 4.2 未启用专用 provider，确认 `package.json` 未残留 `@ai-sdk/deepseek` / `@ai-sdk/moonshotai`，验证：`bun run quality-check` 无 unused dependency
- [ ] 5.3 `bun run build:spa` 与 1.3 基线对比主 chunk 体积，明显增大则把 provider 包改为动态 import，验证：体积差写进本任务备注
- [ ] 5.4 更新 CLAUDE.md「技术栈」中的 AI 依赖描述（OpenAI SDK + Google Generative AI → Vercel AI SDK），验证：文档与 `package.json` 一致
- [ ] 5.5 阶段一收尾质量检查：`bun run lint && bun run type-check && bun run test && bun run quality-check` 全部通过，并在浏览器里用真实模型完成一次翻译和一次 assistant 对话；单独提交

## 6. 模型上限目录（阶段二）

- [ ] 6.1 编写 `scripts/update-model-limits.ts` 与 `package.json` 脚本 `update:model-limits`，生成 `src/services/ai/model-limits/catalog.json`（过滤 context 为 0 的条目、按 D10 结构输出），验证：运行后快照体积与条目数写进本任务备注，超过 ~300 KB 时按 D10 的合并方案缩减
- [ ] 6.2 实现目录查找（provider 映射、规范化 id、跨 provider 取最小值、`input` 优先于 `context`），验证：表单驱动单测覆盖 spec「Catalog lookup matching」与「Bundled model limits catalog」全部场景，且快照经动态 import 加载
- [ ] 6.3 `AIModel` 新增可选 `limitsSource`，实现 `resolveModelLimits`（manual > catalog > 存储值，0 / 无限视为未知），验证：单测覆盖 spec「Limit source precedence」全部场景；旧数据与同步反序列化测试通过
- [ ] 6.4 `AIModelDialog.vue`：手动修改数值字段记为 `manual`；「自动获取」先查目录再回退探测，并按来源显示不同提示；`useAIPage.ts` 的 `handleSaveAdd` / `handleSaveEdit` 是逐字段构造 `AIModel` 的，必须带上 `limitsSource`，验证：组件测试覆盖命中 / 未命中两条路径，另有测试断言经 useAIPage 新增与编辑后存储的模型保留 `limitsSource`；浏览器中实测一个目录内模型和一个自定义模型
- [ ] 6.5 把所有直接读取 `model.maxInputTokens` / `maxOutputTokens` 做预算的地方切到 `resolveModelLimits`（`assistant-service.ts`、`text-task-processor.ts`、`import-agent-compaction.ts`、`useChatSending.ts`、`useRightPanel.ts`、`ai-context-utils.ts`），验证：全仓 grep 无剩余预算用途的直接读取；相关测试通过；单独提交

## 7. 上下文度量（阶段三）

- [ ] 7.1 在 `src/services/ai/context/` 实现 `measureContext` 与锚点结构（前缀校验、fingerprint 差值、换模型失效、`estimated` 标记），验证：表驱动单测覆盖 spec「Usage-anchored context measurement」全部场景
- [ ] 7.2 实现按模型的估算自校准（EMA、[0.5, 3] 夹紧、默认系数），`ai-token-utils.ts` 的估算入口接收系数，验证：单测断言多次观测后的系数与边界
- [x] 7.3 实现 `isContextOverflowError`（spec 列出的关键词 + AI SDK `APICallError` 的 message），替换 `messageIndicatesTokenLimit`，验证：用各厂商错误格式及 spike 4.3 捕获的 GPT-6 Luna 真实错误做单测；不把配额、鉴权、仅含模型名的 HTTP 400 当作上下文错误。因真实 gate 漏判提前接入，其他阶段三任务仍待阶段一 gate。

  7.3 实测修复记录：旧逻辑要求错误同时包含 `token`，漏掉真实错误 `Your input exceeds the context window of this model. Please adjust your input and try again.`。先复现助手直接报错，再以公共 `AssistantService.chat` 验证“初次失败 → 摘要 → 重试成功”与成对摘要事件；纯函数覆盖 spec 所有关键词。28 项定向测试通过，完整套件 2,757 通过、1 个 legacy 预期失败、5 个跳过；lint、type-check、quality-check 通过。

## 8. 压缩核心（阶段三）

- [ ] 8.1 实现 `planCompaction`（D13 切点规则：本轮之前只在 user 前切、本轮之内可在已答完调用后的 assistant 前切、pinned user 消息、未答完调用整体保留、预算 0、不适用返回 null），验证：表驱动单测覆盖 spec「Keep-recent compaction」全部场景及空历史 / 单条 / 全部可保留 / 理想切点落在旧轮次 assistant 前时回退到该轮 user 前
- [ ] 8.2 新增结构化摘要提示词 `getStructuredSummaryPrompt`（目标 / 约束与偏好 / 进展 / 关键决定 / 用户问答 / 下一步 / 关键标识，含「更新已有摘要」指令），合并现有两套摘要输入格式化为一个函数，验证：单测断言 `ask_user` / `ask_user_batch` 问答与工具标识出现在摘要输入中
- [ ] 8.3 实现 `summarizeInto`（分段迭代、输出上限 `min(2048, maxOutput)`、校验失败抛错、支持取消），验证：mock `generateText` 的单测覆盖 spec「Structured summary」全部场景
- [ ] 8.4 实现 `compactHistory` 编排（只返回 `{ summary, keep }`，不写存储），验证：单测断言成功路径的返回值，以及摘要失败 / 取消 / 不适用时返回 null 或抛错且输入数组未被修改（spec「Compaction failure never loses history」）
- [ ] 8.5 会话 store：`ChatSession.contextAnchor`、统一原子结果保存入口取代 `summarizeAndReset`（摘要、kept 历史、索引与锚点一次保存，失败保留原状态并抛错）、`ApiMessage.tool_calls` 类型补 `providerMetadata`、删除 `toolCallTokenOverhead` 与 `updateToolCallTokenOverhead`，验证：store 单测覆盖 spec「Assistant session persistence after compaction」的存储场景、超 512,000 字符历史、存储失败与旧会话回退路径
- [ ] 8.6 导入检查点写回：`import-agent-compaction.ts` 用 `compactHistory` 的结果经 `ImportRepository.mutateTask` 写回（剥离 / 保留 system 消息、`messages = keep`、summary 更新、手动压缩用预算 0、有待执行调用时不可压缩），验证：单测覆盖 spec「Import agent uses the same context management」的检查点场景与手动压缩场景

## 9. 接线与删除旧路径（阶段三）

- [ ] 9.1 `AssistantService`：发送前与循环步间调用 `measureContext` + `compactHistory`，循环内原地替换 `messages` 并在执行模式调用 `execution.setSummary`；每次响应后更新锚点与自校准；沿用 `onSummarizingStart` / `onSummarizingEnd` 事件，验证：扩展 `use-chat-sending.context-compression.test.ts` 覆盖两个预判触发点与「窗口未知不触发」「条数不触发」
- [ ] 9.2 `AssistantService`：超限恢复（减半预算压缩 + 重发一次；失败抛出用户可读错误；`execution` 模式下返回 `paused: 'context_limit'`）；删除 `AssistantExecution.beforeRequest` 的估算硬停与 `initializeMessages` 的 `contextLimit` 参数，验证：单测覆盖 spec「Context overflow recovery」全部场景与「No estimate-based hard stop」；改写 `assistant-execution-profile.test.ts` 中锁定旧硬停的用例
- [ ] 9.3 结果回传与落盘：`AssistantResult` 删除 `toolCallTokenOverhead` / `needsReset`、新增 `contextAnchor`；`persistChatResult` 按 D14 通过统一入口原子保存并移除 512,000 字符静默跳过，存储失败通知用户；验证：改写 `use-chat-sending.persist-safety.test.ts`，断言 kept 历史完整保存、存储失败不部分写入、锚点写入发起请求的会话（中途切换会话不串写）
- [ ] 9.4 删除 D14 列出的旧方法与 `summarizeSession`、`performUISummarization`、`useChatSummarizer` 中的摘要逻辑、`MESSAGE_LIMIT_THRESHOLD` 触发；`enforceMessageLimitBeforeSend` 只保留 200 条存储上限拦截，验证：`bun run quality-check` 无新增 unused export；design D16 列出的旧行为测试（`assistant-service.in-loop-summary`、`assistant-service.summary-safety`、`use-chat-summarizer.token-summary`、`ai-context-utils.overhead` 等）逐个改写或删除并在备注说明取舍
- [ ] 9.5 导入 agent：`import-agent-compaction.ts` 改用共享度量与 `compactHistory`（手动 / 自动 / 暂停后恢复语义不变），验证：现有导入 agent 测试全绿并补充「保留近期消息」断言
- [ ] 9.6 UI 用量：`useRightPanel` 的会话统计与任务面板（`ai-processing` 的 `contextTokens` / `contextPercentage`，`text-task-processor.ts` 每次响应后写实测值——需把 `usage` 经 `llm-stream-adapter.ts` 与 `task-runner.ts` 的 `ToolCallLoopConfig.generateText` 返回类型传上来）改用 `measureContext`，估算值显示「≈」，窗口未知不显示百分比，去掉按条数的百分比，验证：组件 / composable 测试覆盖 spec「Context usage display」全部场景，浏览器中目测三种状态
- [ ] 9.7 更新 CLAUDE.md「关键设计」补充上下文度量与压缩的一句话说明，验证：描述与 design D12–D14 一致

## 10. 端到端验证

- [ ] 10.1 在浏览器里用真实模型跑一段长助手会话（含工具调用与一次 `ask_user`），至少触发两次预判压缩：核对摘要是「更新」而非叠加、问答保留、压缩后续写连贯、用量条显示实测值，结果写进本任务备注
- [ ] 10.2 把一个模型的窗口手动调小到能稳定触发超限，验证超限恢复只重试一次、失败时提示新会话且历史未被截断
- [ ] 10.3 跑一次长导入任务触发自动压缩与一次手动压缩，确认来源 / 草稿 / 事件日志不变
- [ ] 10.4 最终质量检查：`bun run lint && bun run type-check && bun run test:coverage && bun run quality-check` 全部通过
