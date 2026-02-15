## Why

当前翻译/润色/校对任务在构建 chunk 时会过滤空段落并在 chunk 内重新编号，而段落查询工具返回的 `paragraph_index` 仍基于章节原始顺序（包含空段落）。这会让模型在“任务段落索引”和“工具返回索引”之间出现认知错位，增加误判和无效工具调用。现在需要统一索引语义，降低工具协作中的歧义。

## What Changes

- 调整任务 chunk 展示索引语义：继续过滤空段落参与处理，但展示的 `[index]` 改为章节原始 `paragraph_index`（包含空段落计数），不再使用 chunk 内重编号。
- 明确索引用途：在 chunk 提示中声明索引仅用于阅读定位，提交结果必须使用 `paragraph_id`。
- 清理残留歧义提示：移除仍在提示词/循环提醒中出现的“`index` 或 `paragraph_id` 均可提交”表达，统一为仅 `paragraph_id`。
- 补充回归测试：覆盖“章节含空段落”场景，验证 chunk 展示索引与段落工具 `paragraph_index` 一致，且提交路径不受影响。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `ai-tool-chunk-boundary`: 调整待处理段落 chunk 的索引展示语义，要求展示索引与章节原始段落位置一致（含空段落计数），并保持 `paragraph_id` 为唯一提交主键。
- `ai-paragraph-tools`: 明确 `paragraph_index` 为章节原始索引（包含空段落），并要求与任务 chunk 展示索引保持一致，避免跨工具语义冲突。

## Impact

- 受影响代码：`src/services/ai/tasks/utils/chunk-formatter.ts`、`src/services/ai/tasks/utils/text-task-processor.ts`、`src/services/ai/tasks/prompts/runner.ts` 及相关提示词构建代码。
- 受影响测试：`src/__tests__/paragraph-id-submission.test.ts`、`src/__tests__/translation-tools.test.ts` 以及与段落索引语义相关的任务/工具测试。
- API/契约影响：`add_translation_batch` 的提交契约不变（仍为 `paragraph_id`），本变更主要收敛索引展示与提示语义。
- 用户与模型行为影响：减少“同一段落在不同上下文索引不一致”导致的理解偏差，提升工具调用稳定性。
