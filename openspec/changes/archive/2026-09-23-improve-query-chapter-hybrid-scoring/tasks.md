## 1. 数据模型与 IDB Migration

- [x] 1.1 在 [`src/models/chapter-embedding.ts`](src/models/chapter-embedding.ts) 上为 `ChapterEmbedding` 增加 `kind: 'content' | 'title'` 字段(必选),并补 jsdoc 说明 title chunk 的语义
- [x] 1.2 在 [`src/utils/indexed-db.ts`](src/utils/indexed-db.ts) 把 `DB_VERSION` 从 10 提升到 11,在 `upgrade` handler 内新增 `oldVersion < 11` 分支:遍历 `chapter-embeddings` store,给每条记录补 `kind: 'content'`,并按新 key 格式 `${chapterId}:content:${chunkIndex}` 重写(删除旧 key)
- [x] 1.3 更新 [`src/utils/indexed-db.ts`](src/utils/indexed-db.ts) 顶部的 `DB_VERSION` 注释,说明 v11 新增 `kind` 字段及复合 key 格式
- [x] 1.4 编写 `src/__tests__/chapter-embedding-migration-v11.test.ts`,覆盖三种状态的 migration:空 store / 全量旧 chunk / 部分章节有数据

## 2. ChapterEmbeddingService — Title Chunk 嵌入

- [x] 2.1 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) 增加常量 `TITLE_INPUT_MAX_CHARS = 300`、`TITLE_CHUNK_INDEX = 0`,并在文件顶部的 jsdoc 块描述新存储布局(content + title 双 kind)
- [x] 2.2 实现 `composeTitleChunkInput(chapterTitle: string, paragraphs: Paragraph[]): string | null` 工具函数:跳过空段,取首段,与 `[章] ${chapterTitle}` 拼接(标题为空则只用首段),截断到 300 字符;无非空段返回 `null`
- [x] 2.3 改写 `embedChapter(chapterId)`:既生成 content chunks(原有路径),也生成 title chunk(若可生成);把两类 chunk 一并送入一次 `embedBatch` 调用以共用模型 warmup
- [x] 2.4 改写 `writeChunksForChapter` 的事务:先按 `kind` 分别清除该章旧记录(`by-chapterId` cursor + `record.kind` 判断),再写入新记录,key 用 `${chapterId}:${kind}:${chunkIndex}`;保持单事务原子性
- [x] 2.5 编写 `src/__tests__/chapter-embedding-title-chunk.test.ts`,覆盖:正常嵌入(title + content 都成功)、章节无段落(无 title chunk)、首段为空白(跳到下一非空段)、标题为空(只用首段)

## 3. ChapterEmbeddingService — 混合打分查询

- [x] 3.1 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) 增加打分常量:`CHAPTER_SEMANTIC_WEIGHT = 0.65`、`CHAPTER_KEYWORD_WEIGHT = 0.35`、`TITLE_KW_WEIGHT = 1.0`、`CONTENT_KW_WEIGHT = 0.6`、`CONTENT_TOP_K = 3`、`CONTENT_MAX_BLEND_ALPHA = 0.6`(实施时新增 — design D3 修订:content 内部 blend 而非 max)
- [x] 3.2 从 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) 复用 `calculateQueryKeywordScore`、`SPREAD_FLOOR`、`Z_CLAMP` — 若需要导出新符号,只导不改逻辑
- [x] 3.3 改写 `queryChapters(bookId, query, limit)`:
  - 拉全书 chunks → 按 `model === MODEL_VERSION` 过滤(全 stale 抛同一 structured error)
  - 对所有 chunks 算 raw cosine,做全局 z-score(沿用 `scoreMemoriesBatch` 同款公式),应用 `SPREAD_FLOOR` 兜底(整批 stddev 不足时 normalized = 0,走纯 keyword)
  - 按 chapterId 分组,对每章计算:`title_norm`(若有 title chunk)、`content_max`、`content_top3_mean` → `content_semantic = α × content_max + (1-α) × content_top3_mean`,然后 `semantic = max(title_norm, content_semantic)`(D3 修订:同章内 top3_mean ≤ max,max-of-three 永远不让 top3_mean 起作用,改成内部 blend)
  - 对每章计算:`title_kw`(对 `${chapterTitle} ${volumeTitle}`)、`content_kw`(取每个 content chunk `textSnippet` 的 max)→ `keyword = max(title_kw × 1.0, content_kw × 0.6)`
  - `total = 0.65 × semantic + 0.35 × keyword`,排序取 top `limit`
  - `preview` 取最高 content chunk snippet;无 content chunk 时取 title chunk snippet
- [x] 3.4 把 `volumeTitle` 的查找逻辑加到 `queryChapters` 内的 `titleLookup`(目前只查 `chapter.title`,需要补查 `book.volumes[].title`)
- [x] 3.5 编写 `src/__tests__/chapter-embedding-hybrid-scoring.test.ts`,场景覆盖:
  - 标题命中型 query(title_norm 通道赢)
  - 具体场景型 query(content_max 通道赢)
  - 整章主题型 query(content_blend 让 broadly-relevant 章节胜出)
  - 关键词命中型(标题字面 / 正文字面)
  - 全书 chunk 抱团触发 SPREAD_FLOOR(降级到纯 keyword)
  - 章节缺 title chunk(title_norm = 0,其它通道仍工作)
  - 章节只有 1-2 chunk(top-K mean 自动退化为均值)
  - preview fallback、stale chunk 错误、总分公式

## 4. EmbeddingQueue Backlog 扫描扩展

- [x] 4.1 改写 `ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId)`:
  - 原条件保留(无 chunk / 任一 chunk model 过期)
  - 新增条件:有当前 model 的 content chunks 但**无 title chunk**,且该章可生成 title chunk(段落非全空)→ 加入返回列表
  - 反之,该章无任何非空段(永远生成不了 title chunk)→ 不加入(避免无限重试)
- [x] 4.2 在 [`src/services/embedding-queue.ts`](src/services/embedding-queue.ts) 确认 backlog 扫描调用了 `findChaptersNeedingEmbedding`,且对返回的章节统一走 `embedChapter` 全章重嵌路径(无需新增 enqueue 类型)
- [x] 4.3 编写测试覆盖 4.1 新条件:章节有 content chunk 但无 title chunk → 被识别;章节段落全空(永远生成不了 title)→ 不被识别

## 5. 提示词与文档更新

- [x] 5.1 微调 [`src/services/ai/tools/book-tools.ts`](src/services/ai/tools/book-tools.ts) 内 `query_chapter` 工具的 description,反映"现在标题/系列名/卷名也能命中"的新能力(去掉「标签式查询改用 list_chapters」的过度警告 — 现在标题型 query 也能命中了)
- [x] 5.2 微调 [`src/services/ai/tasks/prompts/common.ts:321`](src/services/ai/tasks/prompts/common.ts#L321) 与 [`assistant.ts:17`](src/services/ai/tasks/prompts/assistant.ts#L17) / [`translation.ts:49`](src/services/ai/tasks/prompts/translation.ts#L49) 的提示词,提到"标题/章节主题也是有效 query 类型",但保留"具体场景 + 独特细节"模板
- [x] 5.3 在 [`CLAUDE.md`](CLAUDE.md) 「关键设计」段更新章节嵌入的描述(原 max-cosine → 现 hybrid scoring + title chunk),保持简短

## 6. 验证与归档准备

- [x] 6.1 运行 `bun run lint && bun run type-check`,修掉所有报错
- [x] 6.2 运行 `bun test`,确认全部通过(1182/1186 通过,4 skip 是无关旧测试,本次新增的 4 个测试文件全绿)
- [ ] 6.3 手动测试:在开发模式下打开一本已嵌入的书,触发 IDB v11 migration → 检查 `chapter-embeddings` store 里所有记录都有 `kind: 'content'` 字段、key 格式为 `${chapterId}:content:${chunkIndex}` *(留待用户手动验证)*
- [ ] 6.4 手动测试:在该书上让 EmbeddingQueue 后台跑完 backlog,检查每章都补了 title chunk(`${chapterId}:title:0` key 存在) *(留待用户手动验证)*
- [ ] 6.5 手动测试:对比改造前后,用一组 typical query(标题型 / 具体场景型 / 概括型)调 `query_chapter`,记录 Top-1 准确率改进 *(留待用户手动验证)*
- [x] 6.6 运行 `openspec validate improve-query-chapter-hybrid-scoring --strict`,确认 spec 通过验证

## 7. 专名加权 + 中日别名映射(LLM 反馈第二轮)

> 第二轮 LLM 反馈:当前工具更像"标题/关键词检索器",对长自然语言、含日文专名的中文 query 弱。复用书的 `terminologies` / `characterSettings`(含 `aliases: Alias[]`,自带中日双语)做专名抽取 + 跨语言别名归一,代价低,直击痛点。

- [x] 7.1 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) 增加 `PROPER_NOUN_BOOST = 2.0` 常量并在 jsdoc 段说明:专名命中时 unit 命中分乘以该系数(再 clamp 到 [0, 1])
- [x] 7.2 在 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) 把 `calculateQueryKeywordScore` / `scoreSingleQueryAgainstMemory` 扩展为可选接受 `properNouns?: Set<string>`(每个 unit 命中分按系数加权;default 行为不变,旧调用方零影响),或导出一个并列函数 `calculateQueryKeywordScoreWithBoost(query, mem, properNouns, boost)` 二选一(选择代价小的那种) — 实施:走第一种,加可选 `KeywordScoringOptions` 参数
- [x] 7.3 在 `chapter-embedding-service.ts` 内新增 `buildBookAliasIndex(book): { properNouns: Set<string>, aliasGroups: string[][] }` 工具(实施时把签名简化:aliasGroups 用 string[][] 即可,不需要 Map key)
- [x] 7.4 在 `queryChapters` 内调一次 `buildBookAliasIndex(book)`,然后在 query 关键词打分前做**别名扩展**:把 query 里出现的任一别名,都扩展为整个同义词组(即 query 计分时,扩展后的 query 形如 "原 query + 所有同义词全部追加"),让中文 query 也能命中日文记录、反之亦然 — 单独导出 `expandQueryWithAliases` 工具便于测试
- [x] 7.5 在 `kwOnText` 调用前把扩展后的 query 喂进去;同时把 `properNouns` 传到 7.2 的扩展接口里,实现专名加权
- [x] 7.6 改 `keyword` 融合公式从 `max(title_kw × 1.0, content_kw × 0.6)` 改为 `min(1, title_kw + content_kw × 0.4)`(标题命中 + 正文命中线性叠加,封顶 1.0 — title 单独命中仍可达 1.0,但有正文加成时分数明显高于无加成);`CONTENT_KW_WEIGHT = 0.6` 常量删除,新增 `CONTENT_KW_ADDITIVE_WEIGHT = 0.4`
- [x] 7.7 编写 `src/__tests__/chapter-embedding-proper-noun-boost.test.ts`,覆盖:
  - `buildBookAliasIndex` 单元测试(空 / terminologies / characterSettings + aliases / 单字过滤 / lowercase)
  - `expandQueryWithAliases` 单元测试(正向 / 反向命中、多组、已含全部成员、无命中、空索引)
  - 集成测试:中文 query "莉莉花园" + 章节正文只含日文 "リリーガーデン" → 命中 ch-1
  - 集成测试:query 里专名 unit 与泛词 unit 同时存在 → 专名 boost 让含专名章节胜出
  - 集成测试:title + content 双命中 → keyword 分高于只 title 命中(title 部分命中场景)
  - 集成测试:书无 terminologies / characterSettings → 行为退化为旧逻辑(无 boost、无别名)
- [x] 7.8 运行 `bun run lint && bun run type-check && bun test`,确认全绿(1197/1201 通过,4 skip 是无关旧测试)
- [x] 7.9 运行 `openspec validate improve-query-chapter-hybrid-scoring --strict`,确认 spec 仍合法

## 8. Identifier 加权 + mismatch 惩罚(LLM 反馈第三轮)

> 第三轮 LLM 反馈实测:对章节 83【星天】⑥ 的 10 条 query Top1 命中 0/10,即便明确写"83 星天 ⑥"也只到第 2。根因:① `extractQueryUnits` 把 `⑥`(U+2466)和罗马数字这类单字符 identifier 直接丢弃,kw 通道完全失效;② 当前公式对"identifier 缺失"无惩罚,系列章节(星天 ⑤/⑥/⑦)的 title embedding 又高度相似,无法区分。

- [x] 8.1 在 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) `extractQueryUnits` 加 `IDENTIFIER_RUN = /[\u2460-\u24ff\u2160-\u217f]/g`(圈号 + 罗马数字),单字符即入 unit;`partialMatchLength` 放开 length=1 走直接 `includes` 检查
- [x] 8.2 在 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) export `isIdentifierUnit(unit)`:阿拉伯数字 / 中文数字(`〇一二三四五六七八九十百千` 组合)/ 圈号 / 罗马数字 → true
- [x] 8.3 扩展 `KeywordScoringOptions` 加 `identifierBoost?: number`;`scoreSingleQueryAgainstMemory` 中 unit 命中时,identifier 与 properNoun **取最大适用倍数**(不复合),clamp [0, 1]
- [x] 8.4 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) 加 `IDENTIFIER_BOOST = 3.0` 与 `IDENTIFIER_MISMATCH_PENALTY = 0.3`;`kwOnText` 透传 `identifierBoost`;新增 `extractIdentifiersFromQuery(query)` 函数;`queryChapters` 在 total 计算后,若 query 含 identifier 但章节标题(章 + 卷拼接)缺其中任一 → `total *= IDENTIFIER_MISMATCH_PENALTY`
- [x] 8.5 编写 `src/__tests__/chapter-embedding-identifier-boost.test.ts`,18 个用例覆盖:`isIdentifierUnit` 各类型 / 圈号单字符现在能命中 / IDENTIFIER_BOOST 加权(取最大不复合)/ 星天 ⑤/⑥ query "⑥" 应胜 / 阿拉伯章号 / 无 identifier query 不被惩罚 / 卷标题里有 identifier 也算命中 / 章节缺 identifier 被惩罚
- [x] 8.6 运行 `bun run lint && bun run type-check && bun test` 全绿(1215/1219 通过,4 skip 是无关旧测试),`openspec validate --strict` 通过

## 9. 在线 TF-IDF 加权(LLM 反馈第四轮)

> 第四轮 LLM 反馈实测:title 类 query 现在很稳,但 "阿莉亚看到【星天】新据点后想探险" 这类**含热门角色名的中文场景查询**仍 Top1 跑偏 90 章。根因:角色名在 `properNouns` 里拿固定 2× boost,而角色出现在 40+ 章 → 把所有"角色相关章"都误抬,场景细节词反而被压住。Round 4 用**数据驱动的 IDF**取代固定 properNoun boost 解决。

- [x] 9.1 在 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) `export extractQueryUnits`(供 chapter 检索抽 unit 算 IDF);`KeywordScoringOptions` 加 `idfWeights?: Map<string, number>` 字段
- [x] 9.2 重构 `scoreSingleQueryAgainstMemory` 的 multiplier 逻辑为**互斥优先级**(取第一项匹配,不复合):identifier → idf → properNoun fallback。注释说明 IDF 比固定 properNoun boost 鲁棒(角色名在多章出现时不会被误抬)
- [x] 9.3 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) 新增 `computeQueryUnitIdf(query, chunks)` 工具:
  - 用 `extractQueryUnits` 抽 query 的所有 unit
  - 按 chapterId 聚合所有 chunk(content + title)的 textSnippet,统计每个 unit 的 document frequency
  - 公式 `idf = log((N+1)/(df+1)) / log(N+1)` 归一化到 [0, 1]
  - **identifier unit 不进 IDF map**(它们走 IDENTIFIER_BOOST,优先级独立)
  - 在 `queryChapters` 里调用一次,把结果传给所有 `kwOnText` 调用(title + content 都用)
- [x] 9.4 编写 `src/__tests__/chapter-embedding-idf.test.ts`,13 个用例覆盖:
  - `computeQueryUnitIdf` 单元测试(空 / 稀有 unit / 完全没出现 / identifier 跳过 / 同章多 chunk 不重复)
  - IDF 在 calculateQueryKeywordScore 中的作用(稀有 boost / 常见抑制 / 与基线对比)
  - IDF 优先于 properNoun boost(单 unit partial 命中场景)
  - Identifier 即使有 IDF 也走 IDENTIFIER_BOOST
  - E2E:热门角色 + 稀有场景词 → 稀有词章节胜出(直击 LLM 反馈)
  - 回归:小书 IDF 区分度低不影响 properNoun fallback
- [x] 9.5 修旧 round 2 测试 `专名加权` — round 4 后用 6 章 corpus(1 章稀有专名 + 1 章主命中泛词 + 4 章 decoy 让泛词变常见)演示 IDF 主导。运行 `bun run lint && bun run type-check && bun test` 全绿(1227/1231 通过),`openspec validate --strict` 通过

## 10. 段落级粒度 + IDF 收紧(LLM 反馈第五轮)

> 第五轮 LLM 反馈:title/角色级 query 现在很稳,但**含具体场景词的 query 仍发散** ——"章节级粗排过强、细节事件建模过弱"。前 4 轮全在打分层加权,问题在 chunk 粒度本身:1500 字 chunk 含 5-10 段,具体场景的语义信号被同 chunk 内其它段落稀释,IDF 在 200 字 snippet 上区分度也粗。

- [x] 10.1 在 [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts):
  - `CHUNK_TARGET_CHARS` 从 1500 缩到 **400**(段落级粒度,1-3 段一个 chunk)
  - 新增 `CHAPTER_CHUNK_LAYOUT_VERSION = 'cs400'` 和 `CHAPTER_MODEL_VERSION = ${MODEL_VERSION}@cs400`
  - 把所有 chapter 内部对 `MODEL_VERSION` 的引用替换为 `CHAPTER_MODEL_VERSION`(`writeChunksForChapter`、`queryChapters`、`findChaptersNeedingEmbedding`)
  - 与 memory 共用的 `MODEL_VERSION` 不动 — memory 嵌入不受影响,只 chapter 触发 backlog 重嵌
- [x] 10.2 在 [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) IDF multiplier 从 `0.5 + 1.5 × idf` 收紧到 `0.3 + 1.7 × idf` —— 稀有上限不变(2.0×),常见词从 0.5× 进一步压到 0.3×,让锚点稀有词对排序的影响更激进
- [x] 10.3 更新失败的测试:
  - `chapter-embedding-idf.test.ts`:常见 unit 期望从 0.5 改为 0.3;IDF 优先 properNoun 测试的具体值从 0.833 改到 0.767(0.667×1.15)
  - `chapter-embedding-service.test.ts` / `chapter-embedding-title-chunk.test.ts`:从 import `MODEL_VERSION` 改为 import `CHAPTER_MODEL_VERSION`(写 chapter chunks 时存的 model 字段已变)
- [x] 10.4 运行 `bun run lint && bun run type-check && bun test` 全绿(1227/1231 通过,4 skip 是无关旧测试),`openspec validate --strict` 通过

> **用户感知**: 升级后,`CHAPTER_MODEL_VERSION` 不一致 → backlog 扫描把所有 chapter chunks 标 stale 自动重嵌。已嵌入的 N 章会显示 "0/N 处理中..." 几分钟到一小时(取决于书量)。Memory embeddings 不受影响。
