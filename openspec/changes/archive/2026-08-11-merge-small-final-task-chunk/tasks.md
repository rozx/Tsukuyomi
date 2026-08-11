## 1. 分块行为测试

- [x] 1.1 为 `buildChunks` 添加回归测试：末块严格小于 `chunkSize / 3` 时合并，并保持文本与段落 ID 顺序。
- [x] 1.2 添加边界测试：末块恰好等于或大于三分之一时不合并，零/单块结果不变。
- [x] 1.3 为 `buildFormattedChunks` 添加回归测试，确认翻译格式化路径使用相同的小尾块合并规则。
- [x] 1.4 在实现前运行新增测试并确认其因缺少尾块合并行为而失败。

## 2. 共享分块实现

- [x] 2.1 在共享 `buildChunks` 返回前实现一次性小尾块合并，使用严格的 `last.text.length * 3 < chunkSize` 判断。
- [x] 2.2 合并文本与 `paragraphIds` 时保持原始顺序，并补充简体中文注释说明允许超过常规 `chunkSize` 的原因。
- [x] 2.3 运行 chunk formatter 及相关 AI 任务测试，确认翻译、润色、校对与重建路径无回归。

## 3. 质量校验与规格收尾

- [x] 3.1 运行并通过 `bun run lint`。
- [x] 3.2 运行并通过 `bun run type-check`。
- [x] 3.3 运行并通过 `bun run quality-check`。
- [x] 3.4 校验 OpenSpec change，并核对 proposal、spec、design、tasks 与最终实现一致。
