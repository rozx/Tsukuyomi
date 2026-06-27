## Why

在书籍详情页（桌面 / 平板）拖动章节内容区的滚动条时，滚动条滑块会与鼠标指针失同步（滑块漂移、跟不上光标）。根因是段落卡片使用 `content-visibility: auto` + 固定 `contain-intrinsic-size`（160px / 120px）做 CSS 级虚拟化：视口外段落用估算高度占位，拖动时它们进入视口被替换成真实高度，导致容器 `scrollHeight` 在拖动过程中持续变化，浏览器据此反复重算滑块位置，于是滑块脱离光标。只有改用「按真实高度测量」的虚拟滚动，才能让原生滚动条始终精确。

移动端是另一套独立的段落列表（`BookDetailsMobile.vue` 的 `.mbr-p` 列表），滚动条被隐藏（触摸滚动），**没有该失同步 bug**；但它一次性渲染全部段落，大章节（2000+ 段）下有性能压力，故顺带纳入同一套虚拟滚动方案（性能动机，非修 bug）。

## What Changes

引入依赖 **`@tanstack/vue-virtual`**，新增通用 composable `useChapterVirtualizer.ts` 封装 `useVirtualizer`（动态测量行高 / `scrollToIndex` / `measureElement` / 动态 `scrollMargin`），供以下两个**互相独立**的渲染面同时使用。采用 TanStack 推荐的 **block translation** 布局（整块按首个虚拟项的 `start` 平移，而非逐项绝对定位），以兼容动态测量下的平滑滚动。

**面 A —— 桌面 / 平板（修 bug，`src/components/novel/ChapterContentPanel.vue`）**

- 对两个长列表做真正的虚拟滚动：编辑/列表模式的 `ParagraphCard` 段落列表、预览模式的只读译文段落列表。
- 移除这两个列表上的 `content-visibility: auto` / `contain-intrinsic-size`。
- **BREAKING（内部行为契约）**：视口外段落不再挂载到 DOM。原先依赖「全部段落已挂载」的命令式访问改为**基于索引**：
  - `useParagraphNavigation`：键盘导航 / 滚动定位 / 聚焦 / 开始编辑改为「先 `scrollToIndex` → 等待挂载 → 再操作」；删除自定义 RAF 阻尼动画，由 `scrollToIndex` 取代；其 `getElementById` 兜底（`:368` / `:460`）改索引驱动。
  - `useSearchReplace`：`scrollToMatch` 改为按 `match.index` 调 `scrollToIndex`；`syncParagraphEditTextarea`（`:13`）与 `getLiveTextareaValue`（`:51`）仅作用于「当前编辑段落」，依赖其被钉住而始终在 DOM。
- 编辑安全：**钉住（pin）当前正在编辑的段落索引**，使其即便滚出可视区也保持挂载，避免未保存编辑文本与编辑态丢失，并保证命令式 `stopEditing`、上述 textarea 同步引用有效。
- **BREAKING（用户可见，已确认可接受）**：浏览器原生 Ctrl+F 只命中当前可见段落；Ctrl+F 已由 `handleFindKey` 拦截打开应用内搜索（既有行为，本变更只需固化不回归）。

**面 B —— 移动端（性能优化，`src/pages/book-details/BookDetailsMobile.vue`）**

- 对 `.mbr-scroll` 容器内的 `.mbr-p` 只读段落列表做虚拟滚动（仅渲染可视区 + overscan）。
- 该列表无内联编辑、无键盘导航、无应用内搜索、滚动区内无章节头部，故**无需钉住、无需索引驱动导航**；点击选中沿用数据驱动的 `mobileSelectedParagraphId`（选中不改变行高），段落序号 `§` 用真实索引。
- 移动端原本就没有 `content-visibility`，无样式需移除。

## Capabilities

### New Capabilities
- `chapter-paragraph-virtualization`: 章节段落长列表的虚拟滚动渲染能力 —— 桌面/平板按真实高度测量以保证原生滚动条拖动时与光标精确同步，移动端以同一引擎做性能虚拟化；定义虚拟化下必须保持的导航、搜索、编辑（含桌面编辑态钉住）、行号/序号、选中等行为契约，以及动态高度测量、`scrollMargin`、block translation 布局、原生页内查找取舍。

### Modified Capabilities
<!-- 无：现有 capability 的需求未变。responsive-book-details-workspace 仅约束布局与模式切换；现无基于元素/ scrollTop 的段落定位恢复代码，本变更不改变其现状（设置面板切换时面板被 v-if 销毁、回到顶部，与当前 content-visibility 行为一致）。 -->

## Impact

- **新增依赖**: `@tanstack/vue-virtual`
- **新增**: `src/composables/book-details/useChapterVirtualizer.ts`（通用，桌面与移动共用）
- **受影响代码**:
  - `src/components/novel/ChapterContentPanel.vue`（面 A：两个列表改虚拟渲染；移除 content-visibility 样式）
  - `src/pages/book-details/BookDetailsMobile.vue`（面 B：`.mbr-p` 列表改虚拟渲染）
  - `src/composables/book-details/useParagraphNavigation.ts`（面 A：滚动/聚焦/编辑改索引驱动，替换 RAF 阻尼动画）
  - `src/composables/book-details/useSearchReplace.ts`（面 A：`scrollToMatch` 改索引驱动）
  - `src/composables/book-details/useBookDetailsPage.ts`（接线 virtualizer：桌面用 `chapterContentPanelRef` 作为滚动元素、移动用 `.mbr-scroll`，通过 provide/inject 共享）
  - `src/components/novel/ParagraphCard.vue`（面 A：编辑态钉住相关最小适配，保持现有 `defineExpose` API）
- **范围澄清**: 平板（`BookDetailsTablet.vue`）是 `<BookDetailsDesktop />` 包装，随面 A 自动覆盖。桌面滚动容器是 `BookDetailsDesktop.vue` 中包裹 `<ChapterContentPanel>` 的 `.chapter-content-panel` 外层 div（已由 `chapterContentPanelRef` 持有），**非** `ChapterContentPanel` 组件根。
- **测试**: 新增 vitest 单测覆盖索引解析 / `estimateSize` / 导航与搜索的索引驱动滚动 / 编辑钉住合并逻辑；手动（Playwright/preview）验证桌面拖动同步、编辑滚离再回、键盘导航、搜索跳转、预览滚动，以及移动端长章节虚拟滚动与点击选中。
