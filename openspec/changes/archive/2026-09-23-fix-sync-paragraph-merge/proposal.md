# Proposal

## Why

同步合并章节正文时，章节层按 `lastEdited` 决定谁为主，段落层取两边的并集：副方独有的段落一律追加到章末，按 ID 配对的段落不管原文是否相同都合并译文。这导致一台设备上修改过段落结构（AI 导入器应用、编辑原文、查找替换，以及即将上线的检查更新），会被另一台还停留在旧版本的设备破坏：

- 删掉的段落在章末复活；
- 已清空的旧译文被挂回到修订后的新原文上；
- 旧设备只要在同步前翻译过（翻译会更新章节的 `lastEdited`），就会整章赢回旧的段落结构。

根源在于用同一个时间戳裁决两件不同的事：段落结构和译文。

## What Changes

- 每台设备在本地记录每章「上次同步时远端的段落结构指纹」（段落 ID 加原文的哈希，不含译文）。只存本地，不上传。
- 合并章节正文时，用两边当前的结构与这份基准比较，判断哪一方改过结构：
  - **只有一方改过**：以改过的一方的段落结构为准，另一方独有的段落不再追加；
  - **两方都没改**：只合并译文；
  - **两方都改过**：沿用现有做法（较新章节为主，取并集），并在同步结束后提示用户哪些章节存在结构冲突；
  - **没有基准**（首次同步或旧数据）：沿用现有做法。
- 在所有情况下，只有原文完全相同的段落才合并译文。ID 相同但原文不同时，不带入另一方的译文。
- 基准只在确认远端已经是该状态后写入：下载应用成功后写入远端的结构，上传成功后写入已上传的结构；失败的条目保留旧基准。这和 `knownRemoteHashes` 的规则一致。
- 章节层的元信息（标题等）仍按现有的较新者优先规则处理，只有段落结构的裁决方式改变。

## Capabilities

### New Capabilities

- `sync-chapter-content-merge`：同步时章节正文（段落结构与译文）的合并规则、结构基准的记录时机，以及结构冲突的提示。

### Modified Capabilities

（无：现有 `data-sync`、`sync-change-detection` 规格没有涉及段落合并的要求。）

## Impact

- `src/services/sync-data-service.ts`：`mergeNovelChapters`、`mergeParagraphTranslations` 接收结构基准并返回冲突列表；增量路径（`applyPartialNovelEntry`、`mergeNovelsForUpload`）和旧的全量路径（`selectFinalNovel`）都经过同一个合并函数。
- `src/composables/useSyncExecutor.ts`：下载应用成功后和上传成功后写入基准；同步结束后提示结构冲突。
- `src/utils/indexed-db.ts`：新增对象存储 `sync-chapter-baselines`，数据库版本从 12 升到 13。删除书籍时一并清理。
- 与 `add-book-sync-core`、`redesign-book-sync-ui`、`import-record-update-recipe` 没有依赖关系，建议最先实施。
