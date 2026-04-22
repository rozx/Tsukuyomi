## Why

当前桌面端虽然功能完整，但 `MainLayoutDesktop`、`BooksPageDesktop`、`BookDetailsDesktop`、`SettingsPageDesktop`、`AIPageDesktop`、`HelpPageDesktop` 仍然呈现出多套不一致的年代感界面：有的偏旧式后台，有的直接放大 tablet 结构，有的与 mobile/tablet 已经形成明显视觉割裂。随着 mobile 和 tablet 变体已经建立了更明确的标题层次、材质、导航节奏和信息收纳方式，桌面端现在成为整套产品里最不统一的那一层，需要一次成体系的桌面工作台重设计来恢复跨设备一致性，同时保留大屏高密度效率。

## What Changes

- 重新设计桌面端应用壳层，让顶部系统条、左侧主导航、中间页面画布、右侧上下文面板共享统一的桌面工作台视觉语言，而不是继续维持各自为政的深色玻璃拼装感。
- 重做 `BooksPageDesktop`，将当前偏后台化的网格卡片升级为封面优先、标题分层更明确、次级操作降噪的桌面书库工作台。
- 重做 `BookDetailsDesktop`，保留桌面端目录 + 正文/设置工作区的高效率骨架，但把左栏、章节工具栏、阅读区表面和设置上下文重排为更接近 tablet/mobile 的层次结构。
- 将 `SettingsPageDesktop` 从“放大的 tablet 模态卡片”升级为真正的桌面工具页，并统一 `AIPageDesktop` 的头部、内容区和次级面板风格。
- 提升 `HelpPageDesktop` 的帮助中心入口、导航侧栏、TOC 与正文头部层次，使其与新的桌面壳层和工具页语法一致。
- 保持现有业务能力、路由、stores、services、composables 和 dispatcher 规则不变；本次仅调整桌面端呈现和桌面信息组织方式，不新增翻译、同步或 AI 功能。

## Capabilities

### New Capabilities

- `desktop-shell-chrome`: 定义桌面端应用壳层的统一工作台视觉与交互骨架，覆盖顶栏、左导航、主画布和右侧上下文区。
- `desktop-library-workbench`: 定义桌面书库页的头部层次、书架卡片、筛选/排序工具条和高密度浏览行为。
- `desktop-book-details-workspace`: 定义桌面书籍详情页的目录侧栏、阅读工具栏、章节内容工作区和设置上下文切换方式。
- `desktop-tool-pages`: 定义桌面 `Settings` 与 `AI` 页面共享的内容/工具页骨架、标题区、tabs、卡片表面和次级面板组织方式。

### Modified Capabilities

- `help-page`: 扩展桌面帮助页 requirement，使桌面端除了现有文档渲染与跨断点可达性之外，还需要提供品牌化帮助中心入口、更明确的文档导航/目录/正文三段阅读工作区，以及在无选中文档时的桌面入口态。

## Impact

- **主要影响文件**: `src/layouts/main-layout/MainLayoutDesktop.vue`、`src/components/layout/AppHeader.vue`、`src/components/layout/AppSideMenu.vue`、`src/components/layout/AppRightPanelDesktop.vue`、`src/pages/books-page/BooksPageDesktop.vue`、`src/pages/book-details/BookDetailsDesktop.vue`、`src/pages/settings-page/SettingsPageDesktop.vue`、`src/pages/ai-page/AIPageDesktop.vue`、`src/pages/help-page/HelpPageDesktop.vue` 及其直接依赖的桌面展示组件。
- **可能新增文件**: 共享桌面页面骨架/片段组件、桌面样式片段或局部展示组件，用于抽取重复的标题区、统计条、工作台 section 和卡片表面。
- **不受影响**: `src/stores/**`、`src/services/**`、`src/router/**`、`src/models/**`、移动端与平板端业务逻辑、断点解析、IndexedDB、同步流程、AI 执行流程。
- **约束**: 桌面端仍需保留高密度浏览、多栏并行查看和直接操作效率；不得把 desktop 退化成 mobile/tablet 的单列或抽屉式工作流。
