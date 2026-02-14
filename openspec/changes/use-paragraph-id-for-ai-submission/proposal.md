## Why

当前翻译/润色/校对流程允许 AI 在 `add_translation_batch` 中按 `index` 提交结果，这在分块处理、跳读上下文或输出顺序变化时容易把译文写入错误段落，导致段落错配。现在需要统一改为仅使用稳定的 `paragraph_id` 提交，以消除错配风险并提升可追踪性。

## What Changes

- 将 `add_translation_batch` 的提交标识从 `index` 切换为 `paragraph_id`，并禁止仅按 `index` 提交。
- 更新 Translation/Polish/Proofreading 提示词，明确要求 AI 使用段落 ID 提交结果，不再使用序号定位。
- 更新分块构建与任务上下文呈现，确保 AI 在待处理段落中获得可直接提交的 `paragraph_id` 信息。
- 更新工具校验与错误信息：按 `paragraph_id` 校验任务分配范围、重复提交与缺失字段。
- **BREAKING**：移除工具层对 `index` 提交语义的依赖，现有基于 `index` 的调用将不再被接受。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `ai-translation-batch-tool`: 将批量提交参数与校验主键从 `index` 改为 `paragraph_id`，并同步更新原子性与错误场景定义。
- `ai-paragraph-tools`: 调整任务提示词与工具协同约束，要求 AI 仅按段落 ID 提交翻译/润色/校对结果。
- `ai-tool-chunk-boundary`: 调整分块上下文与边界约束的标识语义，确保分块内外校验基于 `paragraph_id` 一致执行。

## Impact

- **受影响代码**：AI 提示词构建（translation/polish/proofreading）、分块内容构建、`add_translation_batch` 工具定义与处理逻辑、任务分配校验逻辑。
- **受影响测试**：工具参数校验、批量提交原子性、分块场景提交、提示词约束相关测试需改为 `paragraph_id` 语义。
- **API/契约影响**：Function Calling 的提交参数契约发生变更（`index` -> `paragraph_id`）。
- **数据与兼容性**：段落实体已有稳定 ID，不涉及数据迁移；但旧提示词或旧调用样例需要同步更新。
