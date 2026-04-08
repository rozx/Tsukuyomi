## MODIFIED Requirements

### Requirement: Task status update tool

系统 SHALL 提供 `update_task_status` 工具，允许 AI 通过 Function Calling 更新任务状态。翻译相关任务状态集合为 `planning`、`preparing`、`working`、`review`、`end`。状态转换前，系统 MUST 检查当前状态的所有预定义待办事项是否已完成（状态为 `done`）。

#### Scenario: AI 调用状态更新工具

- **WHEN** AI 在翻译、润色或校对任务中调用 `update_task_status` 工具
- **THEN** 系统 MUST 检查当前状态的预定义待办事项是否全部为 `done`
- **AND THEN** 如果存在未完成的待办事项，系统 MUST 返回错误信息，包含未完成的待办列表
- **AND THEN** 如果所有待办已完成，系统 MUST 验证状态值和转换规则
- **AND THEN** 如果验证通过，系统 MUST 更新任务状态
- **AND THEN** 状态更新成功后，系统 MUST 为新状态生成预定义待办事项（仅首次进入时）
- **AND THEN** 如果验证失败，系统 MUST 返回错误信息

#### Scenario: 待办未完成时拒绝状态转换

- **GIVEN** 当前状态为 `planning`，存在 2 个未完成的预定义待办事项
- **WHEN** AI 调用 `update_task_status` 请求更新为 `preparing`
- **THEN** 系统 MUST 返回错误信息："⛔ 无法进入 preparing：还有 2 个未完成的待办事项"
- **AND THEN** 错误信息 MUST 列出每个未完成的待办事项文本
- **AND THEN** 系统 MUST 不执行状态更新
