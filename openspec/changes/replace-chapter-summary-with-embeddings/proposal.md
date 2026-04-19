## Why

章节摘要依赖 AI 调用生成，慢且昂贵，生成的文本质量受模型影响。现在项目已经有成熟的本地嵌入基础设施（EmbeddingGemma 300M + EmbeddingQueue），可以用章节向量化 + 语义检索替代"AI 生成摘要 + 关键词检索"的老路子——AI 查章节时用自然语言 query 做语义搜索，比搜关键词命中摘要文本更准确，且无 AI 调用成本。

## What Changes

- **BREAKING** 移除 `Chapter.summary` 字段及其全部生成路径（`ChapterSummaryService`、chapter_summary 任务类型、`BatchSummaryPanel` 的摘要生成逻辑、`search_chapter_summaries` 工具、`get_chapter_info` 响应中的 summary 字段、前一章摘要与当前章节摘要的 prompt 自动注入）。旧数据库中残留的 summary 字段静默忽略，不再读写，不再导出。
- **新增**章节级多向量嵌入：每章按 ~1500 字符沿段落边界切成多个 chunk，逐 chunk 生成 256 维向量（`译文+原文` 拼接作为嵌入输入），存入独立的 IndexedDB store `chapter-embeddings`。
- **新增** AI 工具 `query_chapter(query, limit?)`：对 query 做 embedding，与所有 chunk 向量算余弦相似度，按章节聚合（chapterScore = max chunkScore），返回 top N 条 `{ chapter_id, title, score, preview }`（preview 为匹配 chunk 的前 200 字）。
- **扩展** `EmbeddingQueue`：从仅处理 memory 扩展为同时处理 memory 和 chapter 两类目标，共用 pipeline、进度事件、暂停/恢复。
- **触发链路**：段落原文/译文变更以 per-chapter 60 秒防抖入队；新建章节立刻入队；章节删除时清理对应 embeddings；`MODEL_VERSION` 升级触发 backlog 扫描。
- **同步**：和 memory embedding 一致，Gist 序列化时 strip 掉章节 embedding（本地重算，不上传）。
- **UI 改造**：原 `BatchSummaryPanel` popup 改造为统一的 **Batch Embeddings** 面板，分两块展示 章节 embedding 与 记忆 embedding 的进度（已嵌入/待处理/ETA），各自提供"回填缺失"与适用情况下的"全部重算"按钮。移除 `ChapterContentPanel` 中的 summary 显示/编辑入口。

## Capabilities

### New Capabilities

- `chapter-embedding-search`：章节级多向量嵌入的存储、增量更新、语义查询。包括 chunk 切分规则、嵌入输入构造、多向量到单章的聚合打分、`query_chapter` 工具协议、触发防抖语义、同步 strip 语义与 backlog 扫描。

### Modified Capabilities

- `chapter-summary`：废弃该能力下的全部 requirements（摘要生成、可见性、模型指示），由 `chapter-embedding-search` 接替。静默移除字段与 UI。
- `ai-context-building`：移除「前一章摘要注入」与「单段润色的当前章节摘要注入」两条 requirements；新增"AI 可通过 `query_chapter` 工具按需获取章节上下文"的约束。

## Impact

**数据模型**
- `models/novel.ts::Chapter`：`summary` 字段删除。
- 新增 `models/chapter-embedding.ts`。

**存储**
- `utils/indexed-db.ts`：新 IndexedDB store `chapter-embeddings`。
- `services/sync-data-service.ts`：序列化 Chapter 时 strip `summary`（兜底清理老数据）和章节 embedding。
- `services/book-service.ts`：JSON 导出去掉 summary 字段。

**Service**
- 删除：`services/ai/tasks/chapter-summary-service.ts`、`services/ai/tasks/prompts/chapter-summary.ts`。
- 新增：`services/chapter-embedding-service.ts`（chunk 切分、upsert、query、delete）。
- 修改：`services/embedding-queue.ts`（泛化 target 类型）、`services/chapter-content-service.ts`（保存段落时触发防抖入队）。

**AI 工具**
- 删除：`search_chapter_summaries`、chapter_summary 任务类型（`task-status-tools.ts`）。
- 新增：`query_chapter`（`book-tools.ts`）。
- 修改：`get_chapter_info` 响应结构（去 summary）、`tools/index.ts` 白名单。

**Context / Prompt**
- `services/ai/tasks/utils/context-builder.ts`：`buildPreviousChapterSection` 只保留 title；`buildSingleParagraphDefaultContext` 删除摘要注入块。
- `services/ai/tasks/prompts/common.ts` 与 `runner.ts`：移除摘要相关说明，新增 `query_chapter` 工具使用指引。

**UI**
- 改造 `components/novel/BatchSummaryPanel.vue` → `BatchEmbeddingsPanel.vue`（入口与 icon 保留），同时展示章节与记忆 embedding 进度。
- `components/novel/ChapterContentPanel.vue`、`VolumesList.vue`、`composables/book-details/useBookDetailsPage.ts`：移除摘要显示/编辑。
- i18n：清理摘要相关键。

**测试**
- 删除 `chapter-summary-service`、`task-status-tools` 中的 chapter_summary 用例。
- 新增 `chapter-embedding-service` 与 `query_chapter` 工具测试。
