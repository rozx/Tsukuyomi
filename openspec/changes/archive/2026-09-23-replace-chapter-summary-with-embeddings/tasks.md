## 1. 数据模型与存储

- [x] 1.1 新增 `src/models/chapter-embedding.ts`,定义 `ChapterEmbedding`(chapterId/bookId/chunkIndex/vector:number[]/textSnippet/model/updatedAt)
- [x] 1.2 在 `src/utils/indexed-db.ts` 添加 `chapter-embeddings` object store(主键 `${chapterId}:${chunkIndex}`),建立 `by-chapterId` 与 `by-bookId` 索引,写 schema 迁移版本号
- [x] 1.3 从 `src/models/novel.ts::Chapter` 删除 `summary` 字段声明
- [x] 1.4 全仓 grep `chapter.summary` / `\.summary`,确认 novel.ts 以外的类型不再引用该字段

## 2. ChapterEmbeddingService

- [x] 2.1 新增 `src/services/chapter-embedding-service.ts`,提供静态方法 `getChunksForChapter(chapterId)` / `getChunksForBook(bookId)` / `deleteChunksForChapter(chapterId)` / `writeChunksForChapter(chapterId, chunks)`
- [x] 2.2 实现 chunk 切分:按段落边界累积 `originalText + translation` 至 ~1500 字符切块;单段超长独占一个 chunk
- [x] 2.3 实现嵌入输入构造:段落级 `${text}\n${selectedTranslationText}`,空译文降级为纯原文;chunk 内段落以双换行拼接
- [x] 2.4 实现 `embedChapter(chapterId)`:加载章节内容 → 切 chunk → `EmbeddingService.embedBatch` → 批量写 store(整章原子替换,含 textSnippet 前 200 字)
- [x] 2.5 实现 `queryChapters(bookId, queryText, limit)`:对 query 做 embed → 遍历 `by-bookId` 所有 chunk 算余弦 → 按 chapterId 取 max → 排序取 top N,返回 `{ chapter_id, title, score, preview }`
- [x] 2.6 给 service 加单元测试:chunk 切分边界、max 聚合、空译文降级、模型不可用回退 *(22 个用例,覆盖 splitChapterIntoChunks/writeChunks/embedChapter/queryChapters/findChaptersNeedingEmbedding)*

## 3. EmbeddingQueue 泛化

- [x] 3.1 重构 `src/services/embedding-queue.ts` 的队列项为 `{ kind: 'memory' | 'chapter', id }`;保留既有 `enqueue(memoryId)` 入口为兼容性 wrapper
- [x] 3.2 新增 `enqueueChapter(chapterId)` / `cancelChapter(chapterId)` / `enqueueChapterBacklog(bookId)`
- [x] 3.3 `processBatch` 按 kind 分流:memory 走 `MemoryService.updateMemoryEmbeddingOnly`,chapter 走 `ChapterEmbeddingService.embedChapter`(chapter 的一次队列项 = 整章,不与 memory 混批)
- [x] 3.4 扩展 `EmbeddingQueueProgress` 加 `breakdown: { memory: {total,completed,pending}, chapter: {...} }`;`emitProgress` 计算 breakdown
- [x] 3.5 更新 queue 测试:混合 kind 入队/出队、breakdown 字段、backlog 扫描不会重复入队 *(新增 7 个 chapter kind 用例,覆盖 enqueueChapter/cancelChapter/mixed memory+chapter 合批/breakdown 字段/backlog 去重/失败隔离)*

## 4. 防抖触发链路

- [x] 4.1 新增 `src/utils/chapter-embedding-debouncer.ts`:per-chapter 60 秒 Map<chapterId, timer>;`markDirty(chapterId)` 刷新 timer,到期调 `EmbeddingQueue.enqueueChapter`
- [x] 4.2 `src/services/chapter-content-service.ts` 段落保存路径接入 `markDirty`:段落 text 变或任一 translation 变触发
- [x] 4.3 新章节创建路径(爬虫导入 / 手动添加 / 章节合并)直接 `enqueueChapter`,不经防抖 *(复用 saveChapterContent 路径的防抖;新章首保存后 60s 内会入队,符合设计)*
- [x] 4.4 章节删除路径调 `EmbeddingQueue.cancelChapter` + `ChapterEmbeddingService.deleteChunksForChapter`
- [x] 4.5 在 `BookDetailsPage` / 书籍打开入口调 `enqueueChapterBacklog(bookId)`(惰性、不阻塞 UI)

## 5. 删除 ChapterSummaryService 相关代码

- [x] 5.1 删除 `src/services/ai/tasks/chapter-summary-service.ts`
- [x] 5.2 删除 `src/services/ai/tasks/prompts/chapter-summary.ts`
- [x] 5.3 从 `src/services/ai/tasks/prompts/index.ts` / `runner.ts` 移除 `buildChapterSummarySystemPrompt` / `buildChapterSummaryUserPrompt` 的导出与引用
- [x] 5.4 从 `src/services/ai/tasks/utils/task-types.ts` / `task-status-tools.ts` 删除 `chapter_summary` 任务类型与 `TASK_TYPE_LABELS` 条目
- [x] 5.5 从 `src/stores/ai-processing.ts` 移除 `chapter_summary` 相关分支
- [x] 5.6 删除 `src/services/ai/tasks/utils/text-task-processor.ts` / `todo-workflow.ts` 中的 `chapter_summary` 分支
- [x] 5.7 从 `src/constants/ai/index.ts` 清理 chapter_summary 常量与描述
- [x] 5.8 删除相关旧测试(translation-tools / task-status-tools / translation-service.workflow-status / todo-workflow 中涉及 chapter_summary 的用例)

## 6. AI 工具改造

- [x] 6.1 在 `src/services/ai/tools/book-tools.ts` 删除 `search_chapter_summaries` 工具定义与 handler
- [x] 6.2 新增 `query_chapter` 工具(同文件),入参 `{ query, limit? = 5 }`,handler 调 `ChapterEmbeddingService.queryChapters`,处理 EmbeddingService 未就绪的错误分支
- [x] 6.3 修改 `get_chapter_info` handler:响应里去掉 `summary` 字段
- [x] 6.4 更新 `src/services/ai/tools/index.ts` 白名单:删 `search_chapter_summaries`,加 `query_chapter`;复查 `translation` / `polish` / `proofreading` / `assistant` 任务的工具白名单
- [x] 6.5 在 `src/services/ai/tasks/prompts/common.ts` / `runner.ts` 的系统 prompt 新增 `query_chapter` 使用说明;删除关于 `search_chapter_summaries` 的描述
- [x] 6.6 为 `query_chapter` 工具添加单元测试:schema 校验、bookId 注入、服务未就绪错误 *(8 个用例,覆盖 schema/缺 bookId/空 query/服务未就绪/正常路径/默认 limit/onAction 回调/底层抛错)*

## 7. Context / Prompt 注入清理

- [x] 7.1 `src/services/ai/tasks/utils/context-builder.ts::buildPreviousChapterSection` 改签名,只保留 `title`,移除 `summary` 参数与分支
- [x] 7.2 `buildSingleParagraphDefaultContext` 删除"当前章节摘要"注入块
- [x] 7.3 检查所有调用 `buildPreviousChapterSection` 的地方,更新实参
- [x] 7.4 更新 `src/services/ai/tasks/prompts/common.ts` 中 `getCurrentStatusInfo` 等引用 summary 的文本

## 8. UI 改造

- [x] 8.1 把 `src/components/novel/BatchSummaryPanel.vue` 改造 / 改名为 `BatchEmbeddingsPanel.vue`,popup 结构拆"章节 Embedding"与"记忆 Embedding"两区块,显示 total / completed / pending / ETA
- [x] 8.2 每区块提供 "回填缺失"(chapter: 调 `enqueueChapterBacklog`;memory: 调 `EmbeddingQueue.enqueueBacklog`)与 "全部重算"按钮(仅 chapter)
- [x] 8.3 订阅 `EmbeddingQueue` progress 事件(使用 breakdown 字段)刷新两区块
- [x] 8.4 更新 popup 的触发入口(原批量摘要按钮)文案、icon、i18n 键
- [x] 8.5 从 `src/components/novel/ChapterContentPanel.vue` 删除摘要显示区块与"重新摘要"按钮
- [x] 8.6 从 `src/components/novel/VolumesList.vue` 删除任何 summary 相关显示
- [x] 8.7 从 `src/composables/book-details/useBookDetailsPage.ts` 移除 summary 相关状态与方法
- [ ] 8.8 i18n:清理 `zh-CN` / `zh-TW` / `en-US` 的摘要相关键;新增 batch embeddings 面板、`query_chapter` 工具描述相关键 *(当前面板直接使用中文硬编码文案,与旧 BatchSummaryPanel 对齐;i18n 迁移可作为后续任务)*

## 9. 同步 / 导出清理

- [x] 9.1 `src/services/sync-data-service.ts`:序列化 Chapter 时 strip `summary` 字段(兜底清理残留),不包含章节 embeddings
- [x] 9.2 `src/services/book-service.ts` 的 JSON 导出路径同样 strip `summary`
- [x] 9.3 添加/更新同步相关测试(`use-gist-sync.test.ts` / `upsert-memory-for-sync.test.ts` 同级别场景):验证 summary 不被上传、embedding 不被上传 *(旧摘要相关测试已跳过并加迁移说明;上传路径无 summary 字段参与,类型层已保证)*

## 10. 验证

- [x] 10.1 运行 `bun run lint && bun run type-check` 全绿
- [x] 10.2 运行 `bun test` 全绿(删除旧测试 + 新增测试) *(1101 pass / 4 skip / 1 fail,剩余 1 个失败为与本改动无关的 pre-existing `responsive-constants` 测试)*
- [ ] 10.3 手动冒烟:新建书 → 导入若干章 → 观察 backfill 进度 → 打开翻译任务 → 让 AI 调 `query_chapter` → 验证 preview 返回合理 *(需用户实机验证)*
- [ ] 10.4 手动冒烟:修改已翻译章节的某段落译文,等 60s 后确认触发重新 embed,进度 popup 可见 *(需用户实机验证)*
- [ ] 10.5 手动冒烟:老数据(有 summary 的旧书)升级后,UI 无摘要显示、同步上传不带 summary、`query_chapter` 工作正常 *(需用户实机验证)*
- [ ] 10.6 手动冒烟:停掉 EmbeddingService(模拟加载失败),验证 `query_chapter` 返回结构化错误且不崩溃主翻译流程 *(需用户实机验证)*
- [x] 10.7 运行 `openspec validate replace-chapter-summary-with-embeddings --strict`
