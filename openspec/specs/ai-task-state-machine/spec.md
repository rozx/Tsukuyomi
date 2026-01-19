# ai-task-state-machine Specification

## Purpose
TBD - created by archiving change update-completed-state-to-review. Update Purpose after archive.
## Requirements
### Requirement: 翻译相关任务状态机（translation）
系统 MUST 对 translation 任务执行严格状态机：`planning → working → review → end`，用于确保任务完成度可被复核与补齐。

#### Scenario: translation 禁止跳过 review
- **GIVEN** translation 任务正在执行且当前状态为 `working`
- **WHEN** AI 试图将状态直接设置为 `end`
- **THEN** 系统 MUST 拒绝该状态转换并提示正确顺序 `planning → working → review → end`

#### Scenario: translation 在 review 阶段发现缺失段落
- **GIVEN** translation 任务已进入 `review`
- **WHEN** 系统检测到仍有缺失段落需要补齐
- **THEN** 系统 MUST 要求回到 `working` 并继续输出缺失段落
- **AND** 仅当缺失段落补齐后才允许进入 `end`

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

### Requirement: 禁止旧状态值 `completed`
系统 MUST 将旧状态值 `completed` 视为无效状态，并要求改为 `review`。

#### Scenario: translation 输出 completed 被拒绝
- **GIVEN** translation 任务正在执行
- **WHEN** AI 输出 `{"status":"completed"}`
- **THEN** 系统 MUST 拒绝该状态并要求输出 `{"status":"review"}`

