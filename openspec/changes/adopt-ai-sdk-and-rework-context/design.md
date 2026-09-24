# Design

## Context

动机见 proposal.md。与方案直接相关的现状：

- 上层只经 `AIServiceFactory.getService(provider)` 拿到 `AIService`（`getConfig` / `generateText` / `getAvailableModels`）。`AIProvider` 只有 `'openai' | 'gemini'` 两种；`'openai'` 实际承载所有 OpenAI 兼容服务（DeepSeek、Kimi、OpenRouter、本地服务等，用户自填 baseUrl）。
- `generateText` 的返回契约被大量调用方依赖：`TextGenerationChunk` 流式回调、`toolCalls[].function.arguments` 是**原始字符串**（`tools/tool-call-invoker.ts` 依赖它做截断检测 + jsonrepair）、`AIEmptyResponseError`（`single-paragraph-processor.ts`）、取消错误识别（`name === 'AbortError'` 或 message 含「取消」）、token 超限识别（按错误 message 关键词）。
- 现有兼容逻辑（全部要保留，见 specs/ai-provider-adapter）：显式 `tool_choice: 'auto'`、空 content 占位、DeepSeek `reasoning_content: null`、tool 消息带 `name`、`<think>` 流式状态机、`max_tokens` 夹紧到 65536、baseUrl 补 `/v1`、`/api/ai/` 相对路径、CORS 代理 fetch 包装。
- 现有 Gemini 实现的缺陷：`GoogleGenerativeAI` 不接受 baseUrl / fetch，生成请求绕过 CORS 代理和 baseUrl；thought signature 读取的是从未被写入的 `extra_content.google.thought_signature`，实际永远走占位值 `skip_thought_signature_validator`；工具调用 id 用 `Math.random`。
- 旧 OpenAI SDK 默认 `maxRetries: 2`；旧 Gemini SDK 不重试，但无 signal 时有 100s 超时。
- 仓库里没有直接驱动 `OpenAIService` / `GeminiService` 的测试（`custom-headers.test.ts` 只验证配置向任务服务的传递）。
- 所有 AI 请求的取消都是无 reason 的 `controller.abort()`（`stream-handler.ts` 的 `createUnifiedAbortController`、`ai-processing.ts`、`import-agent-service.ts`），因此抛出的是 `name === 'AbortError'` 的 DOMException，AI SDK 下调用方的取消识别不受影响。

上下文管理的现状（阶段三要替换的部分）：

- **度量**：服务侧 `evaluateTokenBudget` / `updateTaskContextUsage` 与 UI 侧 `estimateAssistantContextTokens`（`utils/ai-context-utils.ts`）各算一遍，都用 `estimateMessagesTokenCount`（gpt-tokenizer × 1.6）；UI 只看得到可见消息，于是服务把「完整上下文 − 可见消息」的差值写回 `ChatSession.toolCallTokenOverhead` 给 UI 补偿；另有按「API 上下文条数」计的 180 条阈值（`countContextMessagesSinceSummary`）。窗口来自 `AIModel.maxInputTokens`，通常由 `CONFIG_DISCOVERY_PROMPT` 探测所得。
- **压缩**：`useChatSending.enforceMessageLimitBeforeSend`（UI 侧，按条数 / 估算 token / 200 条存储上限触发 `performUISummarization`）；`AssistantService` 内的发送前摘要（70%）、循环内摘要（85%，单次最多 2 次）、`trimToolMessagesIfNeeded`、`reduceMessagesToFitContext` / `shrinkMessagesToFit`、`getFallbackMessages`（最近 5 条 + 剔除孤儿 tool 消息）、超限错误恢复（`attemptTokenLimitRecovery` 等）。摘要统一走 `summarizeSession`：输入按比例切「早 / 中 / 近」三段、超预算丢最早消息、输出上限 1024、校验失败返回拼接式降级摘要；`summarizeAndReset` 保存摘要并**清空** `apiMessageHistory`（全量重置）。
- **执行模式的硬停**：`AssistantExecution.beforeRequest`（`assistant-execution.ts`）在**每次**请求前用估算值与 `initializeMessages` 传入的 `model.maxInputTokens` 比较，≥ 上限即以 `context_limit` 暂停——这是第 7 套机制，导入 agent 与所有走 execution 的会话都受它约束，且先于其它任何压缩触发。
- **会话持久化是「结果回传」式**：`AssistantService.chat` 返回 `summary` / `messageHistory` / `toolCallTokenOverhead`，由 `useChatSending.persistChatResult` 依次调用 `summarizeAndReset`（会删除 `apiMessageHistory`）与 `updateApiMessageHistory`（超过 512 KB 时跳过保存，下次退回从可见消息重建）；服务层不直接写会话。执行模式下循环内摘要通过 `execution.setSummary` + 原地改写 `messages`，由下一次 `beforeRequest` 的检查点保存落盘。
- **导入 agent**：`import-agent-compaction.ts` 自己按 70% 估算或 180 条触发，同样调用 `summarizeSession` 并清空检查点消息；它通过 `AssistantService.chat({ execution })` 复用助手循环，超限时循环以 `paused: 'context_limit'` 返回，由 `ImportAgentService.converse` 压缩后发一次继续提示。
- 会话存于 localStorage（`tsukuyomi-chat-sessions`），不参与 Gist 同步；`AIModel` 存于 IndexedDB 并参与同步。

## Goals / Non-Goals

**Goals:**

- `AIService` 接口签名与上层调用方零改动；行为以 specs/ai-provider-adapter 为准。
- 新旧实现可在运行时切换，用真实服务做兼容矩阵验证后再删旧实现。
- 兼容逻辑集中在可单测的纯函数 / fetch 包装里，不依赖 AI SDK 内部序列化细节。
- 上下文度量与压缩只有一个实现：纯函数核心 + 薄的存储适配，助手会话与导入检查点共用；所有阈值集中在一处。
- 压缩模块不依赖循环实现，今后迁到 `ToolLoopAgent` 时可直接在 `prepareStep` 里调用。

**Non-Goals:**

- 不使用 `ToolLoopAgent` / 多步 `stopWhen`（工具循环仍由 `task-runner` / `assistant-service` 驱动，后续 change 再迁）。
- 不引入 AI SDK UI（`useChat` 等）、不走 `@ai-sdk/gateway`（永远传 provider 实例，不传字符串模型 id）。
- 不新增 `AIProvider` 枚举值；模型配置 UI 只改「自动获取」的数据来源与提示文案。
- 不做摘要质量的自动评估；不做「按 token 裁剪单条超大工具结果」这类有损压缩。

## Decisions

### D1. 用 `streamText` 单步调用，不注册 `execute`

每次 `generateText` 对应一次 `streamText({ model, messages, tools, toolChoice: 'auto', maxRetries: 2, abortSignal })`，工具只声明 schema（`tool({ description, inputSchema: jsonSchema(parameters) })`），不给 `execute`，因此 AI SDK 只跑一步、不执行工具。

- 消费 `fullStream`：`text-delta` → chunk.text；`reasoning-delta` → chunk.reasoningContent；`tool-input-start/delta/end` 按 id 累积**原始参数字符串**；`tool-call` 只用来取 `providerMetadata`（Gemini thought signature）和补全没有 delta 的情况（`JSON.stringify(input)` 兜底）。
- 这样 AI SDK 的 schema 校验结果（`invalid` 工具调用、`tool-error`）被忽略，参数原样交给 `tool-call-invoker`，截断检测与 jsonrepair 行为不变。
- **备选**：直接调用 `model.doStream()`（LanguageModel 规范层，tool-call 的 input 本就是原始字符串）。更贴近原始数据，但绕过了 `maxRetries`、`abortSignal` 处理与中间件管道，要自己重做。只有 spike 发现 `tool-input-delta` 在某 provider 上拿不到完整原始串时才切换。

### D2. 兼容逻辑分两层：消息转换器 + 请求级 compat fetch

1. **消息转换器**（纯函数，`ChatMessage[] → ModelMessage[]`）：负责内容层规则——空 content 占位（`TOOL_CALL_PLACEHOLDER` / 「（工具返回为空）」）、丢弃空消息、prompt-only 转单条 user、system 消息提取、tool result 与 call 配对、Gemini thought signature 写回 `providerOptions.google`。
2. **请求体改写**（`createOpenAICompatible` 的 `transformRequestBody` 选项，每次请求构造一个闭包）：改写 JSON body 的字段级规则——有 tools 时强制 `tool_choice: 'auto'`；带 `tool_calls` 的 assistant 消息补 `reasoning_content`（按 tool_call id 从本次请求的原始 `ChatMessage` 里查，查不到则 `null`）；tool 消息补 `name`；`max_tokens` 夹紧。`fetch` 请求侧负责 CORS 代理与错误重试分类，不再解析请求 body；响应侧仅按 D4 补兼容字段。

**为什么字段级规则在请求体层做而不是依赖 AI SDK 序列化**：`@ai-sdk/openai-compatible` 是否把 assistant 的 reasoning part 序列化成 `reasoning_content`、是否透传 message 级 providerOptions、`toolChoice: 'auto'` 是否真的写进 body，文档都没有明确承诺，且可能随小版本变化。OpenAI Chat Completions 线格式本身是稳定的，在最终 body 上打补丁是确定的、可以直接断言请求 body 的单测。`transformRequestBody` 是 provider 官方提供的钩子，比在 fetch 里反序列化 body 更干净。**备选**：在 fetch 包装里解析 / 重写 body——仅在 spike 发现 `transformRequestBody` 拿不到需要的字段时回退。

### D3. `<think>` 标签用 `extractReasoningMiddleware`

OpenAI 兼容模型用 `wrapLanguageModel({ model, middleware: extractReasoningMiddleware({ tagName: 'think' }) })` 包装，由中间件处理跨 delta 的标签切分；原生 `reasoning_content` 由 provider 解析为 reasoning part，两路合并到 `reasoningContent`。spike 需确认两路同时存在时不重复。

### D4. Provider 实例化与路由

- `'openai'` → `createOpenAICompatible({ name, baseURL: normalize(baseUrl), apiKey, headers: customHeaders, fetch: compatFetch })`。baseUrl 规范化逻辑（补 `/v1`、`/api/ai/` 转绝对地址、默认 `https://api.openai.com/v1`）原样迁移为纯函数。
- `'gemini'` → `createGoogleGenerativeAI({ baseURL: \`${baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta\`, apiKey, headers: customHeaders, fetch: proxyFetch })`；模型名去 `models/`前缀；名字含`gemini-2`/`gemini-3`时`providerOptions.google.thinkingConfig.includeThoughts = true`；无 signal 时用 `AbortSignal.timeout(100_000)`。
- **专用 provider 仅在 spike 失败时启用**：若通用 provider 在 DeepSeek / Kimi 上丢 reasoning 或破坏多轮工具调用，按 baseUrl 域名（`api.deepseek.com` → `@ai-sdk/deepseek`，`api.moonshot.*` → `@ai-sdk/moonshotai`）分流。**备选**：在 compat fetch 里对 SSE 响应做 TransformStream，把 `reasoning` / `reasoning_details` 改写成 `reasoning_content`。两者择一，以 spike 结果决定，不影响 spec。

2026-09-24 本地契约测试已证实 `@ai-sdk/openai-compatible@3.0.55` 拒绝缺失 id 的工具调用，并忽略 `reasoning_details`。因此先启用上述响应归一化：使用 AI SDK 导出的 `parseJsonEventStream` 解析 SSE，补稳定工具 id、缓冲先参数后名称的片段、丢弃最终无名调用、归一化 reasoning 字段，原始参数字符串保持不变。真实服务矩阵仍须通过，未因此勾选任务 4.2。另将 SDK 默认会重试的 408/409 标记为不可重试，并把浏览器无 Node cause.code 的连接错误标记为可重试，以满足既定 spec。

### D5. Gemini thought signature 作为不透明元数据透传

`AIToolCall` 新增可选字段 `providerMetadata?: Record<string, Record<string, unknown>>`，原样保存 AI SDK `tool-call` part 的 `providerMetadata`，回传时写到对应 tool-call part 的 `providerOptions`。上层不解读它，只负责随消息持久化（聊天记录里多一个可选字段，旧数据不受影响）。assistant 消息的首个工具调用缺 signature 时，沿用现有占位值 `skip_thought_signature_validator`（Google 官方 FAQ 做法），保证旧会话和跨 provider 的历史仍被 Gemini 接受。

### D6. 模型列表与配置探测不走 SDK

- 模型列表：AI SDK 不提供该能力。OpenAI 兼容走 `GET {base}/models`（Bearer + 自定义头，经代理 fetch），Gemini 保留现有 REST 调用与「失败返回空列表」语义。
- 配置探测：`generateText`（非流式）+ 现有 `CONFIG_DISCOVERY_PROMPT`；`parseConfigJson` / `extractConfigFromText` 从 `base-ai-service.ts` 原样迁出为纯函数。Gemini 不再设置 `responseMimeType: 'application/json'`，靠提示词 + 文本兜底解析（spec 已覆盖非 JSON 回复）。

### D7. 运行时双实现开关

`AIServiceFactory` 在迁移期读取 dev flag（`localStorage['tsukuyomi.aiProviderBackend']`，值 `'legacy' | 'ai-sdk'`，读失败按默认值），两种实现都实现 `AIService`。阶段 0 默认 `legacy`，gate 通过后默认改 `ai-sdk`，最后在同一 change 内删除旧实现与开关。不暴露到设置 UI。

**备选**：直接替换、靠 git revert 回滚。放弃原因：兼容矩阵要用真实 key 反复 A/B 对比同一段对话，开关成本很低而收益明显。

2026-09-24 用户确认按当前可用配置范围验收并完成切换：自建 OpenAI 兼容路由下的 GPT-6 Luna/Sol、DeepSeek V4 Pro/V4.1 Flash、GLM 5.3、Kimi K3 已通过真实助手与整章翻译。原生 Gemini/OpenRouter 直连未配置，仅有自动化契约覆盖；FlashX 订阅受限、DeepSeek 不透明超限错误保留为已知限制。此确认解除删除旧实现的 gate，最终只保留 AI SDK，不保留运行时开关。

### D8. 契约测试：stub 全局 fetch + SSE fixture，双实现跑同一套

新旧实现在 jsdom 下最终都走全局 `fetch`（旧 OpenAI 实现经 `createProxiedFetch`，旧 Gemini SDK 直接用全局 fetch），因此契约测试 stub `globalThis.fetch`、mock `ProxyService.getProxiedUrlForAI`，用手写 SSE fixture（DeepSeek 风格 `reasoning_content`、跨 delta 的 `<think>`、分片工具参数、缺 id、截断参数、Gemini thought part + functionCall + thoughtSignature）驱动，用 `describe.each([legacy, aiSdk])` 跑同一套断言：

- 旧实现也能通过的用例 = 特征化测试，先在旧实现上跑绿，证明测试本身正确。
- 旧实现本就不满足的用例（Gemini signature 回传、Gemini 代理 / baseUrl / 自定义头）只对新实现断言，先红后绿。
- 实测补充：旧 OpenAI 的 think 内容可跨 delta，但标签本身拆分会泄漏到正文。旧实现记录为已知失败，新实现对同一 fixture 正常断言；不能将这一场景算成旧实现已经满足。
- 请求侧断言直接检查 stub 收到的 URL / headers / JSON body，覆盖 D2 的全部字段规则。

### D8b. 透传真实 token 用量（阶段一只提供，阶段三才消费）

`TextGenerationResult` 增加可选 `usage: { inputTokens?, outputTokens?, reasoningTokens?, cachedInputTokens? }`，取自 `streamText` 的单步 `finish-step.usage`（单步计数与 `totalUsage` 相同，但保留 `raw`）。实测 SDK 会把缺失细项补零，因此依据 `raw` 中厂商字段的存在性决定是否上报对应计数，不能把补零当成实测。OpenAI 兼容 provider 以 `includeUsage: true` 创建，请求里带 `stream_options.include_usage`；不支持的端点忽略该参数、结果里就没有 `usage`。

阶段一**不**让上层消费 `usage`，保证厂商层迁移的回归可以单独定位；spike 中记录各服务是否真的返回 usage，作为阶段三（D12）的输入。

### D9. 依赖升级

- 新增：`ai@^7`、`@ai-sdk/openai-compatible`、`@ai-sdk/google`、`zod@^4`（同时用于响应归一化的宽松结构校验；工具仍沿用现有 JSON Schema，经 `jsonSchema()` 包装）。
- 移除：`openai`、`@google/generative-ai`（删除旧实现时）。
- 升级：`gpt-tokenizer` 3 → 4（major，只在 `utils/ai-token-utils.ts` 用 `countTokens`，需核对 v4 的 API / 模型参数变化）、`@huggingface/transformers` 4.2 → 4.3、`jsonrepair` 3.14 → 3.15。
- 依赖升级单独成一个任务组、单独提交，先于实现落地，出问题可以单独回退。

### D10. 模型目录：构建期生成的精简快照，懒加载

- `scripts/update-model-limits.ts` 拉取 `https://models.dev/api.json`（约 5 MB，含 200+ provider），只保留 `limit.context > 0` 的条目，输出 `src/services/ai/model-limits/catalog.json`：`{ [providerId]: { [modelId]: [context, output, input?] } }`，并提交进仓库。脚本手动运行（`bun run update:model-limits`），发版前跑一次；不在 CI 里联网。
- 运行时通过动态 `import()` 加载快照，首次查询时才进 bundle chunk。
- 查找：`baseUrl` 主机名 / provider 类型 → models.dev provider id 的映射表（deepseek、moonshotai / moonshotai-cn、google、openrouter、openai 等少量常见项）；命中 provider 则在该 provider 下按规范化 id 找；否则跨 provider 取最小值（spec 要求的保守回退）。规范化：小写、去 `models/`、去 `<vendor>/` 前缀后再比对一次。
- **备选**：运行时从 models.dev 拉取。放弃：离线优先、额外的 CORS / 隐私面、首屏依赖网络。**备选**：手写小表。放弃：维护成本高、覆盖面差。
- 快照体积若超过 ~300 KB，只保留映射表涉及的 provider + 一个「其余 provider 按 id 去重取最小值」的合并表。

### D11. `limitsSource` 与运行时有效上限

- `AIModel.limitsSource?: 'catalog' | 'probe' | 'manual'`。表单里用户改动两个数值字段 → `manual`；「自动获取」命中目录 → `catalog`，走探测 → `probe`。
- `resolveModelLimits(model)`（纯函数，异步加载目录）返回 `{ contextWindow?: number; maxOutput?: number; source }`，按 spec 的优先级：`manual` 用存储值；否则目录命中用目录；否则用存储值；`0` / `UNLIMITED_TOKENS` 视为未知。所有上下文预算只读这个函数，不再直接读 `model.maxInputTokens`。
- 目录值只在运行时覆盖，不回写存储（避免在用户没点保存时改动同步数据）。

### D12. 上下文度量：锚点 + 增量 + 自校准

- `ContextAnchor = { inputTokens, historyLength, historyFingerprint, promptFingerprint, promptTokens, modelKey, estimateAtAnchor }`：每次请求返回 `usage.inputTokens` 时记录。`historyLength` 是发送时历史条数；`historyFingerprint` 是该历史前缀的哈希；`promptFingerprint` 是 system prompt + 工具定义的哈希；`promptTokens` 是锚点时 system/tools 的估算值，用于计算提示词差值；`estimateAtAnchor` 是同一份请求内容未经自校准系数放大的本地估算。
- `measureContext({ systemPrompt, tools, history, anchor, modelKey })`：
  - 有锚点且 `modelKey` 相同、`history` 以锚点时的前缀开头（`historyLength` 以内未被改写）→ `inputTokens + estimate(history.slice(historyLength))`，若 fingerprint 变了再加上 system/tools 估算差值；`estimated: false`。
  - 否则全量估算，`estimated: true`。
- 自校准：模块级 `Map<modelKey, ratio>`，每次拿到锚点时 `ratio = inputTokens / estimateAtAnchor`，用 EMA（α = 0.3）更新，夹在 [0.5, 3]；估算函数用它替代固定的 1.6。只存内存，刷新后从默认值重新学。
- 持久化：助手会话在 `ChatSession.contextAnchor` 存锚点（localStorage，同会话一起存）；导入检查点同理存进检查点。压缩成功时清空锚点。
- 任务面板（`ai-processing` 的 `contextTokens` / `contextPercentage`）改为写入 `measureContext` 的结果，翻译类任务在每次响应后用实测 `inputTokens` 更新。

### D13. 压缩核心：纯函数规划 + 可注入的摘要器

分成三层，便于测试和复用：

1. `planCompaction({ history, keepRecentBudget, pinnedIndex })` → `{ keep: ChatMessage[]; summarize: ChatMessage[] } | null`。纯函数（输入不含 system 消息；执行模式检查点里的 system 消息由调用方先剥离），实现 spec 的全部切点规则：
   - 从末尾往前累加估算 token，超过预算即停，得到「理想切点」；
   - **本轮之前**（`pinnedIndex` 之前）的候选切点只在 user 消息之前——保证保留部分以 user 开头；
   - **本轮之内**（`pinnedIndex` 之后）额外允许在「其前面所有 tool_calls 均已有结果」的 assistant 消息之前切，此时 `keep = [pinned user, ...切点之后]`；
   - 理想切点不是合法切点时向更早方向移动到最近的合法切点；
   - 末尾未答完的 tool_calls 及已有结果整体保留；
   - `keepRecentBudget = 0` 时只保留结构性必须保留的消息（pinned user、未答完的调用）；
   - `summarize` 为空时返回 `null`（不适用）。
2. `summarizeInto({ previousSummary, messages, model, signal })` → `string`：把消息转成摘要输入（沿用 `chat-session-context.ts` / `import-agent-compaction.ts` 现有的工具调用 / 结果截断格式，合并为一个函数），按「摘要请求可用输入 = 窗口 × 0.6 − 已有摘要」分段，逐段更新摘要；每段输出上限 `min(2048, maxOutput)`；校验（非空、≥ 20 字）失败抛错。提示词改为固定小节的结构化模板，新增 `getStructuredSummaryPrompt`，替换 `getSessionSummaryPrompt` 的「早 / 中 / 近」格式。
3. `compactHistory({ history, previousSummary, pinnedIndex, keepRecentBudget, model, signal })` → `{ summary, keep } | null`：编排「规划 → 摘要」，**只返回结果、不写任何存储**；任何一步失败抛错或返回 `null`，调用方的数据保持原样。写回沿用现有的两条落盘路径，不引入新的存储抽象：
   - **循环内（助手会话与执行模式通用）**：原地把 `messages` 替换为 `[system, ...keep]`，并记录 `summary`——执行模式调用 `execution.setSummary`（与现有循环内摘要相同，由下一次 `beforeRequest` 的检查点保存落盘）；普通会话把 `summary` 与最终 `messageHistory`（= keep + 之后新增的消息）通过 `AssistantResult` 回传，由 `persistChatResult` 落盘。
   - **循环外（导入 agent 的运行前 / 手动压缩）**：`import-agent-compaction.ts` 调用 `compactHistory` 后用现有的 `ImportRepository.mutateTask` 写回检查点。

**为什么不做通用的 `ContextHistoryStore`**：会话持久化本来就是「服务回传结果、composable 落盘」，让服务层直接写 Pinia 会话既违反分层约定（services 不依赖 Pinia），又会和 `persistChatResult` 双写同一份数据。

阈值（集中在 `context/constants.ts`）：`reserve = clamp(maxOutput ?? 16384, 4096, 32768)` 且 ≤ 25% 窗口；`keepRecentBudget = min(20000, 25% 窗口)`，超限恢复时减半。

**备选**：直接采用 AI SDK 的 `pruneMessages`。只能删 reasoning / 工具调用，不做摘要，无法满足「不丢信息」；可作为今后的补充手段，本次不用。**备选**：沿用全量重置（摘要后清空历史）。放弃：每次压缩都丢掉最近几轮的原文，模型立刻失去「刚才在做什么」的细节，这是目前摘要后效果差的主要原因之一。

### D14. 触发点收敛与 `AssistantService` 瘦身

- **发送前**：`AssistantService.chat` 在构建消息后调用 `measureContext`，超阈值即 `compactHistory`（`pinnedIndex` = 新 user 消息）。UI 侧 `enforceMessageLimitBeforeSend` 只保留 200 条存储上限的拦截，不再发起摘要；`performUISummarization` 删除。
- **循环步间**：在工具循环每次发起下一次请求前做同样检查，复用上一步的实测 `usage` 作为锚点。
- **超限恢复**：请求抛错且 `isContextOverflowError(error)`（spec 列出的关键词，替换 `messageIndicatesTokenLimit`）→ 以减半预算 `compactHistory` 后重发一次；失败则抛出带用户可读提示的错误。导入 agent 保持暂停契约：`execution` 模式下恢复失败时返回 `paused: 'context_limit'`。该请求的恢复预算统一由 `AssistantService` 管理，`ImportAgentService.converse` 不再额外重试已耗尽恢复预算的请求；之后用户显式压缩成功仍按既有入口恢复运行。
- **执行模式硬停改为只在恢复失败时触发**：删除 `AssistantExecution.beforeRequest` 里基于估算的 `context_limit` 检查以及 `initializeMessages` 的 `contextLimit` 参数；`context_limit` 暂停只由上面的超限恢复失败路径产生。否则它会在新的预判压缩之前按旧估算抢先暂停。
- **结果回传**：`AssistantResult` 删除 `toolCallTokenOverhead`、`needsReset`，新增 `contextAnchor?`（本次最后一次请求的锚点）；`summary` 仅在本次回复内发生过压缩时出现。`persistChatResult` 将结果传给统一的会话保存入口：在候选状态中应用摘要、替换 API 历史、更新可见消息索引、清除旧锚点并写入本次有效锚点；整份候选状态持久化成功后才替换内存状态。始终绑定发起请求的会话。普通回复也走同一入口，避免部分写入。
- 摘要进度事件沿用现有 `onSummarizingStart` / `onSummarizingEnd` 回调，`useInternalSummarization` 的展示逻辑不变。
- 从 `assistant-service.ts` 删除：`evaluateTokenBudget`、`tryPreRequestSummarize` 及其 retry / reset / fallback 链、`evaluateInLoopSummarizeTrigger` / `maybeSummarizeInLoop` / `applyInLoopSummary` 等循环内摘要方法、`trimToolMessagesIfNeeded`、`reduceMessagesToFitContext` / `reduceMessagesOnce` / `shrinkMessagesToFit`、`getFallbackMessages`、`ensureSummaryFitsInContext`、`truncateMessagesForSummary`、`createFallbackSummary`、`mergeSummaries`、`calculateToolCallTokenOverhead`、`attemptTokenLimitRecovery` 等。`summarizeSession` 由 `summarizeInto` 取代。

### D15. 会话数据与向后兼容

- `ChatSession`：新增 `contextAnchor?`；`summary` 继续存摘要文本；压缩后 `apiMessageHistory = keep`、`apiMessageHistoryVisibleMessageCount` 设为当前可见消息数、`lastSummarizedMessageIndex` 设为当前可见消息数（保持旧的「无 API 历史时从可见消息重建」回退路径正确）。`toolCallTokenOverhead` 与 `updateToolCallTokenOverhead` 删除，旧值读到即忽略。
- `summarizeAndReset` 由统一的原子结果保存入口取代，摘要与 kept 历史不会分别保存。`ApiMessage.tool_calls` 的类型补上可选 `providerMetadata`——运行时它已经随 `pickApiMessageExtras` 原样透传并序列化进 localStorage，只是类型上缺失。
- 删除 `apiMessageHistory` 超过 512,000 字符时静默跳过保存的分支。存储失败时保留原有摘要、历史、索引和锚点，向用户报告失败；不得保存新摘要后继续读取旧历史，也不得悄悄丢弃 kept 消息。该修订于 2026-09-24 经用户确认，具体复现见 review.md。
- 系统提示词里注入摘要的格式保持现有「## 之前的对话总结」小节，内容换成结构化摘要。
- 导入检查点：压缩后 `messages = keep`，`summary` 更新；`remainingCalls` / `completedCallIds` 不变（规划阶段已保证有待执行调用时不压缩）。

### D16. 测试策略

- `planCompaction`、`measureContext`、`resolveModelLimits`、目录查找、`isContextOverflowError`：纯函数，按 spec 场景逐条写表驱动单测（空历史、单条、全部可保留、切点落在工具调用组中间、切点落在本轮 user 之后、末尾未答完的调用、锚点前缀被改写、换模型、窗口未知）。
- `summarizeInto`：mock `AIService.generateText`，断言分段次数、每段都带上一段摘要、输出上限、校验失败抛错。
- `compactHistory`：断言摘要失败 / 取消 / 不适用时返回 `null` 或抛错，且输入数组未被修改。
- 需要改写或删除的现有测试（锁定了旧行为）：`assistant-service.in-loop-summary.test.ts`、`assistant-service.summary-safety.test.ts`、`use-chat-sending.context-compression.test.ts`、`use-chat-sending.persist-safety.test.ts`（摘要持久化顺序）、`use-chat-summarizer.token-summary.test.ts`、`ai-context-utils.overhead.test.ts`、`import-agent-compaction.test.ts`、`assistant-execution-profile.test.ts`（估算硬停）。
- 集成：扩展现有 `use-chat-sending.context-compression.test.ts`、`use-chat-summarizer.token-summary.test.ts`、导入 agent 测试，覆盖三个触发点与超限恢复一次；删除只测旧行为（180 条阈值、`toolCallTokenOverhead`、降级摘要）的用例。

## Risks / Trade-offs

- [通用 provider 不解析 Kimi 的 `reasoning` / OpenRouter 的 `reasoning_details`，思考内容丢失] → spike 矩阵逐项验证；按 D4 分流到专用 provider 或做 SSE 改写。
- [放弃旧式 `delta.function_call` 兼容] → spike 期间用开关对比真实在用的服务；若确有依赖，在 compat fetch 的 SSE 改写里把 `function_call` 转成 `tool_calls`。
- [Gemini 生成请求默认开始走 CORS 代理，代理不支持流式 POST 时 Gemini 会整体不可用] → spike 必测「Gemini + 代理」；用户可按模型关闭代理；Electron 不受影响。
- [compat fetch 与 OpenAI 线格式耦合] → 规则集中在一个纯函数，由请求 body 断言测试守护；线格式本身稳定。
- [AI SDK 的 AbortError / APICallError message 与旧 SDK 不同，影响上层基于 message 的 token 超限判断] → 契约测试断言错误 message 包含厂商原始错误文本；spike 用超长上下文实测一次 assistant 的 token 超限恢复路径。
- 2026-09-24 实测补充：GPT 返回 `Your input exceeds the context window of this model. Please adjust your input and try again.`，旧检测因缺少 `token` 漏判。为完成阶段一 gate，提前实施 7.3 的共享错误分类；度量与压缩算法的其余改造仍按后续阶段执行。仅含模型名的 HTTP 400 无法区分上下文超限、参数或路由错误，不能无依据地触发摘要。
- [bundle 体积变化] → 删除 `openai` SDK 可抵消一部分；实现前后各跑一次 `build:spa` 对比主 chunk 体积，明显变大时再考虑把 provider 包改为动态 import。
- [`gpt-tokenizer` v4 计数结果变化，影响上下文预算与摘要触发阈值] → 升级后跑 `use-chat-summarizer.token-summary` 等相关测试，比较固定样本的计数差异；阶段三后估算只用于锚点之后的增量且会自校准，影响进一步缩小。
- [部分 OpenAI 兼容端点不返回 usage，度量退化为纯估算] → 行为与现在一致（估算 + 自校准缺失时用默认系数），UI 标注「≈」；spike 记录各服务是否返回 usage。
- [models.dev 数据有误或过时] → 用户手动值永远优先；超限恢复兜底；发版前刷新快照。跨 provider 回退取最小值，宁可早压缩。
- [保留近期消息后单轮工具结果本身就接近窗口（例如一次读取整章）] → 切点可以落在本轮 user 消息之后，把本轮较早的工具往返摘要掉；仍放不下时按 spec 报错并建议新会话，不做有损截断。
- [摘要质量下降导致模型「失忆」] → 结构化小节强制保留目标、决定、用户问答和关键 ID；每次是「更新」而非「再摘要」；spike 阶段用一段长会话人工对比新旧摘要。
- [删除大量旧逻辑的回归面大] → 阶段三在阶段一 gate 通过后才开始，且以纯函数 + 表驱动测试先行；删除旧路径放在最后一组任务。

## Migration Plan

1. 依赖升级（不含新增 / 移除）→ 质量检查 → 提交。
2. 新增 AI SDK 依赖，实现新 `AIService`，接上开关（默认 `legacy`），契约测试双实现全绿。
3. Spike：在 dev 环境切到 `ai-sdk`，按兼容矩阵用真实服务验证；把结果记录到 tasks.md。未通过项按 D4 / 风险缓解处理，处理完再验。
4. Gate 通过：开关默认值改为 `ai-sdk`。
5. 删除旧实现、开关、`openai` / `@google/generative-ai` 依赖；契约测试去掉 legacy 维度；质量检查。
6. 阶段二：生成模型目录快照，接入 `resolveModelLimits` 与「自动获取」；所有预算读取点切到新函数。
7. 阶段三：落地度量、规划、摘要、编排四个纯模块与两个存储适配器（此时尚未接线）。
8. 接线：助手发送前 / 循环步间 / 超限恢复，导入 agent，UI 与任务面板用量；删除旧的估算、摘要与裁剪路径。
9. 用真实模型跑一段长会话（触发至少两次压缩 + 一次超限恢复）和一次长导入，人工核对摘要与续写效果。

回滚：步骤 5 之前，把 localStorage 开关设回 `legacy` 即可；步骤 5 之后，revert 删除提交。阶段二、三各自独立提交，可单独 revert；会话数据的新字段都是可选的，回退后旧代码忽略 `contextAnchor`，但压缩后保留的 `apiMessageHistory` 仍可被旧代码正常使用。
