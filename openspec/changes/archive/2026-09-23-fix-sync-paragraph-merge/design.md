# Design

## Context

- 章节合并在 `mergeNovelChapters`（`sync-data-service.ts:185`）：先按 ID 配对，再按 `webUrl` 回退配对；配对后以 `lastEdited` 较新的章节为主，调用 `mergeParagraphTranslations`（:526）。段落先按 ID、再按原文队列配对，合并双方译文；**副方未被配对的段落一律追加**（:605）。章节级有防复活判断 `shouldKeepLocalOnlyItem`，段落级没有。
- 翻译会更新章节的 `lastEdited`（`useParagraphTranslation.ts:44`、`useChapterTranslation.ts:311`），所以结构过时的设备只要翻译过，就可能成为主导方。
- 运行时的合并入口有两处，最终都经过 `mergeNovelKeepingPrimary`：
  - 增量下载 `applyPartialNovelEntry`（:2844）；
  - 旧版全量下载 `applyDownloadedNovels` → `selectFinalNovel`（:1361、:1306，由 `useSyncExecutor.ts:338` 调用）。

  `mergeNovelsForUpload`（:2238）只被 `mergeDataForUpload` 调用，而后者只在测试中用作 `mergeParagraphTranslations` 的测试入口（`sync-data-service.test.ts:2663`），不是运行时路径，这次不接入。
- 远端章节缺少内联正文时，`loadChapterContentForNovelMerge`（:169）会按同一章节 ID 读取**本地**正文，所以不能用它来计算远端结构。
- 上传时会带上全部章节正文（`useSyncExecutor.ts:162` 调用 `loadAllChapterContentsForNovels`），上传结果中的 `uploadedEntries`（`gist-sync-incremental.ts:1150`）列出实际上传的条目。
- 已知远端状态 `knownRemoteHashes` 在下载应用成功后才写入，失败的条目保留旧值（`useSyncExecutor.ts:405`）。基准沿用同样的思路。
- 当前数据库版本为 12（`indexed-db.ts:167`）。

## Goals / Non-Goals

**Goals:**

- 段落结构的裁决与译文合并分开；只改过结构的一方胜出，另一方残留的段落不再复活。
- 原文不同的段落之间不再合并译文。
- 不要求各个写入点配合打标记：基准比对能覆盖所有修改结构的路径。

**Non-Goals:**

- 不解决两方都修改了结构的真正冲突（只提示用户）。
- 不处理章节级、卷级的删除和复活（已有 `shouldKeepLocalOnlyItem` 判断）。
- 不处理同步与翻译任务的互斥（同步搁置问题第 1 条），也不处理跨设备时钟偏差（第 3 条）。本方案裁决结构时不依赖时间戳，不受时钟偏差影响。

## Decisions

### D1 结构指纹

`chapterStructureHash(paragraphs) = hashJson(paragraphs.map(p => [p.id, p.text]))`，复用 `src/utils/content-hash.ts`。只取 ID 和原文，所以翻译、改选译文都不会改变指纹。

备选：在章节上记录 `structureEditedAt`，由所有写入点更新 → 否决。写入点有很多（导入应用、编辑原文、查找替换、检查更新、拆合章），漏一处就会出错，而且依赖时钟。

### D2 基准存储

新增对象存储 `sync-chapter-baselines`，`keyPath: 'chapterId'`，并建 `bookId` 索引；记录为 `{ chapterId, bookId, hash, recordedAt }`。数据库版本升到 13，只新增这个存储。以下情况需要清理：

- `LibraryPersistence.deleteBook` / `deleteChapters`：删除对应的基准；
- `clear` 和快照覆盖（`overwriteFromSnapshot` / `clearLocalSyncedData`）：清空全部基准。

不放进 `SyncConfig`：几千章的映射放在配置对象里，每次保存配置都要整体序列化。

### D3 合并算法

`mergeNovelChapters` 增加参数 `baselines: (chapterId) => string | undefined` 和 `report: SyncMergeReport`。对每个配对：

```
base      = 两方章节 ID 相同时取 baselines(id)，否则视为没有基准
localChg  = base && hash(local)  !== base
remoteChg = base && hash(remote) !== base

if (!base || (localChg && remoteChg)):
    结构来源 = 现有规则（较新的章节为主，追加另一方独有的段落）
    if (localChg && remoteChg): report.conflicts.push(书名, 章节)
elif localChg:  结构来源 = 本地，不追加另一方独有的段落
elif remoteChg: 结构来源 = 远端，不追加另一方独有的段落
else:           两方结构一致
```

章节元信息（标题译文等）仍用现有的 `winningChapter` 逻辑。结构来源只决定段落序列和原文；只有一方改过结构时，`originalContent`（原始抓取文本）与 `lastUpdated`（原文更新时间）也取自结构来源一方，避免它们与段落结构错配。

`hash(local)` 用本地已加载的正文计算；`hash(remote)` **只用远端条目中内联的正文**计算，不经过 `loadChapterContentForNovelMerge`，否则远端正文缺失时会读到本地正文。任一侧正文缺失或为空时，这一章视为没有基准，走现有规则，也不写入基准。

`mergeParagraphTranslations` 增加参数 `appendSecondaryOnly: boolean`；配对到的两个段落原文不同时，不合并译文，只保留主导方的段落。原文队列回退配对本来就要求原文相同，所以不受影响。

### D4 基准写入时机

- **下载**：在 `applyPartialNovelEntry` / `applyDownloadedNovels` 中，本地写入（`bulkAddBooks`）成功之后，写入**远端条目中**各章的结构指纹。写的是远端原样的结构，不是合并结果，因为基准表示「远端当前是什么样」。写入失败只记录日志，不影响本次同步（下次按没有基准处理）。
- **上传**：`uploadToGistIncremental` 成功后，对本次实际上传的 `novel:<id>` 条目，用**上传时序列化的那份数据**计算各章指纹并写入，避免上传期间本地又被修改而写错基准。上传结果需要带出这些条目的结构，或由执行器在序列化时记录。
- **补写**：同步成功结束后，对本地 manifest 哈希等于 `knownRemoteHashes` 的 `novel:<id>` 条目（说明本地与远端逐字相同），用本地结构补写该书各章中还没有基准或基准不同的记录。否则升级后，没被下载或上传过的书一直没有基准，第一次跨设备修改结构时仍会出错。补写只在一次同步完全成功后执行，并且只处理哈希相等的条目。
- 失败的条目：跟随 `failedEntryKeys` / `applyFailedKeys`，不写入。
- 实现上，上传与补写合并为一条规则：同步成功结束后（增量上传、强制推送、无需上传），对 bundle 中本地 manifest 哈希等于最终已知远端哈希的书写入基准。上传成功时最终远端哈希就是本次上传的 manifest，无需上传时是 `knownRemoteHashes`。首次创建 Gist 时整个 bundle 都已上传，全部写入。写入只覆盖还没有基准或基准不同的章节。

### D5 冲突提示

`SyncMergeReport` 在一次同步执行中累积。`applyPartialRemoteData` 现在只返回失败条目列表，需要改为同时返回报告（或接受外部传入的报告对象），`applyDownloadedData` 也做同样的调整。`useSyncExecutor` 在同步结束后如果有冲突，就弹出一条 toast，列出最多 5 个「书名 · 章节」，其余用「等 N 章」概括。提示放在执行器里，确保每次同步只出现一次；报告按书籍与章节去重（伪 CAS 重试会重新合并同一章节）。合并已写入本地，所以同步最终失败时也照样提示。

## Risks / Trade-offs

- [升级后还没有基准] → 升级后第一次成功同步时，通过 D4 的补写为所有本地与远端一致的书写入基准；本地有未上传修改的书，会在这次上传成功后写入。
- [通过 `webUrl` 配对的两侧章节 ID 不同，没有基准可用] → 退回现有行为；这种配对只出现在两台设备各自抓取同一章的早期数据中。
- [基准写入与远端状态不一致，导致误判谁改过] → 只在应用成功或上传成功后写入，并用执行器测试锁定时机（成功写、失败不写）。
- [两方都修改了结构时仍可能复活] → 提示用户手动检查；比已有行为多了可见性。
- [数据库升级] → 只新增存储、不改动现有存储，回滚到旧版本代码时，idb 会拒绝打开更高版本的数据库。这与以往每次升级数据库版本的风险相同，在发布说明中注明。

## Migration Plan

数据库版本 12 → 13，新增 `sync-chapter-baselines`。已有数据不需要迁移；没有基准的章节保持现有行为，直到下一次同步成功后写入基准。
