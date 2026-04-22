## ADDED Requirements

### Requirement: 桌面工具页共享工作台语法

`SettingsPageDesktop` 与 `AIPageDesktop` MUST 共享桌面工具页语法，包括统一的 eyebrow、主标题、摘要、主要操作区、section surface 和次级面板节奏，使两页在桌面下呈现同一套工具页体验。

#### Scenario: 在桌面端切换工具页时保持一致页面语法

- **WHEN** 用户在桌面端在设置页与 AI 页之间切换
- **THEN** 两个页面 MUST 使用一致的标题区层次、内容边距和区块表面语法，而不是各自采用完全不同的页面骨架

### Requirement: 桌面设置页为正式页面而非平板模态复用

`SettingsPageDesktop` MUST 作为独立桌面工具页渲染，复用现有 `injectSettingsPage()` tab 状态和 tab content components，但 MUST NOT 仅通过放大 `SettingsPageTablet` 的居中模态卡片来实现。

#### Scenario: 桌面设置页加载时展示专用页面骨架

- **WHEN** 用户在桌面端进入 `/settings`
- **THEN** 页面 MUST 渲染桌面设置页标题区、tab 导航和内容画布，而不是单一居中模态式容器

#### Scenario: 桌面设置页切换 tab 时复用现有状态与组件

- **WHEN** 用户在桌面设置页切换 AI 模型、代理、API Keys、同步、嵌入、爬虫或导入导出等 tab
- **THEN** 系统 MUST 继续复用 `injectSettingsPage()` 暴露的 tab 状态和现有 tab content components，且 MUST NOT 新增 store 字段或服务方法

### Requirement: 桌面 AI 模型管理页采用分层工作台布局

`AIPageDesktop` MUST 将模型管理信息组织为更清晰的桌面工作台布局，突出页面摘要、模型列表层次和任务路由等次级上下文，同时保留搜索、添加、复制、编辑和删除等现有行为。

#### Scenario: 桌面 AI 页保留现有核心管理操作

- **WHEN** 用户在桌面 AI 页执行搜索、添加、复制、编辑或删除模型
- **THEN** 系统 MUST 继续调用现有 `injectAIPage()` 行为，而不是引入新的管理流程

#### Scenario: 桌面 AI 页保持次级上下文直接可达

- **WHEN** 用户需要查看任务路由或模型附加信息
- **THEN** 页面 MUST 在同一桌面工作区内提供稳定的次级区块或侧栏，而不是将其降级为仅移动端弹层入口
