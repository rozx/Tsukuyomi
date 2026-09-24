# book-update-panel Specification

## Purpose

规定书籍详情页「检查更新」入口的承载形态：桌面与平板在主内容区以设置面板承载该书的同步工作区，手机以全屏页面承载，入口、返回路径与应用链路保持一致。

## Requirements

### Requirement: 侧栏「检查更新」路由面板（桌面/平板）

系统 SHALL 在书籍详情页支持路由 `/books/:id/settings/update`。桌面和平板端 SHALL 在主内容区以面板形式（与术语、角色、记忆、翻译设置面板相同的 panel-header 风格）承载该书的同步工作区。侧栏 SETTINGS 菜单中的「检查更新」项（展开和折叠两种状态）SHALL 导航到该面板。手机端访问同一路由时，SHALL 以全屏页面承载同步工作区。

#### Scenario: 从侧栏进入检查更新面板

- **GIVEN** 用户在桌面或平板端打开某书籍详情页
- **WHEN** 用户点击侧栏 SETTINGS 菜单中的「检查更新」
- **THEN** 路由 SHALL 变为 `/books/:id/settings/update`
- **AND** 主内容区 SHALL 渲染该书的同步工作区，并自动执行快速检查

#### Scenario: 面板内取消返回工作台

- **GIVEN** 用户位于检查更新面板，且没有正在进行的应用
- **WHEN** 用户点击关闭或返回
- **THEN** 系统 SHALL 返回 `/books/:id` 书籍工作台

#### Scenario: 应用更新链路不变

- **GIVEN** 用户在检查更新面板中勾选了章节并确认应用
- **WHEN** 应用完成
- **THEN** 系统 SHALL 通过同步服务写入书籍，包括写入互斥、版本核对和段落级译文保留
