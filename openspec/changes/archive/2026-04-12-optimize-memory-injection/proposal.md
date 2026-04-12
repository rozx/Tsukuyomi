## Why

当前记忆注入使用"严格优先级填充 + LRU"策略(角色 → 术语 → 章节 → 书籍 → 全局),依赖用户/AI 手动为每条记忆维护 `attachedTo` 附件关系,然后按附件优先级填充,硬性限制 10–15 条。这导致:

- **相关性低**: 主角的 LRU 前 N 条总是霸占名额,即使和当前 chunk 毫无关系;书籍级记忆不基于内容被匹配
- **预算失控**: 只有条数上限,无字符/token 预算,长 summary 可能吃掉大量上下文
- **DB 冗余**: 每个 chunk 对每个角色/术语/章节/书籍分别调用 `getMemoriesByAttachment`(全表扫描),一次翻译发起 5–N 次重复查询
- **黑盒**: 用户看不到为什么某条记忆被选中,策略缺乏可解释性
- **附件维护负担**: AI 每次创建/更新记忆都要决定 `attached_to`,提示词中有大量"附件最佳实践"规则,数据结构笨重但对召回质量贡献有限

## What Changes

### 新增

- **三信号打分**: 用 `score = 0.6·semanticSim + 0.3·keywordHitRatio + 0.1·recencyFactor` 取代优先级填充,阈值 `0.38` 过滤噪声,满分 1.0
- **字符预算控制**: 默认 2000 字符预算 + 25 条硬上限,按分数贪心填充,取代硬条数上限
- **本地语义检索**: 集成 `@huggingface/transformers` v4 + EmbeddingGemma-300m-ONNX(q4 量化,Matryoshka 截断到 256 维),**完全离线**,首次使用下载约 195 MB 模型,权重缓存到浏览器
- **嵌入异步队列**: 创建/更新记忆时后台自动入队嵌入;书籍打开时懒加载 backfill 缺失/版本旧的向量;可暂停;带进度与 ETA
- **记忆注入设置 tab**: 字符预算滑条、语义检索开关、嵌入模型下载/状态、最低相关度滑条
- **评分可视化**: `MemoryReferencePanel` 对已注入记忆展示打分详情 tooltip(语义/关键词/时间衰减)
- **记忆面板向量状态**: `MemoryPanel` 卡片显示向量徽章,增加"仅显示未向量化"筛选、"重新向量化本书"按钮、后台队列进度横幅
- **混合搜索**: `search_memories` 工具接收自然语言 query,同时用关键词匹配和语义检索,复用 `scoreMemory()` 统一评分
- **记忆预览**: 章节加载时自动计算记忆预览,尊重用户的字符预算和最低相关度设置
- **应用启动自动 warmup**: 语义检索启用时,应用启动后自动预热嵌入模型
- **DB 查询优化**: 新增 `MemoryService.getAllBookMemories(bookId)` 一次取整本书记忆 + 60 秒 TTL 缓存
- **数据模型扩展**: `Memory` 新增可选字段 `embedding: number[]`(256 float)与 `embeddingModel: string`;`Translation` 新增可选字段 `memoryScoreBreakdown`(非同步,调试用)
- **首次使用温和提示**: 用户升级后首次打开设置对话框时,以 toast 形式提示"新功能:语义记忆检索"
- **共享余弦相似度**: `src/utils/cosine-similarity.ts` 提取为公共工具,`EmbeddingService` 和 `memory-scoring` 共用

### **BREAKING**: 移除记忆附件系统(`attachedTo`)

语义检索 + 关键词命中在功能上完全覆盖了原附件关系的召回能力,因此本 change 彻底移除这套基础设施:

- **BREAKING** 删除 `Memory.attachedTo` 字段与 `MemoryAttachment` 类型
- **BREAKING** 删除 `MemoryService.getMemoriesByAttachment` / `getMemoriesByAttachments`
- **BREAKING** 删除 AI 工具 `create_memory` / `update_memory` 的 `attached_to` 参数
- **BREAKING** 精简提示词 `getMemoryWorkflowRules`,移除附件最佳��践规则
- **BREAKING** `MemoryCard` 移除附件 chips 标签
- **BREAKING** `MemoryDetailDialog` 移除"关联实体"分组编辑区
- **BREAKING** `MemoryPanel` 移除"类型筛选"与"实体筛选"下拉,改为混合搜索
- **BREAKING** 删除 `src/composables/useMemoryAttachments.ts`
- **BREAKING** IndexedDB schema 从 v8 升级到 **v9**
- **BREAKING** 移除 `get_recent_memories` AI 工具(三信号自动注入覆盖其用途)
- **BREAKING** `search_memory_by_keywords` 重命名为 `search_memories`,参数从 `keywords: string[]` 改为 `query: string`

## Capabilities

### New Capabilities

- `memory-relevance-scoring`: 三信号打分公式(语义 0.6 / 关键词 0.3 / 时间衰减 0.1,满分 1.0)、字符预算分配、最低分阈值过滤、降级兜底策略,以及用户可配置的注入参数
- `semantic-memory-embedding`: 基于 Transformers.js 的本地嵌入服务、嵌入任务队列、模型生命周期管理、触发时机规则,以及模型状态/下载的用户设置

### Modified Capabilities

- `ai-context-building`: `getRelatedMemoriesForChunk` 内部重写,从优先级填充改为打分 + 预算填充;新增可选的 chunk 语义嵌入步骤;**移除**所有基于 `attachedTo` 的记忆发现逻辑
- `memory-management`: `Memory` 数据模型新增嵌入字段、**移除** `attachedTo` 字段;新增 `getAllBookMemories` + TTL 缓存;CRUD 触发嵌入队列联动;混合搜索替代纯关键词搜索
- `translation-memory-visibility`: 记忆预览改为动态三信号打分(章节加载时计算),尊重用户设置
- `memory-attachments`: **整个 capability 作废**
- `memory-attachment-visualization`: **整个 capability 作废**
- `memory-entity-filtering`: **整个 capability 作废**

## Impact

**受影响代码**(修改):

- `src/services/ai/tasks/utils/context-builder.ts` — `getRelatedMemoriesForChunk` 内部重写
- `src/services/memory-service.ts` — 新增 `getAllBookMemories` + TTL 缓存 + CRUD 联动 + `searchMemories` 混合搜索;**移除**搜索结果缓存和附件相关方法
- `src/services/ai/tools/memory-tools.ts` — `search_memories` 混合搜索;**移除** `get_recent_memories`
- `src/services/ai/tasks/prompts/common.ts` — `getMemoryWorkflowRules` 精简,新增自动召回和混合搜索说明
- `src/models/memory.ts` — 新增 `embedding` / `embeddingModel` 可选字段;**移除** `attachedTo`
- `src/models/novel.ts` — `Translation` 新增 `memoryScoreBreakdown` 可选字段
- `src/models/settings.ts` + `src/stores/settings.ts` — 新增 `memoryInjection` 设置段
- `src/components/dialogs/SettingsDialog.vue` — 新增 tab + 首次 toast
- `src/components/novel/MemoryPanel.vue` — 混合搜索、进度横幅、重新向量化按钮
- `src/components/novel/MemoryCard.vue` — 向量徽章,引用 `MODEL_VERSION`
- `src/components/novel/MemoryDetailDialog.vue` — 嵌入元信息与单条触发
- `src/components/novel/MemoryReferencePanel.vue` — 打分详情 tooltip
- `src/pages/BookDetailsPage.vue` — 懒 backfill + 记忆预览(动态打分)
- `src/layouts/MainLayout.vue` — 应用启动自动 warmup

**新增文件**:

- `src/services/embedding-service.ts` — Transformers.js 封装
- `src/services/embedding-queue.ts` — 嵌入任务队列
- `src/services/memory-scoring.ts` — 纯打分逻辑
- `src/utils/cosine-similarity.ts` — 共享余弦相似度
- `src/components/settings/MemoryInjectionTab.vue` — 设置 tab

**删除文件**:

- `src/composables/useMemoryAttachments.ts`
- `src/components/novel/MemoryAttachmentTag.vue`

**新增依赖**:

- `@huggingface/transformers` ^4.0.1(动态 `import()`,不进入主 bundle)

**不受影响**:

- AI 任务状态机与工具调用循环
- 所有远程 AI Provider 交互
- 术语表 (`Terminology`) 与角色设定 (`CharacterSetting`) 数据模型(作为 keyword 信号源)
