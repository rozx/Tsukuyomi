## ADDED Requirements

### Requirement: 平板首页双列仪表盘

`IndexPageTablet` MUST 呈现双列仪表盘：顶部问候区 + 两栏卡片区（左侧为正在进行的翻译任务 / 右侧为继续阅读）+ 五列统计条 + 四列快速操作 + 三列最近阅读网格，所有数据 MUST 从 `injectIndexPage()` 直接读取，不得新增字段。

#### Scenario: 有正在进行任务时渲染任务卡

- **WHEN** `useAIProcessingStore().hasActiveTasks === true` 并且能从现有数据解析出当前书籍 / 章节 / 段落进度
- **THEN** 首页 MUST 在左侧卡片中渲染任务元数据（章节名、书名、进度条、ETA 占位），并提供跳转到该书籍的按钮；该按钮 MUST 复用 `ctx.navigateToBookDetails` 或等价现有行为

#### Scenario: 无正在进行任务时降级

- **WHEN** 没有正在进行的任务
- **THEN** 首页 MUST NOT 渲染任务卡，继续阅读卡 MUST 占满 `grid` 宽度或按双列布局退化为单列

#### Scenario: 统计与最近阅读直接绑定 composable

- **WHEN** 渲染统计条与最近阅读网格
- **THEN** 数据 MUST 来自 `ctx.totalBooks`、`ctx.totalChapters`、`ctx.totalWords`、`ctx.starredBooks`、`ctx.recentBooks`；平板 MUST NOT 引入新的计算属性

### Requirement: 平板书库主从布局

`BooksPageTablet` MUST 采用主从布局：左侧书籍列表（~320px 宽，包含搜索与收藏筛选），右侧详情区展示选中书籍的封面、标题、标签、进度、统计五项、章节树双列预览，并提供「继续翻译 / 编辑元数据 / 导出」按钮。

#### Scenario: 点击列表项切换详情

- **WHEN** 用户点击书籍列表中的某本书
- **THEN** 详情区 MUST 立即更新为该书内容，路径 MUST NOT 改变（无需跳转），选中态 MUST 通过内联高亮（左侧薄藍 inset-shadow）体现

#### Scenario: 详情区按钮仅绑定现有行为

- **WHEN** 用户点击详情区的「继续翻译」或「编辑元数据」或「导出」
- **THEN** 每个按钮 MUST 调用 `injectBooksPage()` 中已存在的方法或触发现有路由跳转，MUST NOT 新增 store action 或 service 调用

#### Scenario: 搜索与计数

- **WHEN** 用户在左侧搜索框输入
- **THEN** 列表 MUST 用 `ctx.filteredBooks` / `ctx.searchQuery` 过滤，并在表头展示总数与收藏数（与 `BooksPageMobile` 规则一致）

### Requirement: 平板书籍详情工作区

`BookDetailsTablet` MUST 通过复用 `BookDetailsDesktop` 的响应式分支（`isSmallScreen === true` 时的小屏工作区）呈现书籍详情页：左侧卷/章节 sidebar、基于 `workspaceMode` 切换的主内容区（目录 / 内容 / 术语 / 人物 / 记忆 / 设置）、顶部工作区 Tab 条。MUST NOT 引入新的 `Paragraph*` / `VolumesList*` / `ChapterContentPanel*` 子组件或拷贝。

#### Scenario: 平板宽度下激活小屏工作区

- **WHEN** 设备变体为 `tablet`
- **THEN** `BookDetailsTablet` MUST 渲染 `BookDetailsDesktop`；由于 `useBookDetailsPage().isSmallScreen = isPhone || isTablet`，桌面变体内部 MUST 自动进入 `workspaceMode` 切换模式（目录 / 内容 / 设置），而不是并列三栏

#### Scenario: 工作区 Tab 之间切换

- **WHEN** 用户在平板工作区切换 Tab（目录 / 内容 / 设置 / 术语 / 人物 / 记忆）
- **THEN** 切换 MUST 调用现有 `ctx.workspaceMode` / `ctx.selectedSettingMenu` setter，MUST NOT 引入新的 store 字段或 composable 方法

#### Scenario: 章节选择触发内容加载

- **WHEN** 用户在左侧卷/章节 sidebar 点击章节
- **THEN** 章节加载 MUST 走现有 `ctx.loadChapter` 或等价 action；内容呈现 MUST 使用既有 `ChapterContentPanel`（段落原文/译文按当前实现纵向堆叠，tablet 不引入新的双栏段落组件）

#### Scenario: 段落操作复用现有 action

- **WHEN** 用户在内容区选中段落并触发重新翻译 / 润色 / 校对等操作
- **THEN** 调用 MUST 映射到 `useParagraphTranslation` 或等价 composable 中已暴露的 action，MUST NOT 新增操作入口

### Requirement: 平板设置页居中模态与横向 Tab

`SettingsPageTablet` MUST 将设置呈现为壳层内的一张居中卡片（约 820px × 640px），含标题「设置」、横向 Tab 条（AI 模型 · 代理设置 · API Keys · 同步设置 · 爬虫设置 · 导入/导出 · 记忆注入），以及对应 Tab 的内容面板。

#### Scenario: 默认选中 AI 模型 Tab

- **WHEN** 用户进入 `/settings`
- **THEN** 横向 Tab 条 MUST 默认高亮「AI 模型」，下方内容区 MUST 渲染 `AIModelSettingsTab`

#### Scenario: 横向 Tab 切换

- **WHEN** 用户点击其他 Tab（如「API Keys」）
- **THEN** 内容区 MUST 切换到对应的现有组件（`ApiKeysSettingsTab` / `ProxySettingsTab` / `SyncSettingsTab` / `ScraperSettingsTab` / `ImportExportTab` / `MemoryInjectionTab`），并通过路由或 `injectSettingsPage()` 暴露的当前 Tab 状态保持同步

#### Scenario: AI 模型 Tab 双列表单网格

- **WHEN** 用户停留在 AI 模型 Tab
- **THEN** 内容区 MUST 以双列网格呈现四个任务下拉（翻译 / 校对和润色 / 术语翻译 · 章节摘要 / 助手），并提供指向 API Keys 的信息提示卡

### Requirement: 平板 AI 模型与帮助页布局

`AIPageTablet` 与 `HelpPageTablet` MUST 复用各自 `*Desktop` 变体（已内置响应式断点），平板宽度下自动渲染 `p-3 sm:p-4 lg:p-6` 的紧凑网格（AI）与 `w-64` 侧边栏 + 主文档双栏（Help）。MUST NOT 拷贝 DataView、编辑对话框或文档渲染组件为 tablet 专用副本。

#### Scenario: AI 模型页复用 DataView 响应式网格

- **WHEN** 设备变体为 `tablet`
- **THEN** `AIPageTablet` MUST 渲染 `AIPageDesktop`；其 `DataView` MUST 自然适配 tablet 视口，模型卡片按单列布局渲染，添加 / 编辑 / 删除等交互 MUST 走既有 dialogs

#### Scenario: 帮助页两栏导航

- **WHEN** 用户在 `HelpPageTablet` 左侧点击某篇文档
- **THEN** 右侧文章区 MUST 加载对应文档（通过现有 `useHelpPage()` 暴露的 `navigateToDocument`），路由 MUST 更新为 `/help/:docId`；`HelpPageTablet` MUST 渲染 `HelpPageDesktop`（已含 `w-64` 侧栏与 `w-60` TOC 的响应式布局）

### Requirement: 平板 NotFound 页居中呈现

`NotFoundPageTablet` MUST 在壳层内居中渲染 404 状态，含图标、主标题、描述文字，以及「返回首页 / 打开书库」两个按钮。

#### Scenario: 404 页按钮导航

- **WHEN** 用户点击「返回首页」或「打开书库」
- **THEN** 系统 MUST `router.push('/')` 或 `router.push('/books')`，MUST NOT 引入新的路由

### Requirement: 平板页面复用移动端 composable

所有 `*Tablet.vue` 页面 MUST 通过与 `*Mobile.vue` 相同的 `injectXxx()` 获取数据与行为，MUST NOT 新增 composable、store 字段或 service 方法。

#### Scenario: 注入复用而非新建

- **WHEN** 任意平板页面需要书籍 / 章节 / 设置 / AI 模型 / 帮助文档数据
- **THEN** 平板变体 MUST 调用 `injectIndexPage` / `injectBooksPage` / `injectBookDetailsPage` / `injectAIPage` / `injectSettingsPage` / `injectHelpPage`（或等价现有入口），并且 MUST NOT 新增 provide / inject key

#### Scenario: 无可用特性时不渲染

- **WHEN** 设计稿中出现的数据点（例如 ETA、sim 相似度、每模型统计）在现有 mobile 或 desktop 变体中没有绑定
- **THEN** 平板变体 MUST 用静态占位符或直接省略该区块，MUST NOT 新增数据源来填充
