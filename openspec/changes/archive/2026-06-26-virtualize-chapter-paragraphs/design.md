## Context

章节段落在两套**互相独立**的实现里渲染，本变更分别处理：

**面 A —— 桌面 / 平板（`ChapterContentPanel.vue`，有失同步 bug）**

- 滚动容器是 `BookDetailsDesktop.vue` 中**包裹** `<ChapterContentPanel>` 的外层 `<div class="chapter-content-panel h-full overflow-y-auto overflow-x-hidden">`（`BookDetailsDesktop.vue:494`），它由函数式 ref `setChapterContentPanelRef` 写入 composable 的 `chapterContentPanelRef`（`useBookDetailsPage.ts:239/249`）。**注意：滚动容器是这个外层 wrapper，不是 `ChapterContentPanel` 组件的根 `.chapter-content-container`。** `useParagraphNavigation.findScrollContainer` 也用 `closest('.chapter-content-panel')` 解析到同一元素。章节标题/统计头部与上下章导航按钮位于该容器内、随内容滚动。
- 当前用 CSS 级虚拟化：编辑/列表模式 `.paragraph-with-line-number .paragraph-card` 上 `content-visibility: auto; contain-intrinsic-size: auto 160px;`（`ChapterContentPanel.vue:672`）；预览模式 `.translation-preview-paragraph` 上 `content-visibility: auto; contain-intrinsic-size: auto 120px;`（`ChapterContentPanel.vue:775`）。副作用即拖动滚动条时 `scrollHeight` 抖动、滑块脱离光标（已排除键盘导航、祖先 transform/zoom）。
- `ParagraphCard.vue`（1842 行）把编辑态保存在组件内部（`isEditingTranslation` ref + 本地 `editingTranslationValue`），经 `defineExpose({ startEditing, stopEditing })` 暴露命令式 API（`ParagraphCard.vue:857`）。
- 现有「全部段落已挂载」依赖项（完整 blast radius）：`useParagraphNavigation` 的 `paragraphCardRefs` Map + `getElementById('paragraph-<id>')`（`:368` / `:460`）+ `scrollToElementFast`；`useSearchReplace` 的 `getElementById('paragraph-<id>')`（`scrollToMatch` `:196`、`syncParagraphEditTextarea` `:13`、`getLiveTextareaValue` `:51`，后两者经 `.paragraph-translation-edit textarea` 选择器，仅作用于当前编辑段落）。

**面 B —— 移动端（`BookDetailsMobile.vue` 的 `.mbr-p` 列表，无 bug，性能动机）**

- 独立实现：滚动容器 `.mbr-scroll`（`flex:1; overflow-y:auto;` 且 `scrollbar-width:none` / `::-webkit-scrollbar{width:0}` —— **滚动条隐藏、触摸滚动，无失同步 bug**），其上无 `content-visibility`，一次性渲染全部 `.mbr-p` 行。
- `.mbr-p` 为只读展示（`§` 序号 + 状态徽章 + 原文 + 译文），点击设置 `mobileSelectedParagraphId` 弹出浮动操作栏（翻译/润色/校对/关闭）。**无内联编辑、无键盘导航、无应用内搜索**；`.mbr-scroll` 内列表上方无章节头部，仅尾部有上下章导航。`.mbr-p.selected` 仅改背景/左右内边距，不改变行高。整页逻辑来自共享 `useBookDetailsPage`（`ctx.*`）。

通用约束：页面遵循 dispatcher + 变体；业务逻辑进 composable，provide/inject 跨变体共享。测试默认 TDD（vitest，jsdom）。平板 `BookDetailsTablet.vue` 为 `<BookDetailsDesktop />` 包装，随面 A 覆盖。

## Goals / Non-Goals

**Goals:**

- 桌面/平板拖动章节内容区滚动条时，滑块与光标始终同步（`scrollHeight` 在拖动中稳定）。
- 桌面/平板的两个长列表（编辑/列表、预览）与移动端 `.mbr-p` 列表均改为真正的虚拟滚动（仅渲染可视区 + overscan）。
- 完整保留既有行为：桌面键盘上下导航、选中高亮、滚动定位、聚焦、段落编辑（开始/停止/展开/流式增高）、应用内搜索跳转、行号；移动端点击选中、操作栏、`§` 序号、上下章导航。
- 桌面编辑中段落即便滚出可视区也不丢失未保存内容与编辑态。
- 大章节渲染性能不低于当前方案（桌面 content-visibility / 移动全量渲染）。

**Non-Goals:**

- 不改造原文编辑模式（`editMode === 'original'`，单 textarea，非列表）。
- 不保留浏览器原生 Ctrl+F 对视口外段落的查找能力（由应用内搜索承担）。
- 不引入分页/懒加载数据层改动（段落数据仍一次性加载，仅渲染虚拟化）。
- 不把 `ParagraphCard` 编辑态整体上提为 props（更重备选，推迟）。
- 不为移动端新增键盘导航 / 应用内搜索（其本就没有）。

## Decisions

### D1. 选型：`@tanstack/vue-virtual`（headless + 动态测量）

段落高度差异极大且会**挂载后增高**（进入编辑展开 textarea、AI 流式写入译文）。这要求逐项动态测量，而非固定行高。

- 选 `@tanstack/vue-virtual`：headless、活跃维护、Vue 3 一等支持；内置 `measureElement`（ResizeObserver）逐项测真实高度并缓存，故 `scrollHeight` 始终精确；headless 便于与既有键盘导航/refs 架构融合。文档已确认 `measureElement`（动态）/ `scrollToIndex({ align, behavior })` 能力。
- 不选 PrimeVue `VirtualScroller`（项目已有）：`itemSize` 为**强制固定高度**，无自动可变高度模式，喂固定高度会让滚动条同样失真。
- 不选 `vue-virtual-scroller`：Vue 3 构建长期 beta、维护活跃度较低。
- 不选纯 CSS（改进 `contain-intrinsic-size` 估算）：只能缓解、无法根治。

### D2. 渲染模型：block translation（整块平移）+ 动态 `scrollMargin`

**采用 block translation 而非逐项绝对定位。** TanStack 文档明确：在「动态测量 + 平滑 `scrollToIndex`」下，平滑滚动期间只测量目标附近缓冲区内的项，远处项被跳过；若逐项 `position:absolute; translateY(start)` 定位，被跳过的项会使目标位置漂移、破坏平滑动画。推荐做法是整块平移——把整段渲染窗口用「首个虚拟项的 `start`」做单一 `translateY`，块内各项按正常文档流排布，从而即使部分测量被跳过也能保持相对位置正确。

- 每个列表渲染为：spacer（高度 `totalSize`）包裹一个「窗口块」容器，块容器 `transform: translateY(firstItem.start)`，块内按顺序渲染窗口内各行，每行带 `:data-index` + `:ref="measureElement"`。
- **行间距必须由 CSS 真实渲染，且与 virtualizer 的 `gap` 选项一致**：block translation 下块内各行按文档流堆叠，`gap` 选项只进入 TanStack 的偏移/`totalSize` 模型、不会自动渲染成 DOM 间距。二者不一致会导致：视觉无间距、`totalSize` 虚高、`scrollToIndex`/搜索跳转落点按 `gap×index` 偏移。故桌面 `.vlist-window` 设 `display:flex; flex-direction:column; gap:16px`（= 调用处 `gap:16`）；移动端 `gap:0`（行靠 border/padding 分隔）。
- 面 A：头部与上下章导航按钮仍作为流式兄弟节点位于同一滚动容器内；列表起点相对滚动容器顶部的偏移作为 `scrollMargin` 传入，并用 ResizeObserver 监测头部高度变化动态更新。
- 面 B：`.mbr-scroll` 内无头部，`scrollMargin` 仅需计入容器顶部内边距（≈14px）；尾部上下章导航置于 spacer 之后。
- 桌面「钉住」的编辑段落若落在窗口块之外，单独以绝对定位渲染在其测得偏移处（单项，不参与块平移）。

### D3. 新增通用 composable `useChapterVirtualizer.ts`

封装 `useVirtualizer`，桌面与移动共用，隔离 TanStack 细节：

- 输入：滚动元素 ref、`count` ref、`estimateSize(index)`、`overscan`、`scrollMargin` ref、`pinnedIndices` ref（移动端传空）。
- 输出：`virtualRows`（computed）、`totalSize`、首项 `start`（供块平移）、`scrollToIndex(index, { align, behavior })`、`measureElement`、`remeasure()`。
- 选项以响应式方式传入（Vue 适配器要求），`count`/`scrollMargin`/`pinnedIndices` 变化即生效。
- 滚动元素接线：桌面 = `chapterContentPanelRef`（外层 wrapper），移动 = `.mbr-scroll` 的 ref；virtualizer 在 `useBookDetailsPage` 实例化并 provide，渲染面 inject 使用。面 A 两个列表（编辑/预览）处于互斥分支，任一时刻只有一个实例存活。

### D4. 命令式访问改为「索引驱动 + 等待挂载」（仅面 A）

- `useParagraphNavigation`：`scrollAndFocusParagraph` / `startEditingSelectedParagraph` 统一走 `revealParagraph(index, id, action, scroll)`：
  - **已挂载（可见或在 overscan 内，键盘上下导航的常见情形）**：对真实元素用「最小滚动 + 边缘留白」`container.scrollTo({ top, behavior: 'smooth' })`（保留约 `min(96, max(24, 视口高×0.15))` 的留白，仅当超出舒适区才滚）。**不**用 `scrollIntoView({block:'nearest'})` —— 它在虚拟化测量调整下会系统性把目标留在视口外 16–32px。**不**用 `scrollToIndex({align:'auto'})` —— 估算偏移不精确会滚不到位。按真实元素位置计算 + `scrollTo smooth` 才能既平滑又精确入视。
  - **未挂载（远处跳转）**：先 `chapterScrollToIndex(index,{align:'auto'})` 把它带到附近并挂载，`nextTick`+rAF 等挂载后再 `smoothRevealElement` 平滑微调。
  - 删除自定义 RAF 阻尼动画循环；`getElementById` 兜底改为「先滚动入视→挂载后操作」。
- `useSearchReplace.scrollToMatch(id)` → 用 `searchMatches` 已带的 `index` 调 `scrollToIndex(match.index)`，挂载后再定位/高亮。
- `paragraphCardRefs` 与 `paragraph-<id>` 保留，但仅含「可见 + 钉住」行；所有消费者先滚动入视再操作。
- `syncParagraphEditTextarea`（`:13`）/ `getLiveTextareaValue`（`:51`）只作用于当前编辑段落，依赖 D5 钉住保证其在 DOM；无需额外改造，但实现时须确认编辑段落始终被钉住。

### D5. 编辑态钉住（pin），保持 `ParagraphCard` 现有 API（仅面 A）

将 `currentlyEditingParagraphId` 对应索引并入渲染集合（`virtualRows` 索引 ∪ 编辑索引），即使滚出可视区也按其测得偏移单独渲染，保证不卸载 → 未保存编辑文本与编辑态不丢、`stopEditing` 与 textarea 同步引用有效。优点：对 1842 行的 `ParagraphCard` 改动最小。移动端无内联编辑，**不需要**钉住。

备选（推迟）：把编辑文本与编辑标志上提到 composable 作 props 驱动，卸载/重挂载也安全；更彻底但改动大。

### D6. 自定义索引驱动滚动条（替代原生滚动条）

实测发现：仅靠虚拟化 + 估算高度，**原生滚动条仍会漂移**。根因是 `totalSize` = 已测量行真实高度 + 未测量行估算高度；拖动时未测量行陆续被测量，与估算的偏差累加（小偏差 × 上千未测量行 = 数千 px），`scrollHeight` 持续变化 → 浏览器重算滑块大小/位置 → 滑块脱离光标。自校准运行平均（`createSizeCalibrator`，见下）只能把漂移减半，无法消除（平均值与真实平均的微小差 × 行数仍可见）。

结论：**原生滚动条在「虚拟化 + 未知可变高度」下无法做到像素级稳定，除非预先测量所有行**。故桌面/平板隐藏原生滚动条，改用自定义滚动条，滑块位置/大小基于「首行索引 / 总行数」「可见行数 / 总行数」—— 纯索引计数、与像素高度无关，故 `scrollHeight` 怎么变都不影响滑块。拖动映射为 `scrollToIndex(round(fraction × (count − visibleCount)), { align: 'start' })`。

放置：滚动容器的绝对定位子元素仍会随内容滚走，故自定义滚动条用 `<Teleport>` 外移到「精确包住滚动视口」的非滚动定位祖先（桌面 `.page-container`；移动新增 `.mbr-scroll-wrap` 包住 `.mbr-scroll`，使滚动条只覆盖正文滚动区、不延伸到顶部状态条），均 `position: relative`。纯计算（滑块度量 `computeScrollbarMetrics`、比例→索引 `fractionToIndex`）抽为纯函数单测。隐藏原生滚动条后滚动容器会被浏览器设为键盘可聚焦并显示蓝色焦点框，故 `.chapter-content-panel` 与 `.mbr-scroll` 均设 `:focus / :focus-visible { outline: none }`。

复用：滚动条 UI + 拖动逻辑抽成通用组件 `ChapterScrollbar.vue`（props：`model` / `teleportTo` / `scrollToFraction`），桌面（ChapterContentPanel）与移动（BookDetailsMobile）共用。轨道 `pointer-events: none`（穿透，不拦截内容滚动/触摸），仅滑块 `pointer-events: auto` 可拖动。

辅助：`createSizeCalibrator` 仍保留 —— 它让未测量行用「已测量行运行平均」估算，减小 `totalSize` 抖动（从而减小滚轮滚动时的滚动范围跳动）；它不是滚动条同步的充分条件，但是低成本的改善。

移动端：原本隐藏滚动条、纯触摸滚动；现复用同一 `ChapterScrollbar` 在 `.mbr-p` 列表也显示自定义滚动条（长章节滚动定位更方便），不影响触摸滚动。

## Risks / Trade-offs

- [TanStack Vue 适配器响应式细节出错（选项未保持响应式）] → 严格按文档以 ref/响应式传 `count`/`scrollMargin`/`pinnedIndices`；单测覆盖 count 变化、pin 合并。
- [block translation 与钉住项混用：钉住项在窗口外需单独绝对定位、偏移随上方重测变化] → 每帧响应式读取其偏移；手动验证「编辑→滚离→滚回」。
- [`scrollMargin` 偏移算错导致定位/`scrollToIndex` 落点偏移（面 A 头部在滚动容器内）] → ResizeObserver 实测头部高度动态更新；手动验证键盘导航与搜索跳转落点。
- [编辑钉住失效 → 滚离编辑段落丢失未保存内容、textarea 同步失效] → 钉住为硬保障；单测覆盖 pin 合并 + 手动验证。
- [流式写入/编辑展开高度突变造成跳动] → `measureElement` ResizeObserver 自动重测修正 `totalSize`；`align:'auto'` 最小滚动避免视线跳动。
- [移动端 `.mbr-p` 无 `paragraph-<id>`、无 search/键盘导航] → 移动端虚拟化无需这些；保持仅渲染窗口 + 数据驱动选中，避免引入新依赖。
- [jsdom 无真实布局/滚动/ResizeObserver，单测无法验证滚动条同步] → 纯逻辑（estimateSize、索引解析、pin 合并、索引驱动滚动调用）走 vitest；滚动条同步、防丢失、移动滚动走 Playwright/preview 手动验证。

## Migration Plan

1. 加依赖 `@tanstack/vue-virtual`。
2. 新增通用 `useChapterVirtualizer.ts`（先写失败单测），采用 block translation 输出首项 `start`。
3. 面 A 预览模式列表改虚拟渲染（较简单、只读，先验证桌面滚动条同步）。
4. 面 A 编辑/列表模式列表改虚拟渲染 + 编辑钉住。
5. 面 A 改造 `useParagraphNavigation` / `useSearchReplace` 为索引驱动；`useBookDetailsPage` 接线并 provide。
6. 面 A 移除 `content-visibility` / `contain-intrinsic-size` 样式。
7. 面 B 移动端 `.mbr-p` 列表改虚拟渲染（复用同一 composable，无钉住/无索引导航）。
8. 全量回归：桌面键盘导航、编辑滚离再回、搜索跳转、预览/编辑拖动同步；移动端长章节滚动 + 点击选中；`bun run lint && type-check && quality-check`。

回滚：改动集中在 `ChapterContentPanel` / `BookDetailsMobile` / 少数 composable，可整体 revert 回原方案（content-visibility / 全量渲染）。

## Open Questions（已解决）

- **Ctrl+F 拦截打开应用内搜索 → 已存在，无需新增实现。** `handleFindKey`（`useKeyboardShortcuts.ts:94`）已 `preventDefault()` 并 `toggleSearch()`；Ctrl+H/F3/Esc 同理。本变更只需在 spec 固化以防回归并在回归任务验证。保留边界逃生口（搜索栏已开且焦点在其输入框时交回原生）。
- **`overscan` / `estimateSize` 初值 → 决定：** `overscan` 4–6；`estimateSize` 按文本/译文长度估算（非固定值），上线前按手动观感微调。
- **移动端是否纳入 → 决定：纳入。** 移动端无失同步 bug（滚动条隐藏），但全量渲染有大章节性能问题，故复用同一 virtualizer 做性能虚拟化（更简单：无钉住/无键盘导航/无搜索）。
