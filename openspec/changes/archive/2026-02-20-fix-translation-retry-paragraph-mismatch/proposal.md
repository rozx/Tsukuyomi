## Why

当前翻译流程在模型首次提交失败后会进入重试，但重试 payload 有时会遗漏或错配 `paragraph_id`，导致段落与译文对应关系不稳定。这个问题直接影响翻译可信度与可追踪性，需要尽快把“工具校验结果”和“后续段落应用结果”统一到同一个权威来源。

## What Changes

- 为 `add_translation_batch` 定义规范化成功返回：返回已校验通过的段落清单（canonical accepted items），作为后续应用与进度统计的唯一来源。
- 为 `add_translation_batch` 失败场景补充结构化错误字段（如缺失/无效 `paragraph_id` 的机器可读信息），让模型重试可精确修复而非重新猜测。
- 调整任务执行环节对翻译批次结果的消费方式：优先使用工具返回的规范化结果，而不是直接依赖原始 tool call 参数。
- 明确重试与完整性检查语义：当提交失败时不得推进段落完成状态；当提交成功时仅以规范化返回的段落集合更新完成状态。

## Capabilities

### New Capabilities

- `ai-translation-result-canonicalization`: 定义翻译批次工具结果在任务执行链路中的权威来源与消费规则，确保重试后段落映射一致。

### Modified Capabilities

- `ai-translation-batch-tool`: 扩展成功/失败返回契约，增加规范化 accepted items 与结构化错误信息，并约束重试修复行为。

## Impact

- Affected specs: `ai-translation-batch-tool`（修改），`ai-translation-result-canonicalization`（新增）。
- Affected code: `src/services/ai/tools/translation-tools.ts`, `src/services/ai/tasks/utils/task-runner.ts`, `src/services/ai/tasks/prompts/runner.ts`。
- Affected tests: translation tool 校验与执行循环相关测试（如 `src/__tests__/translation-tools.test.ts`、`src/__tests__/ai-task-helper.executeToolCallLoop.test.ts`）。
- External impact: 无新增外部依赖；工具返回 JSON 契约会增强，需保持向后兼容读取策略。
