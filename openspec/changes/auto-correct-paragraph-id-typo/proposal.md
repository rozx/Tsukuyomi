## Why

当前 `add_translation_batch` 对 `paragraph_id` 采用严格匹配，AI 在仅有 1-2 个字符拼写偏差时会被整体拒绝，导致重复重试和吞吐下降。现在需要在不放宽边界校验的前提下，提升轻微 ID 输入错误的容错能力并向模型反馈纠正信息。

## What Changes

- 在 `add_translation_batch` 的参数处理阶段增加“轻微拼写纠错”能力：当 `paragraph_id` 与当前任务可提交 ID 仅有小编辑距离（最多 2 个字符差异）时，自动映射到最可能目标 ID。
- 对每个被自动纠正的条目返回机器可读与可读警告信息，明确原始 ID 与修正后 ID，便于模型后续自我修正。
- 维持现有安全边界：若无法唯一确定候选或偏差超过阈值，仍按现有错误路径拒绝，不改变范围校验和重复校验语义。
- 更新相关规范与任务拆解，确保实现、返回结构与回归测试一致。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `ai-translation-batch-tool`: 调整批量提交工具对 `paragraph_id` 的校验行为，新增“2 字符内拼写纠错 + 警告回传”的规范要求。

## Impact

- 主要影响代码：`src/services/ai/tools/translation-tools.ts`（参数校验、范围验证前的 ID 规范化与告警汇总）。
- 可能影响调用侧契约：`add_translation_batch` 成功响应中的 `warning/quality_warnings` 内容将新增“自动纠错”提示。
- 需要新增/更新测试：覆盖可纠正、不可纠正、歧义候选、重复 ID 纠错后冲突等场景。
