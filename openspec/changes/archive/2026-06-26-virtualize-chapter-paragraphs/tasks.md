## 1. 依赖与基础设施

- [x] 1.1 安装依赖 `@tanstack/vue-virtual`（`bun add @tanstack/vue-virtual`），确认进入 `package.json` 与 lockfile
- [x] 1.2 跑一次 `bun run type-check` 确认适配器类型可用

## 2. useChapterVirtualizer composable（通用，TDD）

- [x] 2.1 先写失败单测：`estimateSize(index)` 按文本/译文长度估算高度的纯逻辑（空段、短段、长段）
- [x] 2.2 先写失败单测：`pinnedIndices` 与 `virtualRows` 索引的合并去重逻辑（编辑索引在/不在可视区；移动端传空时退化为纯窗口）
- [x] 2.3 实现 `src/composables/book-details/useChapterVirtualizer.ts`：封装 `useVirtualizer`，输入滚动元素 ref / `count` ref / `estimateSize` / `overscan` / `scrollMargin` ref / `pinnedIndices` ref；输出 `virtualRows` / `totalSize` / 首项 `start`（供 block translation）/ `scrollToIndex(index,{align,behavior})` / `measureElement` / `remeasure()`，选项以响应式方式传入。初值：`overscan` 4–6；`estimateSize` 按文本长度估算
- [x] 2.4 让 2.1/2.2 单测转绿

## 3. 面 A · 预览模式列表虚拟化（桌面/平板，较简单先落地）

- [x] 3.1 `ChapterContentPanel.vue` 预览模式（`editMode === 'preview'`）的 `.translation-preview-paragraph` 列表改为 **block translation** 虚拟渲染：spacer（高度 `totalSize`）+ 窗口块（`translateY(firstItem.start)`）+ 块内各行 `:data-index` + `:ref="measureElement"`
- [x] 3.2 将预览列表上方头部高度作为动态 `scrollMargin`（ResizeObserver 监测）接入 virtualizer；滚动元素用 `chapterContentPanelRef`（外层 wrapper，非组件根）
- [x] 3.3 移除 `.translation-preview-paragraph` 上的 `content-visibility` / `contain-intrinsic-size`
- [ ] 3.4 手动验证（preview/Playwright）：预览模式拖动滚动条滑块跟随光标、`scrollHeight` 稳定

## 4. 面 A · 编辑/列表模式列表虚拟化 + 编辑钉住（桌面/平板）

- [x] 4.1 `ChapterContentPanel.vue` 编辑/列表模式（`v-else` 分支）的 `.paragraph-with-line-number` + `ParagraphCard` 列表改为 block translation 虚拟渲染（同 3.1 结构），行号用 `row.index + 1`，保留选中 `::before` 高亮（抽出 `ChapterParagraphRow.vue` 复用，含相关样式迁移）
- [x] 4.2 渲染集合 = 「窗口块 ∪ 当前编辑段落索引」；钉住且在窗口外的编辑行单独绝对定位渲染在其测得偏移处（`.vlist-pinned`），保证不卸载
- [x] 4.3 头部高度作为动态 `scrollMargin` 接入；`paragraphCardRefs` / `paragraph-<id>` 仅维护可见+钉住行
- [x] 4.4 移除 `.paragraph-with-line-number .paragraph-card` 上的 `content-visibility` / `contain-intrinsic-size`
- [x] 4.5 `ParagraphCard.vue` 保持 `defineExpose({ startEditing, stopEditing })` 现有 API 不变（行迁移到 ChapterParagraphRow，ParagraphCard 本身无需改）

## 5. 面 A · 导航与搜索改索引驱动（桌面/平板，TDD）

- [x] 5.1 先写失败单测：`useParagraphNavigation` 导航到视口外段落时调用 `scrollToIndex(index,{align:'auto'})`，并在挂载后聚焦（mock virtualizer + 挂载回调）
- [x] 5.2 实现 `useParagraphNavigation`：用注入的 virtualizer `scrollToIndex` 替换 `scrollToElementFast`/自定义 RAF 阻尼动画；`scrollAndFocusParagraph` / `startEditingSelectedParagraph` 改为「滚动入视 → `nextTick`+rAF 等挂载 → 聚焦/`startEditing`」；`getElementById` 兜底改索引驱动
- [x] 5.3 先写失败单测：`useSearchReplace.scrollToMatch` 改为按 `match.index` 调 `scrollToIndex`
- [x] 5.4 实现 `useSearchReplace.scrollToMatch` 索引驱动，匹配段落挂载后再定位/高亮
- [x] 5.5 确认 `syncParagraphEditTextarea` / `getLiveTextareaValue` 只作用于当前编辑段落，并依赖其被钉住而始终在 DOM
- [x] 5.6 让 5.1/5.3 单测转绿（并删除测试已移除内部实现的 `paragraph-navigation-scroll.test.ts`）

## 6. 面 A · 接线与共享

- [x] 6.1 在 `useBookDetailsPage.ts` 接线：`chapterScrollToIndex` 注册回调 + 暴露 `currentlyEditingParagraphId`/`registerChapterScroller`；`BookDetailsDesktop` 传 `scroll-element`/`currently-editing-paragraph-id` 并注册 ChapterContentPanel 的 `scrollToParagraphIndex`；导航与搜索接收 `chapterScrollToIndex`
- [x] 6.2 确认平板（`<BookDetailsDesktop />` 包装）随面 A 自动覆盖

## 7. 面 B · 移动端 `.mbr-p` 列表虚拟化（性能，无钉住/无键盘导航/无搜索）

- [x] 7.1 `BookDetailsMobile.vue` 的 `.mbr-scroll` 内 `.mbr-p` 列表改为 block translation 虚拟渲染，复用 `useChapterVirtualizer`（`pinnedIndex` 不传），滚动元素 = `.mbr-scroll`（`setChapterContentPanelRef` 已持有）
- [x] 7.2 `§` 序号用 `row.index + 1`；点击选中沿用 `mobileSelectedParagraphId`（数据驱动，选中不改行高）；尾部上下章导航置于 spacer 之后；`scrollMargin` 计入 `.mbr-scroll` 顶部内边距
- [ ] 7.3 手动验证：移动端 2000+ 段章节触摸滚动仅渲染可视区；点击选中→操作栏作用正确；滚动后选中态与序号正确

## 9. 自定义索引驱动滚动条（修复原生滚动条残余漂移）

- [x] 9.1 诊断确认：仅虚拟化 + 估算高度，原生滚动条仍漂移（`scrollHeight` 随逐项测量持续变化，实测 1101 段落漂移约 13–17%）
- [x] 9.2 `createSizeCalibrator`（自校准运行平均估算）+ 单测：未测量行用已测量行平均，减小 `totalSize` 抖动
- [x] 9.3 纯函数 `computeScrollbarMetrics` / `fractionToIndex` + 单测：滑块位置/大小=首行索引/总行数，拖动比例→行索引
- [x] 9.4 `useChapterVirtualizer` 暴露 `scrollbarModel` / `scrollToFraction`（读取 getVirtualItems 以随滚动响应）
- [x] 9.5 `ChapterContentPanel` 渲染自定义滚动条（`<Teleport>` 到 `.page-container`）+ 指针拖动/轨道点击逻辑
- [x] 9.6 `BookDetailsDesktop` 隐藏 `.chapter-content-panel` 原生滚动条、`.page-container` 设 `position: relative`
- [x] 9.7 实测验证（Playwright 拖动模拟，真实 1101 段落章节）：拖到 25/50/75/100% 滑块跟随、往返同位一致、`scrollHeight` 漂移不再影响滑块
- [x] 9.8 抽出通用 `ChapterScrollbar.vue`（Teleport + 拖动；轨道穿透不拦截内容），桌面/平板与移动共用
- [x] 9.9 移动端 `BookDetailsMobile` 接入 `ChapterScrollbar`（Teleport 到 `.mobile-reader`），实测拖动到 60% → 段落 658（≈0.6×1101）跟随正确

## 8. 回归与验证

- [ ] 8.1 手动验证（桌面）：编辑某段→滚离→滚回，编辑态与未保存内容完整保留 ——（待用户验证；运行实例当前无书籍数据，未注入避免污染）
- [ ] 8.2 手动验证（桌面）：键盘上一段/下一段（含跳空段、视口外目标）滚动入视并聚焦正确；选中高亮正常 ——（待用户验证）
- [x] 8.3 实测验证（桌面，真实 1101 段落章节）：自定义滚动条拖动与光标同步、往返一致、不漂移（见 9.7）；应用内搜索跳转待用户复核
- [ ] 8.4 验证 Ctrl+F / Cmd+F 仍打开应用内搜索栏（`handleFindKey` 既有行为不被回归），Ctrl+H / F3 / Esc 行为不变 ——（待用户验证）
- [x] 8.5 运行 `bun run test`（vitest）全绿 —— 1642 passed / 4 skipped
- [x] 8.6 运行 `bun run lint && bun run type-check && bun run quality-check` 全通过 —— lint 0 问题；type-check 通过；Fallow 0 超阈值、可维护性 90.2
