## Context

当前 AI 模型的 API 请求在浏览器 (SPA) 模式下统一通过 `DEFAULT_CORS_PROXY_FOR_AI`（`https://cors.rozx.moe/?{url}`）转发，逻辑集中在：

- `ProxyService.getProxiedUrlForAI(url)` — 静态判断 Electron vs 浏览器，浏览器模式一律代理
- `OpenAIService.createProxiedFetch()` — 在自定义 fetch 中调用上述方法包装每个请求 URL
- `GeminiService` — 使用 `@google/generative-ai` SDK，该 SDK 不暴露 fetch 注入点，目前未使用 AI CORS 代理

用户可能使用本身已配置 CORS 响应头的 API 端点（自建 OpenAI 兼容服务、Cloudflare Workers 代理等），对这些端点额外走 CORS 代理只增加延迟和故障点。

## Goals / Non-Goals

**Goals:**

- 每个 AI 模型可独立控制是否通过 CORS 代理发送 API 请求
- 默认行为保持不变（SPA 模式下默认启用 CORS 代理）
- Electron 构建中此选项不可见（Electron 无 CORS 限制）
- 向后兼容：旧数据无此字段时自动视为启用代理

**Non-Goals:**

- 不修改全局代理设置（`ProxySettingsTab` 中的通用代理设置保持不变）
- 不支持为 AI 模型选择不同的代理 URL（仅控制是否使用默认 AI CORS 代理）
- 不处理 Gemini SDK 的 CORS 代理注入（Gemini SDK 架构限制，留待后续）

## Decisions

### D1: 字段设计 — `useCorsProxy` 可选布尔字段

在 `AIModel` 接口新增 `useCorsProxy?: boolean`，`undefined` 和 `true` 均表示启用（默认行为）。

**理由**: 可选字段使旧数据无需迁移，`undefined` fallback 到 `true` 保持向后兼容。相比三态枚举（auto/always/never），布尔开关对用户更直观。

**替代方案**: 使用 `corsMode: 'auto' | 'always' | 'never'` 枚举 — 过度设计，当前需求仅需开/关。

### D2: 配置传递路径

`AIModel.useCorsProxy` → `AIServiceConfig.useCorsProxy` → `ProxyService.getProxiedUrlForAI(url, useCorsProxy)` → OpenAI 自定义 fetch / Gemini 请求

在现有调用链中，`AIServiceConfig` 由各消费方（翻译任务、校对任务、助手等）从 `AIModel` 构建。新增字段后，所有消费方自动获得此配置（因为它们都从同一个 model-to-config 转换函数构建）。

### D3: `getProxiedUrlForAI` 签名变更

将签名从 `getProxiedUrlForAI(url: string)` 改为 `getProxiedUrlForAI(url: string, useCorsProxy?: boolean)`。

当 `useCorsProxy` 为 `false` 时，直接返回原始 URL，跳过代理包装。`undefined` 或 `true` 保持现有行为。

### D4: UI 条件渲染

在模型编辑组件中使用 `useElectron()` composable 的 `isBrowser` 判断，仅在 SPA 模式下显示「使用 CORS 代理」开关。开关使用 PrimeVue `ToggleSwitch` 组件，与现有 UI 风格一致。

## Risks / Trade-offs

- **[用户误关代理导致请求失败]** → 开关描述文案中说明：关闭代理后如遇 CORS 错误需重新开启。默认值为启用以降低误操作风险。
- **[Gemini SDK 不支持自定义 fetch]** → 当前 Gemini 模型的 CORS 代理支持有限（SDK 限制），此变更对 Gemini 模型同样提供开关但实际效果取决于 SDK 能力。在 UI 中不做区分，让用户自行决定。
- **[字段可选导致判断分散]** → 统一在 `getProxiedUrlForAI` 中处理默认值逻辑，调用方只需传递字段即可。
