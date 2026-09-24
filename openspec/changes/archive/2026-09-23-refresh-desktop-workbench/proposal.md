## Why

当前桌面端在视觉语言与信息层次上已经明显落后于 mobile 和 tablet 变体：桌面壳层仍保留偏旧的后台式拼装感，书库与 AI 页面更像历史管理界面，设置页甚至只是平板布局的放大复用，导致同一产品在不同断点下呈现出割裂的年代感。现在 mobile 和 tablet 已经验证了更清晰的标题层次、表面材质和次级信息组织方式，桌面端需要一次只涉及布局与样式的刷新，重新建立统一的桌面工作台体验，同时保留大屏高密度、多栏并行和一跳直达的效率优势。

## What Changes

- 刷新桌面端应用壳层，让顶部系统条、左侧主导航、中间页面画布和右侧上下文面板共享统一的 desktop workbench 视觉语法。
- 重做桌面书库页的头部层次、统计信息和书籍卡片表现，保留现有搜索、排序、添加、收藏、编辑、删除与分页行为。
- 重组桌面书籍详情页的侧栏、章节工具栏和设置上下文容器，让目录、阅读和术语/角色/记忆管理在同一桌面工作区内更连贯地切换。
- 将桌面设置页从平板模态放大复用改为独立桌面工具页，并让桌面 AI 页面共享相同的标题区、内容区和次级信息区语法。
- 提升桌面帮助页的入口态、文档导航、目录和正文层次，使其与新的桌面壳层保持同一产品语言。
- 保持现有 routes、stores、services、composables、dispatcher 规则、数据模型和持久化逻辑不变；本次不引入任何新功能或行为语义变化。

## Capabilities

### New Capabilities
- `desktop-shell-chrome`: 定义桌面端应用壳层的统一工作台视觉与页面语法，覆盖顶部系统条、左侧导航、主画布和右侧上下文区。
- `desktop-library-workbench`: 定义桌面书库页的头部层次、统计条、封面优先卡片和高密度浏览体验。
- `desktop-book-details-workspace`: 定义桌面书籍详情页的目录侧栏、阅读工作区和设置上下文在同一工作台内的呈现方式。
- `desktop-tool-pages`: 定义桌面设置页与 AI 页面共享的工具页骨架、标题区、区块表面与次级信息组织方式。

### Modified Capabilities
- `help-page`: 调整桌面帮助页 requirement，使其在保留多栏阅读工作区的同时提供品牌化入口态和更清晰的导航/目录/正文层次。

## Impact

- **主要影响文件**: `src/layouts/main-layout/MainLayoutDesktop.vue`、`src/components/layout/AppHeader.vue`、`src/components/layout/AppSideMenu.vue`、`src/components/layout/AppRightPanelDesktop.vue`、`src/pages/books-page/BooksPageDesktop.vue`、`src/pages/book-details/BookDetailsDesktop.vue`、`src/pages/settings-page/SettingsPageDesktop.vue`、`src/pages/ai-page/AIPageDesktop.vue`、`src/pages/help-page/HelpPageDesktop.vue`。
- **可能新增文件**: 桌面共享展示片段、桌面页面标题/section 容器、局部样式 token 或纯展示组件。
- **不受影响**: `src/stores/**`、`src/services/**`、`src/router/**`、`src/models/**`、移动端与平板端功能逻辑、IndexedDB、同步流程、AI 执行链路。
- **API / data impact**: 无外部 API 变化，无数据迁移，无新增依赖要求。