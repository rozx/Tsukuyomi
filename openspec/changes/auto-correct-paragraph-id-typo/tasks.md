## 1. 纠错规则与工具函数

- [x] 1.1 在 `src/services/ai/tools/translation-tools.ts` 新增 `paragraph_id` 编辑距离计算与候选选择函数（阈值 <= 2）。
- [x] 1.2 实现“唯一最优候选才自动纠正”的判定逻辑，并暴露纠错结果结构（原始 ID、纠正 ID、是否歧义）。

## 2. 提交流程集成

- [x] 2.1 在批次参数校验后、重复校验前接入 ID 规范化流程，生成纠正后的 `resolvedIds`。
- [x] 2.2 保持现有范围校验、重复校验与后续处理逻辑不变，确保纠正后 ID 贯穿 `processItems` 与 `accepted_paragraphs`。
- [x] 2.3 对“不可纠正/歧义纠正”场景维持失败路径，确保不会写入错误段落。

## 3. 告警与返回契约

- [x] 3.1 为自动纠正条目生成可读 warning 文案，至少包含原始 `paragraph_id` 与纠正后 `paragraph_id`。
- [x] 3.2 将纠错 warning 合并到工具响应（`warning`/`quality_warnings`）并与既有告警并存。

## 4. 测试与回归验证

- [x] 4.1 为 `add_translation_batch` 增加测试：2 字符内可唯一纠正时成功提交并返回警告。
- [x] 4.2 为 `add_translation_batch` 增加测试：歧义候选与超阈值场景下拒绝提交且返回错误。
- [x] 4.3 增加测试：纠正后若产生重复 ID，仍按现有重复校验规则拒绝。
- [x] 4.4 执行 `bun run lint && bun run type-check`，并修复发现的问题。
