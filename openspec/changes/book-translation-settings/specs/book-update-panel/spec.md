## ADDED Requirements

### Requirement: 侧栏「检查更新」路由面板（桌面/平板）

系统 SHALL 在书籍详情页支持路由 `/books/:id/settings/update`，在主内容区以面板形式（panel-header 风格，与 术语/角色/记忆/翻译设置 面板一致）承载小说抓取器主体（URL 输入、章节列表/预览分栏、导入操作栏）。侧栏 SETTINGS 菜单的「检查更新」项（展开与折叠两态）SHALL 导航到该面板而非弹出对话框。

#### Scenario: 从侧栏进入检查更新面板

- **GIVEN** 用户在桌面或平板端打开某书籍详情页
- **WHEN** 用户点击侧栏 SETTINGS 菜单中的「检查更新」
- **THEN** 路由 SHALL 变为 `/books/:id/settings/update`
- **AND THEN** 主内容区 SHALL 渲染检查更新面板，自动填充本书来源 URL 并触发章节列表抓取（与原弹窗行为一致，默认过滤「未导入」）

#### Scenario: 面板内取消返回工作台

- **GIVEN** 用户位于检查更新面板
- **WHEN** 用户点击操作栏中的「取消」
- **THEN** 系统 SHALL 返回 `/books/:id` 书籍工作台

#### Scenario: 应用更新链路不变

- **GIVEN** 用户在检查更新面板中选择了章节并点击导入
- **WHEN** 导入完成
- **THEN** 系统 SHALL 走与原弹窗相同的 `handleScraperUpdate` 应用链路更新书籍

### Requirement: 抓取器弹窗形态保留（嵌入模式共存）

`NovelScraperDialog` SHALL 支持 `embedded` 模式（不渲染对话框壳，直接输出主体+操作栏）供路由面板使用；非嵌入调用方（首页、书籍库、手机端书籍概览）的弹窗行为 MUST 保持不变。

#### Scenario: 手机端保持弹窗形态

- **GIVEN** 用户在手机端书籍概览页
- **WHEN** 用户触发「检查更新」
- **THEN** 系统 SHALL 以底部抽屉/对话框形态展示抓取器（现状行为），不走路由面板
