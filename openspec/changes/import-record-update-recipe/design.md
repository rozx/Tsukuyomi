# Design

## Context

- `add-book-sync-core` 提供 `BookUpdateRecipe`、引擎的纯解析函数（`parseCatalog` / `parseChapter`）和 `normalizeChapterText`（清理、剥离标题、切段落）。
- 导入任务保存的来源快照：`ImportResource` 中 `kind: 'snapshot'`（含 `text`、`responseUrl`）；来源的 `currentSnapshotId`；发现记录里的 `relation`（`catalog` / `next` / `chapter`）。
- 新书方案由 `buildImportBook` 构造：已有书籍基于快照中的书籍记录复制，所以原有配方会自动保留；`comparableBook` 比较整本书（去掉正文），配方和 `webUrl` 的变化会让 `hasChanges` 为真。
- `import-plan-layout` 只在网址在本次导入中唯一时写 `chapter.webUrl`。
- 空选择会产生 `EMPTY_SELECTION` 冲突，任务停在 `draft`。
- 撤销：`ImportOperation.before.book` 保存完整的书籍记录，撤销时整体恢复。

## Goals / Non-Goals

**Goals:**

- 配方只在 Agent 明确声明、宿主离线验证之后，才能进入书籍。
- 导入器是配方唯一的产生方和修复方；检查更新本身不依赖导入器。

**Non-Goals:**

- 不为老书自动补录配方，由修复入口按需建立。
- 不支持章内分页、拆章、合章或整卷一页的配方。
- 不从用户在界面上的手工清理操作自动推断清理规则。

## Decisions

### D1 草稿中的配方声明

```ts
ImportDraft.updateRecipe?: {
  recipe: BookUpdateRecipe;       // 不含 skippedUrls，应用时再计算
  declaredAtRevision: number;
  selfTest: { ok: boolean; verified: number; pinned: number; issues: RecipeIssue[] };
}
```

工具 `record_update_recipe` 的参数：`base_draft_revision`、`catalog_source_ids`、`catalog_selector?`、`chapter_filter?`、`content_rules?`、`cleanup?`、`strip_heading?`、`pinned_chapter_ids?`。宿主负责：

1. 检查来源属于本任务、不是元信息来源、没有被移除。
2. 用 `NovelScraperFactory` 判断目录网址属于哪个站点。属于内置站点时，引擎用 `builtin`，目录交给内置抓取器处理（忽略 `chapter_filter` 和目录范围）。但 `content_rules` **必须保留**，写入 `engine.content`：导入器抓内置站点正文时用的是 `parseImportHtml` 加 `BODY_PRESETS`（`import-extraction-service.ts:426`），回放必须用同样的口径；换成抓取器自带的 `parseChapterSnapshot`，结果就会不一样。Agent 没有提供 `content_rules` 时，从这些章节提取资源实际使用的规则中推导；各章节使用的规则不一致时，以 `CONTENT_MISMATCH` 拒绝。
3. 执行离线自测（D2），通过后用一次草稿编辑写入，递增修订号。

错误码：`SOURCE_NOT_FOUND`、`SNAPSHOT_MISSING`、`UNSUPPORTED_GRANULARITY`、`CONTENT_MISMATCH`（最多 5 条差异示例）、`PINNED_LIMIT`、`CLEANUP_INVALID`、`CLEANUP_TIMEOUT`、`DRAFT_CHANGED`。

### D2 离线自测

```
目录页 = catalog 来源的当前快照，加上它们经 next 关系发现、且已有快照的分页来源
entries = 对每个目录页执行 parseCatalog，按顺序去重
站点章节 = 草稿中 selected 的章节里，sourceIds 指向与目录同站点网址的章节
一一对应：每个站点章节必须恰好对应一个来源网址，且该网址在 entries 中；
          同一网址不能对应多个章节（否则报 UNSUPPORTED_GRANULARITY）
正文比对：对每个站点章节，取该网址来源的快照，
          normalizeChapterText(parseChapter(html)) 与草稿正文逐段比较
          回放文本：按 add-book-sync-core 的「导入器口径」提取（全部块以 \n 连接，与 prepareExtraction 一致），
          再依次执行清理、剥离标题、切成段落
          草稿正文：用 loadImportPlanContext 加方案的段落拼装（assembleImportParagraphs）生成
          比较函数用 add-book-sync-core 的 sameChapterText，保证与检查时的口径一致
固定章节：pinned_chapter_ids 中的章节跳过比对，但要求回放结果确实与草稿不同；
          数量不能超过站点章节数的 20%
```

缺少快照时不去请求网络，而是返回 `SNAPSHOT_MISSING`，列出需要先 `inspect_source` 或 `extract_content` 的来源。清理正则同样走 worker，带超时。

### D3 方案生成时重跑

`import-plan-service` 生成方案时调用同一个自测函数：

```
ImportPlan.recipeChange?: {
  kind: 'add' | 'replace' | 'keep' | 'stale';
  verified: number;
  before?: RecipeSummary;
  after?: RecipeSummary;
  reason?: string;
}
```

- **自测通过**：把 `plan.book.updateRecipe` 设为新配方，并带上 D4 计算的 `skippedUrls`；把目录网址放到 `plan.book.webUrl` 首位（去重）。
- **`stale`**：沿用原有配方，只维护跳过列表。
- **没有声明**：也只维护跳过列表，保留原有配方。

方案预览界面中单独渲染一个「更新配方」区块。

### D4 跳过列表的计算

```
新 skipped = 原 skipped
           ∪ { 草稿中 selected=false、网址唯一且在 entries 中的章节 }
           − { 本次写入书籍的章节网址 }
```

`entries` 来自本次自测；没有有效配方时只做减法。计算结果写入 `plan.book.updateRecipe.skippedUrls`。

### D5 放宽空选择

`EMPTY_SELECTION` 的判断改为：目标为已有书籍，且 `recipeChange.kind` 是 `add` 或 `replace` 时，不产生这个冲突。其余情况不变。注意顺序：现在这个冲突在 `import-plan-service.ts:419` 构造方案时就产生了，所以配方自测（D3）必须挪到这个判断之前执行，或者把空选择的判断移到配方自测之后。

### D6 撤销

`before.book` 本来就是完整的书籍记录，撤销时会连同配方和 `webUrl` 一起恢复，不需要新增字段。用测试锁定这一行为。

### D7 修复任务

```
ImportTask.purpose?: { kind: 'recipe-repair'; bookId: string; reason: string }

ImportRecipeRepair.open(book, reason):
  已有未结束的修复任务（purpose.bookId 相同，state 不是 applied 或 reverted）-> 直接返回它
  否则 createTask(`修复更新配方：${title}`)
    -> 设置 draft.target = { kind: 'existing', bookId, basis: 'user' }
    -> registerUrl(配方目录 ?? webUrl[0])；两者都没有时不登记来源
    -> 设置 purpose
  返回 taskId，由调用方 router.push('/import/<id>')
```

导入 Agent 的提示词状态中增加 `repair: { bookId, previousRecipe, reason }`。工作台打开修复任务时，在输入框中预填一句说明失效原因的话，由用户发送，不自动运行。同步工作区的 `HandoffNotice` 改为调用 `ImportRecipeRepair.open`。

### D8 提示词

新增一条工作方式：

- 网页来源的章节与目录一一对应、整理完成后，调用 `record_update_recipe`；
- 草稿中用过的批量清理规则要一并声明；
- 导入时用引用范围裁掉的内容（标题、前言后记、导航），要改写成 `content_rules.excludeSelectors`、清理规则或 `strip_heading`，否则自测会失败；
- 目录链接不在标准目录容器中时，要提供 `catalog_selector`；
- 固定正文章节只用于有意的手工修改；
- 自测失败时根据差异调整规则，不要反复用同样的参数重试；
- 修复任务的目标是得到一份通过自测的配方，没有新章节时，可以只提交配方变化。

## Risks / Trade-offs

- [草稿正文拼装与方案拼装不一致，导致自测误报] → 复用同一段拼装代码，并用测试锁定「自测通过的草稿，应用后 `originalContent` 与回放结果相同」。
- [目录分页快照不全] → 返回 `SNAPSHOT_MISSING`，引导 Agent 先检查缺失的页面，而不是静默只用部分目录。
- [Agent 滥用固定正文章节来绕过自测] → 设 20% 上限，并要求固定章节确实与回放结果不同；方案中列出固定章节数。
- [声明配方后草稿又被修改] → 每次生成方案都重跑自测，失效时不写入配方（见 D3）。
- [修复任务预填的目标书被删除] → 沿用导入器已有的目标校验，目标不存在时要求用户重新选择。

## Migration Plan

新增字段均为可选，不需要迁移。旧任务没有 `purpose`，旧草稿没有 `updateRecipe`，照常工作。
