# Design

## Context

- 依赖 `add-book-sync-core` 提供的 `BookSyncService` 和会话对象（`quickCheck`、`deepCheck`、`changeset`、`preview`、`apply`、`undo`、`setSkipped`）。
- 旧界面：`NovelScraperDialog` 被首页（`useIndexPage.showImportDialog`）、书库（`useBooksPage.showImportDialog` / `handleImportBook`）、`BookDialog`（`openScraper` / `handleApplyScrapedData`）、书籍详情（`BookUpdatePanel` 嵌入模式，以及手机端 `openScraperDialog` 抽屉）共 4 处使用。
- 路由已有 `books/:id/settings/:setting(terms|characters|memory|translation|update)`；手机端书籍详情的设置面板是概览里的分段标签，检查更新走抽屉。
- 设备变体规则：页面用 dispatcher 加桌面、平板、手机三个变体，逻辑放在 composable 里，通过 provide/inject 共享，一次性副作用只注册一次。
- 导入器对外接口：`ImportRepository.createTask(name)`、`ImportSourceService.registerUrl(taskId, url)`、路由 `/import/:taskId`、`FEATURES.importWorkspace`。

## Goals / Non-Goals

**Goals:**

- 新建和更新共用一个工作区组件树，差别只在外壳（目标、返回位置、应用后的跳转）。
- 删除旧抓取器界面，以及绕过写入保护的旧应用路径。

**Non-Goals:**

- 不改导入工作台，也不在这里做预填修复任务（见 `import-record-update-recipe`）。
- 不缓存检查结果，每次进入都重新检查。
- 不新增元信息编辑（书名、封面等由新书创建时的目录元信息和书籍编辑负责）。

## Decisions

### D1 组件结构

```
src/composables/book-sync/useBookSync.ts        provideBookSync(target) / injectBookSync()
  - 持有 BookSyncSession、检查状态、勾选、目标卷覆盖、确认摘要、应用进度、撤销句柄
  - onMounted 执行一次快速检查；目标变化（路由参数）时新建会话；卸载时 abort

src/components/book-sync/BookSyncWorkspace.vue  dispatcher：provideBookSync + useDeviceVariant
src/components/book-sync/BookSyncWorkspaceDesktop.vue / Tablet.vue（<Desktop/> 包装）/ Mobile.vue
src/components/book-sync/fragments/            跨变体复用的片段
  RecipeHeader · ChangesetSummary · NewChapterGroups · UpdatedChapterList ·
  ParagraphDiffView（由 ScraperCompareView 改写为段落级）· SkippedList · FailedList ·
  ApplyConfirm · HandoffNotice

外壳：
  BookUpdatePanel.vue（桌面/平板，/books/:id/settings/update）-> <BookSyncWorkspace :target="{bookId}"/>
  src/pages/BookSyncNewPage.vue（/books/new/web，页面 dispatcher）
    + src/pages/book-sync-new/BookSyncNew{Desktop,Tablet,Mobile}.vue
    + src/composables/book-sync-new/useBookSyncNew.ts
    -> 网址输入 + <BookSyncWorkspace :target="{newFrom}"/>
    应用成功后：把服务返回的封面记入 coverHistoryStore（与旧流程 useBookImportActions.ts:62 一致），再跳转到新书
  手机端 /books/:id/settings/update：书籍详情的手机变体识别 setting=update，
    渲染全屏 BookSyncWorkspace（带返回顶栏），不进分段标签
```

工作区是一个会随设备明显变化的组件，所以本身按 dispatcher 模式实现；两个外壳只负责目标和导航。确认弹窗和撤销 toast 挂在 dispatcher 上，保证只挂载一次。

### D2 路由

在 `books/:id` 之前加 `{ path: 'books/new/web', component: BookSyncNewPage }`，静态段排序优先于动态段；再加一条路由测试确认不被 `books/:id` 截获。`?url=` 只在进入时读取一次，会话建立后不再与网址同步。

### D3 选择与目标卷覆盖

勾选状态和目标卷覆盖都放在 `useBookSync`，即 composable 内的 reactive 状态，所以切换断点、换变体时不会丢失。应用时传给服务的 `selection = { newUrls, updatedUrls, volumeOverrides: Map<groupKey, volumeId | { newTitle }> }`。覆盖由 `add-book-sync-core` 的服务处理（其 D5），界面只负责收集。

### D4 大面积差异提示

纯函数 `driftWarning(changeset)`：已比对的已导入章节里，有更新的占比超过 0.5 就返回提示。只用已有数据，不发额外请求。

### D5 交接到 AI 导入器

`handoffToImporter(url)`：`createTask(\`导入：${host}\`)` → `ImportSourceService.registerUrl` → `router.push('/import/<taskId>')`，不启动 Agent。`FEATURES.importWorkspace` 为 false 时不渲染入口。已有书籍缺少配方或配方失效时，入口只是 `router.push('/import')`，`import-record-update-recipe` 会把它换成预填的修复任务。

### D6 退役旧界面

删除 `NovelScraperDialog.vue`、`Scraper*.vue`、`scraper-dialog-context.ts`，以及 `useBookDetailsPage` 中的 `showScraperDialog`、`openScraperDialog`、`handleScraperUpdate`、`BookDialog` 中的 `openScraper`、`handleApplyScrapedData`、`useBooksPage` 和 `useIndexPage` 中的 `showImportDialog`、`handleImportBook`（`createImportBookHandler` 如果再无调用方也一起删除）。对应的旧测试删除或迁移；`ScraperCompareView` 的对比逻辑迁到 `ParagraphDiffView`。

备选：保留旧对话框作为兜底入口 → 否决，会保留两套应用路径和绕过写入保护的写入。

## Risks / Trade-offs

- [手机端书籍详情的变体需要识别 `setting=update` 并切换为全屏] → 只在手机变体内处理，桌面和平板仍走面板；加上路由加变体渲染测试。
- [新建网址输入页和工作区状态交织] → 网址输入只存在于外壳；提交后建立会话，改网址就重建会话。
- [删除旧对话框波及测试和自动导入声明（`auto-components.d.ts`）] → 按 tasks 顺序先接入新入口、再删除，每步都跑类型检查。
- [批量勾选有更新时误操作] → 批量勾选前的确认摘要中，醒目显示将清空的译文版本总数。

## Migration Plan

界面层替换，没有数据迁移。回滚就是恢复旧组件和入口（git revert）；同步服务和配方数据向后兼容。
