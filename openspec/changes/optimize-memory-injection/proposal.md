## Why

当前记忆注入使用"严格优先级填充 + LRU"策略(角色 → 术语 → 章节 → 书籍 → 全局),依赖用户/AI 手动为每条记忆维护 `attachedTo` 附件关系,然后按附件优先级填充,硬性限制 10–15 条。这导致:

- **相关性低**: 主角的 LRU 前 N 条总是霸占名额,即使和当前 chunk 毫无关系;书籍级记忆不基于内容被匹配
- **预算失控**: 只有条数上限,无字符/token 预算,长 summary 可能吃掉大量上下文
- **DB 冗余**: 每个 chunk 对每个角色/术语/章节/书籍分别调用 `getMemoriesByAttachment`(全表扫描),一次翻译发起 5–N 次重复查询
- **黑盒**: 用户看不到为什么某条记忆被选中,策略缺乏可解释性
- **附件维护负担**: AI 每次创建/更新记忆都要决定 `attached_to`,提示词中有大量"附件最佳实践"规则,数据结构笨重但对召回质量贡献有限。一旦引入本地语义检索 + 关键词命中两个信号,附件关系在功能上被完全覆盖,成为冗余

## What Changes

### 新增

- **多信号打分**: 用 `score = 3.0·semanticSim + 2.0·keywordHitRatio + 1.0·recencyFactor` 取代优先级填充,阈值 `0.3` 过滤噪声
- **字符预算控制**: 默认 2000 字符预算 + 25 条硬上限,按分数贪心填充,取代硬条数上限
- **本地语义检索**: 集成 `@huggingface/transformers` v3 + EmbeddingGemma-300m-ONNX(q4 量化,Matryoshka 截断到 256 维),**完全离线**,首次使用下载约 200 MB 模型,权重缓存到浏览器
- **嵌入异步队列**: 创建/更新记忆时后台自动入队嵌入;书籍打开时懒加载 backfill 缺失/版本旧的向量;可暂停;带进度与 ETA
- **记忆注入设置 tab**: 字符预算滑条、语义检索开关、嵌入模型下载/状态、最低分数阈值(高级)
- **评分可视化**: `MemoryReferencePanel` 对已注入记忆展示打分详情 tooltip(语义/关键词/时间 × 权重 = 分项)
- **记忆面板向量状态**: `MemoryPanel` 卡片显示"已向量化/待向量化/版本过期"徽章,增加"仅显示未向量化"筛选、"重新向量化本书"按钮、后台队列进度横幅
- **单条手动嵌入**: `MemoryDetailDialog` 为缺失向量的记忆提供手动触发按钮
- **DB 查询优化**: 新增 `MemoryService.getAllBookMemories(bookId)` 一次取整本书记忆 + 60 秒 TTL 缓存,取代多次 `getMemoriesByAttachment`
- **数据模型扩展**: `Memory` 新增可选字段 `embedding: number[]`(256 float)与 `embeddingModel: string`;`Translation` 新增可选字段 `memoryScoreBreakdown`(非同步,调试用)
- **首次使用温和提示**: 用户升级后首次打开设置对话框时,以 toast 形式提示"新功能:语义记忆检索"

### **BREAKING**: 移除记忆附件系统(`attachedTo`)

语义检索 + 关键词命中在功能上完全覆盖了原附件关系的召回能力,因此本 change 顺手彻底移除这套基础设施:

- **BREAKING** 删除 `Memory.attachedTo` 字段与 `MemoryAttachment` 类型
- **BREAKING** 删除 `MemoryService.getMemoriesByAttachment` / `getMemoriesByAttachments`(`by-attachedTo` IndexedDB 索引在 v8 已删除)
- **BREAKING** 删除 AI 工具 `create_memory` / `update_memory` 的 `attached_to` 参数
- **BREAKING** 精简提示词 `getMemoryWorkflowRules`,移除附件最佳实践规则(提示词瘦身)
- **BREAKING** `MemoryCard` 移除附件 chips 标签
- **BREAKING** `MemoryDetailDialog` 移除"关联实体"分组编辑区
- **BREAKING** `MemoryPanel` 移除"类型筛选"与"实体筛选"下拉,保留文本搜索
- **BREAKING** 删除 `src/composables/useMemoryAttachments.ts`
- **BREAKING** IndexedDB schema 从 v8 升级到 **v9**:一次性迁移扫描 `memories` store,从每条记录中 `delete` 掉 `attachedTo` 字段,随后 `put` 回写
- 数据迁移:**硬迁移**。升级到新版本后首次打开 IDB 时,`upgrade` 回调会清理所有旧记忆的 `attachedTo` 字段残留;500 条记忆预计 <500 ms 内完成,用户无感。Gist 同步端上传仍然 strip 相关字段,作为防御性 double-safety

`getRelatedMemoriesForChunk` 函数签名保持不变;所有嵌入相关字段为可选;语义检索关闭或未就绪时打分系统以 `semanticSim=0` 正常工作。

## Capabilities

### New Capabilities

- `memory-relevance-scoring`: 三信号打分公式(语义/关键词/时间衰减)、字符预算分配、最低分阈值过滤、降级兜底策略,以及用户可配置的注入参数(字符预算、阈值)
- `semantic-memory-embedding`: 基于 Transformers.js 的本地嵌入服务、嵌入任务队列、模型生命周期管理、触发时机规则,以及模型状态/下载的用户设置

### Modified Capabilities

- `ai-context-building`: `getRelatedMemoriesForChunk` 内部重写,从优先级填充改为打分 + 预算填充;新增可选的 chunk 语义嵌入步骤;**移除**所有基于 `attachedTo` 的记忆发现逻辑
- `memory-management`: `Memory` 数据模型新增嵌入字段、**移除** `attachedTo` 字段;新增 `getAllBookMemories` + TTL 缓存;CRUD 触发嵌入队列联动;`MemoryPanel` / `MemoryCard` / `MemoryDetailDialog` 增加向量状态可视化与手动触发;**移除**附件 chips 与编辑区
- `translation-memory-visibility`: 已注入记忆展示打分详情 tooltip,让用户理解选中原因
- `memory-attachments`: **整个 capability 作废**,所有需求被 REMOVED(附件系统本身被移除)
- `memory-attachment-visualization`: **整个 capability 作废**,所有需求被 REMOVED(附件可视化无标的)
- `memory-entity-filtering`: **整个 capability 作废**,所有需求被 REMOVED(按附件类型/实体筛选消失,保留纯文本搜索)
- `memory-detail-view`: 移除"附件列表"相关需求,其他内容(内容展示、元信息、编辑/删除操作)保留

## Impact

**受影响代码**(修改):

- `src/services/ai/tasks/utils/context-builder.ts` — `getRelatedMemoriesForChunk` 内部重写
- `src/services/memory-service.ts` — 新增 `getAllBookMemories` + TTL 缓存 + CRUD 联动;**移除** `getMemoriesByAttachment`、`getMemoriesByAttachments`、`by-attachedTo` 索引
- `src/services/ai/tools/memory-tools.ts` — `create_memory` / `update_memory` 参数精简,**移除** `attached_to`
- `src/services/ai/tasks/prompts/common.ts` — `getMemoryWorkflowRules` 精简,**移除**"附件最佳实践"规则
- `src/models/memory.ts` — 新增 `embedding` / `embeddingModel` 可选字段;**移除** `attachedTo`、`MemoryAttachment`、`MemoryAttachmentType`
- `src/models/novel.ts` — `Translation` 新增 `memoryScoreBreakdown` 可选字段
- `src/models/settings.ts` + `src/stores/settings.ts` — 新增 `memoryInjection` 设置段
- `src/components/dialogs/SettingsDialog.vue` — 新增 tab + 首次 toast
- `src/components/novel/MemoryPanel.vue` — 新增向量状态、进度横幅、重新向量化按钮;**移除**类型筛选与实体筛选下拉
- `src/components/novel/MemoryCard.vue` — 新增向量徽章;**移除**附件 chips
- `src/components/novel/MemoryDetailDialog.vue` — 新增嵌入元信息与单条触发;**移除**"关联实体"分组
- `src/components/novel/MemoryReferencePanel.vue` — 打分详情 tooltip

**新增文件**:

- `src/services/embedding-service.ts` — Transformers.js 封装
- `src/services/embedding-queue.ts` — 嵌入任务队列
- `src/services/memory-scoring.ts` — 纯打分逻辑
- `src/components/dialogs/settings/MemoryInjectionTab.vue` — 设置 tab

**删除文件**:

- `src/composables/useMemoryAttachments.ts`
- `src/components/novel/MemoryAttachmentTag.vue`(如存在)
- 相关 i18n 键(附件相关标签)

**新增依赖**:

- `@huggingface/transformers` ^3.x(动态 `import()`,不进入主 bundle,运行时懒加载)

**运行时**:

- 首次启用语义检索需下载约 195 MB 模型权重(由 Transformers.js 自动缓存到 IndexedDB/OPFS)
- 后续启动额外 3–10 秒 ONNX 初始化成本(仅在首次使用嵌入功能时)
- 单条记忆嵌入 ~150–400 ms(WASM),批处理 batch=8 可获 2–4x 加速
- 200 条记忆全量 backfill:典型 Windows 笔电 15–40 秒,M3 + WebGPU 3–5 秒

**兼容性**:

- **IDB schema v9 硬迁移**: 首次打开数据库时,`upgrade` 回调遍历 `memories` store,`delete` 每条记录的 `attachedTo` 字段后 `put` 回写。500 条记忆在单一 IDB 事务中完成,典型耗时 <500 ms
- **schema 不可逆**: v9 迁移后数据库无法被 v8 打开(IDB 规则),这是故意的 —— 避免回滚后出现数据形态不一致
- Gist 同步:上传时 strip `attachedTo`(冗余防御,硬迁移后本地已无此字段)、`embedding`、`embeddingModel`、`memoryScoreBreakdown`;下载端若收到含 `attachedTo` 的旧 payload,在写入 IDB 前先 strip
- `enableSemantic = false` 或模型未就绪时自动降级为纯打分
- 升级前建议用户导出备份(常规软件升级建议,非强制)

**不受影响**:

- AI 工具 `search_memory_by_keywords` / `get_memory` / `list_memories` 接口
- AI 任务状态机与工具调用循环
- 所有远程 AI Provider 交互
- 术语表 (`Terminology`) 与角色设定 (`CharacterSetting`) 数据模型(保留,作为 keyword 信号源)
