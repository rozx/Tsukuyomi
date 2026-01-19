## ADDED Requirements

### Requirement: AI 工具 `ask_user_batch`（批量问答）
系统 MUST 提供一个 AI 工具 `ask_user_batch`，允许 AI 在一次工具调用中向用户提出多个问题，并获取对应的多条回答作为工具返回值。

#### Scenario: 用户完成批量问答并提交
- **GIVEN** AI 调用 `ask_user_batch` 并提供 `questions[]`（每项包含 `question`，可选包含 `suggested_answers` 与 `allow_free_text`）
- **WHEN** UI 以单个全屏问答对话框完成所有问题的采集流程
- **AND** 用户提交结果
- **THEN** 系统 MUST 将答案列表作为工具结果返回给 AI
- **AND** 答案列表 MUST 能映射回原问题（例如包含 `question_index` 字段）

#### Scenario: 用户取消批量问答
- **GIVEN** AI 调用 `ask_user_batch`
- **WHEN** 用户在批量问答流程中执行取消操作
- **THEN** 系统 MUST 返回一个可被 AI 识别的取消结果（`cancelled:true`）
- **AND** 系统 MUST 返回用户已答部分（partial answers）
- **AND** partial answers MUST 能映射回原问题（例如包含 `question_index` 字段）

### Requirement: 批量问答在同一个全屏对话框内完成
系统 MUST 在 `ask_user_batch` 执行时使用一个全屏 modal 对话框完成多问题采集，避免通过多次 `ask_user` 造成多次全屏弹窗打断。

#### Scenario: 多问题采集为单个 UI 流程
- **GIVEN** `ask_user_batch` 被调用且包含多个问题
- **WHEN** UI 开始展示问答
- **THEN** 系统 MUST 仅展示一个全屏问答对话框
- **AND** 系统 MUST 在该对话框内完成所有问题的回答采集

### Requirement: 批量问答使用 Stepper 分步呈现
系统 MUST 在批量问答 UI 中以 Stepper 分步方式呈现问题（一次只展示一个问题），避免同时展示过多信息并提升可用性。

#### Scenario: 一次只展示一个问题
- **GIVEN** `ask_user_batch` 被调用且包含多个问题
- **WHEN** 用户正在回答第 N 个问题
- **THEN** UI MUST 仅展示第 N 个问题的内容
- **AND** UI MUST 提供前进/后退（或等价）操作以在问题之间切换

### Requirement: 与书籍级跳过追问设置协同（批量）
当用户对某书籍启用“跳过 AI 追问（ask_user）”时，系统 MUST 对 `ask_user_batch` 采取与 `ask_user` 一致的硬保障策略（不弹窗、不阻塞、工具列表过滤）。

#### Scenario: 启用后在翻译相关任务中不提供 ask_user_batch 工具
- **GIVEN** 用户对某书籍启用“跳过 AI 追问”
- **WHEN** 系统为该书籍执行 translation/polishing/proofreading 等翻译相关任务构建 tools 列表
- **THEN** 系统 MUST 不向 AI 提供 `ask_user_batch` 工具（tools 列表中不包含 `ask_user_batch`）

#### Scenario: 启用后调用 ask_user_batch 不弹窗且不阻塞
- **GIVEN** 用户对某书籍启用“跳过 AI 追问”
- **WHEN** AI 在该书籍范围内调用 `ask_user_batch`
- **THEN** 系统 MUST 不弹出问答对话框
- **AND** 系统 MUST 返回等价取消/跳过的结果（`cancelled:true`）

