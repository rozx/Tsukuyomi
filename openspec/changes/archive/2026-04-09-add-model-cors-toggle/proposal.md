## Why

当前 AI 模型的 CORS 代理是全局统一行为——浏览器 (SPA) 模式下所有模型的 API 请求都通过 `DEFAULT_CORS_PROXY_FOR_AI` 代理转发。但部分用户使用的 API 端点本身已支持 CORS（如自建的 OpenAI 兼容服务、Cloudflare Workers 代理等），对这些模型使用 CORS 代理是多余的，甚至会增加延迟和降低可靠性。用户需要能够逐模型控制是否走 CORS 代理。

## What Changes

- 在 `AIModel` 接口新增 `useCorsProxy` 可选布尔字段，默认 `true`（保持现有行为）
- 修改 `ProxyService.getProxiedUrlForAI()` 使其接受 `useCorsProxy` 参数，当为 `false` 时即使在浏览器模式下也直接返回原始 URL
- OpenAI 和 Gemini 的 provider 实现中，将模型级别的 `useCorsProxy` 配置传递给代理逻辑
- 在 AI 模型编辑 UI 中添加「使用 CORS 代理」开关，仅在非 Electron 构建中显示
- `AIServiceConfig` 接口新增 `useCorsProxy` 字段以便在调用链中传递该配置

## Capabilities

### New Capabilities

- `model-cors-toggle`: 为每个 AI 模型提供独立的 CORS 代理开关，控制该模型的 API 请求是否通过 CORS 代理服务器转发

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **数据模型**: `AIModel` 接口新增可选字段，向后兼容（旧数据无此字段时默认启用代理）
- **服务层**: `proxy-service.ts` 的 `getProxiedUrlForAI` 签名变更；`openai-service.ts` 和 `gemini-service.ts` 需要传递新配置
- **类型**: `AIServiceConfig` 新增可选字段
- **UI**: 模型编辑对话框新增开关控件（条件渲染，Electron 下隐藏）
- **存储**: IndexedDB 中 `ai-models` store 的数据会包含新字段，无需迁移（可选字段）
