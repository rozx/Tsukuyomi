## ADDED Requirements

### Requirement: Task status update tool

系统 SHALL 提供 `update_task_status` 工具，允许 AI 通过 Function Calling 更新任务状态。

#### Scenario: AI 调用状态更新工具

- **WHEN** AI 在翻译、润色或校对任务中调用 `update_task_status` 工具
- **THEN** 系统验证状态值和转换规则
- **AND THEN** 如果验证通过，更新任务状态
- **AND THEN** 如果验证失败，返回错误信息

### Requirement: State value validation

`update_task_status` 工具 SHALL 验证状态值必须是有效值之一。

#### Scenario: 有效状态值

- **WHEN** AI 请求更新状态为 "planning"、"working"、"review" 或 "end"
- **THEN** 状态值验证通过

#### Scenario: 无效状态值

- **WHEN** AI 请求更新状态为无效值（如 "completed"、"error" 等）
- **THEN** 返回错误信息："无效的状态值"
- **AND THEN** 不执行状态更新

### Requirement: Translation task state transitions

对于翻译任务，`update_task_status` 工具 SHALL 支持 working 和 review 之间的双向转换。

#### Scenario: Translation working to review

- **GIVEN** 当前任务状态为 "working"
- **WHEN** AI 请求更新状态为 "review"
- **THEN** 状态更新成功

#### Scenario: Translation review to working

- **GIVEN** 当前任务状态为 "review"
- **WHEN** AI 请求更新状态为 "working"
- **THEN** 状态更新成功（允许返回修改）

#### Scenario: Translation invalid backward transition

- **GIVEN** 当前任务状态为 "end"
- **WHEN** AI 请求更新状态为 "working"
- **THEN** 返回错误信息："无效的状态转换：end → working"
- **AND THEN** 不执行状态更新

### Requirement: Polish and proofreading task state transitions

对于润色和校对任务，`update_task_status` 工具 SHALL 只允许单向流程，跳过 review 阶段。

#### Scenario: Polish working to end

- **GIVEN** 当前任务类型为 "polish"，状态为 "working"
- **WHEN** AI 请求更新状态为 "end"
- **THEN** 状态更新成功（跳过 review）

#### Scenario: Proofreading working to end

- **GIVEN** 当前任务类型为 "proofreading"，状态为 "working"
- **WHEN** AI 请求更新状态为 "end"
- **THEN** 状态更新成功（跳过 review）

#### Scenario: Polish review not allowed

- **GIVEN** 当前任务类型为 "polish"
- **WHEN** AI 请求更新状态为 "review"
- **THEN** 返回错误信息："润色任务不支持 review 状态"
- **AND THEN** 不执行状态更新

### Requirement: Initial state enforcement

`update_task_status` 工具 SHALL 强制执行正确的初始状态。

#### Scenario: First status must be planning

- **GIVEN** 任务没有当前状态（首次更新）
- **WHEN** AI 请求更新状态为 "working"
- **THEN** 返回错误信息："初始状态必须是 planning"
- **AND THEN** 不执行状态更新
