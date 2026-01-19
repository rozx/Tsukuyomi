## ADDED Requirements

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

