## ADDED Requirements

### Requirement: 侧栏「翻译设置」入口与路由面板（桌面/平板）

系统 SHALL 在书籍详情页侧栏 SETTINGS 菜单中提供「翻译设置」入口（与 术语设置 / 角色设置 / 记忆管理 同级，置于术语设置之上），并 SHALL 支持路由 `/books/:id/settings/translation`，在主内容区渲染书籍翻译设置面板。侧栏菜单的展开态与折叠态 MUST 都包含该入口。

#### Scenario: 从侧栏进入翻译设置面板

- **GIVEN** 用户在桌面或平板端打开某书籍详情页
- **WHEN** 用户点击侧栏 SETTINGS 菜单中的「翻译设置」
- **THEN** 路由 SHALL 变为 `/books/:id/settings/translation`
- **AND THEN** 主内容区 SHALL 渲染书籍翻译设置面板，上下文头显示「翻译设置」

#### Scenario: 直接访问翻译设置路由

- **WHEN** 用户在桌面/平板端直接访问 `/books/:id/settings/translation`
- **THEN** 系统 SHALL 渲染该书籍的翻译设置面板，且侧栏「翻译设置」项呈选中态

#### Scenario: 手机端深链降级

- **GIVEN** 用户在手机端
- **WHEN** 访问 `/books/:id/settings/translation`
- **THEN** 系统 SHALL 视同未选中设置菜单，落到 Overview 默认分段标签，不新增手机导航态

### Requirement: 书籍翻译设置面板内容与保存语义

书籍翻译设置面板 SHALL 包含现有 5 个书籍级开关（过滤行首空格、显示时规范化符号、显示时规范化标题、跳过 AI 追问、原文校验）、翻译任务分块大小，以及「模型覆盖」分组（翻译模型、校对·润色模型两个下拉）。面板 MUST 采用显式保存语义（保存/取消按钮），保存 SHALL 通过 `booksStore.updateBook` 落库并给出成功 toast。

#### Scenario: 修改开关并保存

- **GIVEN** 用户在翻译设置面板中切换了「显示时规范化符号」开关
- **WHEN** 用户点击「保存」
- **THEN** `Novel.normalizeSymbolsOnDisplay` SHALL 被更新并持久化
- **AND THEN** 系统 SHALL 显示保存成功 toast

#### Scenario: 取消放弃修改

- **GIVEN** 用户在翻译设置面板中修改了任意设置但未保存
- **WHEN** 用户点击「取消」或离开面板
- **THEN** 书籍设置 SHALL 保持修改前的值

### Requirement: 齿轮弹窗瘦身为纯章节设置（桌面/平板）

在桌面/平板端，章节工具栏齿轮弹窗 SHALL 只包含章节级指令设置（翻译/润色/校对指令三个页签），标题为「章节设置」，MUST NOT 再包含书籍级「全局设置」页签。仅保存章节指令时系统 MUST NOT 修改任何书籍级设置字段。

#### Scenario: 桌面弹窗只显示章节设置

- **GIVEN** 用户在桌面端选中某章节
- **WHEN** 用户点击章节工具栏的齿轮按钮
- **THEN** 弹窗 SHALL 只显示章节指令设置（无「全局设置」页签），标题为「章节设置」

#### Scenario: 保存章节指令不影响书籍级设置

- **GIVEN** 某书籍已设置 `preserveIndents = false` 与模型覆盖
- **WHEN** 用户在桌面齿轮弹窗中仅修改章节翻译指令并保存
- **THEN** `Novel.preserveIndents`、`Novel.taskModelOverrides` 等书籍级字段 SHALL 保持不变

### Requirement: 手机端底部抽屉保留双页签

在手机端，阅读器的翻译设置底部抽屉 SHALL 保留「全局设置」与「章节设置」两个页签。「全局设置」页签 SHALL 与桌面路由面板复用同一份表单组件（含模型覆盖分组），行为与保存语义一致。

#### Scenario: 手机端访问书籍级设置

- **GIVEN** 用户在手机端阅读器中
- **WHEN** 用户打开翻译设置底部抽屉并切到「全局设置」页签
- **THEN** 抽屉 SHALL 显示全部书籍级设置（含模型覆盖下拉），保存后生效于整本书
