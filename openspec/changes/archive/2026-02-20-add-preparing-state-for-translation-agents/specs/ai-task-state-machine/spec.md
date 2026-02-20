## MODIFIED Requirements

### Requirement: 翻译相关任务状态机（translation）

系统 MUST 对 translation 任务执行严格状态机：`planning → preparing → working → review → end`，用于确保任务先完成数据准备、再专注翻译、最后复核。状态转换 MUST 通过 `update_task_status` 工具进行。

#### Scenario: translation 从 planning 进入 preparing（通过工具）

- **GIVEN** translation 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `preparing`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `preparing`

#### Scenario: translation 从 preparing 进入 working（通过工具）

- **GIVEN** translation 任务当前状态为 `preparing`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `working`

#### Scenario: translation 禁止 planning 直接进入 working（通过工具）

- **GIVEN** translation 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："翻译任务必须先进入 preparing 状态"

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

系统 MUST 对 polish 与 proofreading 任务执行状态机：`planning → preparing → working → end`，并禁用 `review` 阶段。状态转换 MUST 通过 `update_task_status` 工具进行。

#### Scenario: polish/proofreading 从 planning 进入 preparing（通过工具）

- **GIVEN** polish 或 proofreading 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `preparing`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `preparing`

#### Scenario: polish/proofreading 从 preparing 进入 working（通过工具）

- **GIVEN** polish 或 proofreading 任务当前状态为 `preparing`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 接受该状态转换
- **AND THEN** 系统 MUST 更新任务状态为 `working`

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

#### Scenario: polish/proofreading 禁止 planning 直接进入 working（通过工具）

- **GIVEN** polish 或 proofreading 任务当前状态为 `planning`
- **WHEN** AI 调用 `update_task_status` 工具请求更新为 `working`
- **THEN** 系统 MUST 拒绝该状态转换
- **AND THEN** 系统 MUST 返回错误信息："润色/校对任务必须先进入 preparing 状态"

## ADDED Requirements

### Requirement: working 阶段禁止术语/角色/记忆写操作

系统 MUST 在 translation、polish、proofreading 任务的 `working` 阶段拒绝 term/character/memory 的写入操作（create/update），并引导切换到 `preparing` 或 `review`。

#### Scenario: working 阶段调用 create_term 被拒绝

- **GIVEN** 当前任务状态为 `working`
- **WHEN** AI 调用术语写入工具（如 `create_term`）
- **THEN** 系统 MUST 拒绝该调用
- **AND THEN** 系统 MUST 返回提示："请在 preparing 或 review 阶段进行术语/角色/记忆更新"

#### Scenario: working 阶段调用 update_memory 被拒绝

- **GIVEN** 当前任务状态为 `working`
- **WHEN** AI 调用记忆写入工具（如 `update_memory`）
- **THEN** 系统 MUST 拒绝该调用
- **AND THEN** 系统 MUST 返回提示："请在 preparing 或 review 阶段进行术语/角色/记忆更新"

### Requirement: preparing/review 阶段允许术语/角色/记忆写操作

系统 MUST 在 `preparing` 与 `review` 阶段允许 term/character/memory 的 create/update 操作，以支持翻译前准备和翻译后复核。

#### Scenario: preparing 阶段更新术语成功

- **GIVEN** 当前任务状态为 `preparing`
- **WHEN** AI 调用术语写入工具（如 `update_term`）
- **THEN** 系统 MUST 接受该调用并完成更新

#### Scenario: review 阶段更新记忆成功

- **GIVEN** 当前任务状态为 `review`
- **WHEN** AI 调用记忆写入工具（如 `update_memory`）
- **THEN** 系统 MUST 接受该调用并完成更新

### Requirement: 记录 working 阶段被拒绝写入次数

系统 MUST 统计每个任务在 `working` 阶段被拒绝的 term/character/memory 写入调用次数，并将该统计纳入任务指标。

#### Scenario: working 阶段拒绝写入后增加计数

- **GIVEN** 某任务当前状态为 `working`
- **WHEN** AI 发起一次被拒绝的 term/character/memory 写入调用
- **THEN** 系统 MUST 将该任务的“working 阶段被拒绝写入计数”加 1
- **AND THEN** 该计数 MUST 可用于后续流程分析与提示词优化
