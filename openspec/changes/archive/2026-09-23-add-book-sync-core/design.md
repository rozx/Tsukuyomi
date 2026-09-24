# Design

## Context

- 现有检查更新：`NovelScraperDialog` 通过 `NovelScraperFactory.getScraper(url)` 选内置抓取器，应用走 `handleScraperUpdate` → `ChapterService.mergeNovelData`。`applyChapterMerge` 用远端内容整章替换 `content`（新段落 ID、无译文）；toast 撤销用 `cloneDeep(book.value)`，不含懒加载的章节正文。
- AI 导入器应用新书时（`buildImportBook`）不写 `book.webUrl`，只在网址唯一时写 `chapter.webUrl`。
- 可复用零件：`parseImportHtml(html, rules, baseUrl)` 为纯函数（正文块 + 链接关系 `chapter`/`next` 等）；`fetchScraperPage` 为统一网页传输（含代理、Electron、novel18 Cookie 钩子）；`ImportParsingClient` 的 pattern 作业（worker 内执行正则，超时上限 3 秒，没有 worker 时拒绝执行正则）；`matchImportParagraphs`（段落对应与译文保留）；`BookExecutionGuard`（`occupants` / `write` 共享锁 / `commit` 排他锁，跨页面）；`book-revisions` 单调修改序号 + `bookCommitBus`。
- 导入器段落切分规则：`assembleImportParagraphs` 按 `\n` 切分并保留缩进和空行，`originalContent` 为段落 `\n` 连接。

## Goals / Non-Goals

**Goals:**

- 配方与回放完全位于 `services/` 与 `models/`，不依赖 Vue / Pinia，可以 TDD。
- 同一套服务同时支撑「新建书籍」与「更新已有书籍」，供 `redesign-book-sync-ui` 接入。
- 更新应用的安全性与导入器对齐：段落级译文保留、写入互斥、版本绑定、可撤销。

**Non-Goals:**

- 不改任何界面，不退役 `NovelScraperDialog`（见 `redesign-book-sync-ui`）。
- 不实现配方录入与自测（见 `import-record-update-recipe`）。
- 不支持网页与章节非一对一（章内分页、拆章、整卷一页）。
- 更新已有书籍时不改书籍元信息（书名、作者、简介、标签、封面）；元信息修正交给书籍编辑或 AI 导入器。

## Decisions

### D1 配方数据形状

```ts
// src/models/book-sync.ts
interface BookUpdateRecipe {
  version: 1;
  engine:
    | {
        kind: 'builtin';
        site: 'syosetu-org' | 'kakuyomu' | 'ncode' | 'novel18';
        content?: ImportExtractionRules; // 有则按导入器方式提取正文；无则用抓取器自带解析
      }
    | {
        kind: 'html';
        content: ImportExtractionRules; // selector / excludeSelectors / preset
        catalogSelector?: string; // 目录链接所在范围（CSS）
        chapterFilter?: ImportSourceFilter; // name / locator 模式
        followNext?: boolean;
      };
  catalogUrls: string[];
  cleanup?: { pattern: ImportTextPattern; action: 'remove_matches' | 'remove_lines' }[];
  stripHeading?: boolean;
  skippedUrls?: { url: string; title: string }[];
  pinnedUrls?: string[]; // 导入时有意与来源不同的章节，检查时不比对
  verifiedChapterCount: number;
  recordedAt: number;
}
// Novel.updateRecipe?: BookUpdateRecipe
```

直接复用导入器的 `ImportExtractionRules` / `ImportSourceFilter` / `ImportTextPattern`，让导入器录入配方时不需要转换格式。`version` 为日后格式演进预留。`serializeBookRecord` 是展开式序列化，新字段自动持久化并进入 `novel:<id>` 同步条目。

备选：给内置站点和 HTML 各设一个字段 → 否决，路由和录入会分叉成两套。

### D2 引擎抽象与虚拟配方

```
resolveRecipe(book)
  book.updateRecipe                           -> { recipe, virtual: false }
  webUrl[0] 能被 NovelScraperFactory 识别     -> { recipe: builtin(site), virtual: true }
  否则                                        -> RECIPE_MISSING

interface SyncEngine {
  fetchCatalog(recipe, signal): Promise<{ meta, entries: CatalogEntry[] }>
  fetchChapter(recipe, entry, signal): Promise<string>   // 引擎抽取后的原始文本
}
CatalogEntry = { url, title, group?: string, lastUpdated?: Date }
```

- `builtin`：目录通过现有 `NovelScraper.fetchPageSnapshot` + `parseNovelSnapshot` 逐页回放，将解析结果展平为带 `group` 和 `lastUpdated` 的条目；保留站点解析（包括 Kakuyomu Apollo JSON）和 novel18 Cookie。起始页以 `catalogStartUrl` 为准，按 `nextPageUrls` 遍历，保留跨页分组延续，最多 500 页并检测循环。任一页请求失败、验证页或空目录均整体失败，不发布已取得的部分目录。到达上限但仍有未遍历页也整体失败。不使用 `fetchNovel`，因为现有 ncode/novel18 分页会吞掉后续页错误并返回部分成功。正文页用 `adapter.fetchPageSnapshot` 请求（保留 Cookie 和代理），再按配方选择提取方式：
  - **有 `content`**（导入器声明的配方）：走下面「导入器口径」的提取；
  - **没有 `content`**（虚拟配方，即旧抓取器导入的书）：用 `parseChapterSnapshot(html).text`，和旧流程写入时的口径一致。

  这样处理的原因是：导入器抓内置站点正文时，用的是 `parseImportHtml` 加 `BODY_PRESETS`（`import-extraction-service.ts:426`），不是抓取器自带的解析，两者输出不同。

- `html`：`fetchScraperPage` + `parseImportHtml`。
  - **目录链接**：有 `catalogSelector` 时，先用 cheerio 截取该范围的 HTML，再交给 `parseImportHtml`，范围内除 `metadata` 以外的链接都作为候选；没有时，只取 `relation === 'chapter'` 的链接（这个关系只在 `nav / .toc / .p-eplist / .index_box` 容器内才会标上，见 `import-html-parser.ts:111`）。候选再按 `chapterFilter` 筛选（经正则 worker）。
  - **目录分页**：`followNext` 跟随 `relation === 'next'`，上限 50 页，用已访问集合检测循环。
  - **正文**：走「导入器口径」的提取。
- **导入器口径的提取**：`parseImportHtml(html, content, baseUrl)` 得到的**全部块**按 `\n` 连接，和 `ImportContentService.prepareExtraction` 与 `import-extraction-service.ts:444` 的拼接完全一致。导入时用引用范围裁掉的部分，在配方里必须表达为 `excludeSelectors`、清理规则或 `stripHeading`（由导入器的自测保证）。`parseImportHtml` 目前不给链接标注分组；v1 的 `group` 为空，归卷退化为「相邻章节或最后一卷」，站点新分组不会单独建卷。给链接补分组列为后续改进。
- 引擎内部把「取页面」和「解析」分开：`parseCatalog(html, url, recipe)` 与 `parseChapter(html, recipe)` 是纯函数（目录：builtin 用 `NovelScraper.parseNovelSnapshot`，html 用 `parseImportHtml`；正文：配方带 `content` 时走导入器口径的提取，否则用 `parseChapterSnapshot`），`fetchCatalog` / `fetchChapter` 只负责请求页面再调用它们。这样 `import-record-update-recipe` 可以在导入任务已保存的快照上离线回放，不发网络请求。
- 统一后处理 `normalizeChapterText(raw, recipe, { title, signal })`：清理规则（worker，带超时）→ 标题剥离 → 按导入器规则切成段落。标题由目录条目提供，仅当首个非空行与标题精确匹配时剥离，避免误删正文。自测（导入器侧）与检查共用这一个函数，保证两边的比对口径一致。

### D3 配方失效判定集中在回放层

回放返回 `{ ok: true, ... } | { ok: false, code, message }`。失效码：`CATALOG_FETCH_FAILED`、`VERIFICATION_REQUIRED`、`CATALOG_EMPTY`、`CATALOG_UNRECOGNIZED`（已导入的同站章节中，目录复现不到半数）、`CONTENT_EMPTY`（仅限已导入章节）、`CLEANUP_INVALID`、`CLEANUP_TIMEOUT`。验证页复用 `parseImportHtml` 的 `verification` 判断，内置引擎沿用各抓取器自己的错误。

### D4 检查会话与变更集

```
BookSyncService.openSession({ target: { bookId } | { newFrom: url } }) -> BookSyncSession
session.quickCheck(signal)
session.deepCheck({ signal, onProgress })      // p-limit 式 3 并发
session.changeset                               // { baseRevision, new[], updated[], skipped[], failed[], status }
session.preview(entry)                          // 抓取并缓存正文
session.apply(selection) / session.undo()
```

- 会话对象持有 `Map<url, paragraphs>` 正文缓存，这就是「单次抓取」的实现。会话不持久化。
- 快速检查中的内置日期候选：复用 `ChapterService.shouldUpdateChapter` 的日期逻辑，只抓候选章节的正文确认。
- 有更新判定：用统一的 `sameChapterText(local, remote)` 比较，两边都先去掉首尾空白，口径和 `hasContentChanged` 一致。
  - `local` 为 `originalContent`；没有时，用已加载段落以 `\n` 连接。旧抓取器导入的书从不写 `originalContent`（`NovelScraperDialog.vue:786` 只调用了 `convertContentToParagraphs`），没有这个回退，这些书的每一章都会被误判为有更新。
  - 判定不同时，对该章运行 `matchImportParagraphs`（scope = 章节），得到段落变化和 `clearedVersions`。
- 新建书籍：`baseRevision` 为空，所有目录条目都是新章节。

### D5 归卷算法

按目录顺序扫描，维护 `anchorVolumeId`（最近一个已在书中的章节所在的卷）和预先按整个目录计算的 `groupSeen`（每个站点分组在书中是否有章节，包含当前位置之后的已导入章节）：

```
for entry in catalog:
  if entry 在书中: anchorVolumeId = 它所在卷; continue
  if entry 已跳过: continue
  if entry.group && !groupSeen[entry.group]: target = 新卷(entry.group)，同组复用
  else target = anchorVolumeId ?? 最后一卷 ?? 新卷('正文')
```

输出的是本书的卷 ID，或待建新卷的标题，不依赖按卷标题合并，所以不再调用 `mergeNovelData`。应用时的 `selection.volumeOverrides: Map<groupKey, volumeId | { newTitle }>` 会覆盖推断结果；`groupKey` 按「推断目标卷加连续段」给新章节分组，由会话随变更集一起提供。

### D6 应用：先抓取、再排他提交

1. 调用 `BookExecutionGuard.occupants(bookId)`，有占用者就拒绝，返回占用者标签。
2. 在锁外抓取所选新章节中还没有缓存的正文，3 路并发。失败的章节移入 `failed`。
3. 在 `BookExecutionGuard.commit(bookId, …)` 内：
   - 读取 `book-revisions`，与 `baseRevision` 不同就抛出 `BOOK_CHANGED`，由会话重新计算受影响的章节；
   - 读取受影响章节的旧正文存入撤销快照。读取失败要和「没有正文」区分，读取失败时拒绝提交；
   - 在同一个 IndexedDB 事务里写入书籍记录和章节正文，并调用 `bumpBookRevision`。书籍记录包括新卷、新章节元数据，以及新章节和有更新章节的 `originalContent`（回放文本）、`webUrl`、远端 `lastUpdated`。不写 `lastUpdated` 的话，内置站点按日期筛选时会反复抓取同一批章节；
   - 记录 `postApplyRevision`，通过 `bookCommitBus` 广播。
4. 写入路径复用 `LibraryPersistence` 的事务工具，与导入器应用保持一致。不经过 Pinia，store 通过 `bookCommitBus` 刷新。

在排他锁内抓网络会长时间阻塞翻译任务，所以网络请求放在锁外。

### D7 段落匹配的歧义处理

`matchImportParagraphs` 不传 `allowedReplacements`。返回的 `conflicts` 和未确认的 `replacements` 对应的新段落一律作为无译文的新段落写入，计入 `clearedVersions`。这满足「歧义不转移译文」，也不需要用户逐项确认。已核实：`materialize` 会把未匹配的新段落生成为无译文的段落，未使用的旧段落计为 `remove` 并统计其 `clearedVersions`（`import-paragraph-matching.ts:241-290`），不需要适配层；只是冲突不能当作失败来处理。

### D8 会话内撤销

快照为 `{ bookRecordBefore, chapterContentsBefore: Map, postApplyRevision, createdBookId? }`，保存在内存里。撤销时同样调用 `occupants` 并在 `commit` 内执行：核对修改序号仍等于 `postApplyRevision` 后恢复（新建书籍则删除该书），同时递增序号并广播。

### D9 跳过章节

`BookSyncService.setSkipped(bookId, entries, skipped)`：在 `commit` 内读取书籍，没有真实配方时先由虚拟配方落为真实配方，再改写 `skippedUrls`，并递增修改序号。应用导入时，已导入的网址从 `skippedUrls` 中移除。

## Risks / Trade-offs

- [解析器演进导致已存配方回放漂移] → 为 `parseImportHtml` 与 `normalizeChapterText` 增加固定 HTML 的输出快照测试；界面侧有更新不自动勾选（见 `redesign-book-sync-ui`）。
- [HTML 引擎 v1 无链接分组，站点新开分组时无法自动建新卷] → 退化为相邻章节或最后一卷，界面允许用户改目标卷（UI 变更中处理）；给链接补分组列为后续改进。
- [单独落地时服务无界面消费者，Fallow 报未使用导出] → 与 `redesign-book-sync-ui` 同分支交付，不做行内抑制。
- [更新不再同步元信息（旧流程会更新简介或标签）] → 刻意收窄：更新只处理章节，避免覆盖用户编辑过的元信息。
- [深度检查对站点压力] → 仅由用户触发、3 路并发、可取消。
- [验证页判断漏判] → 同时用正文为空的判断兜底，最终都判为失效，不产出结果。
- [同步按并集合并段落，更新删除的段落可能被旧设备同步回来，旧译文也可能挂回修订后的原文] → 由 `fix-sync-paragraph-merge` 修复（按上次同步的结构基准裁决段落结构，原文不同的段落不合并译文），建议先于本变更实施。
- [新建书籍的封面历史] → 服务在结果中返回封面信息，由 `redesign-book-sync-ui` 的 composable 写入封面历史（保持旧流程 `useBookImportActions.ts:62` 的行为）。

## Migration Plan

无数据迁移：`updateRecipe` 是可选字段，旧书走虚拟配方。回滚只需要移除服务代码，已写入的 `updateRecipe` 字段对旧代码无害（展开式序列化会原样保留）。
