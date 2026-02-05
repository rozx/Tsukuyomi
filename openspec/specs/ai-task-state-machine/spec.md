# ai-task-state-machine Specification

## Purpose
TBD - created by archiving change update-completed-state-to-review. Update Purpose after archive.
## Requirements
### Requirement: 翻译相关任务状态机（translation）
系统 MUST 对 translation 任务执行严格状态机：`planning → working → review → end`，用于确保任务完成度可被复核与补齐。状态转换 MUST 通过 `update_task_status` 工具进行。

#### Scenario: translation 使用工具更新状态
- **GIVEN** translation 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `review`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `review`

#### Scenario: translation 禁止 working → end（通过工具）
- **GIVEN** translation 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `end`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："翻译任务必须先进入 review 状态"

#### Scenario: translation 在 review 阶段返回 working（通过工具）
- **GIVEN** translation 任务当前状态为 `review`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 接受该状态转换（允许返回修改）
- **AND THEN** 系统 MUST 更新任务状态为 `working`

### Requirement: 润色/校对任务状态机（polish / proofreading）
系统 MUST 对 polish 与 proofreading 任务跳过并禁用 `review` 阶段，状态机固定为 `planning → working → end`。状态转换 MUST 通过 `update_task_status` 工具进行。

#### Scenario: polish/proofreading 使用工具结束任务
- **GIVEN** polish 或 proofreading 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `end`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 结束当前任务

#### Scenario: polish/proofreading 禁止 review（通过工具）
- **GIVEN** polish 或 proofreading 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `review`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："润色/校对任务不支持 review 状态"




