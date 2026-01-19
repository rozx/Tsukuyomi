## ADDED Requirements

### Requirement: 润色/校对任务状态机（polish / proofreading）

系统 MUST 对 polish 与 proofreading 任务跳过并禁用 `review` 阶段，状态机固定为 `planning → working → end`。

#### Scenario: polish/proofreading 允许 working → end

- **GIVEN** polish 或 proofreading 任务正在执行且当前状态为 `working`
- **WHEN** AI 将状态设置为 `end`
- **THEN** 系统 MUST 接受该状态转换并结束当前 chunk

#### Scenario: polish/proofreading 禁止进入 review

- **GIVEN** polish 或 proofreading 任务正在执行且当前状态为 `working`
- **WHEN** AI 将状态设置为 `review`
- **THEN** 系统 MUST 拒绝该状态并要求改为 `end`
