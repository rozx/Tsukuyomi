## Why

当前 `add_translation_batch` 工具强制要求 AI 提供 `original_text_prefix` 字段用于防错位校验。这会增加 AI token 消耗（每个段落额外生成 5-20 个字符的前缀），且在某些场景下（如原文格式特殊、AI 模型能力强不易错位）属于不必要的开销。需要提供书籍级别的开关，让用户自主选择是否启用此校验。

## What Changes

- 在 `Novel` 数据模型中新增 `enableOriginalTextValidation` 字段（默认 `undefined`，等同于启用）
- 在翻译设置弹窗（ChapterSettingsPopover）的全局设置中新增「原文校验」开关，默认关闭（即 `enableOriginalTextValidation = false`）
- 禁用时，`add_translation_batch` 的 tool schema 动态变化：`original_text_prefix` 从 `required` 中移除，AI 无需生成该字段
- 禁用时，handler 中跳过所有 `original_text_prefix` 相关验证（缺失检查、长度检查、前缀匹配检查）
- `translationTools` 从静态数组改为工厂函数，接收配置参数动态生成 schema
- `ToolContext` 新增 `enableOriginalTextValidation` 字段，传递给 handler

## Capabilities

### New Capabilities
- `original-text-validation-toggle`: 书籍级别的原文校验开关，控制 `add_translation_batch` 工具是否要求和校验 `original_text_prefix` 字段

### Modified Capabilities
- `ai-translation-batch-tool`: `original_text_prefix` 从始终必填变为可配置必填/可选

## Impact

- **Models**: `src/models/novel.ts` — `Novel` 接口新增字段
- **UI**: `src/components/novel/ChapterSettingsPopover.vue` — 新增开关和 emit 数据
- **Tools**: `src/services/ai/tools/translation-tools.ts` — 静态数组改工厂函数 + 条件校验
- **Tool Registry**: `src/services/ai/tools/index.ts` — `getTranslationToolsForAI` 接收参数
- **Tool Context**: `src/services/ai/tools/types.ts` — `ToolContext` 新增字段
- **Task Processor**: `src/services/ai/tasks/utils/text-task-processor.ts` — 读取 book 设置并传递
- **Tests**: `src/__tests__/translation-tools.test.ts`, `tools.test.ts` — 适配新函数签名
