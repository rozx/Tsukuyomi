## Why

当前翻译相关任务把“规划”和“数据维护”混在一起，导致 working 阶段经常被术语/角色/记忆更新打断，AI 难以持续专注在翻译本身。现在需要在 planning 与 working 之间引入明确的准备阶段，把“先整理数据库，再专注翻译”固化为标准流程。

## What Changes

- 在翻译相关任务中新增 `preparing` 状态（位于 `planning` 与 `working` 之间），用于集中处理术语、角色、记忆的创建与更新。
- **BREAKING**：调整状态机顺序。
  - `translation`：`planning → preparing → working → review → end`
  - `polish/proofreading`：`planning → preparing → working → end`
- 明确状态职责与工具权限：
  - `planning`：只做信息收集与规划，不提交翻译。
  - `preparing`：可进行 term/character/memory 的创建与更新，完成后进入 working。
  - `working`：只专注输出翻译；禁止 create/update term/character/memory，相关数据维护必须在 preparing 或 review 执行。
  - `review`：专注复核已有翻译；仍允许创建/更新角色与更新 memory（以及必要术语修正），不再承担翻译前准备职责。
- `preparing` 阶段允许“无更新直接进入 working”，避免无意义停留。
- 本次改动不保留兼容分支，按新状态机与新提示词直接切换。

## Capabilities

### New Capabilities

- 无（本变更不引入全新 capability）。

### Modified Capabilities

- `ai-task-state-machine`：扩展翻译相关任务状态机，新增 `preparing` 并更新各任务类型的合法转换与阶段职责。
- `ai-task-state-tool`：扩展 `update_task_status` 的状态值与转换校验规则，使其支持 `preparing` 并执行新流程。
- `ai-processing-task-status`：补充 `preparing` 在任务工作流状态中的展示语义与映射要求。

## Impact

- 受影响系统：AI 任务状态机、状态更新工具、任务循环提示与引导逻辑、AI 处理任务状态展示。
- 预期影响代码区域：
  - `src/services/ai/tasks/utils/task-types.ts`
  - `src/services/ai/tools/task-status-tools.ts`
  - `src/services/ai/tasks/utils/task-runner.ts`
  - `src/services/ai/tasks/prompts/common.ts`
  - `src/constants/ai/index.ts`
  - `src/stores/ai-processing.ts` 及相关状态展示组件
- 对外 API 与第三方依赖：无新增外部依赖；属于内部工作流与工具约束变更。
