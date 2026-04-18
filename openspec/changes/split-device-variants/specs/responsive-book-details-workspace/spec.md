## MODIFIED Requirements

### Requirement: 小屏书籍详情全功能编排

系统 MUST 在手机与平板端提供书籍详情工作区的完整功能编排，覆盖目录、正文、翻译、术语、角色、记忆与进度操作；该工作区的 phone / tablet / desktop 三种结构 MUST 以独立的变体组件承载，由一个薄分派器根据当前设备类型挂载其一，不得通过在同一 SFC 内部使用 `v-if="isPhone"` 等内联分支实现。

#### Scenario: 手机端完整功能可达

- **WHEN** 用户在手机端进入书籍详情页
- **THEN** 系统 MUST 通过模式切换或面板切换提供所有桌面能力且不删减功能

#### Scenario: 平板端核心工作区优先

- **WHEN** 用户在平板端进入书籍详情页
- **THEN** 系统 MUST 优先展示正文与翻译工作区，并支持快速切换到辅助面板

#### Scenario: 书籍详情工作区三种结构独立承载

- **WHEN** 审查书籍详情工作区相关代码
- **THEN** 代码库 MUST 为 BookDetailsPage 提供独立的 Desktop、Tablet、Mobile 变体文件（位于 `src/pages/book-details/` 下），以及一个保持原文件名的薄分派器文件；任一变体内部不得包含针对其他设备类型的 `v-if` 结构性分支

#### Scenario: Electron 环境强制桌面工作区

- **WHEN** 应用运行于 Electron 环境，无论窗口宽度如何变化
- **THEN** 分派器 MUST 始终挂载 Desktop 工作区变体，不得切换到 Mobile 或 Tablet 工作区

### Requirement: 工作区模式切换可恢复

系统 MUST 在不同工作模式间切换时保留当前编辑状态与阅读位置，避免重复操作；当用户在跨断点切换导致工作区变体换挂载时，系统 MUST 同样保留当前选中的章节、面板标签与滚动定位。

#### Scenario: 模式切换后保留段落定位

- **WHEN** 用户从正文模式切换到术语或角色模式后再返回正文
- **THEN** 系统 MUST 恢复到先前段落位置与当前选中翻译版本

#### Scenario: 断点切换后保留工作区状态

- **WHEN** 用户在 BookDetailsPage 中选中章节、打开某一面板标签后，发生断点切换导致工作区变体重新挂载
- **THEN** 系统 MUST 在新变体中保留原先选中的章节、打开的面板标签与滚动定位

## ADDED Requirements

### Requirement: 书籍详情业务逻辑统一提取

系统 MUST 将 BookDetailsPage 的业务逻辑（章节列表加载、翻译进度计算、面板标签切换、术语 / 角色 / 记忆的设置子菜单跳转、AI 任务交互入口等）提取到专属的 composable 中；BookDetailsPage 的 Desktop / Tablet / Mobile 变体 MUST 通过调用同一 composable 获取这些能力，不得在各变体中重复声明。

#### Scenario: 业务逻辑仅定义一次

- **WHEN** 开发者需要修改章节加载、翻译进度或面板切换逻辑
- **THEN** 该修改 MUST 只涉及 BookDetailsPage 专属 composable，无需同步修改任一工作区变体文件

#### Scenario: 变体仅包含视图相关代码

- **WHEN** 审查任一书籍详情工作区变体文件
- **THEN** 该文件 MUST 只包含模板、device 特定样式以及仅用于视图展示的局部 UI 状态，不得包含数据加载、进度计算或状态跨变体复用的业务逻辑
