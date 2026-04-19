## Why

`query_chapter` 当前对「具体场景 + 独特细节」类查询召回良好,但对「章节主题、人物个人回、系列标题、概括式描述」类查询定位不准 — Top-1 经常落到语义相邻而非目标章节。

根因有三:

1. **章节标题完全没参与索引** — 仅嵌入「原文+译文」chunk,纯标题型 query(如「修学旅行篇」)无锚点可用
2. **按 chapterId 取 max 的聚合方式赢家通吃** — 单个 1500 字 chunk 偶然语义高就胜出,章节整体相关性被忽略
3. **纯余弦无关键词融合、无归一化** — mean-pooled 多语言向量在同书同领域抱团,绝对相似度区分度低

[memory-scoring.ts](src/services/memory-scoring.ts) 已用 z-score 归一化 + 关键词部分匹配解决过同源问题,本次把同套思路下沉到章节检索。

## What Changes

- **新增 title chunk**: 给每章嵌入一条「章节标题 + 章节首段 ~200 字」的特殊 chunk
- **新增 `kind: 'title' | 'content'` 字段**: 区分 chunk 类型(**BREAKING** schema:IDB v10 → v11 migration,存量 chunk 回填 `kind: 'content'`)
- **改写 chapter chunk key 格式**: `${chapterId}:${chunkIndex}` → `${chapterId}:${kind}:${chunkIndex}`(title chunk 用 `${chapterId}:title:0`)
- **混合打分公式**: semantic(z-score 归一化的余弦)+ keyword(字面部分匹配)线性融合
- **聚合方式升级**: 章节级 semantic 取 `max(title_semantic, content_max, content_top3_mean)` —— 三路独立竞争,任一路强命中即赢
- **关键词通道**: title 字面分扫「章节标题 + 卷标题」,content 字面分扫各 chunk `textSnippet`,复用 [`calculateQueryKeywordScore`](src/services/memory-scoring.ts#L195)
- **批内 z-score 归一化**: 沿用 [`SPREAD_FLOOR`](src/services/memory-scoring.ts#L50) 兜底,本批向量抱团时降级到纯关键词
- **EmbeddingQueue backlog 扩展**: `findChaptersNeedingEmbedding` 识别「缺 title chunk」「title chunk model 过期」两种新情况,自动补嵌入(无需 bump `MODEL_VERSION`,存量 content chunk 不失效)
- **专名加权 + 中日别名归一**(round 2 — 基于 LLM 第二轮反馈): 复用 `Novel.terminologies` / `Novel.characterSettings.aliases` 构建专名字典 + 同义词组,query 时自动跨语言扩展(中文 query 也能命中日文记录)+ unit ∈ 专名表时命中分乘 `PROPER_NOUN_BOOST = 2.0`。
- **Title + content keyword 加性融合**(round 2): `keyword = max(title_kw, content_kw × 0.6)` → `keyword = min(1, title_kw + content_kw × 0.4)` —— 双命中真正比单命中分高
- **Identifier 抽取修 bug + 加权 + mismatch 惩罚**(round 3 — 基于 LLM 第三轮 10 query 实测 Top1 0/10): 修 `extractQueryUnits` 让圈号 ① ⑥ 与罗马数字 Ⅰ Ⅴ Ⅹ 这类单字符 identifier 不再被丢弃;新增 `IDENTIFIER_BOOST = 3.0` 高于专名加权;在 `queryChapters` 加 mismatch 惩罚:query 含 identifier 但章节标题缺该 identifier 时 `total × IDENTIFIER_MISMATCH_PENALTY = 0.3`,直击"星天 ⑤ / ⑥ / ⑦ 系列内部 Top1 不稳"
- **在线 TF-IDF 加权**(round 4 — LLM 反馈"含热门角色名的中文场景查询 Top1 仍跑偏角色主章"): 把固定 `PROPER_NOUN_BOOST` 改为**数据驱动**的 IDF —— `computeQueryUnitIdf(query, chunks)` 在线统计每个 query unit 在全书 chunk snippet 里的 document frequency,稀有 unit(如"新据点")拿 2.0× 权重、常见 unit(如"阿莉亚"在 40+ 章出现)仅 0.5× 抑制权重。Multiplier 优先级互斥(取第一项,不复合):identifier(结构性)→ idf(数据驱动)→ properNoun(配置 fallback)。直接反转"角色词把结果拉去角色主章"
- **段落级粒度 + IDF 收紧**(round 5 — LLM 反馈"章节级粗排过强、细节事件建模过弱"): chunk 目标字符数从 1500 缩到 **400**(段落级粒度,1-3 段一 chunk),提升 chunk 语义焦点和 IDF 区分度。新增 `CHAPTER_MODEL_VERSION = MODEL_VERSION + 'cs400'` 触发全书 chapter chunks 重嵌(memory 不受影响)。同时 IDF multiplier 收紧:`0.5 + 1.5×idf` → `0.3 + 1.7×idf`,常见词压更低

## Capabilities

### New Capabilities

(无)

### Modified Capabilities

- `chapter-embedding-search`: 章节嵌入新增 title chunk 类型;查询路径从纯余弦+max 聚合升级为「语义(z-score 归一化的多路 max)+ 关键词(字面匹配)」混合打分

## Impact

**代码**:
- [`src/models/chapter-embedding.ts`](src/models/chapter-embedding.ts) — 新增 `kind` 字段
- [`src/utils/indexed-db.ts`](src/utils/indexed-db.ts) — `DB_VERSION` 10→11,upgrade 中给存量 chunk 回填 `kind: 'content'`、改 key 格式
- [`src/services/chapter-embedding-service.ts`](src/services/chapter-embedding-service.ts) — 核心改写:`embedChapter` 多嵌入一条 title chunk;`queryChapters` 重写打分聚合逻辑;`findChaptersNeedingEmbedding` 加 title 缺失判断
- [`src/services/embedding-queue.ts`](src/services/embedding-queue.ts) — backlog 扫描复用上面的判断
- [`src/services/memory-scoring.ts`](src/services/memory-scoring.ts) — 可能小幅抽取 `calculateQueryKeywordScore` 让它适合被章节检索调用(无逻辑改动)
- 新增测试 `src/__tests__/chapter-embedding-hybrid-scoring.test.ts` 与 `src/__tests__/chapter-embedding-migration-v11.test.ts`

**数据**:
- 用户的 IndexedDB 自动 migration 到 v11,**无数据丢失**(只回填字段、改 key)
- 存量章节缺 title chunk → EmbeddingQueue 后台自动补,**不影响现有 content chunk**
- 不需要全量重新嵌入

**API / 提示词**:
- `query_chapter` 工具签名不变(`{ query, limit }` → `{ chapter_id, title, score, preview }[]`)
- 提示词([common.ts:321](src/services/ai/tasks/prompts/common.ts#L321) 与 [translation.ts:49](src/services/ai/tasks/prompts/translation.ts#L49) / [assistant.ts:17](src/services/ai/tasks/prompts/assistant.ts#L17))可能微调措辞,反映"标题/系列名也能命中"的新能力

**风险**:
- **存量数据失效极低**:仅多一次自动 migration + title chunk 后台补嵌入;若 IDB upgrade 失败,fallback 到旧库(整个 upgrade 事务回滚)
- **embedding 调用量增长**:每章多 1 次 embed(title chunk),全书相对原成本增加 ~10-20%(每章原本 5-15 个 content chunk)
- **打分公式参数为经验值**:Top-K=3、kw 权重 1.0/0.6、总权重 0.65/0.35 —— 留为常量供后续 eval 调整,不引入设置项
