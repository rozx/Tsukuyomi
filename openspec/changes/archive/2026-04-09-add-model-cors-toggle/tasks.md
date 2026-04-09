## 1. 数据模型层

- [x] 1.1 在 `src/services/ai/types/ai-model.ts` 的 `AIModel` 接口中新增 `useCorsProxy?: boolean` 可选字段
- [x] 1.2 在 `src/services/ai/types/ai-service.ts` 的 `AIServiceConfig` 接口中新增 `useCorsProxy?: boolean` 可选字段

## 2. 代理服务层

- [x] 2.1 修改 `src/services/proxy-service.ts` 中 `ProxyService.getProxiedUrlForAI()` 的签名，新增 `useCorsProxy?: boolean` 参数，当 `useCorsProxy` 为 `false` 时直接返回原始 URL

## 3. AI Provider 层

- [x] 3.1 修改 `src/services/ai/providers/openai-service.ts` 中 `createProxiedFetch()` 方法，使其接收并使用 `useCorsProxy` 配置；当 `useCorsProxy` 为 `false` 时跳过 CORS 代理包装
- [x] 3.2 修改 `src/services/ai/providers/openai-service.ts` 中 `createClient()` 方法，将 `useCorsProxy` 从 config 传递到 `createProxiedFetch()`
- [x] 3.3 检查 `src/services/ai/providers/gemini-service.ts` 中是否有使用 `ProxyService.getProxiedUrlForAI` 的调用，如有则传递 `useCorsProxy` 参数

## 4. 配置构建层

- [x] 4.1 找到所有将 `AIModel` 转换为 `AIServiceConfig` 的位置，确保 `useCorsProxy` 字段被正确传递

## 5. UI 层

- [x] 5.1 在 AI 模型编辑对话框中添加「使用 CORS 代理」ToggleSwitch 控件，使用 `useElectron()` 的 `isBrowser` 控制仅在 SPA 模式下显示
- [x] 5.2 确保新建模型时 `useCorsProxy` 默认为 `true`

## 6. 验证

- [x] 6.1 运行 `bun run lint` 确保无 lint 错误
- [x] 6.2 运行 `bun run type-check` 确保无类型错误
