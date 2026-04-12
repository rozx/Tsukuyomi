## 1. 数据模型与基础设施

- [x] 1.1 在 `src/models/memory.ts` 中为 `Memory` 接口添加可选字段 `embedding?: number[]` 与 `embeddingModel?: string`
- [x] 1.2 在 `src/models/memory.ts` 中删除 `Memory.attachedTo` 字段声明,以及 `MemoryAttachment` 和 `MemoryAttachmentType` 类型导出
- [x] 1.3 在 `src/utils/indexed-db.ts` 的 `TsukuyomiDB.memories.value` 类型中删除 `attachedTo` 字段声明
- [x] 1.4 在 `src/models/novel.ts` 的 `Translation` 接口中添加可选字段 `memoryScoreBreakdown?: Record<string, ScoreBreakdown>`,并导出 `ScoreBreakdown` 类型(字段:`semantic`, `keyword`, `recency`, `semanticWeighted`, `keywordWeighted`, `recencyWeighted`, `total`)
- [x] 1.5 在 `src/models/settings.ts` 中添加 `memoryInjection` 段:`{ charBudget: number; enableSemantic: boolean; minScoreThreshold: number; hasSeenIntro: boolean }`
- [x] 1.6 更新 `src/stores/settings.ts` 初始化默认值 `{ charBudget: 2000, enableSemantic: true, minScoreThreshold: 0.3, hasSeenIntro: false }`
- [x] 1.7 在 `src/services/sync-data-service.ts` 中为 Gist 序列化路径添加字段 strip,去除 `memory.embedding`、`memory.embeddingModel`、`memory.attachedTo`(防御)与 `translation.memoryScoreBreakdown`
- [x] 1.8 在 `src/services/sync-data-service.ts` 中为 Gist **反序列化**路径也添加 `attachedTo` strip(防止旧版本 Gist 数据污染已迁移的本地 DB)

## 2. IDB schema 硬迁移(v8 → v9)

- [x] 2.1 在 `src/utils/indexed-db.ts` 将 `DB_VERSION` 常量从 `8` 升级到 `9`,更新其注释说明"v9 硬迁移:清理旧 attachedTo 字段残留"
- [x] 2.2 在 `getDB()` 的 `upgrade(db, oldVersion, newVersion, transaction)` 回调中添加 `if (oldVersion < 9)` 分支
- [x] 2.3 在 v9 迁移分支内,通过 `transaction.objectStore('memories')` 打开 cursor,遍历所有记录
- [x] 2.4 对每条记录检查 `'attachedTo' in record`,若存在则 `delete record.attachedTo` 后 `cursor.update(record)`
- [x] 2.5 迁移逻辑必须在 `upgrade` 回调的同一事务内完成,利用 IDB 原生原子性保证失败时整个升级回滚
- [x] 2.6 添加日志:迁移开始/结束时打印记录数与耗时,便于排查
- [x] 2.7 创建或扩展 `src/__tests__/indexed-db-migration.test.ts`(使用 fake-indexeddb),测试:
   - 从 v8 模拟数据(含 `attachedTo`)升级到 v9 后字段被清除
   - 空 `memories` store 的升级正常完成
   - 升级后新记忆的 schema 符合预期

## 3. 移除附件基础设施(TypeScript 层换血)

- [x] 3.1 从 `src/services/memory-service.ts` 删除 `getMemoriesByAttachment` 和 `getMemoriesByAttachments` 方法及其内部辅助逻辑
- [x] 3.2 删除 `src/composables/useMemoryAttachments.ts`
- [x] 3.3 删除 `src/components/novel/MemoryAttachmentTag.vue`(若存在);同时在 `MemoryCard.vue` 中移除对该组件的导入与模板使用
- [x] 3.4 在 `src/services/ai/tools/memory-tools.ts` 中移除 `create_memory` 与 `update_memory` 工具定义里的 `attached_to` 参数,以及对应的 handler 逻辑
- [x] 3.5 在 `src/services/ai/tasks/prompts/common.ts` 的 `getMemoryWorkflowRules` 中删除"附件最佳实践"、"附件示例"、"补齐附件"、"记忆顺序"相关段落,精简为"短、有效、可检索、可复用 + 字段约束"
- [x] 3.6 全局搜索 `attachedTo` / `MemoryAttachment` 残留引用,逐个修复(预期需要动的文件:`memory-service.test.ts`、其他使用 Memory 类型的地方)
- [x] 3.7 运行 `bun run type-check`,确认所有附件相关的类型错误都被清除
- [x] 3.8 更新或删除 `src/__tests__/memory-service.test.ts` 中涉及 attachment 的用例

## 4. 纯打分逻辑(三信号)

- [x] 4.1 创建 `src/services/memory-scoring.ts`,导出常量 `SCORING_WEIGHTS = { semantic: 3.0, keyword: 2.0, recency: 1.0 }`、`DEFAULT_CHAR_BUDGET = 2000`、`HARD_ITEM_CAP = 25`、`DEFAULT_MIN_SCORE = 0.3`
- [x] 4.2 实现 `calculateKeywordHitRatio(memory, chunkEntities: Array<{ name: string }>)`:统计 `chunkEntities.name` 在 `memory.summary + memory.content` 中的命中比例,空集时返回 0
- [x] 4.3 实现 `calculateRecencyFactor(memory, now)` 使用 `exp(-ageDays / 30)`
- [x] 4.4 实现 `calculateSemanticSim(memoryEmbedding, chunkEmbedding)` 余弦相似度,任一为空或维度不匹配时返回 0,结果 clamp 到 [0, 1]
- [x] 4.5 实现 `scoreMemory(memory, context): ScoreBreakdown` 组合三个信号,返回含原始值、加权值、总分的结构体
- [x] 4.6 实现 `selectByBudget(scoredMemories, charBudget, hardCap, minScore): Memory[]` 贪心填充算法,按分数降序,超预算或超上限停止,低于阈值过滤
- [x] 4.7 创建 `src/__tests__/memory-scoring.test.ts`,对每个信号函数单独测试 + `scoreMemory` 组合测试 + `selectByBudget` 边界测试(空候选、全部低分、超预算、超上限)
- [x] 4.8 验证阈值选择:给出典型的 semantic/keyword/recency 组合,确认 0.3 阈值下结果合理(至少有 1 个"新记忆无向量"的单元测试能通过阈值)

## 5. `MemoryService` 扩展

- [x] 5.1 在 `src/services/memory-service.ts` 添加私有 `bookMemoryCache: Map<string, { data: Memory[]; expiresAt: number }>` 与常量 `BOOK_CACHE_TTL_MS = 60_000`
- [x] 5.2 实现 `getAllBookMemories(bookId: string): Promise<Memory[]>`,命中缓存直接返回,否则走 `by-bookId` 索引查询后入缓存
- [x] 5.3 在 `createMemory`、`updateMemory`、`deleteMemory` 的写入路径添加 `bookMemoryCache.delete(bookId)` 调用
- [x] 5.4 添加内部辅助 `updateMemoryEmbeddingOnly(memoryId, embedding, embeddingModel)`,写入嵌入字段但 **不修改** `lastEdited`、不触发 Gist sync dirty flag
- [x] 5.5 创建 `src/__tests__/memory-service-cache.test.ts`,验证缓存命中、TTL 过期、写入失效

## 6. `EmbeddingService`

- [x] 6.1 创建 `src/services/embedding-service.ts`,定义常量 `MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX'`、`MODEL_VERSION = 'embeddinggemma-300m@256'`、`DIMENSIONS = 256`
- [x] 6.2 实现 `EmbeddingService.init(): Promise<void>` 懒加载,使用动态 `import('@huggingface/transformers')`
- [x] 6.3 使用 `pipeline('feature-extraction', MODEL_ID, { dtype: 'q4', device: 'auto' })` 创建特征提取 pipeline,接入 `progress_callback` 广播到 event bus
- [x] 6.4 实现 `isReady(): boolean` 与 `getStatus(): 'idle' | 'loading' | 'ready' | 'failed'`
- [x] 6.5 实现 `embed(text: string): Promise<Float32Array>`,调用 pipeline 后取前 256 维并 L2 归一化
- [x] 6.6 实现 `embedBatch(texts: string[]): Promise<Float32Array[]>`
- [x] 6.7 实现 `cosineSimilarity(a, b): number` 静态工具函数
- [x] 6.8 实现 `warmup(): Promise<void>` 供设置页手动触发
- [x] 6.9 在 `package.json` 添加 `@huggingface/transformers` 依赖(v4.0.1,仅通过动态 import 使用);bundle 验证推迟到 Group 17 端到端阶段
- [x] 6.10 创建 `src/__tests__/embedding-service.test.ts`,mock `@huggingface/transformers`,验证懒加载、就绪状态、错误降级、维度截断

## 7. `EmbeddingQueue`

- [x] 7.1 创建 `src/services/embedding-queue.ts`,使用 `EventTarget` 或 mitt 实现事件广播
- [x] 7.2 实现 `enqueue(memoryId: string)` 将任务加入队列,若队列空闲则启动处理循环
- [x] 7.3 实现 `cancel(memoryId: string)` 从队列中移除未开始的任务
- [x] 7.4 实现内部处理循环:按 `BATCH_SIZE = 8` 切分,调用 `EmbeddingService.embedBatch`,调用 `MemoryService.updateMemoryEmbeddingOnly` 持久化,每批后 `await new Promise(r => setTimeout(r, 0))`
- [x] 7.5 实现 `pause()` / `resume()` 状态控制
- [x] 7.6 实现 `enqueueBacklog(bookId: string)` 扫描书籍中 embedding 缺失或版本过期的记忆批量入队
- [x] 7.7 实现 `getProgress()` 返回 `{ total, completed, etaMs }`,使用最近 5 批吞吐量滑动窗口估算 ETA
- [x] 7.8 在处理失败时捕获错误,继续下一批,广播 `error` 事件
- [x] 7.9 创建 `src/__tests__/embedding-queue.test.ts`,mock `EmbeddingService`,测试批处理、取消、暂停/恢复、失败恢复、进度计算

## 8. `context-builder` 重写

- [ ] 8.1 在 `src/services/ai/tasks/utils/context-builder.ts` 将现有的 `getRelatedMemoriesForChunk` 重命名为 `getRelatedMemoriesForChunkLegacy`,内部逻辑改造为"纯 LRU 兜底"(不再依赖 `attachedTo` 或 `getMemoriesByAttachment`)
- [ ] 8.2 实现新的 `getRelatedMemoriesForChunk`,保持签名不变,内部流程:拉 `getAllBookMemories` → 提取 chunk 实体(terms + characters) → 可选计算 chunk 嵌入 → 逐条打分 → 阈值过滤 → 按预算填充 → 格式化为 `【相关记忆】\n  - [id] summary` 字符串
- [ ] 8.3 实现 task 级 chunk 嵌入缓存(`Map<string, Float32Array>`,任务结束时清空)
- [ ] 8.4 空选择兜底:当打分后 `selected.length === 0` 时调用 `MemoryService.getRecentMemories(bookId, 5, 'lastAccessedAt', false)`
- [ ] 8.5 将选中的 `ScoreBreakdown` 通过参数或 ambient context 传递到 `translation-service.ts`,由 translation 任务在构造 Translation 对象时写入 `memoryScoreBreakdown`
- [ ] 8.6 在新实现外层包裹 `try { new } catch { console.warn; legacy }`,确保异常不影响翻译
- [ ] 8.7 更新或新增 `src/__tests__/context-builder.test.ts`,覆盖:打分路径、语义降级路径、预算裁剪、兜底路径、异常 fallback

## 9. CRUD 到队列的联动

- [ ] 9.1 修改 `MemoryService.createMemory`,成功写入后(不 await)调用 `EmbeddingQueue.enqueue(memory.id)`
- [ ] 9.2 修改 `MemoryService.updateMemory`,对新旧记忆的 `summary` 与 `content` 做 diff,仅文本字段变化时入队
- [ ] 9.3 修改 `MemoryService.deleteMemory`,删除前调用 `EmbeddingQueue.cancel(memoryId)`
- [ ] 9.4 确保嵌入队列写回路径不会再次触发 9.2 的判断(避免死循环):`updateMemoryEmbeddingOnly` 绕过 `updateMemory` 的公共入口,直接写 IDB
- [ ] 9.5 扩展现有 `memory-service.test.ts` 或新增用例,验证 CRUD 与队列的联动(mock EmbeddingQueue)

## 10. 设置存储与 Store

- [ ] 10.1 更新 `src/stores/settings.ts` 使 `memoryInjection` 设置段响应式可读写
- [ ] 10.2 为 `enableSemantic` 的变更添加副作用:`true` 时若模型就绪则 `EmbeddingQueue.resume()`,`false` 时 `EmbeddingQueue.pause()`
- [ ] 10.3 为 `charBudget` 和 `minScoreThreshold` 做范围约束(500 ≤ charBudget ≤ 5000,0 ≤ threshold ≤ 6.0)
- [ ] 10.4 确保 `hasSeenIntro` 默认 `false`,变更后持久化

## 11. 设置对话框新 Tab

- [ ] 11.1 创建 `src/components/dialogs/settings/MemoryInjectionTab.vue`,使用 `<script setup lang="ts">` + PrimeVue 组件
- [ ] 11.2 实现字符预算滑条(范围 500–5000,步长 100),绑定 `settings.memoryInjection.charBudget`
- [ ] 11.3 实现启用语义检索开关,绑定 `enableSemantic`
- [ ] 11.4 实现嵌入模型状态展示,订阅 `EmbeddingService` 状态 + 下载进度 event
- [ ] 11.5 实现下载按钮(状态 = idle 时显示)、重新加载按钮(ready 时显示)、重试按钮(failed 时显示)
- [ ] 11.6 实现高级折叠区:`Accordion` 包含最低分数阈值滑条(范围 0–3,步长 0.1,默认 0.3)
- [ ] 11.7 更新 `src/components/dialogs/SettingsDialog.vue`,在 tabs 列表中添加"记忆注入" tab 并路由到新组件
- [ ] 11.8 更新 `src/i18n/*` 为新 tab 文案添加 key(中/繁/英/日)

## 12. 首次使用温和提示

- [ ] 12.1 在 `SettingsDialog.vue` 的 `onMounted` 或 `watch(visible)` 中,判断 `!settings.memoryInjection.hasSeenIntro` 时使用 PrimeVue Toast 显示提示
- [ ] 12.2 Toast 内容:标题"新功能:语义记忆检索",副文案简短说明,按钮"了解更多" / "稍后"
- [ ] 12.3 "了解更多"触发:切换到 `memory-injection` tab + 关闭 toast + `settings.memoryInjection.hasSeenIntro = true`
- [ ] 12.4 "稍后"触发:关闭 toast + 标记 `hasSeenIntro = true`
- [ ] 12.5 确保 `hasSeenIntro` 一次性行为,重复打开设置不再弹出

## 13. `MemoryPanel` / `MemoryCard` 改造

- [ ] 13.1 在 `MemoryCard.vue` 右上角添加向量状态徽章组件(tiny badge),根据 `embedding`/`embeddingModel` 与当前 `MODEL_VERSION` 决定颜色(绿/黄/红)
- [ ] 13.2 为徽章添加悬停 tooltip,文案解释对应状态
- [ ] 13.3 **删除** `MemoryCard.vue` 中的附件 chips 渲染块(先前使用 `useMemoryAttachments` 懒加载名称的区域)
- [ ] 13.4 在 `MemoryPanel.vue` 工具栏添加"重新向量化本书"按钮
- [ ] 13.5 **删除** `MemoryPanel.vue` 中的"类型筛选"下拉(`全部 / 📚 / 👤 / 📝 / 📖`)
- [ ] 13.6 **删除** `MemoryPanel.vue` 中的"实体筛选"下拉(基于选中类型动态列出实体)
- [ ] 13.7 **删除** `MemoryPanel.vue` 中基于 `attachedTo` 的过滤计数逻辑(filterCounts computed)
- [ ] 13.8 在 `MemoryPanel.vue` 过滤区增加"仅显示未向量化"复选框,筛选逻辑:`!embedding || embeddingModel !== MODEL_VERSION`
- [ ] 13.9 在 `MemoryPanel.vue` 顶部添加进度横幅组件,订阅 `EmbeddingQueue` progress 事件,显示 `X / Y 条记忆` + ETA + 暂停按钮(仅在队列活跃时显示)
- [ ] 13.10 横幅暂停按钮调用 `EmbeddingQueue.pause()`,恢复时按钮切换为"继续"
- [ ] 13.11 保留纯文本搜索框(对 `summary + content` 的 `includes` 匹配),保留"清除筛选"按钮(仅清空文本搜索)
- [ ] 13.12 更新 `src/i18n/*`:添加新 UI 文案 key,**删除**附件相关旧 key(`memory.type.book`、`memory.type.character`、`memory.type.term`、`memory.type.chapter`、`memory.attached` 等)

## 14. `MemoryDetailDialog` 改造

- [ ] 14.1 **删除** "📎 关联实体" 分组整个区块(按类型分组列出附件并提供导航链接的部分)
- [ ] 14.2 删除附件分组的相关 props、emits(`navigate`)与内部状态
- [ ] 14.3 在对话框底部添加 metadata 行,显示 `embeddingModel` 与最近嵌入时间(若有)
- [ ] 14.4 添加"为此记忆生成向量"按钮,仅在 `!embedding || embeddingModel !== MODEL_VERSION` 时可见
- [ ] 14.5 按钮点击调用 `EmbeddingQueue.enqueue(memoryId)` 并显示 loading 状态
- [ ] 14.6 嵌入完成后通过 `memory-changed` 事件刷新对话框状态
- [ ] 14.7 保留所有其他功能(内容展示、创建/访问时间、Memory ID、编辑/删除按钮、复制内容、快捷键)

## 15. `MemoryReferencePanel` 打分可视化

- [ ] 15.1 修改 `MemoryReferencePanel.vue`,从当前 paragraph 的 translation 读取 `memoryScoreBreakdown`
- [ ] 15.2 对每条引用记忆,若 breakdown 中有对应条目,在行尾渲染 ⓘ 图标并挂载 Popover/Tooltip
- [ ] 15.3 Popover 内容:三行"信号 原始值 × 权重 = 加权分"(语义/关键词/时间衰减)+ 分隔线 + "总分 X.XX (满分 6.0)"
- [ ] 15.4 对无 breakdown 的引用(由 AI 工具直接调用),显示 "由 AI 主动调用" 标签替代 ⓘ 图标
- [ ] 15.5 确保混合来源的记忆列表显示正常(两种样式共存)
- [ ] 15.6 更新 `src/i18n/*` 添加打分标签文案

## 16. 触发点联动

- [ ] 16.1 在 `BookDetailsPage.vue` 的 `onMounted` 中,调用 `EmbeddingQueue.enqueueBacklog(bookId)` 执行该书懒 backfill
- [ ] 16.2 在 `EmbeddingService` 首次 init 完成后,广播 `ready` 事件;订阅方(设置 tab、打开的 BookDetailsPage)在收到事件后触发 backfill
- [ ] 16.3 确保切换书籍时取消前一本书的 backfill(避免队列累积)

## 17. 端到端验证

- [ ] 17.1 运行 `bun run lint && bun run type-check` 通过(所有 `attachedTo` / `MemoryAttachment` 引用已清除)
- [ ] 17.2 运行 `bun test` 全部通过
- [ ] 17.3 运行 `bun run build:spa` 验证 bundle 大小无明显增长(Transformers.js 未进主 bundle)
- [ ] 17.4 **硬迁移验证**:在升级前备份一份含 `attachedTo` 字段的 IndexedDB(DevTools export);启动新版本后在 DevTools 中检查:
   - `DB_VERSION` 显示为 9
   - `memories` store 中所有记录的 `attachedTo` 字段**已被删除**
   - 迁移日志显示"迁移 N 条记忆,耗时 X ms"
   - 记忆内容(summary/content/createdAt/lastAccessedAt)完全保留
- [ ] 17.5 **迁移失败回滚验证**:在 `fake-indexeddb` 环境下 mock cursor update 抛异常,验证事务回滚 → DB 保持 v8 状态 → 下次启动重试
- [ ] 17.6 手工测试:含 100+ 条旧记忆的书籍加载,UI 行为正常:
   - 书籍打开正常
   - 记忆面板显示全部记忆(不再分类型筛选)
   - MemoryCard 不再显示附件 chips
   - MemoryDetailDialog 不再显示"关联实体"分组
- [ ] 17.7 手工测试:首次下载嵌入模型 → 自动 backfill → 翻译一段,观察 `MemoryReferencePanel` 的打分 tooltip 显示三信号分值是否合理
- [ ] 17.8 手工测试:关闭 `enableSemantic`,验证翻译仍正常(纯 keyword + recency 降级路径)
- [ ] 17.9 手工测试:删除模型缓存后重启,验证懒加载 + 错误状态显示
- [ ] 17.10 手工测试:AI 翻译任务中,确认 `create_memory` / `update_memory` 不再接受 `attached_to` 参数;AI 提示词明显瘦身(提示词日志对比)
- [ ] 17.11 手工测试 Gist 同步导出:导出数据,检查 JSON 中**不含** `attachedTo`、`embedding`、`embeddingModel`、`memoryScoreBreakdown`
- [ ] 17.12 手工测试 Gist 同步导入:从旧版本应用导出含 `attachedTo` 的 JSON,新版本导入,验证:
   - 导入不 crash
   - 导入后 IDB 中的新记忆**没有** `attachedTo` 字段(反序列化阶段被 strip)
- [ ] 17.13 运行 `bun run dev:electron` 在 Electron 环境重复 17.4 和 17.7 验证
- [ ] 17.14 运行 `openspec validate "optimize-memory-injection" --strict` 确认所有 requirements 都有对应实现佐证
