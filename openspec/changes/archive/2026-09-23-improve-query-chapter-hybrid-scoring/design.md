## Context

`query_chapter` 通过 `ChapterEmbeddingService.queryChapters` 实现:把每章按段落切成 ~1500 字符 chunk → EmbeddingGemma 256 维向量 → 与 query 余弦 → 按 chapterId 取 max → 排序。

实测反馈:具体场景类 query 召回准确,但「章节主题、人物个人回、系列标题」类查询 Top-1 经常偏到剧情簇邻居。诊断如下:

1. **章节标题完全没参与索引** — 只嵌入「原文+译文」chunk
2. **mean-pooled 多语言向量在同书同领域抱团** — 全书 chunk 余弦多落在 0.85-0.95,绝对相似度无区分度
3. **chunk 级 max 聚合赢家通吃** — 一个 1500 字 chunk 偶然语义高就胜出,章节整体相关性被忽略
4. **纯余弦,无关键词信号** — 强字面信号(如标题里的"修学旅行")利用不上

[`memory-scoring.ts`](src/services/memory-scoring.ts) 已用 z-score 归一化(`SPREAD_FLOOR=0.02`、`Z_CLAMP=2`)+ 关键词部分匹配(`calculateQueryKeywordScore` + `splitCompoundQuery`)解决过同源问题,本次复用同套思路下沉到章节检索。

约束:
- 不能让用户存量 chunk 失效(IDB 里可能成千上万条)
- 不引入新外部依赖、不改 embedding 模型
- 工具签名 `query_chapter(query, limit) → ChapterQueryMatch[]` 保持兼容
- 不引入用户可调设置(参数全为代码常量)

## Goals / Non-Goals

**Goals:**
- 「章节主题、系列标题、人物个人回」类 query 的 Top-1 准确率显著提升
- 不破坏现有「具体场景 + 独特细节」类 query 的召回能力
- 存量 IDB 数据无损 migration,不需要全量重新嵌入
- 打分逻辑可解释、可调试(每路信号在 breakdown 里可见)

**Non-Goals:**
- 不引入 LLM-based reranker(那是后续 C 档,本次范围外)
- 不做 query expansion / multi-query 融合
- 不让用户配置打分参数(权重为代码常量)
- 不改 embedding 模型 / 维度
- 不改 `query_chapter` 工具的输入输出签名

## Decisions

### D1. 用 `kind: 'title' | 'content'` 字段区分 chunk,而非用魔法值 `chunkIndex = -1`

**选择**:在 `ChapterEmbedding` 上新增 `kind: 'title' | 'content'` 字段,IDB schema bump 到 v11,migration 给存量 chunk 回填 `kind: 'content'`。Key 格式从 `${chapterId}:${chunkIndex}` 改为 `${chapterId}:${kind}:${chunkIndex}`。

**为什么**:
- 语义清晰,future-proof(后续若加「卷标题 chunk」直接扩 enum 不改 key)
- 避免 `chunkIndex = -1` 的魔法值在多处分支判断
- 复合 key 让 `by-chapterId` 索引扫描时按 chunk 类别分流更直接

**alternatives**:
- *标题 prepend 到每个 content chunk*:不需要新 schema,但要全量重算嵌入(bump `MODEL_VERSION` 触发 backlog),代价大;且标题信号在每个 chunk 里都被稀释,权重不可控。✗
- *新建独立 `chapter-title-embeddings` store*:语义最清晰,但要新 schema migration、新 backlog 扫描分支,改动最大。✗
- *复用 `chunkIndex = -1` 魔法值*:代价最小,但语义隐晦,扩展性差。✗

### D2. Title chunk 嵌入「章节标题 + 章节首段 ~200 字」

**选择**:title chunk 的嵌入输入为 `[章] ${章节标题}\n\n${首段全文,截断到 300 字}`(只取第一段,不跨段落)。卷标题信息**不**进嵌入,而是走「字面匹配」通道(D5)。

**为什么**:
- EmbeddingGemma 对很短的文本(纯标题 5-15 字)嵌入质量差,语义稀疏。比如「修学旅行 1」和「修学旅行 2」纯靠标题几乎区分不出
- 标题作为短前缀,嵌入模型会自动加权前部 token,起"主题提示"作用
- 首段往往包含视角人物、场景设定,给嵌入语义饱和度
- 卷标题走字面通道:卷名是强结构信号,字面匹配更稳(避免被嵌入抹平)

**alternatives**:
- *仅章节标题*:嵌入质量太差(短文本失效)。✗
- *标题 + 卷标题*(短文本拼短文本):仍然太短,且卷信息混入嵌入会污染章节主题信号。✗
- *标题 + 卷标题 + 首段*:首段会被前缀稀释。✗

### D3. 章节级 semantic = title vs content 两路 max,content 内部 blend max + top3_mean

**选择**:
```
content_semantic = α × content_max + (1-α) × content_top3_mean    // α = 0.6
semantic         = max(title_norm, content_semantic)
```
其中 `content_top3_mean` 是该章 content chunks(已 z-score 归一化)的 top-3 均值;chunk 数 < 3 时取全部 chunk 均值。

**为什么**:
- **标题 vs 内容用 max**:两路捕捉不同 query 类型(标题型 / 内容型),max 让任一路强命中都能赢,加权和会让专精一路的 query 被另一路稀释
- **内容内部用 blend(α=0.6)而非 max**:同一章内 `top3_mean ≤ max` 永远成立,如果用 `max(content_max, content_top3_mean)`,top3_mean 在 max 里永远不可能胜出 — "整章相关"信号被埋没。改用线性融合让 top3_mean 有实际权重,broadly-relevant 章节才能从 single-strong-chunk 章节里浮出
- α=0.6 偏向 max:保留"具体场景型"的检索效果(用户反馈已生效);0.4 给 top3_mean,提升"整章中等命中"章节排名

**alternatives**:
- *三路全 max* `max(title_norm, content_max, content_top3_mean)`:在初次实施时尝试过,但 top3_mean ≤ max 同章恒成立,这一路从不胜出 — 设计意图无法实现。✗
- *三路加权和*:专精一路的 query 会被另外两路稀释。✗
- *仅 max*(content 也只取 max):无法区分"整章相关"和"一段巧合",回到原问题。✗

### D4. 用 z-score 归一化(全书 chunk 池),沿用 `SPREAD_FLOOR` 兜底

**选择**:对全书所有 chunk(content + title 一起)的 raw cosine 做 z-score 归一化,映射到 `[0, 1]`(`(z + Z_CLAMP) / (2 × Z_CLAMP)` clamp 两端);若本批 raw cosine stddev < `SPREAD_FLOOR=0.02`,整批降级为纯关键词检索(semantic 设为 0,total 走 keyword 单通道)。

**为什么**:
- mean-pooled 多语言向量在同书同领域绝对余弦抱团(memory-scoring 同源问题);只有相对偏离度才有信号
- title chunk 和 content chunk 在同一分布上比较是对的 — 都是该书的语义向量,应同池子归一化
- `SPREAD_FLOOR` 兜底:抱团极端情况(如全书 chunk 余弦都在 0.92±0.01)时,z-score 噪声放大不可信,降级到纯关键词比胡乱排序好

**alternatives**:
- *不归一化*:回到原问题,绝对余弦无区分度。✗
- *分两池归一化*(title 池和 content 池分别 z-score):title chunk 数等于章节数,content chunk 数远多;两池的 z-score 不可比较,max-of-tracks 失去意义。✗

### D5. Keyword 通道分 title / content 两条,权重 1.0 / 0.6

**选择**:
```
title_kw   = calculateQueryKeywordScore(query, 章节标题 + " " + 卷标题)
content_kw = max over chunks: calculateQueryKeywordScore(query, chunk.textSnippet)
keyword    = max(title_kw × 1.0, content_kw × 0.6)
```

**为什么**:
- 标题字面命中是强信号(章节真就叫这个名)
- 正文字面命中较弱(很多章会偶然提到关键词)
- 用 `max` 而非加权和:让任一路强命中都能赢,语义和 D3 一致
- `content_kw` 只扫 `textSnippet`(前 200 字)而非全文 — 全文扫太贵(每章可能几万字),且 snippet 已能挡住"完全不相关"的章节
- 复用 `calculateQueryKeywordScore` 已有的 `splitCompoundQuery` + CJK 部分匹配逻辑,代码重用

**alternatives**:
- *只用 title_kw*:漏掉「正文关键词命中但标题不含」的情况(比如查询独特术语)。✗
- *扫全文*:每章可能几万字,N 个章节 × M 个 chunk 全文扫描 IO 成本太高。✗

### D6. 总权重 0.65 × semantic + 0.35 × keyword

**选择**:`total = 0.65 × semantic + 0.35 × keyword`,与 [`SCORING_WEIGHTS`](src/services/memory-scoring.ts#L12) 同源(0.6 + 0.3 + 0.1,这里去掉 recency 那 0.1 重分配)。

**为什么**:
- 与 memory-scoring 体系认知一致,降低维护和直觉负担
- 语义为主、关键词兜底是正确的 default(query 大多自然语言,字面命中率不稳定)
- 当 semantic 走兜底降级到 0(`SPREAD_FLOOR` 触发),`total = 0.35 × keyword`,即使天花板降到 0.35 也仍能区分"完全不相关"和"字面强命中"

### D7. EmbeddingQueue backlog 扩展:识别"该章缺 title chunk"

**选择**:`findChaptersNeedingEmbedding(bookId)` 增加判断逻辑:
- 该章无任何 chunk → needs embed(原行为)
- 该章有 chunk 但任一 chunk `model !== MODEL_VERSION` → needs embed(原行为)
- **新增**:该章有 content chunks 但**无 title chunk** → needs embed(只补 title 不动 content)

`embedChapter(chapterId)` 内部:
- 总是生成新的 title chunk + content chunks
- 在写入事务里,先按 `kind` 分别清除旧记录(content 清旧 content、title 清旧 title)
- 注意:如果只缺 title chunk(content 已是当前 model),理论上可以走"增量补 title"的轻路径节省 N-1 次 content 嵌入。但增量路径会引入更多分支和原子性陷阱,本次**不做** — 一律走全章重嵌(成本可接受,每章 5-15 次 embed)

**为什么**:
- 不 bump `MODEL_VERSION`:存量 content chunks 不失效,用户感知最小
- 全章重嵌 > 增量补 title:简化原子性、避免 partial state(若增量补 title 写失败,章节处于"缺 title"状态;全章重嵌的事务更易推理)

### D11. 段落级 chunk 粒度 + IDF 收紧(round 5)

**背景**:LLM 反馈第五轮 — "章节级粗排过强、细节事件建模过弱"。前 4 轮全部在打分层加权,但具体场景查询仍发散。问题在 chunk 粒度本身:1500 字 chunk 含 5-10 段,具体场景的语义信号被同 chunk 内其它段落稀释,IDF 在 200 字 snippet 上区分度也粗。

**选择**(双管齐下):

1. **chunk 缩小**:`CHUNK_TARGET_CHARS` 1500 → 400(段落级粒度,1-3 段一 chunk)
2. **chapter 专用 model version**:新增 `CHAPTER_MODEL_VERSION = MODEL_VERSION + '@cs400'`,backlog 自动检出 stale 重嵌
3. **IDF multiplier 收紧**:`0.5 + 1.5×idf` → `0.3 + 1.7×idf`,常见词从 0.5× 压到 0.3×,稀有上限 2.0× 不变

**为什么**:
- chunk 缩小直击根因:每个 chunk 一个场景为主,具体事件查询能精准命中含该事件的 chunk;同 chapter 多个 chunk 混合不同场景时,top3_mean 通道也更准
- IDF 在更细粒度的 snippet 上 df 更精确:同一个角色名在原 1500 字 chunk snippet 里几乎章章命中,在 400 字 chunk snippet 里能区分出真正聚焦该角色的章节
- chunk 缩小本质是改变 chunk 内容边界(同向量空间),不是换嵌入模型 → 用单独的 `CHAPTER_MODEL_VERSION` 而非 bump 全局 `MODEL_VERSION`,memory 嵌入不受影响

**alternatives**:
- *只改 IDF 不改 chunk*:不足以改变 chunk 级粗排过强这个根本问题。✗
- *segment 到单段(1 段 = 1 chunk)*:对话段太短(单行 < 30 字),嵌入语义稀。400 字平均 1-3 段更平衡。✗
- *bump 全局 MODEL_VERSION*:memory 也跟着 stale 重嵌,代价无谓。✗
- *动态多分辨率*(同时存 1500 字粗 chunk 和 400 字细 chunk):存储 5x,代码复杂,收益不清。✗

**风险**:
- 用户感知:升级后 backlog 跑一段时间(数百到数千 chunk × 嵌入时间)。Tsukuyomi 已有进度展示,可接受
- 存储增加 ~4×:每章 5-10 chunk → 20-40 chunk。256 维 float = 1KB → 大书可能从 1MB 到 4MB,无压力
- 嵌入失败概率提升:更多 chunk → 更多嵌入调用。`embedChapter` 已 catch 单个 chunk 失败不阻塞其它,影响小
- IDF 收紧到 0.3 — 命中常见词的章节最低分明显降低。若 LLM 反馈过激(误杀有效结果),可调回 0.4 或 0.5。常量集中

### D10. 在线 TF-IDF 加权取代固定 properNoun boost(round 4)

**背景**:LLM 反馈第四轮 — title/标签型 query 现在很稳,但 "阿莉亚看到【星天】新据点后想探险" 这类**含热门角色名 + 稀有场景词的中文 query** Top1 仍跑去 90 章(角色主章)。根因:`PROPER_NOUN_BOOST = 2.0` 是**配置驱动**的(查 `Novel.characterSettings`),不看角色实际频率。"阿莉亚"在 40+ 章出现 → 每章都被 2× 放大 → 排名里全是"角色相关章",场景细节词("新据点"在 1-2 章)反而被压住。

**选择**:把 properNoun boost 改为**数据驱动的 IDF**。`queryChapters` 加载所有 chunks 后,调 `computeQueryUnitIdf(query, chunks)`:

- 抽 query 的所有非 identifier unit
- 按 chapterId 聚合 snippet,统计每个 unit 出现在多少**不同章节**(df)
- `idf = log((N+1)/(df+1)) / log(N+1)` 归一化到 [0, 1]
- 把 idf map 通过 `KeywordScoringOptions.idfWeights` 传到 `kwOnText`
- 单元 multiplier:`0.5 + 1.5 × idf`,稀有(idf=1)→ 2.0×、最常见(idf=0)→ 0.5× 抑制

Multiplier 选取**互斥优先级**(取第一项匹配,不复合):
1. `identifier` → IDENTIFIER_BOOST(结构性,与频率无关)
2. `idfWeights` → IDF-based(数据驱动)
3. `properNouns` → PROPER_NOUN_BOOST(配置 fallback,memory 注入路径仍走这条)

**为什么**:
- LLM 反馈直接对症:角色名在很多章 → IDF 自动低权重 → 不再误抬"角色相关章"
- "新据点"、"屋敷"这类只在少数章出现的具体场景词自动拿高权重 → 场景定位能力提升
- 不需新数据 / 不需 LLM 调用,chunks 在 queryChapters 早就加载过 — 在线计算几乎免费(~5 unit × ~500 chunk = 2500 次字符串 includes)
- 替代固定 properNoun 而非叠加:本来 properNoun 假设的"专名 = 重要"在角色多章出现时崩塌,IDF 是更鲁棒的"重要性"度量。在大书上 IDF 自然会让稀有专名拿高权重(比如反派只在 2 章出现 → 高 IDF),所以专名信息没丢

**alternatives**:
- *IDF 与 properNoun 取最大*:角色名仍能拿固定 boost,根本问题没解决。✗
- *IDF 与 properNoun 相乘*:复合放大不可控,且依然受配置影响。✗
- *只用 IDF 完全删除 properNoun*:memory 注入路径(`scoreMemory`)目前不走 chapter chunks,无法算 IDF;删除会让记忆打分 fallback 路径行为变差。保留 properNoun 作为 chapter 之外路径的兜底。✓

**风险**:
- snippet(前 200 字)而非全文计算 df → 精度有损,但 snippet 已是章节"代表性片段"。可接受
- 小书(< 5 章)IDF 区分度低 — 比如 round 2 测试用 2 章演示"专名加权"在 IDF 下不再奏效。已修测试用 6 章 corpus 演示新行为
- properNoun fallback 在 chapter 路径里基本死代码(IDF 总能算出来,除非 chunks 为空) — 接受,memory 路径仍依赖它

### D9. Identifier 抽取修 bug + 加权 + mismatch 惩罚(round 3)

**背景**:LLM 实测对章节 83【星天】⑥ 的 10 条 query Top1 命中 0/10,即使 query 明确写 "83 星天 ⑥" 也只到第 2 名。两个根因:

1. **`extractQueryUnits` bug**:正则 `CJK_RUN` 仅 `\u3040-\u309f \u30a0-\u30ff \u4e00-\u9fff`,`ALPHA_RUN` 要求长度 ≥ 2 → 圈号 ⑥(U+2466)、罗马数字 Ⅵ(U+2165)被静默丢弃。query "星天 ⑥" 实际等价于 "星天",⑥ 区分功能形同虚设
2. **无 identifier 缺失惩罚**:同系列章节(星天 ⑤ / ⑥ / ⑦)title embedding 高度相似,z-score 后差异更被压平;keyword 通道虽然现在能加权,但少 1 个 unit 的章节平均分只低一点点,无法把"对的章节"压过"像的章节"

**选择**(三处改动叠加):

1. 加 `IDENTIFIER_RUN = /[\u2460-\u24ff\u2160-\u217f]/g` 到 `extractQueryUnits`,**单字符即入 unit**(它们都是低噪声字符,不像单字汉字到处误命中);`partialMatchLength` 放开 length=1 走直接 `includes`
2. export `isIdentifierUnit(unit)`(阿拉伯数字 / 中文数字 / 圈号 / 罗马数字 → true);新增 `IDENTIFIER_BOOST = 3.0`,unit 命中且是 identifier → 命中分乘以 3.0(clamp [0, 1])。识别规则与专名 boost 共存,**取最大不复合**
3. 新增 `IDENTIFIER_MISMATCH_PENALTY = 0.3`:`queryChapters` 在 total 计算后,若 query 含任一 identifier 但候选章节标题(章 + 卷拼接)缺该 identifier → `total *= 0.3`

**为什么**:
- (1) 是 bug fix,无悬念
- (2) 让 identifier 命中比一般专名命中权重更高 — 用户写 identifier 通常表示精确意图
- (3) 是 LLM 反馈直接要求的"硬过滤"软化版:不直接 drop 章节(留给"用户记错章号"等模糊场景兜底),但 0.3 倍折扣足够让正确章节超越最强的非 identifier 命中章节

**alternatives**:
- *把识别 unit 单字符过滤完全放开*:风险大,单字汉字"山"、"火"、"剑"会到处误命中。✗
- *硬过滤(直接剔除 identifier 不符的章节)*:用户记错章号时无法找到。✗
- *惩罚系数更激进(0.1 / 0.05)*:模糊匹配场景体验差。0.3 是经验折中。✗
- *只惩罚一次(query 有多个 identifier 时只看是否全缺)*:复杂度上去但收益不明显。✗

**风险**:0.3 是经验值。若实测仍嫌不够严,可再调到 0.2;若误杀场景多,可调到 0.4。常量集中在 `chapter-embedding-service.ts` 顶部,方便按 eval 反馈调整。

### D8. 专名加权 + 跨语言别名归一(基于 Novel 的 terminologies / characterSettings)

**选择**:在 `queryChapters` 内基于当前 book 的 `terminologies` 和 `characterSettings`(后者带 `aliases: Alias[]`,每条 alias 自带 name + translation 双语)构建两份索引:

- `properNouns: Set<string>` — 所有出现过的中/日专名(name + translation.translation + aliases 双语)
- `aliasGroups: Array<string[]>` — 每个术语/角色一个组,组内成员互为别名

打分流程改造:

1. **Query 别名扩展**:遍历 `aliasGroups`,只要 query 字面包含其中一个成员,就把同组其它成员追加到 query 末尾(空格分隔),让中文 query 也能匹配日文记录
2. **Per-unit 专名加权**:`scoreSingleQueryAgainstMemory` 在累加 unit 命中时,如果 unit ∈ `properNouns`,该 unit 的命中分乘以 `PROPER_NOUN_BOOST = 2.0`,clamp 到 `[0, 1]`
3. **Title + content 加性 keyword**:`keyword = min(1, title_kw + content_kw × 0.4)`(从原 max 改成 cap 加性 — 标题命中仍可单独到 1.0,但有正文加成时分数显著高于无加成)

**为什么**:
- LLM 反馈第二轮:对长自然语言、含日文专名的中文 query 弱;泛词("马车"、"森林")带偏排序
- Tsukuyomi 已经在 `Novel.terminologies` 和 `Novel.characterSettings.aliases` 里维护了书的中日双语专名表(本来就为翻译上下文用的)— 完全不用新数据结构、不用新同步、不用 LLM 调用
- 加性 keyword 让"标题 + 正文双命中"的章节真正排在"只标题命中"前面,符合 LLM 的"标题命中 + 正文命中应叠加"反馈

**alternatives**:
- *用 LLM 抽专名*:每次查询多一次 LLM call,延迟和 token 都贵。✗
- *预计算 IDF 降权泛词*:精度更高,但要每本书维护语料统计、跨章节修改时维护成本高。本次跳过,放后续 C 档。✗
- *把别名预编入 chunk embedding*:全量重嵌成本高;且向量空间不擅长处理硬同义关系,不如字面归一直接。✗

**风险**:依赖术语表完整度。用户没维护 `terminologies` / `characterSettings` 的话,这一档提升幅度有限 — 但翻译流程本来就鼓励维护这些,数据通常完整。无术语表时退化为纯第一档行为(无 boost、无别名),不会变差。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **IDB v10→v11 migration 失败** → 用户打不开应用 | upgrade 在同一事务内完成,失败回滚到 v10;migration 仅做"读旧 chunk 写回带 kind 字段 + 新 key";migration 测试覆盖空 store / 旧 chunk / 部分章节缺数据三种状态 |
| **title chunk 嵌入失败但 content chunk 写入成功** → 该章 query 时 title_norm = 0 | `embedChapter` 整体事务:任一 chunk 写失败回滚整章;backlog 下次扫描会重试 |
| **首段过长(>300 字)被截断,可能切到句子中间** | 截断在字符级(`slice(0, 300)`),嵌入模型对截断鲁棒;首段一般 <300 字,极少触发 |
| **首段为空(章节开头是空白段落)** → title chunk 退化为纯标题嵌入 | 取首段时跳过空段落,从第一个非空段开始;若全章无段落,跳过 title chunk 不抛错(查询时 `title_norm = 0`,正常走 content 通道) |
| **embedding 调用量增加 ~10-20%** → 后台嵌入更耗时 | EmbeddingQueue 已是异步批处理,用户感知小;backlog 增量推进,不阻塞 UI |
| **z-score 在 chunk 数极少时不稳定**(N=1 或 2) | 沿用 `scoreMemoriesBatch` 已有保护:`valid.length >= 2 && stddev >= SPREAD_FLOOR`,否则降级 |
| **打分参数为经验值,可能在某些书上劣化** | 参数集中在文件顶部 `const SCORING_WEIGHTS_CHAPTER = { semantic: 0.65, keyword: 0.35 }`、`TITLE_KW_WEIGHT = 1.0`、`CONTENT_KW_WEIGHT = 0.6`、`TOP_K = 3`,留 TODO 待 eval 调整;不引入设置项避免用户负担 |
| **title chunk 拉低 SPREAD_FLOOR 判定**(title 向量与 content 分布差异大,人为放大 stddev) | 验证手段:测试用例里构造极端"全书无关 query",观察归一化值是否仍合理 |

## Migration Plan

1. **IDB 升级**:DB_VERSION 10 → 11,upgrade handler:
   - 遍历 `chapter-embeddings` store 所有记录
   - 给每条加 `kind: 'content'` 字段
   - 在新 key `${chapterId}:content:${chunkIndex}` 下写入,删除旧 key `${chapterId}:${chunkIndex}`
   - 索引 `by-chapterId`、`by-bookId` 不变(字段名相同)
   - 整个 upgrade 在同一 IDB 事务内,失败回滚

2. **代码改造顺序**(实施按 tasks.md):
   - 模型 + IDB schema 先行(无业务影响)
   - `ChapterEmbeddingService` 改造(新 embed/query 路径,旧 query 路径删除)
   - EmbeddingQueue backlog 扫描扩展(自动后台补 title chunk)
   - 测试覆盖(migration / hybrid scoring / backlog 扩展)
   - 提示词微调(可选,可后续)

3. **首次启动行为**:
   - DB 自动 migration 到 v11,存量 content chunk 透明改 key + 加 kind
   - EmbeddingQueue 后台扫描发现"缺 title chunk"的章节,陆续补嵌入
   - 用户可立即使用 `query_chapter`,只是没补完 title 的章节暂时只走 content + keyword(等同旧行为 + 关键词加成,**不退化**)

4. **回滚**:不可回滚(数据库 schema 已升级)。但若发现严重问题:
   - 把 `queryChapters` 内的 title 通道开关改为常量 `false`,临时禁用 title 信号(代码改动 1 行)
   - 重大问题考虑发热修补丁

## Open Questions

- 标题首段截断阈值 300 字是否合适?(首段过短时可能整章只有 50 字嵌入,质量未必好。可考虑"首段不足 N 字时往后追加直到 N 字"。本次先用纯首段,实施后看 eval 结果再决定)
- `content_top3_mean` 的 K=3 是否对短章节(2-3 chunk)合理?(代码里 `top-K mean` 取 `min(K, chunks.length)`,小章节自动退化为均值。先这样实施,eval 时再判断)
- 是否在 `ChapterQueryMatch` 返回结果里加 `breakdown`(每路得分),让前端能展示"为什么这个章节被选中"?(本次不加 — 工具签名稳定优先,后续若需调试再加)
