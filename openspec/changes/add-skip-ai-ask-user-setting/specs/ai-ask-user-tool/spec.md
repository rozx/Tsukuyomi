## ADDED Requirements

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

