## 1. 提取前缀长度校验 helper 函数

- [x] 1.1 在 `translation-tools.ts` 中创建 `validatePrefixLength(prefix: string, originalText: string)` 函数，返回 `{ valid: true } | { valid: false, errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT' | 'ORIGINAL_TEXT_PREFIX_TOO_LONG', limit: number }`
- [x] 1.2 在 helper 函数内实现最小长度校验（`effectiveMinLength = min(MIN_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length)`）
- [x] 1.3 在 helper 函数内实现最大长度校验，使用窗口宽度判断替代固定阈值：计算 `ratioMax = max(MIN, floor(len * 0.8))`，当 `ratioMax - effectiveMinLength < MIN_WINDOW_WIDTH(2)` 时放宽为 `originalText.length`，否则使用 `ratioMax`
- [x] 1.4 用三元分支替代条件 spread 语法，确保代码清晰直观

## 2. 重构主流程调用

- [x] 2.1 在 `processTranslationBatch` 循环体中，将内联的前缀长度校验代码替换为 `validatePrefixLength` 调用
- [x] 2.2 保持纯符号段落（`isSymbolOnly`）跳过 `validatePrefixLength` 的现有行为不变
- [x] 2.3 保持 `startsWith` 匹配校验在 helper 函数之外（它适用于所有段落包括符号段落）

## 3. 更新测试

- [x] 3.1 更新"短文本提交完整原文作为前缀时不应触发 TOO_LONG"测试：确保 4~6 字符文本（窗口过窄）的完整原文前缀被接受
- [x] 3.2 更新"长文本提交超出比例上限的前缀仍应触发 TOO_LONG"测试：确保长文本（窗口足够宽）的超比例前缀被拒绝
- [x] 3.3 添加窗口宽度边界测试：7 字符文本（ratioMax=5, min=3, 窗口=2，刚好不放宽），验证长度 6 的前缀被拒绝
- [x] 3.4 验证所有现有前缀校验相关测试仍然通过

## 4. 验证

- [x] 4.1 运行 `bun test translation-tools.test.ts` 全部通过
- [x] 4.2 运行 `bun run lint` 无错误
- [x] 4.3 运行 `bun run type-check` 无错误
