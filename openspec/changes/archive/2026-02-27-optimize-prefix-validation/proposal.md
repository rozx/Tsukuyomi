## Why

`add_translation_batch` 工具的 `original_text_prefix` 长度校验逻辑随着对纯符号段落和短文本的补丁修复变得复杂且难以理解。当前实现使用条件 spread 数组、多层嵌套 Math.max/min 和魔法数字阈值，增加了维护成本并降低了可读性。需要重构为更清晰的校验策略。

## What Changes

- 将 `maxOriginalTextPrefixLength` 计算从条件 spread 语法（`...(condition ? [value] : [])`）重构为直接的三元分支，消除不必要的数组分配
- 将前缀校验中的"短文本阈值"从基于 `2 * MIN_ORIGINAL_TEXT_PREFIX_LENGTH` 魔法数字改为基于合法窗口宽度的动态计算，使放宽逻辑精确对应窗口过窄问题而非依赖经验常数
- 提取前缀长度校验为独立的 helper 函数，使 `processTranslationBatch` 主流程更清晰
- 考虑将 `TOO_LONG` 从硬性拒绝降级为 warning（仅记录日志），因为前缀过长是效率问题而非正确性问题——`startsWith` 匹配已保证段落对应正确性

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `ai-translation-batch-tool`: 前缀长度校验的实现策略变更——短文本放宽条件改为基于合法窗口宽度、`TOO_LONG` 可能降级为 warning、代码结构重构。功能行为对 AI 端无感知变化（仍接受相同的合法前缀、拒绝相同的非法前缀），但长文本中 0.8~1.0 范围的前缀可能从拒绝变为接受（如果 TOO_LONG 降级为 warning）。

## Impact

- **代码**: `src/services/ai/tools/translation-tools.ts` — 前缀校验逻辑重构
- **测试**: `src/__tests__/translation-tools.test.ts` — 测试用例需同步更新以反映新行为（如果 TOO_LONG 降级）
- **API 行为**: 如果 TOO_LONG 降级为 warning，AI 提交的稍长前缀将被接受而非拒绝，减少不必要的重试循环
