## Context

记忆注入是 AI 翻译任务构造上下文的关键环节。当前 `getRelatedMemoriesForChunk` 在 `src/services/ai/tasks/utils/context-builder.ts` 实现,逻辑为:按 **角色 → 术语 → 章节 → 书籍 → 全局 LRU** 的严格优先级填充,每 chunk 上限 10–15 条,每实体最多 `max(3, limit*0.4)` 条。筛选只看"实体名是否出现在 chunk 文本中",完全不考虑记忆内容本身是否与 chunk 相关。

**痛点**:

1. 对每个角色/术语/章节/书籍独立调用 `MemoryService.getMemoriesByAttachment`,一次翻译 5–N 次 IndexedDB 查询(含全表扫描,因 `by-attachedTo` 复合索引在嵌套数组上不工作,见 `memory-service.ts:1162`)
2. 没有字符预算,无法控制实际注入字数
3. 书籍级/章节级记忆不基于内容被召回,相关性为 0
4. 主角 LRU 前几条永远霸占名额,即使与 chunk 无关
5. `MemoryReferencePanel` 只显示"用了哪条",不显示"为何被选中"

**约束**:

- 离线优先 —— 本地 IndexedDB 存储是硬约束,不能引入需要远程查询的向量库
- Web + Electron 同构 —— 任何方案必须在浏览器和 Electron 都能跑
- 渐进可降级 —— 语义特性失败时不能影响现有翻译工作流
- 不能破坏 Gist 同步 —— 新字段设计要考虑跨设备一致性
- Bundle 体积敏感 —— 主 bundle 不能因引入大型 ML 库变大
- `Memory` 的 `summary ≤ 40 字 / content ≤ 300 字` 的写入门槛规则由 AI 提示词约束,记忆本身一般很短,这是我们设计嵌入字段和字符预算的依据

**利益相关者**:

- 最终用户:翻译质量与 UI 体验
- 开发者:context-builder、memory-service、settings、MemoryPanel、MemoryReferencePanel 的所有者
- AI 任务子系统:translate / polish / proofread / explain / chapter_summary

## Goals / Non-Goals

**Goals:**

- **相关性提升**: 记忆选择综合语义相似度、关键词命中、时间衰减三信号(权重 0.6/0.3/0.1,满分 1.0),相关性评分决定选中,阈值过滤噪声
- **预算可控**: 以字符预算(默认 2000)替代硬条数上限,用户可在设置中调整
- **DB 查询减少**: 单 chunk 内的记忆拉取从 N 次降为 1 次(带 TTL 缓存)
- **可解释**: `MemoryReferencePanel` 显示每条已注入记忆的分项打分,用户看得到"为什么是它"
- **完全离线语义**: 引入本地浏览器嵌入模型,不依赖任何远程 API
- **优雅降级**: 模型未加载/加载失败/被用户关闭时,打分系统以 `semanticSim = 0` 继续工作,翻译不受影响
- **异步非阻塞**: 所有嵌入计算在后台队列中完成,翻译任务不等待嵌入

**Non-Goals:**

- **远程 Provider 嵌入**: 不支持 OpenAI / Gemini 的 embedding API(违背离线优先,另起 spec 再议)
- **向量压缩**: 不做 int8/int4 量化存储(256 维 float = 1KB/条,500 条 = 500KB/书,成本可忽略)
- **Web Worker 化**: 第一期主线程 + yield,Worker 留作二期优化
- **向量跨设备同步**: 嵌入字段不进入 Gist 同步,各设备本地重算
- **多模型共存**: 只支持单一模型版本,版本变更时靠懒重算过渡
- **保留 AI 记忆附件系统**: `attachedTo` 被彻底移除(见决策 11)
- **移除冗余工具**: `search_memories` 被移除(三信号自动注入覆盖其用途);`search_memories` 重命名为 `search_memories`,参数从 `keywords: string[]` 改为 `query: string`,支持混合检索
- **全局 backfill 扫描**: 启动时不扫描所有书,只扫当前打开的书
- **保留按附件筛选的 UI**: `MemoryPanel` 的类型/实体筛选下拉被删除,保留纯文本搜索

## Decisions

### 决策 1:打分公式(三信号加权)

```ts
score = W.semantic  * semanticSim
      + W.keyword   * keywordHitRatio
      + W.recency   * recencyFactor;

// W = { semantic: 0.6, keyword: 0.3, recency: 0.1 }
// 最大可能得分 = 0.6 + 0.3 + 0.1 = 1.0
// DEFAULT_MIN_SCORE = 0.38 → 低于阈值丢弃
```

**信号定义**:

- `semanticSim`: `cosine(chunkEmbedding, memory.embedding)`,两者都是 L2 归一化的 256 维向量,结果 ∈ [0, 1];缺向量 → 0
- `keywordHitRatio`: 设 `chunkEntities = findUniqueTerms(chunkText) ∪ findUniqueCharacters(chunkText)`(基于 book 的 `terminologies` 与 `characterSettings` 表,独立于任何附件概念),`hits = |{e ∈ chunkEntities : e.name 出现在 memory.summary + memory.content}|`,`ratio = hits / max(1, |chunkEntities|)` ∈ [0, 1];chunk 无已登记实体时 → 0
- `recencyFactor`: `exp(-ageDays / 30)`,以 `lastAccessedAt` 计算,30 天衰减到 0.37

**为何只有三个信号**:

之前版本曾设计 5 个信号(加上 `entityHits` 和 `tierBoost`),但两个附件相关信号与本 change 决策 11(移除 `attachedTo` 基础设施)矛盾。删除后:

- `entityHits`(挂在 chunk 实体上的记忆)—— 其召回意图被 `keywordHitRatio` 覆盖:只要 AI 撰写的记忆文本中提到相关实体名,就会被 keyword 命中。**风险**:"挂上但未提及"的记忆会失去这个信号,但这种场景应当较少(AI 通常会在记忆文本中提到相关实体)
- `tierBoost`(附件类型权重)—— 随附件概念一起消失

**为何选这些权重**:

- `semantic` 最高(0.6)——语义相似度是泛化能力最强的召回信号,涵盖同义词、代称、主题相关
- `keyword` 次之(0.3)——正交的显式信号,对语义召回的弱项(专名、新术语)作为补偿,高精度
- `recency` 最低(0.1)——仅作 tiebreaker,避免时间衰减喧宾夺主

权重初值写死为常量(非用户可调),避免暴露过多参数。`minScoreThreshold` 默认 `0.38`,用户可在设置中调整(范围 0–0.5)。

**阈值 0.38 的意义**:

- 纯 `recencyFactor` 最高得 0.1 —— 远低于阈值,仅靠时间衰减不会被选中(避免无关记忆霸占名额)
- `keywordHitRatio = 1.0` + 近期记忆 → 0.3 + 0.1 = 0.4 —— 刚好进入
- `semanticSim = 0.6` + 无关键词 → 0.36 —— 略低于阈值,需要配合少量关键词或近期访问才进入
- 语义 + 关键词双信号命中 → 轻松超过阈值

**考虑的替代方案**:

1. **纯语义检索 (top-K by cosine)** —— 放弃:冷启动阶段(向量未就绪)无可用信号
2. **加回 `entityHits`**(基于 keyword 信号间接推算)—— 放弃:与 keyword 耦合,权重难以正交设计
3. **让用户配权重** —— 放弃:大多数用户不知如何调,决策疲劳

### 决策 2:字符预算替代条数上限

```ts
const DEFAULT_CHAR_BUDGET = 2000;  // 可调
const HARD_ITEM_CAP = 25;          // 病态保护

// 按 score desc 排序后贪心填充
for (const m of sortedByScore) {
  if (usedChars + lineLen > CHAR_BUDGET || selected.length >= HARD_ITEM_CAP) break;
  selected.push(m);
  usedChars += lineLen;
}
```

**为何字符而非 token**: token 估算需要运行时 tokenizer,成本高且因模型而异;字符是直观可控的代理。按 2000 字符约等于 1000–1400 token(中文略多于英文),足够合理。

**为何 2000 默认**: 参考当前硬上限 10 条 × 平均 60 字 ≈ 600 字,提升 3 倍给打分系统更大发挥空间;25 条硬上限防止极端情况。

**空结果兜底**: 若打分后所有候选都被阈值过滤掉(常见于记忆库较小或阈值设置过高),退化为 `getRecentMemories(bookId, 5, 'lastAccessedAt')`,保证至少有兜底上下文。

### 决策 3:本地嵌入 —— EmbeddingGemma-300m-ONNX @ 256 维

**模型**: `onnx-community/embeddinggemma-300m-ONNX`

- Google 2025-09 发布,308M 参数,q4 量化后约 195 MB
- MTEB 下 500M 以下开源模型第一名
- 100+ 语言训练(中日覆盖良好)
- **Matryoshka 表示学习**:原生支持 768→512→256→128 维截断,前 N 维本身是有效子嵌入
- 2K token 上下文,覆盖 memory.summary + memory.content(通常 <340 字符)

**为何不选其他**:

- `multilingual-e5-small`(120 MB, 384 维):质量被 EmbeddingGemma 碾压,早期 Xenova 时代的优选
- `BGE-M3`(q8 约 570 MB,q4 约 280 MB):质量最高但体积翻 2–3 倍,浏览器下载成本不可接受
- `mxbai-embed-xsmall-v1`(HF v3 官方 demo 模型):多语言覆盖不明,没有 Google 级背书

**为何 256 维**: 768 维存储成本 3 倍(500 条 × 768 × 4 字节 = 1.5 MB),256 维只 500 KB,且 Matryoshka 保证前 256 维的子嵌入质量损失有限。若后续发现质量不足,可直接升到 512 维且无需重嵌旧数据(前 256 维继续有效,只需补齐 257–512)—— 但首期版本为简化实现,**不处理**这种部分向量,升级路径设计为"版本号变化 → 完整重嵌"。

**为何不选 WebGPU 默认**: 社区实测(bge-m3 在 Apple Silicon 上)WASM 比 WebGPU 快 2 倍,设备分布差异大。采用 `device: 'auto'` 让 Transformers.js 自己选。

**考虑的替代方案**:

1. **远程 Provider 嵌入(OpenAI/Gemini)** —— 放弃:违背离线优先哲学
2. **句向量 + 传统检索库(lunr/flexsearch)** —— 放弃:对跨语言/同义词/代称无效,对中日文形态语言的匹配质量差
3. **n-gram 字符相似度** —— 放弃:不能捕捉语义,只能做表层字形相似

### 决策 4:Transformers.js v3 + 动态 import

使用 `@huggingface/transformers` 而非旧的 `@xenova/transformers`(v3 起更名)。通过动态 `import('@huggingface/transformers')` 延迟加载,**不进主 bundle**,首次调用时才下载库代码 + 模型权重。

```ts
// src/services/embedding-service.ts
private static async init(): Promise<void> {
  if (this.pipeline) return;
  if (this.loading) return this.loading;

  this.loading = (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    this.pipeline = await pipeline(
      'feature-extraction',
      'onnx-community/embeddinggemma-300m-ONNX',
      { dtype: 'q4', device: 'auto' },
    );
  })();
  return this.loading;
}
```

Transformers.js 内部使用 IndexedDB / OPFS 缓存模型权重,首次下载后本地持久化。

**为何不放 Worker**: 第一期以主线程 + `setTimeout(0)` yield 实现,简单,足以避免 UI 卡顿。Worker 增加消息序列化/初始化竞态/错误传播复杂度,性能收益对小批次(batch=8)不明显,留二期。

### 决策 5:`EmbeddingQueue` 异步批处理

```ts
class EmbeddingQueue {
  private readonly BATCH_SIZE = 8;
  private readonly YIELD_MS = 0;

  enqueue(memoryId: string): void;
  cancel(memoryId: string): void;
  enqueueBacklog(bookId: string): Promise<void>;
  pause(): void;
  resume(): void;
  getProgress(): { total: number; completed: number; etaMs: number };
  on(event: 'progress' | 'done' | 'error', handler): void;
}
```

**关键点**:

- 串行执行批次,每批后 `await new Promise(r => setTimeout(r, 0))` yield 给 UI
- ETA 用最近 5 批的滑动窗口吞吐量估算
- 写入嵌入时调 `updateMemory` 但 **不修改 `lastEdited`**(避免触发无意义的 Gist 同步)
- 队列状态通过 event bus 广播,UI 订阅以显示进度横幅

### 决策 6:DB 优化 —— `getAllBookMemories` + TTL 缓存

```ts
// MemoryService
private static bookMemoryCache = new Map<string, { data: Memory[]; expiresAt: number }>();
private static readonly BOOK_CACHE_TTL_MS = 60_000;

static async getAllBookMemories(bookId: string): Promise<Memory[]> {
  const cached = this.bookMemoryCache.get(bookId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const all = await db.getAllFromIndex('memories', 'by-bookId', bookId);
  this.bookMemoryCache.set(bookId, { data: all, expiresAt: Date.now() + BOOK_CACHE_TTL_MS });
  return all;
}

// 写入路径失效对应 bookId 缓存
static async createMemory(...) { ... this.bookMemoryCache.delete(bookId); }
static async updateMemory(...) { ... this.bookMemoryCache.delete(bookId); }
static async deleteMemory(...) { ... this.bookMemoryCache.delete(bookId); }
```

**为何 60 秒**: 一次 AI 翻译任务通常 30–120 秒,同任务内的多个 chunk 可以共享缓存;60 秒足以覆盖任务内但不会让 UI 侧用户手动修改记忆被察觉延迟。写入路径同步失效解决修改可见性问题。

### 决策 7:嵌入触发时机

**自动**:

| 规则 | 触发点 | 处理 |
|---|---|---|
| A | `createMemory` 成功后 | `EmbeddingQueue.enqueue(id)`,不 await |
| B | `updateMemory` 后,**仅当 summary 或 content 变化** | 同上;仅改 `lastAccessedAt` 等非文本元数据不触发 |
| C | 进入 `BookDetailsPage` (onMounted) | 扫描该书 `embedding=空 OR embeddingModel≠当前版本` 的记忆,批量入队 |
| D | 首次模型下载完成 | 若当前有打开的书,立即执行规则 C |
| E | 模型版本漂移(常量 `MODEL_VERSION` 变更) | 通过规则 C 自然生效,不做全局扫描 |

**手动**:

- F. `MemoryPanel` "重新向量化本书"按钮:强制清空本书所有向量后重新入队
- G. `MemoryDetailDialog` 单条按钮:对当前记忆重新嵌入

**取消**:

- H. `deleteMemory` → `EmbeddingQueue.cancel(id)`
- I. 设置中关闭 `enableSemantic` → `EmbeddingQueue.pause()`,已有向量保留

**不触发**:

- 应用启动、翻译任务开始、Gist 同步、章节/段落编辑

### 决策 8:数据模型扩展与附件字段删除

```ts
// models/memory.ts
interface Memory {
  id: string;
  bookId: string;
  summary: string;
  content: string;
  createdAt: number;
  lastEdited: number;
  lastAccessedAt: number;
  // 新增
  embedding?: number[];        // 256 float, 存 number[] 非 Float32Array (IDB 兼容)
  embeddingModel?: string;     // "embeddinggemma-300m@256"
  // 删除: attachedTo?: MemoryAttachment[]
}

// MemoryAttachment 类型被整体删除
// MemoryAttachmentType 类型被整体删除

// models/novel.ts
interface Translation {
  // ...existing fields
  memoryScoreBreakdown?: Record<string, {
    semantic: number;            // 原始值 ∈ [0, 1]
    keyword: number;             // 原始值 ∈ [0, 1]
    recency: number;             // 原始值 ∈ [0, 1]
    semanticWeighted: number;    // semantic × 3.0
    keywordWeighted: number;     // keyword × 2.0
    recencyWeighted: number;     // recency × 1.0
    total: number;
  }>;
}

// models/settings.ts
interface Settings {
  // ...existing
  memoryInjection: {
    charBudget: number;          // 默认 2000
    enableSemantic: boolean;     // 默认 true
    minScoreThreshold: number;   // 默认 0.3
    hasSeenIntro: boolean;       // 首次 toast 标记,默认 false
  };
}
```

**为何 `number[]` 而非 `Float32Array`**: IndexedDB 对 TypedArray 支持参差(某些浏览器在 `put` 后 `get` 会变成普通对象),`number[]` 兼容性最佳,256 维存储开销可忽略。读取时再转 `Float32Array` 做相似度计算。

**为何 `memoryScoreBreakdown` 不参与 Gist 同步**: 这是 UI 调试信息,重算成本低,占同步空间无意义。实现上由 `sync-data-service` 在序列化时 strip 掉该字段。

**`attachedTo` 的硬迁移策略**:

采取彻底清理方案,避免"僵尸字段"在 IDB 里长期残留带来的认知负担。利用 IndexedDB 原生的 schema upgrade 机制:

1. **TypeScript 接口**: 从 `Memory` 和 `TsukuyomiDB.memories` schema 中删除 `attachedTo` 字段声明,以及 `MemoryAttachment` / `MemoryAttachmentType` 类型
2. **schema version bump**: `DB_VERSION` 从 **8** 升级到 **9**(见 `src/utils/indexed-db.ts`)
3. **upgrade 回调新增迁移分支**: 当 `oldVersion < 9` 时,打开 `memories` store 的 cursor,对每条记录执行:
   ```ts
   const record = cursor.value;
   if ('attachedTo' in record) {
     delete (record as Record<string, unknown>).attachedTo;
     cursor.update(record);
   }
   cursor.continue();
   ```
4. **事务原子性**: 迁移在单一 IDB 事务中完成,全部成功才提交;500 条记忆预计 <500 ms,用户无感
5. **无索引变更**: `by-attachedTo` 索引在 v8 已经删除(见 `indexed-db.ts:113` 当前注释),本次只清理字段数据
6. **Gist 同步防御**: `sync-data-service.ts` 的 serialize/deserialize 路径仍然 strip `attachedTo` 作为 double-safety,防止跨版本 Gist 数据污染迁移后的本地 DB
7. **不可逆性**: IDB 规则决定 v9 升级后无法被旧版本(`DB_VERSION=8`)代码打开。这是**预期行为** —— 回滚只能通过 git revert 重新部署 v8 代码,此时 DB 中已无 `attachedTo` 字段,旧 UI 将显示"无附件"但不 crash

这种硬迁移的好处:

- 一次性彻底干净,IDB 中没有僵尸字段,用户 DevTools 查看时数据形态与 TS 类型一致
- Gist strip 从"必要"降级为"防御",逻辑更简单可推理
- 单元测试可以假设"迁移后无 `attachedTo`",不再需要兼容两种数据形态的代码路径
- 未来的 schema migration 不需要处理历史遗留的附件数据

代价是:

- 升级**不可回滚**到 v8(数据形态兼容)。通过 git revert + 部署 v8 代码可以恢复应用代码,但已迁移的 DB 中 `attachedTo` 已被清空,旧 UI 会看到"所有记忆都无附件"。这被视为可接受的,因为附件系统是被废弃的,回滚也不是常见操作。
- 首次启动延迟 <500 ms,用户无感但需要在技术文档中提到

### 决策 9:UI — 新设置 tab + 首次使用温和提示

**新 tab**:

- 字符预算滑条(500–5000,步长 100)
- 启用语义检索开关
- 嵌入模型状态(未下载 / 下载中 X% / 已就绪 / 失败)
- 下载按钮(状态变更时按钮文案切换)
- 高级折叠区:最低分数阈值

**首次使用温和提示**: 用户升级后第一次打开 `SettingsDialog` 时,以 toast 形式显示 "新功能:语义记忆检索 [了解更多 / 稍后]"。"了解更多"自动切到新 tab,"稍后"关闭 toast。仅显示一次,通过 settings flag 记录(`memoryInjection.hasSeenIntro = true`)。

**为何不做启动时下载**: 冷启动成本不可接受,违背"本地优先,快速启动"的产品定位。

**为何不做翻译时弹窗**: 翻译工作流不能被中断。

### 决策 10:UI — 向量状态徽章 + 评分详情 tooltip

**MemoryCard 徽章**: 右上角小圆点(≤8px),颜色语义:

- 🟢 已向量化 (`embedding 存在且 embeddingModel 匹配`)
- 🟡 待向量化 (`embedding 空` 或 `在队列中`)
- 🔴 版本过期 (`embeddingModel 存在但不匹配`)

徽章不抢视觉焦点,悬停显示 tooltip 解释。

**MemoryReferencePanel 评分详情**: 对 `memoryScoreBreakdown` 有数据的记忆,行尾显示 ⓘ 图标,点击(或悬停)弹出 tooltip,显示三个信号的原始值 × 权重 = 分项,以及总分。

```
评分详情 [mem_abc123]
─────────────────────────
语义相似度: 0.71 × 3.0 = 2.13
关键词命中: 0.50 × 2.0 = 1.00
时间衰减:   0.83 × 1.0 = 0.83
─────────────────────────
总分:                   0.66  (满分 1.0)
```

当记忆由 AI 工具主动调用而非由 `getRelatedMemoriesForChunk` 注入时,没有 `memoryScoreBreakdown`,tooltip 显示"由 AI 主动调用"。

### 决策 11:移除记忆附件基础设施

本 change 将 `Memory.attachedTo` 及其配套系统彻底移除。动机是:引入 `semanticSim` 和 `keywordHitRatio` 两个信号后,附件关系的召回功能被完全覆盖,保留附件系统只会带来:

- **维护负担**: AI 每次创建/更新记忆都要决定 `attached_to`,提示词里有 20+ 行附件规则
- **数据冗余**: 附件关系本质上是"这条记忆与 X 相关"的元数据,但这个元数据能从记忆文本内容本身推断(keyword 信号)或由语义嵌入捕捉(semantic 信号)
- **维护脆弱性**: 实体改名、删除、合并时附件容易腐烂
- **代码复杂度**: `getMemoriesByAttachment` 全表扫描、`useMemoryAttachments` 懒加载名称、`MemoryAttachmentTag` 组件、4 种类型分别的查询路径……全是附件系统的税

**范围**:

- **数据模型**: 删除 `Memory.attachedTo`、`MemoryAttachment`、`MemoryAttachmentType` 类型;`TsukuyomiDB.memories` schema 同步更新
- **IDB schema**: `DB_VERSION` 从 8 bump 到 9,`upgrade` 回调新增迁移分支清理字段数据
- **服务层**: 删除 `MemoryService.getMemoriesByAttachment` / `getMemoriesByAttachments`;`by-attachedTo` 索引已在 v8 删除,无额外工作
- **AI 工具**: `create_memory` / `update_memory` 移除 `attached_to` 参数;工具描述简化
- **提示词**: `getMemoryWorkflowRules` 移除附件最佳实践段落,整体瘦身约 15 行
- **UI**: `MemoryCard` 移除附件 chips;`MemoryDetailDialog` 移除"关联实体"分组;`MemoryPanel` 移除类型筛选和实体筛选下拉,保留文本搜索
- **Composable**: 删除 `src/composables/useMemoryAttachments.ts`
- **OpenSpec Capabilities**: `memory-attachments`、`memory-attachment-visualization`、`memory-entity-filtering` 整个作废;`memory-detail-view` 移除"附件列表"段
- **Gist 同步**: serialize/deserialize 两端都 strip `attachedTo`,作为跨版本同步的防御

**硬迁移数据路径**: 见决策 8 末尾。`DB_VERSION = 9` 的 upgrade 回调一次性清理所有记录的 `attachedTo` 字段,无需应用层迁移脚本。

**考虑的替代方案**:

1. **保留附件但不进打分**(选项 C): 代码里有一个"看似重要其实没用"的字段,长期产生认知疑惑;附件 UI 和 AI 规则照旧维护,复杂度并没有降低
2. **分两个 change 渐进式移除**: 第一个 change 只引入打分系统,观察 `entityHits` 的实际贡献后再决定是否移除。风险低,但拖长决策周期,且附件维护成本会拖累实际效果评估
3. **完全移除(本方案)**: 一次性换血,代价是 change 规模扩大,回滚成本高。用户选择这个方案

**风险与缓解**:

- [召回质量回退] → 用 `MemoryReferencePanel` 的打分 tooltip 实际观察命中情况;若出现严重回退,可通过调高 `keyword` 权重或降低阈值快速响应
- [用户数据"丢失"感] → 硬迁移会物理删除 `attachedTo`,严格来说"附件关系"这个元数据丢了。缓解:(1) 记忆本体(summary/content/createdAt/lastAccessedAt/id)完全保留,(2) 升级说明文档提醒用户升级前导出备份,(3) 硬迁移前弹一次确认 toast("本次升级将清理旧的附件元数据,记忆内容完全保留")
- [IDB 迁移失败] → IDB 事务原子性保证失败时回滚到 v8 状态;重试机制 + UI 错误提示 + 日志记录
- [AI 提示词调整] → 移除附件规则后 AI 不再纠结"要挂哪里",减少 token 消耗,提示词更简短
- [跨版本 Gist 同步污染] → 旧版本导出的 Gist 含 `attachedTo`,新版本下载时在反序列化阶段 strip,防止污染已迁移的本地 DB

## Risks / Trade-offs

- **[模型下载失败/阻塞]** → UI 清晰反馈错误 + 重试按钮;失败时语义检索静默禁用,翻译继续以纯打分运行
- **[首次下载 200 MB 流量]** → 用户可在首次 toast 选择"稍后",仅在手动点击下载时触发;提示文案明确告知"200 MB,完成后完全离线"
- **[Transformers.js v3 兼容性]** → 目标浏览器需支持 WebAssembly + IndexedDB(所有现代浏览器都满足);Electron 环境测试作为必跑验证项
- **[WASM 运行速度差异]** → 老设备批量嵌入可能 60 秒以上,通过进度条 + ETA + 暂停按钮降低体验冲击;嵌入完全异步,不阻塞翻译
- **[IndexedDB 向量存储膨胀]** → 256 维 float[] ≈ 1KB/条,500 条/书上限 ≈ 500 KB,对 IndexedDB 无感;若用户有数十本书,总量也 <50 MB
- **[Gist 同步规模]** → 嵌入不同步,不影响 Gist 体积;`memoryScoreBreakdown` 在序列化时 strip
- **[版本漂移重嵌成本]** → 通过"打开书时懒重算"摊销,用户升级不会感知一次性卡顿;代价是跨书体验短期不一致(用户打开新书才生效)
- **[模型输出维度固定但后续想升到 512]** → 首期不支持部分维度扩展,版本号变化即全量重嵌;Matryoshka 特性允许未来做平滑升级,但需要额外工程,留二期
- **[打分参数调优盲区]** → 权重常量化,若实测效果不佳需代码发版才能调;可接受,初期数据有限,过早开放配置会增加支持负担
- **[首次 toast 升级检测]** → 用 `settings.memoryInjection.hasSeenIntro` 标记;若用户清空 IDB 可能再次看到,行为可接受
- **[阈值 0.5 的选择]** → 基于加权和 ~ 3–12 的范围估算的经验值,可能偏低或偏高;作为高级设置暴露给用户,支持现场调整

## Migration Plan

**部署步骤**(按 PR / commit 切片):

1. **基础设施层**(无 UI 改动,单测覆盖)
   - `memory-scoring.ts`(纯函数打分,三信号版本)
   - `embedding-service.ts`(接口 + mock 实现,暂不接入真实模型)
   - `embedding-queue.ts`(队列核心,用 mock EmbeddingService 测)
   - `MemoryService.getAllBookMemories` + TTL 缓存
   - `Memory` / `Translation` / `Settings` 数据模型字段变更(新增嵌入字段 + 删除 `attachedTo`)

2. **附件基础设施移除 + IDB schema 硬迁移**(一次性换血)
   - 删除 `MemoryAttachment` / `MemoryAttachmentType` 类型
   - 从 `Memory` 接口删除 `attachedTo`
   - 从 `TsukuyomiDB.memories.value` schema 类型中删除 `attachedTo`
   - **`DB_VERSION` 从 8 bump 到 9**
   - **新增 upgrade 分支**: `if (oldVersion < 9)` 时通过 cursor 遍历 `memories` store,逐条 `delete record.attachedTo` 后 `cursor.update(record)`
   - 删除 `MemoryService.getMemoriesByAttachment` / `getMemoriesByAttachments`
   - 从 AI 工具 `create_memory` / `update_memory` 移除 `attached_to` 参数
   - 简化 `getMemoryWorkflowRules` 提示词
   - 删除 `useMemoryAttachments` composable
   - 在 `sync-data-service.ts` 序列化/反序列化两端 strip `attachedTo`(防御性)
   - **TypeScript 编译必须通过**,所有引用 `attachedTo` 的代码都要修掉或删掉
   - 手工验证:升级前备份一份含 `attachedTo` 的 IDB 数据 → 启动新版本 → 确认 DevTools 中 memories 已无 `attachedTo` 字段

3. **context-builder 重写**(功能等价性切换)
   - `getRelatedMemoriesForChunk` 内部用新三信号打分逻辑,语义信号强制为 0(因为 EmbeddingService 还未接真模型)
   - 保留旧逻辑函数作 fallback(`getRelatedMemoriesForChunkLegacy`),但 legacy 版本也要去掉对 `attachedTo` 的依赖(此时它只剩 LRU 兜底)
   - 新增 scoring 单测

4. **UI 移除附件 + 增加向量状态**(一次性 UI 换血)
   - `MemoryCard` 移除附件 chips,增加向量徽章
   - `MemoryDetailDialog` 移除"关联实体"分组,增加嵌入元信息 + 单条触发按钮
   - `MemoryPanel` 移除类型/实体筛选下拉,保留文本搜索,增加"仅显示未向量化"筛选、"重新向量化本书"按钮、进度横幅
   - `MemoryReferencePanel` 增加打分详情 tooltip
   - 新 `MemoryInjectionTab` 接入 `useSettingsStore`
   - 字符预算滑条、阈值设置生效
   - 此阶段所有记忆都显示 🟡 待向量化(因为 EmbeddingService 还未接真模型)

5. **Transformers.js 接入 + 嵌入队列激活**
   - `EmbeddingService` 接真模型,动态 import
   - `EmbeddingQueue` 开始处理任务
   - `createMemory / updateMemory / deleteMemory` 接入队列联动
   - `BookDetailsPage.onMounted` 触发懒 backfill
   - 首次下载 toast、设置页下载按钮、进度横幅

6. **最终验证**(手工 + 自动化)
   - 真实书籍测试(冷启动下载 + 回填 + 翻译召回质量对比)
   - Web + Electron 双环境验证
   - 关闭 `enableSemantic` 的降级路径
   - 跨版本 Gist 同步:新版本导出 + 旧版本导入(旧版本应仍能工作,`attachedTo` 被忽略但不报错)
   - 跨版本 Gist 同步:旧版本导出 + 新版本导入(新版本看不到 `attachedTo`,行为正确)

**回滚策略**:

- **数据层**: 新增字段(embedding / embeddingModel / memoryScoreBreakdown)均为可选,旧版本代码忽略即可;**`attachedTo` 已被 v9 硬迁移物理清除**,无法通过"回到旧代码"恢复
- **IDB 版本不可降级**: IndexedDB 规则决定 v9 数据库无法被 `DB_VERSION=8` 的代码打开。git revert 后,老代码尝试打开 DB 会失败。**真正的回滚需要同时 revert 代码 + 手动 bump DB_VERSION 到 10 并写 down migration**,或要求用户清空 IDB 重建
- **服务层**: `getRelatedMemoriesForChunkLegacy` 保留为 fallback,但本次的 legacy 已不再是附件版本而是"纯 LRU"版本
- **Bundle**: Transformers.js 是动态 import,回滚时若需完全移除仅删 `EmbeddingService.init()` 调用即可
- **附件系统恢复**: **不可行** —— 迁移后 `attachedTo` 数据已清零。若未来需要类似功能,应设计新机制(如 tags 字段)而非尝试恢复旧附件
- **建议的升级前预防**: 用户在升级前通过现有"导出数据"功能备份 JSON;即使硬迁移出问题,也能从 JSON 手动恢复

**未回滚情况下的降级**:

- 用户设置 `enableSemantic = false` → 运行时完全跳过嵌入路径,打分系统只使用 `keywordHitRatio + recencyFactor` 两个信号
- 模型加载失败 → 捕获 + 静默降级,用户可见错误状态但翻译不受影响
- 若打分完全失败(例如 `memory-scoring.ts` 抛异常)→ 外层 `try/catch` 退化到 `getRelatedMemoriesForChunkLegacy`(纯 LRU 兜底)
- **若 IDB upgrade 迁移失败**(极端情况,IDB 事务抛异常) → 事务原子性保证 DB 仍在 v8 状态,应用可重试。连续失败则抛错到 UI 层,引导用户备份数据后重试或联系支持

## Open Questions

- **首次 toast 的"了解更多"链接是否开外部文档页**: 如果要写用户教育文档,需要决定放 `docs/` 还是应用内 `/help/memory-embedding`。建议应用内文档 + 后续 spec 补充文档内容
- **嵌入队列的 IndexedDB 持久化**: 当前方案是内存队列,重启后丢失(但规则 C 会懒重算回填)。是否需要持久化任务列表防止反复扫描?建议**不持久化**,规则 C 的扫描成本极低(IndexedDB index 查询 + 内存过滤)
- **对已存在的 200+ 本书用户的首次升级体验**: 规则 C 只处理当前打开的书,用户跨书切换才陆续补全。理论上是温和的,但缺乏覆盖保证。是否需要"设置页一键重嵌全部"按钮?—— 暂不加,待用户反馈再定
- **`memoryScoreBreakdown` 的持久化时机**: 写入到 IndexedDB 会在每次翻译后产生额外 IO。是否仅在内存中保留?—— 决定**持久化到 IndexedDB**,因为用户可能在段落上重新查看历史翻译;但字段在 Gist 同步时 strip
- **Gist 同步对新 Settings 字段的处理**: `memoryInjection` 设置要不要同步?—— 倾向同步(字符预算、阈值是用户偏好),但 `hasSeenIntro` 不同步(设备级状态)
- **权重常量未来是否暴露**: 目前写死;若后续用户反馈调优需求强烈,可开高级 JSON 编辑器。不作为当前 spec 工作
