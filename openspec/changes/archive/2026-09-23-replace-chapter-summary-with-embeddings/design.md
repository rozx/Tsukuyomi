## Context

项目当前维护两套并行的"章节辅助理解"机制：

1. **Chapter.summary 文本摘要**：由 `ChapterSummaryService` 调用 AI（使用 `termsTranslation` 模型）生成，存在 `Chapter.summary` 字段里，随 book 对象走 Gist 同步。用于三处自动注入 prompt（前章上下文、单段润色上下文、AI 工具 `search_chapter_summaries` 关键词搜索）。
2. **Memory embedding**：`EmbeddingService`（EmbeddingGemma 300M ONNX / 256 维 Matryoshka / q4 量化 ~195MB）+ `EmbeddingQueue`（批处理 8 条/批，本地异步）+ 三信号打分（语义/关键词/时间衰减）。Memory 字段 `embedding` 在 Gist 序列化时被 strip，仅本地重算。

章节摘要的问题：AI 生成慢/贵、文本语义压缩有损、关键词搜索召回精度受写法影响大。嵌入基础设施已经成熟，完全可以接手"章节级语义理解"的职责。

本变更把 summary 这条线整体替换为章节多向量嵌入 + `query_chapter` 工具，prompt 自动注入完全移除，改由 AI 按需调工具获取上下文。

约束：
- 保持 Gist 同步不上传 embedding（带宽/一致性风险）。
- 不引入新的外部依赖。
- 复用既有 `EmbeddingService` / `EmbeddingQueue` 的 pipeline 与进度事件，避免分裂两套调度。
- 译文和原文都参与嵌入，但译文可能阶段性缺失。

## Goals / Non-Goals

**Goals:**

- 删除 `Chapter.summary` 字段与所有生成/显示/AI 工具路径，代码侧一次性清理。
- 每章以多个 chunk 向量的形式建立可检索的语义索引；`query_chapter` 工具给 AI 一个自然语言入口，返回的 preview 够让 AI 判断是否需要继续调 `get_chapter_info`。
- 章节 embedding 跟随段落原文/译文变更自动更新（防抖），用户无感。
- Batch embeddings popup 让用户对 章节 embedding 与 记忆 embedding 的进度可见，并能回填/重算。
- 新设备首次同步后，后台 backlog 扫描静默补齐。

**Non-Goals:**

- 不做段落级 embedding（粒度过细，索引/存储代价大；当前任务范围内章节级足够）。
- 不做跨书检索（保持按 bookId 隔离）。
- 不改 Memory 相关的检索/打分逻辑，不改三信号打分的权重与预算。
- 不引入专门的向量数据库（WASM/SQLite-vec 之类）——IndexedDB 内自己做内存里打分已够用（一本书章节数 ≤ 几百，chunk 数 ≤ 数千）。
- 不试图"兼容旧摘要"或提供摘要导出/备份工具（决策：静默删除）。

## Decisions

### D1. 每章多向量（C）而非单向量或朴素截断

**选择**：每章按段落边界切成多个 ~1500 字符的 chunk，每个 chunk 一条 256 维向量。查询时对所有 chunk 算余弦相似度，按 `chapterId` 聚合（`chapterScore = max chunkScore`）。

**替代方案**：
- A 朴素截断（只 embed 前 3500 字）：实现最简单但章节后半完全搜不到。
- B 分片 mean-pool（多个 chunk 向量平均后存一个）：存储仍是单向量但平均后语义糊，定位不到具体事件。

**理由**：轻小说章节常见 5–15k 字，A/B 对章节后段的召回都很差。C 的存储代价在接受范围（一本 300 章书 × 平均 8 chunks = 2400 条向量，每条 256 维 × 4B = 1KB，合计约 2.4MB），换来的是章节内任意段落都能召回。`max` 聚合保证了"某 chunk 强相关 → 整章得分高"，这和 AI 想要的语义正好对齐。

### D2. 嵌入输入 = 每段 `原文\n译文` 拼接

**选择**：chunk 内的每个段落以 `${originalText}\n${selectedTranslationText}` 拼接，段落之间换行分隔。译文用 `selectedTranslationId` 对应的 translation；段落未翻译时只拼原文。

**替代方案**：
- 纯原文：查询走原文语义，但用户经常用中文 query，跨语言相似度受限于 Gemma 的多语言能力。
- 纯译文：翻译未完成时章节不可搜。
- 原文/译文各一条向量：存储 × 2，打分需合并。

**理由**：EmbeddingGemma 是多语言模型，原文+译文同时提供让中/日 query 都能匹配；译文缺失时回退成纯原文，不会让章节"不可搜"。翻译推进时 embedding 会随防抖自动更新，从"日文向量"过渡到"日文+中文向量"。

### D3. Chunk 切分：沿段落边界、目标 ~1500 字符

**选择**：扫描章节段落列表，累积字符数达到 ~1500 时切断（不切段落），生成下一个 chunk。单个段落超过 1500 时独占一个 chunk。

**替代方案**：固定字符窗口滑动切分、按句子切、按 token 切。

**理由**：段落是翻译的最小语义单位，不破段落能保证译文/原文的对应关系。1500 字符留给 EmbeddingGemma 2048 token 上下文一倍富余（中日文 1 char ≈ 1 token 不到）。

### D4. 存储：独立 IndexedDB store `chapter-embeddings`

**选择**：新 store，主键 `${chapterId}:${chunkIndex}`，建索引 `by-chapterId` 与 `by-bookId`。字段 `{ chapterId, bookId, chunkIndex, vector: number[256], textSnippet: string, model: string, updatedAt: number }`。

**替代方案**：把 embedding 塞进 `Chapter` 对象的新字段。

**理由**：Chapter 是 `Book.volumes[].chapters[]` 结构，整个 book 是 Gist 同步的基本单元。把几百到几千个向量嵌进去会让 book 对象膨胀到 MB 级，即便序列化时 strip 也容易漏。独立 store 语义清晰（本地资源，不同步），且可以按 chapterId 批量删除。`textSnippet` 冗余存 chunk 的前 200 字，给 `query_chapter` 的 preview 直接用，省一次章节内容加载。

### D5. 触发策略：per-chapter 60 秒防抖

**选择**：
- 段落 `text` 或任一 translation 变更 → 标记章节脏，60 秒防抖后整章重算（所有 chunk）。
- 新建章节（爬虫导入/手动添加）→ 立即入队（无防抖）。
- 章节被删除 → 立即按 `by-chapterId` 清理对应 embeddings。
- `MODEL_VERSION` 变化 → 页面加载时扫描所有章节，embeddings 缺失或模型版本不一致的入队（backlog）。

**替代方案**：
- 每次段落保存都入队：短时间内（如批量翻译）会无意义重算几十次。
- 章节级增量（只重算变动段落所在的 chunk）：实现复杂，收益小（章节级 embedding 本来就不频繁查）。

**理由**：整章重算一次 ~8 次推理（~1-3 秒），可以接受；防抖把密集编辑合并为单次重算。

### D6. EmbeddingQueue 泛化：统一调度 memory 与 chapter

**选择**：`EmbeddingQueue` 的队列项从 `memoryId` 改为 `{ kind: 'memory' | 'chapter', id }`；批处理时按 kind 分路持久化。

**替代方案**：新建 `ChapterEmbeddingQueue`。

**理由**：两者共享 `EmbeddingService.embedBatch`，分两个队列会让 pipeline 预热、暂停/恢复、进度事件都重复。统一队列也方便 UI 展示总进度。

Progress event 结构扩展为 `{ total, completed, pending, etaMs, running, paused, breakdown: { memory: {...}, chapter: {...} } }` 供 UI 分开显示。

### D7. `query_chapter` 返回中粒度

**选择**：
```json
{
  "matches": [
    { "chapter_id": "...", "title": "...", "score": 0.87, "preview": "chunk 前 200 字..." },
    ...
  ]
}
```

**替代方案**：
- 瘦（仅 id/title/score）：AI 需再调 `get_chapter_info`。
- 胖（含章节全文）：多章合计极易爆 token。

**理由**：preview 来自**匹配到的 chunk**（不是章节开头），让 AI 看到"为什么匹配"，多数情况下一次调用够用；需要全文时再调 `get_chapter_info` 不算浪费。

### D8. Prompt 自动注入全部移除（α）

**选择**：
- `buildPreviousChapterSection`：退化为只注入 title（供 AI 知道章节序列存在）。
- `buildSingleParagraphDefaultContext`：删除"当前章节摘要"注入块。
- 翻译/润色/校对的 system prompt 里增加一小节说明 `query_chapter` 的使用场景与返回格式。

**替代方案**：β 自动 embedding 检索注入原文片段；γ 机械窗口裁切（前章结尾 N 字）。

**理由**：β 会稳定地占用 prompt token 预算（每个 chunk 都多几 KB），AI 未必用得上；γ 过于粗暴且不适配多种章节长度。α 让 AI 按需取，更符合 tool-using agent 的架构。

### D9. Gist 同步：strip 章节 embedding

**选择**：
- `sync-data-service.ts` 序列化 Book 时，不包含 chapter-embeddings store 的数据（和 memory embedding 同构，本地资源）。
- 老数据里的 `Chapter.summary` 字段：序列化前也 strip（防止残留的摘要把本地删干净又被其他设备推回来）。
- 新设备同步完成后，`EmbeddingQueue.enqueueChapterBacklog(bookId)` 在书籍页面首次打开时触发。

**替代方案**：跨设备传输 embedding（省 CPU）。

**理由**：模型版本不一致或浏览器不同（Transformers.js 的 q4 在 CPU/WebGPU 上数值也可能有微差）会导致 embedding 语义漂移。本地重算是权威。

### D10. 迁移：静默删除

**选择**：代码侧直接移除 `Chapter.summary` 的定义、读写点、UI 入口；老数据库里的 summary 字段不主动清理（IDB schema 无 summary 也能读），序列化上传时 strip。

**替代方案**：在设置里提供"导出摘要"按钮、数据迁移对话框。

**理由**：用户已明确选择静默删除；长期维护两条路径得不偿失。老数据 `Chapter.summary` 留在 IDB 里是僵尸字段，不影响任何读写路径。

## Risks / Trade-offs

- **[Risk]** 用户首次切到新版后，所有章节都要本地重新 embed，可能数十分钟。 → **Mitigation**：后台入队 + 进度 UI 可见 + 不阻塞阅读/翻译主流程；`query_chapter` 在有部分 embedding 时就能返回部分结果。
- **[Risk]** 短章节或无译文章节的 embedding 信号弱，search 效果差。 → **Mitigation**：显示 score；AI 可用 score 阈值过滤；长章节加权本身靠 max 聚合解决。
- **[Risk]** 防抖 60 秒下，刚翻译完立即调 `query_chapter` 可能命中旧 embedding。 → **Mitigation**：`query_chapter` 的返回包含 chunk 的 `updatedAt`，必要时可以文档说明该语义；另提供 `force: true` 参数（可选，暂不实现）。
- **[Risk]** `MODEL_VERSION` 升级时全库重算对老设备是大负担。 → **Mitigation**：复用既有 queue 的暂停/恢复；UI popup 里显式提示"模型升级，正在重建"。
- **[Trade-off]** 多向量存储 ~2.4MB/300 章，IndexedDB 总量上非瓶颈但会让导出/备份略大；通过独立 store 隔离解决。
- **[Trade-off]** 用户失去了"快速阅读章节摘要"的能力（以前摘要在 UI 上可见）。 → 可以接受：摘要在项目里一直是 AI 产物，用户几乎不做编辑，读原文/译文是主要行为。

## Migration Plan

1. 新版发布后，旧库中 `Chapter.summary` 的 IDB 字段静默保留；所有读路径已移除，不会再展示或使用。
2. 书籍页面首次加载时，`EmbeddingQueue.enqueueChapterBacklog(bookId)` 扫描全书章节，对缺失或 MODEL_VERSION 不一致的入队。
3. Gist 同步首轮：本地计算完成后，manifest 的校验和不变（embeddings 不参与），无额外上传压力；旧设备拉回的 Book 对象里若还有 summary 字段会被忽略。
4. 回滚策略：单个 git revert 即可回退（代码删除是破坏性的，但数据侧因为"未清理老字段 + 独立新 store" 回滚安全）。

## Open Questions

- `query_chapter` 是否应默认只搜"当前书"？→ **决定**：是，从 `bookId` 自动注入（工具 handler 里已有 `bookId` context）。
- 是否需要在 popup 里提供"暂停/恢复"按钮？→ **决定**：复用现有 `EmbeddingQueue.pause/resume`，按钮加进新 popup。
- 章节 embedding 是否也进入记忆三信号打分系统？→ **Non-goal**，暂不合并；保持 `search_memories` 与 `query_chapter` 两条独立通路。
