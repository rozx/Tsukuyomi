# Tasks

## 1. 状态与纯逻辑

- [ ] 1.1 先写测试再实现 `useBookSync`（provide/inject）：进入时只执行一次快速检查；目标变化时重建会话；卸载时 abort；勾选状态与目标卷覆盖在换变体后保留；验证：`bunx vitest run use-book-sync` 全绿
- [ ] 1.2 先写测试再实现选择规则：新章节默认勾选，有更新章节从不自动勾选，已跳过章节不出现在新章节中；验证：勾选规则测试全绿
- [ ] 1.3 先写测试再实现 `driftWarning(changeset)`（已比对的已导入章节中，有更新占比超过 0.5 时给出提示）；验证：边界测试覆盖 0、恰好 0.5、超过 0.5
- [ ] 1.4 先写测试再实现确认摘要：新增章数、更新章数、清空译文版本数、新卷，全部从变更集和勾选计算；以及 `BOOK_CHANGED` 后重算并要求再次确认的状态流转；验证：摘要和状态机测试全绿
- [ ] 1.5 先写测试再实现 `handoffToImporter(url)`（创建任务、登记网址、跳转，不启动 Agent；功能开关关闭时不可用）；验证：mock 导入器接口的测试

## 2. 工作区组件

- [ ] 2.1 新增 `BookSyncWorkspace` dispatcher 及 Desktop、Tablet（包装）、Mobile 三个变体；确认弹窗和撤销 toast 挂在 dispatcher 上；验证：组件测试断言三个变体都能渲染，且确认弹窗只挂载一份
- [ ] 2.2 实现片段 RecipeHeader、ChangesetSummary、NewChapterGroups（含改选目标卷）、SkippedList（跳过与取消跳过）、FailedList（重试）；验证：各片段的组件测试覆盖交互事件
- [ ] 2.3 把 `ScraperCompareView` 的对比逻辑改写为段落级的 `ParagraphDiffView`（标出变化、新增、移除段落和会被清空的译文）；验证：以变更集的段落变化为输入的组件测试
- [ ] 2.4 实现深度检查控件（进度、取消）、配方缺失或失效状态（只显示原因和入口，不显示列表和应用按钮）、HandoffNotice；验证：组件测试覆盖失效状态下没有应用按钮

## 3. 路由与外壳

- [ ] 3.1 在 `books/:id` 之前新增路由 `books/new/web`，页面按设备变体规则实现：`src/pages/BookSyncNewPage.vue`（dispatcher）加 `src/pages/book-sync-new/BookSyncNew{Desktop,Tablet,Mobile}.vue`，逻辑放在 `src/composables/book-sync-new/useBookSyncNew.ts`。页面包括网址输入；带 `?url=` 时自动检查；应用后把封面记入封面历史（与旧流程 `useBookImportActions` 行为一致），并跳转到新书；验证：路由测试确认 `/books/new/web` 不被 `books/:id` 截获，另有测试断言应用后调用了封面历史
- [ ] 3.2 让 `BookUpdatePanel` 承载 `BookSyncWorkspace`（桌面和平板面板），关闭或返回时回到 `/books/:id`；验证：面板渲染测试
- [ ] 3.3 手机端书籍详情识别 `setting=update`，渲染全屏工作区（带返回顶栏）；手机概览的「检查更新」改为路由跳转；验证：手机变体渲染测试，并在浏览器中用 mobile 预设确认

## 4. 入口改造与退役旧界面

- [ ] 4.1 首页、书库的「从网站导入」改为跳到 `/books/new/web`，删除 `showImportDialog` 和 `handleImportBook`；验证：入口测试断言跳转目标
- [ ] 4.2 `BookDialog` 新建模式的「从网站获取」改为关闭对话框并跳到 `/books/new/web`，编辑模式改为跳到本书的 `/settings/update`；删除 `openScraper` 和 `handleApplyScrapedData`；验证：`BookDialog` 测试更新后全绿
- [ ] 4.3 删除 `useBookDetailsPage` 中的 `showScraperDialog`、`openScraperDialog`、`handleScraperUpdate`，以及所有调用点；验证：`bun run type-check` 通过
- [ ] 4.4 删除 `NovelScraperDialog.vue`、`Scraper*.vue`、`scraper-dialog-context.ts` 及其测试，再生成自动组件声明；验证：`grep -r NovelScraperDialog src` 没有结果，且 `bun run type-check` 通过

## 5. 文档与验收

- [ ] 5.1 更新帮助文档中「检查更新」和「从网站导入」的说明（新工作区、有更新不自动勾选、跳过、深度检查、交给 AI 导入器）；验证：帮助页能渲染出新内容
- [ ] 5.2 浏览器端到端验收（不点真实同步）：用 mock 引擎走一遍新建（只导部分章节）、更新（新章节、有更新差异、跳过、部分失败后重试、撤销），桌面和手机各一遍并截图；验证：截图和控制台无错误
- [ ] 5.3 运行 `bun run lint && bun run type-check && bun run test && bun run quality-check`，确认全部通过（包括 `add-book-sync-core` 遗留的未使用导出已消除）
