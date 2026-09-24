## Context

Tsukuyomi 的 mobile 与 tablet 变体已经建立了较清晰的产品语言：更明确的 eyebrow 与标题层次、更克制的表面材质、更安静的次级信息组织，以及更统一的入口态与空状态表达。相比之下，桌面端仍然保留多套历史 UI：

- `MainLayoutDesktop.vue` 延续了旧的 desktop shell 语法，`AppHeader`、`AppSideMenu`、`AppRightPanelDesktop` 与主画布之间缺少统一工作台层次。
- `BooksPageDesktop.vue` 与 `AIPageDesktop.vue` 仍主要依赖传统 DataView/管理后台式布局，信息层次与 mobile/tablet 已经产生割裂。
- `BookDetailsDesktop.vue` 的功能最完整，但目录侧栏、章节工具栏、正文区与术语/角色/记忆上下文之间仍偏向历史模块拼接，而不是同一工作区内的连续体验。
- `SettingsPageDesktop.vue` 目前只是 `SettingsPageTablet.vue` 的桌面放大版，并不具备独立的 desktop page 语法。
- `HelpPageDesktop.vue` 保留了三栏阅读优势，但缺少与其他端一致的入口态与更清晰的品牌化信息层次。

本 change 的目标是刷新桌面端布局与样式，而不是调整产品能力。本次设计必须满足以下约束：

- 不修改 stores、services、routes、IndexedDB、AI pipeline 或 dispatcher 机制。
- 桌面端必须保留高密度扫描、多栏并行查看和一跳直达操作效率。
- mobile 与 tablet 只作为视觉语言与信息层次参考，不直接照搬其 drawer、bottom sheet、rail overlay 或单列工作流。
- `help-page` 是已有 capability，本次通过 delta spec 扩展其 desktop requirement，而不是创建平行 capability。

## Goals / Non-Goals

**Goals:**
- 让桌面端壳层、书库页、书籍详情页、设置页、AI 页与帮助页共享同一套 desktop workbench 语法。
- 让 desktop 吸收 mobile/tablet 已验证的标题层次、材质和次级信息组织方式，同时保留大屏效率优势。
- 将桌面设置页从平板模态放大复用升级为正式的桌面工具页，并让 AI 页共享相同语法。
- 为帮助页补齐 desktop 入口态与多栏阅读工作区的统一表达。

**Non-Goals:**
- 不新增翻译、同步、AI、帮助导航或书籍管理能力。
- 不引入 desktop 专属 store、service API 或数据模型字段。
- 不让 desktop 退化为 mobile/tablet 的单列、抽屉优先或弹层优先工作流。
- 不重写 `VolumesList`、`ChapterToolbar`、`ChapterContentPanel`、设置 tab content、AI 模型管理逻辑等既有业务路径。

## Decisions

### Decision 1: 引入一层很薄的 desktop 展示语法，而不是每页各写一套样式

这次改动横跨 shell、列表页、详情页、工具页和帮助页。如果完全在每个页面内局部复制 eyebrow、标题区、section surface、统计条与 meta strip，会立刻形成新一轮 desktop UI 漂移。相反，如果为此次改动建立完整 design system，又会显著放大范围。

因此实现上采用“很薄的共享展示语法”：共享 desktop 标题区、section surface、统计条和次级 meta 风格，必要时提取 1 到 2 个纯展示片段组件；页面的具体布局和交互仍保留在各自 `*Desktop.vue` 中。

**Alternatives considered:**
- 纯页面局部样式复制：短期快，但很难保证后续桌面页一致性。
- 完整 desktop design system：抽象过重，不符合这次 focused refresh 的范围。

### Decision 2: 保留 `MainLayoutDesktop` 四区骨架，只重做 shell chrome 与画布节奏

`MainLayoutDesktop.vue` 当前的顶部系统条、左侧导航、中央画布和右侧上下文区，仍然符合桌面端高密度与并行工作的需求。问题在于视觉语法旧，而不是壳层结构本身错误。

因此本次保留这套骨架与当前 UI store 语义，只刷新：

- `AppHeader.vue` 的层次、状态信息组织和操作节奏
- `AppSideMenu.vue` 的分区、active 态与收藏区域表达
- `AppRightPanelDesktop.vue` 的表面、header/tabs 层次与与主壳层的一致性
- 主画布的边距、宽度节奏、背景层级和页面容器规则

**Alternatives considered:**
- 改成 tablet 风格 rail-only shell：会降低桌面可发现性与直接操作效率。
- 将右侧上下文区改成 overlay-only 系统：会破坏当前桌面工作流与宽度持久化语义。

### Decision 3: `BooksPageDesktop` 继续使用 route-driven 多列浏览，而不是切到 master-detail

桌面书库的主要任务是批量浏览、搜索、排序、管理和快速进入书籍详情，而不是像 tablet 那样在当前页内维持一个轻量选中态预览详情。现有 `injectBooksPage()` 已经提供完整交互路径，最小正确改动是重做信息层次而不是增加新的桌面状态。

因此桌面书库继续保持分页网格，但提升：

- 头部改为工作台式前奏，包含 eyebrow、标题、摘要、统计和工具条
- 卡片改为封面优先、标题更突出、元数据更安静
- 收藏、编辑、删除等操作保留一跳可达，但明确降级为次级动作

**Alternatives considered:**
- 采用 tablet 的 master-detail：更贴近参考稿，但会损失桌面批量扫描效率，并引入新的局部状态。

### Decision 4: `BookDetailsDesktop` 只重构容器与层次，不替换核心业务组件

`BookDetailsDesktop.vue` 绑定了卷/章节树、章节工具栏、搜索工具栏、正文区与设置面板的大量成熟行为。若直接把 tablet/mobile 模板搬到 desktop，会迫使大量业务组件分叉。

因此本次复用现有 composable 与子组件，只在桌面端重排：

- 左侧栏：书籍概览、设置快捷入口、目录工具、章节树、返回入口
- 主工作区：章节身份、主翻译动作、次级工具和内容容器层次
- 设置上下文：继续作为同一书籍工作区的替代主视图，而不是独立工具页

**Alternatives considered:**
- 直接采用 tablet 的 toolbar 与阅读布局：会迫使 `ChapterContentPanel` 等组件出现桌面专属行为分叉。
- 只换颜色不改层次：无法解决当前信息组织老旧的问题。

### Decision 5: `SettingsPageDesktop` 独立成页，并让 `AIPageDesktop` 共享工具页语法

当前桌面设置页只是 tablet 模态放大版，这会让它在桌面环境里显得像临时借位界面。与此同时，AI 页面虽然是独立页面，但标题区、卡片层次和次级信息区仍延续旧后台式表达。

因此：

- `SettingsPageDesktop` 改为真正的 desktop page，仍复用 `injectSettingsPage()` 与既有 tab content components
- `AIPageDesktop` 保留现有搜索、添加、复制、编辑、删除和任务路由行为，但改成与设置页一致的工具页骨架

**Alternatives considered:**
- 持续复用 `SettingsPageTablet`：实现成本最低，但桌面体验永远停留在“平板放大版”。
- 让 AI 页完全沿用 tablet 页面：会损失桌面已有的信息密度与管理效率。

### Decision 6: `HelpPageDesktop` 保留三栏阅读工作区，但补充 desktop landing state

桌面帮助页的核心优势是 topic navigation、TOC 和正文可同时可见，这一点应保留。当前问题不在于结构错误，而在于无选中文档时缺少真正的帮助中心入口态，也未和其他页面共享同一层次语言。

因此桌面帮助页采用双状态：

- 有文档时：保持 topic navigation + TOC + article 的三栏工作区
- 无文档时：在主内容区显示品牌化 desktop landing，承接 quick start 与 topic entry

**Alternatives considered:**
- 自动打开第一篇文档：避免空状态，但会失去“帮助中心”入口页的导览价值。
- 将 desktop 帮助导航做成 drawer 或 modal：会削弱桌面连续阅读优势。

## Risks / Trade-offs

- **[Risk]** 共享 desktop 展示语法抽象过度，导致页面为了复用而牺牲各自结构。→ **Mitigation:** 共享层只承载标题区、section surface 和统计条语法；一旦页面需要大量条件分支，则保留页面局部实现。
- **[Risk]** 桌面刷新后视觉更统一，但信息密度反而下降。→ **Mitigation:** 保留侧栏、右侧上下文区、多列网格、章节树和工具栏的一跳可达性，只优化 hierarchy，不照搬 mobile/tablet 的稀疏节奏。
- **[Risk]** `SettingsPageDesktop` 与 `SettingsPageTablet` 模板分叉后，后续 tab 内容更新容易遗漏一个变体。→ **Mitigation:** 两端继续共享 `injectSettingsPage()` 与现有 tab content components，只分离容器模板与样式。
- **[Risk]** `BookDetailsDesktop` 容器重排可能影响章节拖拽、工具栏行为或搜索区域定位。→ **Mitigation:** 不替换 `VolumesList`、`ChapterToolbar`、`SearchToolbar`、`ChapterContentPanel` 的核心行为，只调整外层分区和容器层次。
- **[Risk]** `HelpPageDesktop` 的 landing state 增加 `currentDoc === null` 分支后，可能破坏既有阅读路径。→ **Mitigation:** 将 landing state 作为文档未选中时的明确分支；文档选中后的三栏阅读工作区继续沿用现有交互语义。

## Migration Plan

这是纯桌面呈现层刷新，不涉及数据迁移、API 迁移或持久化状态迁移。

建议实现顺序：

1. 先落地共享 desktop 展示语法与 `MainLayoutDesktop` shell chrome。
2. 重做 `BooksPageDesktop`，验证标题区、section surface 和卡片语言是否成立。
3. 重做 `BookDetailsDesktop`，重点验证左栏、章节工具栏和设置上下文的一致性。
4. 将 `SettingsPageDesktop` 从 tablet 复用中拆离，并同步刷新 `AIPageDesktop`。
5. 最后补齐 `HelpPageDesktop` 的 landing state 与阅读工作区层次。
6. 统一执行 lint / type-check / quality-check，并进行桌面与跨断点手动验证。

回滚策略：按提交粒度回退桌面展示语法与各 `*Desktop.vue` 变更即可；不会产生数据层清理需求。

## Open Questions

- 共享 desktop 展示语法最终更适合通过少量 fragment 组件实现，还是仅通过共享 class/token 实现，需要在完成首个页面后再根据重复量确认。
- `AppRightPanelDesktop` 本次是否只需在表面与 header 层级上对齐主壳层，还是需要更深入地重排内部 tab/header，需在 shell 落地后再判断。