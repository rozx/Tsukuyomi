## 1. Implementation

- [x] 1.1 调整状态机：润色/校对跳过并禁用 completed
  - [x] 在 `src/services/ai/tasks/utils/ai-task-helper.ts` 中按 `taskType` 区分 `validTransitions`
  - [x] 覆盖两处校验逻辑：流式输出提前校验 + `executeToolCallLoop` 主循环校验
  - [x] 保持 translation 仍为 `planning → working → completed → end`
  - [x] polish/proofreading 固定为 `planning → working → end`，并拒绝/纠正 `completed`

- [x] 1.2 调整循环引导文案：polish/proofreading 完成后直接 end
  - [x] working 阶段当“无更多变化”或“确认完成”时，引导返回 `{"status":"end"}`（而不是强制 `completed`）
  - [x] 保留 `completed → working` 的回退能力（若用户/模型需要继续修改已输出段落）

- [x] 1.3 更新提示词规则
  - [x] `src/services/ai/tasks/prompts/index.ts`：更新 `getExecutionWorkflowRules('polish'|'proofreading')` 的流程描述

- [x] 1.4 更新流程文档
  - [x] `docs/TRANSLATION_AI_TASK_FLOW.md`：在“状态转换规则”中注明 polish/proofreading 允许 `working → end`

## 2. Tests

- [x] 2.1 单元测试：状态转换规则
  - [x] 新增/更新 tests：translation 禁止 `working → end`
  - [x] 新增/更新 tests：polish/proofreading 允许 `working → end`
  - [x] 新增/更新 tests：polish/proofreading 禁止 `working → completed`（返回 completed 会被纠正为 end）

## 3. Validation

- [x] 3.1 运行 `bun run lint`
- [x] 3.2 运行 `bun run type-check`
- [x] 3.3 运行 `bun test`

