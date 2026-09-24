## ADDED Requirements

### Requirement: 平板应用壳层结构

当 `useDeviceVariant()` 返回 `'tablet'` 时，系统 MUST 通过 `MainLayoutTablet` 渲染三块固定区域：顶部 `TabletSysBar`（高度约 40px）、左侧 `TabletNavRail`（宽度 64px，不可折叠）、以及右侧的主内容区（`RouterView`），并保留既有 `AppRightPanel` 作为覆盖层从右侧滑入。

#### Scenario: 平板视口下渲染三区域壳层

- **WHEN** 设备变体解析为 `tablet`
- **THEN** `MainLayoutTablet` MUST 同时挂载 `TabletSysBar`、`TabletNavRail` 与 `<RouterView>`，并且 `MobileSysBar`、`MobileTabBar`、`AppHeader`、`AppFooter`、`AppSideMenu` 均 MUST NOT 渲染

#### Scenario: 右侧面板保持覆盖层行为

- **WHEN** 平板壳层渲染后用户打开 AI 助手或翻译进度
- **THEN** `AppRightPanel` MUST 作为主内容区之上的覆盖层从右侧滑入，并接入 `useOverlayCloseStack`，按 `Esc` 或点击遮罩时 MUST 关闭面板而不影响壳层其它区域

### Requirement: 平板左侧图标导航栏

`TabletNavRail` MUST 是一条 64px 宽、竖向排列的纯图标导航栏，固定在主内容区左侧，提供与 `MobileTabBar` 相同的核心入口（首页 · 书库 · AI 助手 · AI 模型 · 设置），并在当前路由命中时渲染激活态样式。

#### Scenario: 图标项点击跳转与底部导航一致

- **WHEN** 用户在平板壳层内点击导航项（如「书库」）
- **THEN** 系统 MUST 调用与 `MobileTabBar` 相同的路由/store 行为（例如 `router.push('/books')` 或切换 `ui.activeRightTab`），且 MUST NOT 引入新的路由或 store 字段

#### Scenario: 当前页激活样式

- **WHEN** 当前 `route.path` 匹配某个导航项（首页：`/`；书库：`/books` 或 `/books/:id`；AI 模型：`/ai`；设置：`/settings`），或 `ui.rightPanelOpen && ui.activeRightTab === 'chat'` 命中 AI 助手
- **THEN** 对应图标 MUST 渲染激活态（薄藍 tsukuyomi 色 + 浅背景），其他项 MUST 保持非激活态

#### Scenario: 只渲染图标并提供可访问性标签

- **WHEN** `TabletNavRail` 渲染任意导航项
- **THEN** 每个按钮 MUST 使用 `aria-label` 提供中文名称（图标不显示文本标签），且图标 MUST 使用 `PrimeIcons` 资源（不得使用 emoji）

### Requirement: 平板顶部实用信息条

`TabletSysBar` MUST 复用 `MobileSysBar` 同套状态源（`useSettingsStore().gistSync`、`useAIProcessingStore().hasActiveTasks`、`useToastHistory().unreadCount`），以横向平板宽度呈现品牌标识 + AI 思考过程 / 同步状态 / 通知 / 帮助的胶囊与按钮集群。

#### Scenario: 状态变化时 Pill 样式切换

- **WHEN** `aiProcessing.hasActiveTasks === true`
- **THEN** AI 思考按钮 MUST 渲染为带脉冲圆点的 pill 样式并显示「AI 思考中」；`false` 时 MUST 渲染为仅图标的 chip

#### Scenario: 同步状态四态呈现

- **WHEN** `gistSync.enabled === false`
- **THEN** 同步按钮 MUST 渲染为云朵图标（idle）
- **WHEN** `settingsStore.isSyncing === true`
- **THEN** MUST 渲染为琥珀色「同步中」pill 并带 spinner
- **WHEN** `gistSync.enabled && !isSyncing && gistSync.lastSyncTime > 0`
- **THEN** MUST 渲染为绿色「已同步」pill + `pi-cloud-check` 图标

#### Scenario: 通知与帮助入口

- **WHEN** `unreadCount > 0`
- **THEN** 通知按钮 MUST 在右上角渲染橙色未读徽标（`> 99` 时显示 `99+`）
- **WHEN** 用户点击帮助按钮
- **THEN** 系统 MUST 通过 `router.push('/help')` 跳转至帮助页，且当 `route.path.startsWith('/help')` 时 MUST 渲染激活态

### Requirement: 平板壳层不引入新业务状态

`MainLayoutTablet`、`TabletNavRail`、`TabletSysBar` MUST NOT 引入新的 Pinia store、composable 或路由，所有交互 MUST 通过现有 `useUiStore` / `useSettingsStore` / `useAIProcessingStore` / `useToastHistory` 完成。

#### Scenario: 壳层复用现有 store

- **WHEN** 平板壳层需要读取或写入任何跨组件状态（侧边面板开关、右面板 tab、同步状态、思考状态、未读通知）
- **THEN** 实现 MUST 只调用已存在的 store action / getter，MUST NOT 添加新的 action、getter 或本地 ref 作为跨组件状态源
