## ADDED Requirements

### Requirement: 桌面端统一工作台壳层

系统 MUST 在桌面断点下将应用壳层呈现为统一的工作台骨架，包含顶部系统条、左侧主导航、中央页面画布和右侧上下文面板，并沿用现有 `ui.sideMenuOpen`、`ui.rightPanelOpen` 与 `ui.rightPanelWidth` 状态语义，而不是引入 mobile/tablet 的抽屉式导航流程。

#### Scenario: 桌面路由加载时保持四区骨架

- **WHEN** 用户在桌面断点进入任意主路由
- **THEN** 系统 MUST 渲染顶部系统条、左侧主导航、中央内容画布和右侧上下文面板容器，并允许中央内容区独立滚动

#### Scenario: 面板开合保留桌面工作台语义

- **WHEN** 用户切换侧边导航或右侧上下文面板的开合状态
- **THEN** 系统 MUST 复用现有 UI store 的开合行为与宽度状态，且 MUST NOT 把对应区域退化为 mobile/tablet 的覆盖式导航流程

### Requirement: 桌面端共享页面画布语法

系统 MUST 为桌面主页面提供一致的页面画布语法，包括统一的外边距、标题区层次、主操作区、section 表面材质与区块间距，使 Books、BookDetails、Settings、AI 与 Help 在桌面下呈现同一套工作台语言。

#### Scenario: 桌面内容页使用统一标题区

- **WHEN** 桌面内容页渲染其主要内容
- **THEN** 页面 MUST 提供由 eyebrow、主标题、摘要和主操作区组成的标题区，而不是各页使用互不相干的标题样式

#### Scenario: 桌面内容页使用统一区块表面

- **WHEN** 桌面内容页渲染统计条、列表卡片、工具面板或说明区块
- **THEN** 这些区块 MUST 共享一致的表面材质、边框和间距节奏，以形成连续的桌面工作台视觉

### Requirement: 桌面端直接可达导航与上下文

系统 MUST 保持桌面端主导航和上下文工具的一跳可达性，且 MUST NOT 采用手机端底部导航、平板端 rail-only 导航或 drawer-only 入口来替代桌面直接操作。

#### Scenario: 左侧主导航保持直接可达

- **WHEN** 用户在桌面端需要切换首页、书库、AI、设置或帮助
- **THEN** 系统 MUST 通过左侧主导航直接提供入口，且用户无需先展开底部栏或覆盖式抽屉

#### Scenario: 右侧上下文面板保持工作流连续

- **WHEN** 用户在桌面端打开 AI 助手或翻译进度
- **THEN** 系统 MUST 在当前页面上下文内打开右侧上下文面板，并保持当前主内容页与用户定位不丢失
