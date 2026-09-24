# Tasks

## 1. 指纹与存储

- [x] 1.1 先写测试再实现 `chapterStructureHash`：只由段落 ID 和原文决定，新增译文或改选译文后指纹不变，改原文、调整顺序、增删段落后指纹改变；验证：`bunx vitest run chapter-structure-hash` 全绿
- [x] 1.2 数据库版本升到 13，新增 `sync-chapter-baselines`（`keyPath: chapterId`，`bookId` 索引），并实现读写和按书删除的函数；验证：fake-indexeddb 测试覆盖从 12 升到 13 后原有数据保留，以及新存储的读写
- [x] 1.3 在 `LibraryPersistence.deleteBook` / `deleteChapters` / `clear` 和快照覆盖路径中清理基准；验证：删除书籍后该书的基准被删除的测试

## 2. 合并算法

- [x] 2.1 先写失败测试，复现三种错误：删除的段落在章末复活；修订后的段落带回旧译文；旧设备翻译后整章赢回旧结构。确认三条测试在现有代码上都失败；验证：测试运行结果显示三条都失败
- [x] 2.2 修改 `mergeParagraphTranslations`：ID 配对但原文不同时不合并译文；增加 `appendSecondaryOnly` 参数；验证：「修订后的段落不带回旧译文」和「原文相同的段落合并双方译文」两条测试通过
- [x] 2.3 修改 `mergeNovelChapters`，按 D3 使用基准裁决结构来源（远端指纹只用内联正文计算，任一侧正文缺失或为空时按没有基准处理），并在两方都改过结构时写入 `SyncMergeReport`；验证：2.1 的三条测试转绿，另加「没有基准时保持现有行为」「两方都改过时记录冲突」「webUrl 配对且 ID 不同时视为没有基准」三条测试
- [x] 2.4 让两个运行时合并入口（`applyPartialNovelEntry`、`applyDownloadedNovels` → `selectFinalNovel`）都传入基准查询和报告对象，`applyPartialRemoteData` 和 `applyDownloadedData` 把报告带回执行器（`mergeDataForUpload` 这条测试路径保持现状）；验证：现有 `sync-data-service` 测试全部通过，新增测试覆盖两个入口都会使用基准

## 3. 基准写入时机

- [x] 3.1 下载应用成功后写入远端条目的章节指纹，应用失败的条目不写；验证：执行器测试覆盖成功写入和失败保留旧基准，另加「远端章节没有内联正文时不写基准」测试
- [x] 3.2 上传成功后，用本次序列化上传的数据写入指纹；上传失败时不写；验证：执行器测试断言写入的指纹来自上传时的数据，而不是上传后被修改的本地数据
- [x] 3.3 先写测试再实现同步成功后的补写：本地 manifest 哈希等于 `knownRemoteHashes` 的书，用本地结构补写基准；哈希不等或同步失败时不补写；验证：「升级后第一次同步为没有变化的书写入基准」测试，以及「本地有未上传修改的书不补写」测试
- [x] 3.4 写一条端到端双设备模拟测试：设备 A 修订并上传；设备 B 翻译后同步；再回到设备 A 同步。最终两边的结构都是 A 修订后的版本，B 在未变段落上的新译文得到保留；验证：该测试全绿

## 4. 提示与收尾

- [x] 4.1 在 `useSyncExecutor` 中，同步结束后如果有结构冲突就弹出一条 toast（最多列 5 章）；验证：执行器测试断言有冲突时只提示一次，没有冲突时不提示
- [x] 4.2 运行 `bun run lint && bun run type-check && bun run test && bun run quality-check`，确认全部通过
