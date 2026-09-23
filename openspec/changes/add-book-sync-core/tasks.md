# Tasks

## 1. 模型与配方解析

- [x] 1.1 新增 `src/models/book-sync.ts`（`BookUpdateRecipe`、`CatalogEntry`、变更集类型），给 `Novel` 加可选字段 `updateRecipe`；验证：`bun run type-check` 通过，并用一条测试确认 `serializeBookRecord` 往返后配方保留
- [x] 1.2 先写测试再实现 `resolveRecipe(book)`：覆盖真实配方、四个内置站点的虚拟配方、非内置网址、空 `webUrl` 四种情况；验证：`bunx vitest run book-sync-recipe` 全绿

## 2. 回放与清理

- [x] 2.1 先写测试再实现 `normalizeChapterText(raw, recipe)`：清理规则按 literal/regex 执行 remove_matches 和 remove_lines、剥离标题、按导入器的换行规则切段落（保留缩进和空行）；验证：测试覆盖「次の話へ」整行删除，以及同一输入两次输出相同
- [x] 2.2 清理正则通过导入器 worker 作业执行，带超时；先写超时和无效正则的失败测试（返回 `CLEANUP_TIMEOUT` / `CLEANUP_INVALID`）；验证：灾难性回溯正则的测试在限定时间内返回失败
- [x] 2.3 先写测试再实现 builtin 引擎适配（mock `NovelScraper`）：通过 `fetchPageSnapshot` + `parseNovelSnapshot` 严格遍历目录（起始页、分页、循环和上限），任一页失败不返回部分目录，保留跨页分组并展平为带 `group` 和 `lastUpdated` 的条目；正文页用 `fetchPageSnapshot` 请求，配方有 `content` 时走导入器口径的提取，没有时用 `parseChapterSnapshot`；验证：第二页失败整体拒绝的回归测试，以及同一 ncode 章节 fixture 在两种口径下的输出分别与对应写入流程一致
- [x] 2.4 先写测试再实现 html 引擎（mock `fetchScraperPage`）：用 `catalogSelector` 限定目录范围（排除 metadata 链接），没有范围时退回 `relation === 'chapter'`；`chapterFilter` 筛选；`followNext` 的页数上限和循环检测；正文按导入器口径（全部块以 `\n` 连接，与 `prepareExtraction` 一致）提取；验证：一份「章节链接不在标准目录容器中」的 fixture，以及与 `import-extraction-service` 输出逐字对照的测试
- [x] 2.5 先写测试再实现失效判定：目录抓取失败、验证页、目录为空、已导入章节半数复现不到、已导入章节正文为空；验证：每种失效码各有一条测试，并确认失效时不返回部分条目
- [x] 2.6 为 `parseImportHtml` 和 `normalizeChapterText` 增加固定 HTML 的输出快照测试（防止解析器漂移）；验证：快照测试纳入 `bun run test`

## 3. 检查会话与变更集

- [x] 3.1 先写测试再实现快速检查：新章节、已跳过的归类，内置引擎按日期筛选候选再用正文确认，html 引擎把有更新标记为未检查且不请求已导入正文；验证：用请求计数断言快速检查不抓取已导入章节
- [x] 3.2 先写测试再实现深度检查：最多 3 路并发、进度回调、取消后保留已完成结果、`pinnedUrls` 中的章节不抓取也不比对；验证：用 fake 定时器和可控 Promise 断言并发上限和取消行为，并用请求计数断言固定章节没有被请求
- [x] 3.3 先写测试再实现「有更新」判定（`sameChapterText`：去掉首尾空白后比较，基准为 `originalContent`，没有时用段落以 `\n` 连接）和段落匹配：旧抓取器导入的书（没有 `originalContent`）在正文相同时不计入有更新，相同正文不计入有更新，变化段落、新增、移除和 `clearedVersions` 按实际计算，重复句子的歧义段落不转移译文；验证：「只改一个错字保留 79 段译文」和「重复句子」两条测试
- [x] 3.4 先写测试再实现归卷算法（D5），以及应用时的目标卷覆盖（指定已有卷或新卷）：卷名和分组名不同、站点开新分组、无分组时用最后一卷、书没有卷、覆盖优先于推断；验证：归卷测试全绿
- [x] 3.5 实现会话内正文缓存，保证预览、比对、应用共用同一份内容；验证：测试断言预览后应用不再请求同一网址

## 4. 应用、撤销、跳过

- [x] 4.1 先写测试再实现应用前的占用检查（`BookExecutionGuard.occupants`），有占用者时拒绝并返回占用者标签；验证：mock 占用者的测试
- [x] 4.2 先写测试再实现锁外抓取新章节正文，部分失败时只写入成功项，结果标记为部分成功；验证：「5 章中 1 章失败」测试
- [x] 4.3 先写测试再实现 `commit` 内的版本核对和单事务写入（书籍记录，包括新章节和有更新章节的 `originalContent`、`webUrl`、远端 `lastUpdated`；章节正文；修改序号递增；`bookCommitBus` 广播）；再加一条「应用后再次快速检查不再出现同一候选」的测试；修改序号变化时抛出 `BOOK_CHANGED`，由会话重算受影响章节；旧正文读取失败时拒绝提交；验证：用 fake-indexeddb 的集成测试覆盖成功写入、版本冲突、读取失败三种情况
- [x] 4.4 先写测试再实现新建书籍的应用：创建书籍，写入所选章节、目录元信息（包括封面）和配方，未选中的章节进入 `skippedUrls`，结果中返回封面信息；验证：「只导前 50 话」测试，并断言结果带有封面
- [x] 4.5 先写测试再实现会话内撤销（D8）：修改序号未变时恢复书籍记录和章节正文（新建书籍则删除），序号变化时拒绝；验证：「立即撤销」和「翻译后撤销被拒」两条测试
- [x] 4.6 先写测试再实现 `setSkipped`：虚拟配方落为真实配方、取消跳过、应用导入后从跳过列表移除，每次都递增修改序号；验证：跳过管理测试全绿

## 5. 收尾

- [x] 5.1 运行 `bun run lint && bun run type-check && bun run test`，确认全部通过；运行 `bun run quality-check`，记录尚无界面消费者导致的未使用导出（与 `redesign-book-sync-ui` 同分支交付后消除，不加行内抑制）


## 验证记录（2026-09-23）

- 新增同步专项测试：6 个文件、52 条通过；包含真实线程正则超时、导入器提取结果逐字对照、分页整体失败、并发取消、事务冲突和撤销。
- `bun run lint`、`bun run type-check`、`bun run test`、`bun run quality-check` 全部通过；全量测试 2427 条通过、5 条跳过。
- 已运行全量 `bun run test:coverage`；Fallow CI 门禁的死代码、重复和健康度问题均为 0。当前测试入口会引用同步服务，因此未产生未使用导出告警；未增加抑制配置，UI 消费者仍由 `redesign-book-sync-ui` 接入。
- `openspec validate add-book-sync-core --strict` 通过。
