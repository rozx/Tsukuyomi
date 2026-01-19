# ai-ask-user-tool Specification

## Purpose
TBD - created by archiving change add-ai-ask-user-tool. Update Purpose after archive.
## Requirements
### Requirement: AI 工具 `ask_user`
系统 MUST 提供一个 AI 工具 `ask_user`，允许 AI 在执行过程中向用户提出一个问题，并获取用户回答作为工具返回值。

#### Scenario: 用户从候选答案中选择
- **GIVEN** AI 调用 `ask_user` 并提供 `question` 与 `suggested_answers`
- **WHEN** UI 弹出全屏问答对话框并展示候选答案
- **AND** 用户点击其中一个候选答案
- **THEN** 系统 MUST 将该答案作为工具结果返回给 AI（包含 `answer`，可选包含 `selected_index`）

#### Scenario: 用户输入自定义答案
- **GIVEN** AI 调用 `ask_user` 并设置 `allow_free_text=true`
- **WHEN** UI 弹出全屏问答对话框并提供输入框
- **AND** 用户输入任意文本并提交
- **THEN** 系统 MUST 将该文本作为工具结果返回给 AI（包含 `answer`）

#### Scenario: 用户取消（若允许）
- **GIVEN** AI 调用 `ask_user` 并允许取消
- **WHEN** 用户在对话框中执行取消操作
- **THEN** 系统 MUST 返回一个可被 AI 识别的取消结果（`cancelled:true`），并由 AI 自行决定后续策略

### Requirement: 全屏问答对话框
系统 MUST 在 AI 调用 `ask_user` 时显示一个全屏 modal 对话框，保证用户可见且能完成选择/输入与提交。

#### Scenario: 展示关键要素
- **WHEN** 对话框显示
- **THEN** 系统 MUST 显示 AI 的 `question`
- **AND** 系统 MUST 显示 0..N 个 `suggested_answers`
- **AND** 若 `allow_free_text=true`，系统 MUST 提供自由输入区域

### Requirement: 队列化处理
系统 MUST 支持 `ask_user` 的多次调用按顺序处理，任意时刻最多显示一个问答对话框。

#### Scenario: 连续提问排队
- **GIVEN** AI 在同一会话/任务中连续调用 `ask_user` 两次或更多次
- **WHEN** 用户尚未完成前一个问题的回答
- **THEN** 系统 MUST 将后续问题排队等待
- **AND** 在前一个问题完成后再展示下一个问题

### Requirement: 无 UI 环境的降级
当应用处于无法弹出 UI 的环境（例如测试环境/无窗口上下文）时，系统 MUST 以明确的错误结果返回给 AI，而不是静默挂起。

#### Scenario: 无法弹出对话框
- **GIVEN** `ask_user` 被调用
- **WHEN** 系统检测到无法弹出问答对话框
- **THEN** 系统 MUST 返回 `success:false` 且包含可读的 `error` 字段

### Requirement: 在翻译相关任务中可用
系统 MUST 在以下 AI 任务中提供 `ask_user` 工具：translation、polishing、proofreading、assistant。

#### Scenario: 翻译任务使用 ask_user 获取关键歧义
- **GIVEN** translation/polishing/proofreading 任务正在执行
- **WHEN** AI 判定存在必须由用户确认的关键歧义（例如人名译名、口吻选择、术语取舍）
- **THEN** 系统 MUST 允许 AI 调用 `ask_user` 获取用户回答并继续任务

### Requirement: 记录问答为 action
系统 MUST 记录 `ask_user` 的提问与用户回答为 action，用于聊天历史展示与上下文摘要压缩。

#### Scenario: 在聊天上下文摘要中包含问答
- **GIVEN** AI 在一次会话中调用 `ask_user` 并收到回答
- **WHEN** 系统生成“本轮工具操作摘要”
- **THEN** 摘要 MUST 包含该问答的关键字段（至少包含问题与最终答案的短摘要）

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

### Requirement: 书籍级别跳过 `ask_user` 追问
系统 MUST 支持对单本书籍启用“跳过 AI 追问（ask_user）”设置。启用后，在该书籍范围内系统 MUST 不再弹出 `ask_user` 的全屏问答对话框，并避免阻塞任务执行。

#### Scenario: 默认关闭（不改变现有行为）
- **GIVEN** 用户未对某书籍启用“跳过 AI 追问”
- **WHEN** AI 在该书籍范围内调用 `ask_user`
- **THEN** 系统 MUST 按既有行为弹出问答对话框并等待用户回答

#### Scenario: 启用后不弹窗且不阻塞
- **GIVEN** 用户对某书籍启用“跳过 AI 追问”
- **WHEN** AI 在该书籍范围内调用 `ask_user`
- **THEN** 系统 MUST 不弹出问答对话框
- **AND** 系统 MUST 返回一个可被 AI 识别的“取消/跳过”结果（等价于 `cancelled:true`）

#### Scenario: 启用后在翻译相关任务中不提供 ask_user 工具
- **GIVEN** 用户对某书籍启用“跳过 AI 追问”
- **WHEN** 系统为该书籍执行 translation/polishing/proofreading 等翻译相关任务构建 tools 列表
- **THEN** 系统 MUST 不向 AI 提供 `ask_user` 工具（tools 列表中不包含 `ask_user`）

#### Scenario: UI 设置入口在翻译设置（书籍级）
- **GIVEN** 用户正在查看某本书籍的章节详情页面
- **WHEN** 用户打开“翻译设置”弹窗的「全局设置」页签
- **THEN** 系统 MUST 提供“跳过 AI 追问（不弹出问答对话框）”开关
- **AND** 该开关的变更 MUST 被保存为该书籍的设置

