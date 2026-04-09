## 1. 增强 shouldUpdateChapter 检测逻辑

- [x] 1.1 修改 `ChapterService.shouldUpdateChapter`：当本地 `lastUpdated` 为空时，回退对比远程 `lastUpdated` 与本地 `createdAt`
- [x] 1.2 新增 `ChapterService.hasContentChanged` 静态方法：trim 后对比远程文本与本地 `originalContent`，本地无 `originalContent` 时返回 true

## 2. NovelScraperDialog 内容变化动态标记

- [x] 2.1 在 `loadChapterContent` 成功加载远程内容后，对已导入章节调用 `hasContentChanged`，若内容变化则自动勾选并更新标记为"已导入（有更新）"
- [x] 2.2 新增响应式状态（如 `contentChangedChapters` Set）跟踪哪些章节检测到内容变化
- [x] 2.3 更新 `getChapterImportStatus` 的调用逻辑，将内容变化状态纳入标记判断

## 3. EditChapterDialog 新增 webUrl 编辑字段

- [x] 3.1 `EditChapterDialog.vue` 新增 `webUrl` prop 和对应的 `ref`，在对话框中添加可编辑的 InputText
- [x] 3.2 更新 save emit 的数据结构，包含 `webUrl` 字段（空字符串视为 undefined）
- [x] 3.3 `useChapterManagement.ts` 新增 `editingChapterWebUrl` ref，在 `openEditChapterDialog` 中赋值，在 `handleEditChapter` 中将 webUrl 传给 `ChapterService.updateChapter`

## 4. EditChapterDialog 新增只读日期统计

- [x] 4.1 `EditChapterDialog.vue` 新增 `lastUpdated`、`lastEdited`、`createdAt` props（Date 或 undefined）
- [x] 4.2 在 webUrl 输入框下方、特殊指令区域上方添加只读日期展示区域，格式 YYYY-MM-DD HH:mm，空值显示 "—"
- [x] 4.3 `useChapterManagement.ts` 新增对应的 ref 并在 `openEditChapterDialog` 中从 chapter 对象赋值，传递给 EditChapterDialog
