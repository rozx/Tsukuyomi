# Change: 润色/校对任务跳过 completed 验证阶段，允许直接进入 end

## Why

当前翻译相关 AI 任务的状态机统一要求 `planning → working → completed → end`，并且显式禁止 `working → end`。

但对 **润色（polish）/校对（proofreading）** 来说，任务往往只需要返回“有变化的段落”，系统侧也不会强制要求覆盖所有段落；此时强制引导进入 `completed` 的“验证阶段”会带来额外回合与不必要的状态循环，降低交互效率。

## What Changes

- 对 **润色（polish）/校对（proofreading）** 任务：
  - 允许 `working → end` 状态转换
  - `completed` 阶段被**跳过/禁用**：状态机固定为 `planning → working → end`
  - 若 AI 仍返回 `{"status":"completed"}`，系统 MUST 纠正并要求改为 `{"status":"end"}`
  - 提示词与循环引导应优先引导任务在工作完成后直接 `{"status":"end"}` 结束当前 chunk
- 对 **翻译（translation）** 任务：
  - 维持现有行为：仍要求 `working → completed → end`（不允许 `working → end`）

## Impact

- Affected specs:
  - 新增 capability：`ai-task-state-machine`（用于描述翻译相关 AI 任务的状态转换约束）
- Affected code (预计实现阶段修改/新增):
  - `src/services/ai/tasks/utils/ai-task-helper.ts`
    - 状态转换校验（流式输出提前校验 + 主循环校验）
    - working 阶段的“完成引导文案”（polish/proofreading 不再强制引导到 completed）
  - `src/services/ai/tasks/prompts/index.ts`
    - `getExecutionWorkflowRules()` 中的流程描述需要与新规则一致
  - `docs/TRANSLATION_AI_TASK_FLOW.md`
    - 状态转换规则段落需要更新：polish/proofreading 改为 `planning → working → end`（不再使用 completed）

