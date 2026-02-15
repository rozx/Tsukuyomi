## 1. Chunk 索引语义对齐

- [x] 1.1 调整 chunk 格式化逻辑：在过滤空段落后，展示标签 `[index]` 使用章节原始段落索引（包含空段落计数）。
- [x] 1.2 保持 chunk 处理边界不变：仅非空段落进入待处理与提交范围，继续以 `paragraph_id` 作为唯一提交标识。
- [x] 1.3 在 chunk 文本说明中补充"索引仅用于定位、空段落已过滤"的提示，降低跳号误解。

## 2. 提示词与工具语义收敛

- [x] 2.1 清理 translation/polish/proofreading 相关提示词中的遗留歧义表述，移除任何"可用 index 提交"的暗示。
- [x] 2.2 统一任务提示文案：明确"提交 MUST 使用 `paragraph_id`，index 仅用于阅读定位"。

## 3. 回归测试与规格对应

- [x] 3.1 新增或更新 chunk 格式化测试：覆盖"含空段落章节"场景，断言展示索引与原始章节位置一致（可跳号）。
- [x] 3.2 新增或更新段落工具协同测试：断言工具返回 `paragraph_index` 与 chunk 展示索引语义一致。
- [x] 3.3 新增或更新提示词测试：断言任务提示不再允许 index 提交，且明确 index 为 display-only。

## 4. 质量校验与变更收尾

- [x] 4.1 执行并通过代码质量检查：`bun run lint` 与 `bun run type-check`。
- [x] 4.2 执行相关测试集并修复失败用例，确认 translation/polish/proofreading 主流程无回归。
- [x] 4.3 自检变更与 OpenSpec 制品一致性，确保 proposal/design/specs 的约束均已落地。
