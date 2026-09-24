# Proposal

## Why

现有的「从网站获取小说」和「检查更新」共用 `NovelScraperDialog`（约 1100 行，外加 11 个子组件）。它是一个浏览整份目录的抓取器界面，放不下 `add-book-sync-core` 引入的配方状态、失效原因、目标卷、已跳过、段落级差异和译文清空摘要。手机端的检查更新只能挤在底部抽屉里。`BookDialog` 还有一条不经过任何写入保护、直接 `mergeNovelData` 的路径。新建和更新本质上是同一件事：把网页来源同步到一个目标。因此统一改成面向变更集的工作区。

## What Changes

- 新增书籍同步工作区，新建书籍和更新已有书籍共用。页面遵循设备变体规则：dispatcher 加桌面、平板、手机三个变体，逻辑放在 composable 中。
  - 顶部：来源和配方摘要（引擎、目录网址、清理规则数、跳过数），重新检查。
  - 汇总：新章节、有更新、已跳过、失败的数量。
  - 新章节按目标卷分组，可以更改目标卷，可以预览正文。
  - 有更新章节显示段落级差异和将清空的译文数，**不自动勾选**；已检查章节中大面积出现差异时，提示可能是站点改版。
  - 深度检查按钮，带进度，可取消。
  - 跳过和取消跳过。
  - 应用前显示确认摘要，数字全部来自实际计算。书籍被占用或已被修改时拒绝应用，重新计算后要求再次确认。
  - 部分成功时显示失败项，可以重试；会话内撤销。
- 路由：
  - 更新：保留 `/books/:id/settings/update`。桌面和平板在主区域以面板显示，**手机端改为全屏页面**（不再用底部抽屉）。
  - 新建：新增 `/books/new/web?url=`。先输入网址，带上 `url` 参数时自动检查；应用后跳转到新书。
- 入口调整：首页、书库的「从网站导入」，`BookDialog` 新建和编辑模式的「从网站获取」，手机书籍概览和侧栏的「检查更新」，全部改为路由跳转。
- 无法解析的网址（非内置站点，且没有配方）：新建时提供「交给 AI 导入器」，创建导入任务并登记该网址为来源，然后跳到导入工作台。已有书籍缺少配方或配方失效时，显示原因并提供打开 AI 导入器的入口；`import-record-update-recipe` 会把这个入口升级为预填的修复任务。
- AI 导入回退开关关闭时，内置站点的新建和更新照常可用，只隐藏交给 AI 导入器的入口。
- **BREAKING（仅界面层）**：删除 `NovelScraperDialog` 和它的专属子组件（`Scraper*.vue`、`scraper-dialog-context.ts`）；可复用的片段迁到新工作区。`handleScraperUpdate`、`BookDialog.handleApplyScrapedData`、`useBooksPage.handleImportBook` 等旧应用路径一并移除，统一由同步服务应用。

## Capabilities

### New Capabilities

- `book-sync-workspace`：书籍同步工作区的路由、设备形态、入口、变更集展示与交互、确认与应用反馈、失效与交接入口。

### Modified Capabilities

- `book-update-panel`：检查更新面板改为承载同步工作区，手机端改为全屏路由页面；删除「抓取器弹窗形态保留」这条需求。
- `chapter-update-detection`：删除「抓取器对话框内动态更新状态」这条需求，由同步工作区中「有更新」的展示和选择规则取代。

## Impact

- 页面和路由：`src/router/routes.ts`（新增 `books/new/web`），新增 `src/pages/book-sync/` 下的变体和 `src/composables/book-sync/useBookSync.ts`，调整 `BookUpdatePanel`、`BookDetailsMobileOverview`、`BookSidebarSettingsMenu`、`IndexPage`、`BooksPage`、`BookDialog`、`useBookDetailsPage`、`useBooksPage`。
- 删除：`src/components/dialogs/NovelScraperDialog.vue`、`Scraper*.vue`、`scraper-dialog-context.ts` 及对应测试。
- 依赖：`add-book-sync-core` 必须先完成。
- 帮助文档：更新检查更新和从网站导入的说明。
