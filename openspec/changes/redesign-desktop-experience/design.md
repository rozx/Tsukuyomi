## Context

Tsukuyomi 当前已经在 mobile 与 tablet 端形成了更明确的视觉语言：小写眉题、serif 主标题、低对比材质、紧凑的 meta strip、以及更克制的次级操作收纳方式。相比之下，桌面端仍然保留多套历史 UI：

- `MainLayoutDesktop.vue` 由 `AppHeader`、`AppSideMenu`、`RouterView`、`AppRightPanel` 直接拼接，四个区域各自维护风格，缺少统一工作台语言。
- `BooksPageDesktop.vue` 仍是偏后台式的数据网格，信息噪音较高，书籍封面与主任务优先级不够明确。
- `BookDetailsDesktop.vue` 虽然功能最完整，但左栏、工具栏、正文区和设置上下文之间的视觉分区仍偏工程化堆叠，与 mobile/tablet 已经成型的节奏不一致。
- `SettingsPageDesktop.vue` 目前只是 `SettingsPageTablet.vue` 的放大复用，不是独立的桌面工具页。
- `AIPageDesktop.vue` 与 `HelpPageDesktop.vue` 各自有独立页面语法，和新的壳层方向没有形成统一产品感。

本 change 的目标不是把 desktop 变成 tablet，也不是引入任何新业务能力；它是一次桌面工作台级别的重设计。实现上必须遵守以下约束：

- 不修改 stores、services、routes、IndexedDB、AI pipeline 或 dispatcher 机制。
- desktop 必须保留高密度浏览、多栏并行查看和一跳直达操作。
- mobile / tablet 是视觉与层次参考，不是桌面布局蓝图；不能照搬其 drawer、bottom sheet、单列流式交互。
- `help-page` 是已有 capability，本次需要通过 delta spec 扩展桌面 requirement，而不是另建平行 capability。

## Goals / Non-Goals

**Goals:**

- 让 `MainLayoutDesktop`、`BooksPageDesktop`、`BookDetailsDesktop`、`SettingsPageDesktop`、`AIPageDesktop`、`HelpPageDesktop` 共享同一套桌面工作台语法。
- 让桌面端吸收 mobile/tablet 已验证的视觉层次：eyebrow、serif 标题、mono meta、轻表面、次级操作降噪。
- 保留桌面端的直接操作效率：固定导航、固定上下文面板、多列书架、高密度目录、阅读与设置并行可达。
- 将 Settings 从“放大的平板卡片”升级为真正的桌面工具页，并让 AI / Help 与新的桌面壳层协调一致。

**Non-Goals:**

- 不改变任何业务逻辑、数据模型、AI 服务、同步流程或路由语义。
- 不为 desktop 引入 tablet/mobile 的 drawer-only、bottom-sheet-only 或单列工作流。
- 不新建桌面专属 stores/composables/service API。
- 不重写 `ChapterContentPanel`、`VolumesList`、`TranslationProgress` 的核心业务行为，只调整其桌面容器与呈现层级。

## Decisions

### Decision 1: 引入一层很小的桌面展示原语，而不是每个页面各写一套样式

这次改动横跨 shell、列表页、详情页和工具页。如果完全采用页面局部 CSS 复制，`eyebrow + title + summary + action bar`、统计条、section surface、次级 meta 文本这些模式会在 5 个桌面页面中重复，后续很难保持一致。相反，如果引入一整套新的桌面布局框架，又会让 change 规模膨胀。

因此实现上采用“小而薄”的共享展示层：共享桌面标题区、section surface 和 metric/meta 样式，必要时提取 1-2 个纯展示片段组件；页面自己的布局与交互仍留在各自 `*Desktop.vue` 文件中。

**Alternatives considered:**

- 纯页面局部样式复制：改动快，但会立即形成新一轮桌面 UI 漂移。
- 建立完整 desktop design system / layout framework：抽象过度，不适合本次 focused redesign。

### Decision 2: 保留 `MainLayoutDesktop` 的四区骨架，只重做桌面 chrome，不引入 tablet 式 shell

`MainLayoutDesktop` 当前的 `AppHeader + AppSideMenu + RouterView + AppRightPanel` 已经承载了现有桌面工作流与 UI store 状态（`sideMenuOpen`、`rightPanelOpen`、`rightPanelWidth`）。这些结构本身符合桌面端需求，问题在于视觉语言不统一，而不是骨架错误。

因此实现上保留这套结构与状态语义，只重做：

- `AppHeader` 的系统条层次与信息收纳方式
- `AppSideMenu` 的分区、active 态与收藏区域节奏
- `AppRightPanelDesktop` 的表面、tabs 和与主壳层的一致性
- `main` 画布的统一外边距、背景与 section 节奏

**Alternatives considered:**

- 改成 tablet 式 icon rail：会降低桌面可发现性，也偏离“高密度 direct access”的目标。
- 把右侧面板改成 overlay-only 独立系统：会破坏现有桌面工作流与宽度状态。

### Decision 3: `BooksPageDesktop` 继续使用 route-driven DataView 网格，而不是改成 tablet 的 master-detail

桌面书库的主要任务是大量浏览、筛选、排序和快速进入某本书，而不是在当前页停留一个本地选中态预览详情。现有 `injectBooksPage()` 已经提供了搜索、排序、添加、收藏、编辑、删除、导入与分页所需的全部行为，最小正确改动是重做 header 与 card hierarchy，而不是引入新的本地选中书状态。

因此 Books 桌面端继续保持分页网格，但做以下提升：

- 头部升级为工作台标题区 + 汇总指标 + 搜索/排序/添加工具条
- 卡片改为封面优先、标题更突出、元数据压缩成 badge / mono strip
- 收藏/编辑/删除仍直接可达，但弱化为次级操作

**Alternatives considered:**

- 采用 tablet master-detail：更像参考稿，但会损失 bulk browse 效率，也会引入新的局部选择状态。

### Decision 4: `BookDetailsDesktop` 保留现有业务组件树，只重构容器层次与工具栏信息架构

`BookDetailsDesktop.vue` 已经把大量行为绑定在 `VolumesList`、`ChapterToolbar`、`SearchToolbar`、`ChapterContentPanel`、`TerminologyPanel`、`CharacterSettingPanel`、`MemoryPanel` 上。重新设计桌面端时，不应复制 tablet/mobile 的工作区模式，而应在不碰业务路径的前提下重排桌面容器：

- 左侧栏改为更明确的 section 组织：书籍概览、设置上下文、目录工具、章节树、回退区
- 阅读工具栏改成“章节身份 + 主操作 + 次操作”分层，而不是同权工具堆叠
- 设置上下文（术语/角色/记忆）继续在同一桌面工作台中切换，不跳出当前书籍环境

实现上复用现有 composable 与子组件，仅新增桌面专属 wrapper / section header / surface 样式，必要时借鉴 `ChapterToolbarTablet` 的视觉层次，但不直接用其模板替换 desktop。

**Alternatives considered:**

- 直接使用 tablet 双栏正文样式：会迫使 `ParagraphCard` / `ChapterContentPanel` 行为分叉，超出本次范围。
- 完整保留现状仅换颜色：无法解决当前信息层次失衡的问题。

### Decision 5: `SettingsPageDesktop` 不再复用 `SettingsPageTablet`，并与 `AIPageDesktop` 共享桌面工具页语法

当前 `SettingsPageDesktop.vue` 只是把 `SettingsPageTablet` 放大到 1200px，这会让桌面设置页看起来像悬浮 modal，而不是应用中的正式页面。与此同时，`AIPageDesktop.vue` 又已经是一个独立页面，但其标题区、卡片层级和次级信息呈现与其他桌面页不一致。

因此：

- `SettingsPageDesktop` 改成真正的 desktop page，保留 `injectSettingsPage().activeTab` 和现有 tab components，只替换桌面模板。
- `AIPageDesktop` 保留搜索、添加、编辑、复制、删除和路由选择等现有行为，但改成与 Settings 一致的工具页标题区、统计区、内容表面与次级面板组织方式。

**Alternatives considered:**

- 继续复用 `SettingsPageTablet`：实现最省，但会让桌面工具页永远是视觉特例。
- 让 AI 完全复制 tablet 页面：会牺牲 desktop 现有信息密度与直接操作区。

### Decision 6: `HelpPageDesktop` 保留三段阅读工作区，但增加 desktop-only landing state

桌面帮助页的优势是文档导航、目录和正文可以同时可见，这点需要保留；问题在于当前无选中文档时缺少真正的帮助中心入口态，页面也缺乏与 mobile help landing 一致的品牌层次。

因此桌面帮助页采用双状态：

- 有文档时：继续保留左文档导航 + 中间 TOC + 右正文阅读区的多栏工作台。
- 无文档时：主内容区显示桌面版 help landing，复用 mobile 已有的 quick start、topic tiles 和品牌语义，但按桌面宽度重排。

**Alternatives considered:**

- 自动打开第一篇文档：避免空状态，但丢失帮助中心入口页与导览功能。
- 使用 drawer / modal 作为桌面帮助导航：会破坏桌面连续阅读优势。

## Risks / Trade-offs

- **[Risk]** 共享桌面展示原语抽象过头，导致页面被迫迁就通用组件。→ **Mitigation:** 共享层只承载标题区和 surface 语法；一旦某个页面需要大量条件分支，就保持页面局部实现。
- **[Risk]** 桌面 chrome 重做后视觉统一了，但扫描密度下降。→ **Mitigation:** 保留现有 side menu / right panel / paginator / grid / chapter tree 的效率语义，只优化 hierarchy，不拉大到 tablet/mobile 稀疏度。
- **[Risk]** `SettingsPageDesktop` 与 `SettingsPageTablet` 结构分叉后，后续 tab 内容修改容易遗漏一个变体。→ **Mitigation:** 两端继续共享 `injectSettingsPage()` 和现有 tab content components，仅分离容器模板与样式。
- **[Risk]** `BookDetailsDesktop` 容器重构时破坏拖拽、章节切换或搜索工具栏定位。→ **Mitigation:** 不替换 `VolumesList` / `ChapterToolbar` / `SearchToolbar` / `ChapterContentPanel` 的行为组件，只在外层增加 section 与 surface 包装。
- **[Risk]** `HelpPageDesktop` landing state 需要处理 `currentDoc === null` 的分支，可能影响已存在的桌面阅读流程。→ **Mitigation:** 将 landing state 作为现有 `v-else` 结构中的明确模板分支，文档已选中时完全沿用当前阅读工作区。

## Migration Plan

这是纯桌面 UI 重构，不涉及数据迁移、API 迁移或持久化状态迁移。建议实施顺序：

1. 先落地共享 desktop 展示原语与 `MainLayoutDesktop` chrome 调整。
2. 重做 `BooksPageDesktop`，验证标题区、section surface、卡片语言是否成立。
3. 重做 `BookDetailsDesktop`，重点验证左栏、工具栏和设置上下文的一致性。
4. 将 `SettingsPageDesktop` 从 tablet 复用中拆离，并同步刷新 `AIPageDesktop`。
5. 最后重做 `HelpPageDesktop` 的 landing / 阅读工作区层次。
6. 统一执行 `bun run lint && bun run type-check && bun run quality-check`。

回滚策略：按提交粒度回退桌面展示层与各 `*Desktop.vue` 文件改动即可；不会产生数据层清理需求。

## Open Questions

- 共享 desktop 展示层最终更适合以 1-2 个 fragment 组件实现，还是仅用共享 class/token 实现，需要在完成 `BooksPageDesktop` 与 `AIPageDesktop` 后以重复量再判断一次。
- `AppRightPanelDesktop` 这次是否需要完整内部 tab/header 重做，还是只需与新的 shell 表面对齐，需要在 shell 完成后以实际割裂程度决定。
