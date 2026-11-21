# tablet-shell-chrome Specification

## Purpose
定义平板应用壳层：左侧图标导航栏与顶部实用信息条，不引入新的业务状态。

## Requirements

### Requirement: 平板应用壳层结构

当 `useDeviceVariant()` 返回 `'tablet'` 时，系统 MUST 通过 `MainLayoutTablet` 渲染三块固定区域：顶部 `TabletSysBar`（高度约 40px）、左侧 `TabletNavRail`（宽度 64px，不可折叠）、以及右侧的主内容区（`RouterView`），并保留既有 `AppRightPanel` 作为覆盖层从右侧滑入。

#### Scenario: 平板视口下渲染三区域壳层

- **WHEN** 设备变体解析为 `tablet`
- **THEN** `MainLayoutTablet` MUST 同时挂载 `TabletSysBar`、`TabletNavRail` 与 `<RouterView>`，并且 `MobileSysBar`、`MobileTabBar`、`AppHeader`、`AppFooter`、`AppSideMenu` 均 MUST NOT 渲染

#### Scenario: 右侧面板保持覆盖层行为

- **WHEN** 平板壳层渲染后用户打开 AI 助手
- **THEN** `AppRightPanel` MUST 作为主内容区之上的覆盖层从右侧滑入，并接入 `useOverlayCloseStack`，按 `Esc` 或点击遮罩时 MUST 关闭面板而不影响壳层其它区域

### Requirement: 平板左侧图标导航栏

`TabletNavRail` MUST 是一条 64px 宽、竖向排列的纯图标导航栏，固定在主内容区左侧：上方为页面导航（首页 · 书库 · AI 导入 · AI 模型 · 外部 Agent，按功能开关显示），底部固定帮助 · 设置；当前路由命中时渲染激活态样式。AI 助手入口在顶部实用信息条，MUST NOT 出现在导航栏中。

#### Scenario: 图标项点击跳转与底部导航一致

- **WHEN** 用户在平板壳层内点击导航项（如「书库」）
- **THEN** 系统 MUST 通过与 `MobileTabBar` 共用的 `useMainNavDispatch` 执行路由行为（例如 `router.push('/books')`），且 MUST NOT 引入新的路由

#### Scenario: 当前页激活样式

- **WHEN** 当前 `route.path` 匹配某个导航项（首页：`/`；书库：`/books` 或 `/books/:id`；AI 导入：`/import`；AI 模型：`/ai`；外部 Agent：`/mcp`；帮助：`/help`；设置：`/settings`）
- **THEN** 对应图标 MUST 渲染激活态（薄藍 tsukuyomi 色 + 浅背景），其他项 MUST 保持非激活态

#### Scenario: 只渲染图标并提供可访问性标签

- **WHEN** `TabletNavRail` 渲染任意导航项
- **THEN** 每个按钮 MUST 使用 `aria-label` 提供名称（图标不显示文本标签），且图标 MUST 使用 `PrimeIcons` 资源（不得使用 emoji）

### Requirement: 平板顶部实用信息条

`TabletSysBar` MUST 复用 `MobileSysBar` 同套状态源（`useSettingsStore().gistSync`、任务中心状态、`useToastHistory().unreadCount`），以横向平板宽度从左到右呈现：页面开关挂载点、品牌标识，以及任务中心 · 同步状态 | 「月詠」助手 · 通知的胶囊与按钮集群（竖线为分隔线）。

#### Scenario: 状态变化时 Pill 样式切换

- **WHEN** 有运行中或排队中的章节任务，或有运行中的其他 AI 活动
- **THEN** 任务中心 chip MUST 按 `header-task-center` 定义的状态显示运行数、排队数、进度条或活动指示；全部空闲时 MUST 渲染为仅图标的 chip

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
- **WHEN** 用户点击帮助入口（位于左侧导航栏底部，顶部信息条不另设帮助按钮）
- **THEN** 系统 MUST 通过 `router.push('/help')` 跳转至帮助页，且当 `route.path.startsWith('/help')` 时该入口 MUST 渲染激活态

#### Scenario: 月詠助手按钮

- **WHEN** 用户在任一平板页面点击顶部信息条的「月詠」按钮
- **THEN** 系统 MUST 通过 `useMainNavDispatch().dispatch('chat')` 打开或关闭右侧助手面板（与 `MobileTabBar`、桌面 header 共用同一套逻辑）；面板打开时按钮 MUST 为激活态；按钮只显示图标并 MUST 带 `aria-label`

#### Scenario: 助手面板打开时关闭

- **WHEN** 助手覆盖层已打开，用户再次点击「月詠」按钮
- **THEN** 面板 MUST 关闭（覆盖层遮罩不覆盖顶部信息条）

#### Scenario: 导入页的助手按钮

- **WHEN** 当前为导入路由且平板横屏（导入助手常驻停靠）
- **THEN** 「月詠」按钮 MUST 显示激活态，点击 MUST NOT 关闭导入助手，也 MUST NOT 改变离开导入页后助手面板的开关状态
- **WHEN** 当前为导入路由且平板竖屏（导入助手不停靠，见 `ai-import-workspace`）
- **THEN** 「月詠」按钮 MUST 与其他页面相同，打开或关闭右侧滑入的导入助手；离开导入路由时该面板 MUST 关闭

#### Scenario: 页面开关挂载点

- **WHEN** 当前页面提供左侧面板开关（书库页、书籍详情页，见 `tablet-page-layouts`）
- **THEN** 开关 MUST 显示在品牌标识左侧；壳层只提供空的挂载点，开关按钮与其状态 MUST 由页面提供，壳层 MUST NOT 为此新增 store 字段或 composable

#### Scenario: 竖屏宽度下不溢出

- **WHEN** 平板竖屏窗口宽约 768px，且页面开关与全部 chip 都显示
- **THEN** 品牌文字 MUST 收缩并以省略号截断，开关、任务中心、同步、「月詠」、通知 MUST 保持在一行内且都可点击

### Requirement: 平板壳层不引入新业务状态

`MainLayoutTablet`、`TabletNavRail`、`TabletSysBar` MUST NOT 自行引入新的 Pinia store、composable 或路由，所有交互 MUST 通过现有 `useUiStore` / `useSettingsStore` / `useAIProcessingStore` / `useToastHistory`，以及任务队列 store 与任务中心 composable（由 `chapter-task-queue` 与 `header-task-center` 提供，三端共享）完成。

#### Scenario: 壳层复用现有 store

- **WHEN** 平板壳层需要读取或写入任何跨组件状态（侧边面板开关、同步状态、任务中心状态、未读通知）
- **THEN** 实现 MUST 只调用已存在的 store action / getter 或共享的任务中心 composable，MUST NOT 添加平板专属的 action、getter 或本地 ref 作为跨组件状态源
