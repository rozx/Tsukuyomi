## 1. 数据模型

- [x] 1.1 在 `src/models/novel.ts` 的 `Novel` 接口中新增 `enableOriginalTextValidation?: boolean | undefined` 字段，添加 JSDoc 注释说明默认值为 false

## 2. UI 设置

- [x] 2.1 在 `src/components/novel/ChapterSettingsPopover.vue` 全局设置的开关组中新增「原文校验」InputSwitch，默认关闭
- [x] 2.2 在 emit `save` 事件的 data 类型和 handleSave 方法中加入 `enableOriginalTextValidation` 字段
- [x] 2.3 在 watch 中从 `props.book` 读取 `enableOriginalTextValidation` 初始化开关状态（`undefined` 等同于 `false`）

## 3. Tool Schema 动态化

- [x] 3.1 将 `src/services/ai/tools/translation-tools.ts` 中的 `translationTools` 从 `export const` 静态数组改为 `export function createTranslationTools(options?)` 工厂函数
- [x] 3.2 在工厂函数中根据 `enableOriginalTextValidation` 动态设置 `required` 数组（启用时包含 `original_text_prefix`，禁用时不包含）
- [x] 3.3 禁用时更新 `original_text_prefix` 的 description，标注为可选

## 4. Tool Context 传递

- [x] 4.1 在 `src/services/ai/tools/types.ts` 的 `ToolContext` 接口中新增 `enableOriginalTextValidation?: boolean` 字段
- [x] 4.2 修改 `src/services/ai/tools/index.ts` 的 `getTranslationToolsForAI` 方法，接收 `options?: { enableOriginalTextValidation?: boolean }` 参数并调用 `createTranslationTools`
- [x] 4.3 修改 `ToolRegistry.handleToolCall` 方法，新增 `enableOriginalTextValidation` 参数并传入 ToolContext
- [x] 4.4 修改所有 `getTranslationToolsForAI` 和 `handleToolCall` 的调用方，传递 `enableOriginalTextValidation` 参数

## 5. Handler 条件校验

- [x] 5.1 在 `processTranslationBatch` 函数中新增 `enableOriginalTextValidation` 参数
- [x] 5.2 当 `enableOriginalTextValidation !== true` 时，跳过 `MISSING_ORIGINAL_TEXT_PREFIX` 检查
- [x] 5.3 当 `enableOriginalTextValidation !== true` 时，跳过 `validatePrefixLength` 检查
- [x] 5.4 当 `enableOriginalTextValidation !== true` 时，跳过 `original_text_prefix` 匹配检查（`includes`）

## 6. Task Processor 集成

- [x] 6.1 在 `src/services/ai/tasks/utils/text-task-processor.ts` 中从 book 对象读取 `enableOriginalTextValidation` 设置
- [x] 6.2 将设置传递给 `ToolRegistry.getTranslationTools` 和 `ToolRegistry.getTranslationToolsForAI` 用于构建动态 schema
- [x] 6.3 确保 `handleToolCall` 调用时传入 `enableOriginalTextValidation`

## 7. 父组件保存逻辑

- [x] 7.1 在 `ChapterSettingsPopover` 的父组件处理 `save` 事件时，将 `enableOriginalTextValidation` 写入 book 对象并持久化

## 8. 测试适配

- [x] 8.1 更新 `src/__tests__/translation-tools.test.ts`，适配 `createTranslationTools` 新签名
- [x] 8.2 更新 `src/services/ai/tools/tools.test.ts`，适配新签名
- [x] 8.3 新增测试：验证 `enableOriginalTextValidation=false` 时跳过 prefix 校验
- [x] 8.4 新增测试：验证 `enableOriginalTextValidation=true` 时保持所有校验行为

## 9. Lint & Type Check

- [x] 9.1 运行 `bun run lint` 修复所有 lint 错误
- [x] 9.2 运行 `bun run type-check` 确保类型安全
