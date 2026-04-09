## MODIFIED Requirements

### Requirement: 润色/校对任务状态机（polish / proofreading）

系统 MUST 对 polish 与 proofreading 任务执行状态机：`planning → preparing → working → end`，并禁用 `review` 阶段。状态转换 MUST 通过 `update_task_status` 工具进行。此状态机仅适用于批量（多段落/章节级）润色/校对任务。单段落润色/校对 MUST 不使用此状态机。

#### Scenario: polish/proofreading 从 planning 进入 preparing（通过工具）

- **GIVEN** 批量 polish 或 proofreading 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `preparing`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `preparing`

#### Scenario: polish/proofreading 从 preparing 进入 working（通过工具）

- **GIVEN** 批量 polish 或 proofreading 任务当前状态为 `preparing`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `working`

#### Scenario: polish/proofreading 使用工具结束任务

- **GIVEN** 批量 polish 或 proofreading 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `end`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 结束当前任务

#### Scenario: polish/proofreading 禁止 review（通过工具）

- **GIVEN** 批量 polish 或 proofreading 任务当前状态为 `working`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `review`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："润色/校对任务不支持 review 状态"

#### Scenario: polish/proofreading 禁止 planning 直接进入 working（通过工具）

- **GIVEN** 批量 polish 或 proofreading 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："润色/校对任务必须先进入 preparing 状态"

#### Scenario: 单段落润色/校对不使用状态机

- **WHEN** 系统处理单段落润色或校对任务
- **THEN** 系统 MUST 不注册 `update_task_status` 工具
- **AND THEN** 系统 MUST 不创建或执行任何状态机流程
