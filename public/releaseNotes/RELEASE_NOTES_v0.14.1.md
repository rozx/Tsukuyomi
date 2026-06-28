# 发布说明 - v0.14.1

## 版本信息

- **版本号**: 0.14.1
- **发布日期**: 2026 年 6 月 27 日
- **基于版本**: v0.14.0

> 本版本是 v0.14.0「章节段落虚拟滚动」的两处后续修复，专治升级后阅读 / 编辑时遇到的两个布局问题：
>
> 1. **章节顶部多出一段空白** — 虚拟滚动把列表头部高度重复计入坐标，长章节顶部凭空多出一段等于头部高度的空白，底部导航也可能够不到。本版本把坐标换算抽成纯函数并扣除头部偏移，从根上修掉。
>
> 2. **编辑段落时上下章导航被向下顶动** — 短章节里展开译文编辑框会把「上一章 / 下一章」按钮顶走。本版本用弹性留白把导航钉在面板底部，编辑撑高正文时位置不再跳动。

---

## 🧭 虚拟滚动章节顶部空白修复 (Virtual Scroll Top-Gap Fix)

v0.14.0 引入虚拟滚动后，部分章节顶部会凭空多出一段空白，长度恰好等于章节头部（标题 / 统计区）的高度；个别情况下底部的上下章导航也滚不到（commit `23e7329`）。

根因是 `@tanstack/vue-virtual` 返回的 `item.start` / `item.end` 坐标里**含 `scrollMargin`（即列表头部高度）**，而承载内容的 `.vlist-spacer` 在文档流里本就位于头部之后——其顶部已经在 `scrollMargin` 处。直接把这套坐标当成 spacer 内部偏移用，头部高度被**重复计入一次**，于是顶部多出一段空白。

- **坐标换算抽成纯函数** [`toContentOffset`](src/composables/book-details/useChapterVirtualizer.ts)：把「滚动容器坐标」转为「spacer 内部坐标」时统一扣除 `scrollMargin`，空窗口返回 0、测量抖动出现负值时钳到 0
- **spacer 高度计算抽成纯函数** [`computeSpacerSize`](src/composables/book-details/useChapterVirtualizer.ts)：`totalSize`（已相对内容）与末行 / 钉住项 `end`（含 `scrollMargin`，比较前先扣除）取最大值兜底，避免滚到底时末段溢出 spacer 压到上下章导航
- **窗口块起始偏移 / 钉住项偏移同步修正**：`blockStart` 与窗口外钉住项（编辑中段落）的绝对定位偏移都改走 `toContentOffset`，顶部空白消失、底部导航可达
- 新增 [`use-chapter-virtualizer.test.ts`](src/__tests__/use-chapter-virtualizer.test.ts) 用例覆盖两个纯函数：头部扣减、空窗口、负值钳零、三者取最大兜底

---

## 📌 编辑段落时导航不再被顶动 (Sticky Chapter Navigation)

短章节（正文不足一屏）里展开某段的译文编辑框时，译文会从单行变成 textarea + 操作行，正文被撑高，连带把底部「上一章 / 下一章」导航按钮向下顶走，编辑过程中导航位置一直跳动（commit `297bc0c`）。

- **弹性留白钉住导航** [`.chapter-reading-spacer`](src/components/novel/ChapterContentPanel.vue)：在翻译 / 阅读模式下，正文与导航之间插入一段 `flex: 1 1 auto` 的留白，**仅在正文不足一屏时**占满剩余空间，把导航推到面板底部；正文超过一屏时留白收缩为 0，导航回到正文末尾——既有行为完全不变
- **仅在阅读态生效**：新增 `.chapter-content-container--reading` 容器态，只在「内容加载完成 + 非原文模式 + 非预览模式」时启用弹性布局，原文编辑 / 预览不受影响

---

## 📝 问题修复

- 修复：虚拟滚动下部分章节顶部多出一段等于头部高度的空白（头部偏移被重复计入）
- 修复：上述空白导致个别章节底部上下章导航滚不到
- 修复：短章节展开段落编辑框时，上下章导航被撑高的正文向下顶动

---

## ⚠️ 升级提示

- **无 IndexedDB schema 变更，无 manifest schema 变更**：从 v0.14.0 升级直接生效，本地数据与云同步完全兼容
- 纯阅读 / 编辑布局修复，无需重新构建数据或重跑嵌入

---

## 📚 相关文档

- **内容编辑**: [`help/book-details-editing.md`](help/book-details-editing.md) — 虚拟滚动 / 自定义滚动条与段落编辑
- **书籍详情页概览**: [`help/book-details-overview.md`](help/book-details-overview.md) — 章节内容区滚动与导航行为

---

_本文档基于 git changes v0.14.0..v0.14.1_
