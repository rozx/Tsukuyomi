# 发布说明 - v0.14.3

## 版本信息

- **版本号**: 0.14.3
- **发布日期**: 2026 年 7 月 27 日
- **基于版本**: v0.14.2

> 本版本重点打磨 AI 翻译的「可视化体验」与「语义检索质量」：思考过程与模型输出合并为单一时间线，让推理 → 输出 的因果一眼可见；同时把本地嵌入模型切回 GTE 官方 CLS 方案、并重写记忆 / 章节的语义置信度校准与排名融合，长文与跨语言查询的召回质量明显提升。除此之外还合并了冗余的 preparing 阶段、修复了 Todo 上下文堆积，长章节翻译的 token 开销和稳定性一并改善。

---

## 🔥 思考与输出合并的单一时间线 (Unified Thinking+Output Timeline)

旧版进度面板把「思考过程」和「输出内容」拆成两块独立滚动区域，思考末尾的推理结论与输出开头的连接被滚动条切断，难以看出 AI 是如何从推理过渡到译文的。本版本把两条流合并到同一条时间线，并引入「模式标记 + 单光标」机制。

- **单一实时日志面板**：思考片段与输出片段按真实发生顺序穿插渲染，滚动容器与自动滚动统一由父级承担，思考折叠时仍能感知输出在继续推进
- **模式切换标记**：流式文本进入新阶段时插入 `[=== 思考 ===]` / `[=== 输出 ===]` 标记，解析器据此把后续片段归到正确的模式；标记也写入持久化文本，任务从 IndexedDB 恢复后用 `inferStreamMode` 推断当前模式即可继续拼接
- **单光标追加**：store 端按「上一段模式 vs 当前模式」决定是否插入标记，避免双流切换时丢失定位；节流写入仍走原 fast-path，不增加渲染压力
- **历史任务思考过程空白修复**：从 IndexedDB 恢复的任务挂载时已带有完整 `thinkingMessage`，旧版 watch 不会触发解析导致思考区块空白；现在 `useThinkingFormatter` 的 watch 改为 `immediate`，并对「首次出现且已有思考消息」的任务立即完整解析，恢复的历史任务也能正常展示推理过程
- **测试覆盖**：新增 `stream-timeline.test.ts`、`stream-visibility.test.ts`、`thinking-formatter-restore.test.ts` 覆盖模式标记构造、模式推断、增量追加与历史任务恢复

---

## 🧬 嵌入模型对齐 GTE 官方 CLS 方案 (Embedding Model Realignment)

实书对比显示，原先的 mean pooling + query 前缀方案在跨语言章节检索与短查询场景下区分度不足。本版本把嵌入模型严格对齐回 `gte-multilingual-base` 官方示例：

- **Pooling 切回 CLS**：取 encoder 末层首个 token（CLS）作为句向量，与官方示例一致；query 与 document 共用同一编码路径，余弦相似度的对比度更稳定
- **取消非对称前缀**：不再为 query 端添加 `Represent this sentence for searching relevant passages:` 前缀，直接编码原文。模型多语言能力在原始文本上即可发挥，跨语言标题查询的命中率明显回升
- **模型版本号升级**：`gte-multilingual-base@256@mean` → `gte-multilingual-base@256@cls@raw`。版本号变更后，旧的章节 chunk 与记忆向量会被判定为 stale，自动进入重算队列；**升级后请耐心等待嵌入队列完成重算**，期间检索会临时降级到关键词 + 时间衰减
- **任务 API 显式保留**：`EmbeddingTask` 类型仍保留 `'query' | 'document'` 标识调用意图，便于未来更换模型时维持显式契约

---

## 🎯 记忆 / 章节语义检索重写 (Semantic Retrieval Overhaul)

针对「整批都无关却仍被 RRF 抬成高分」与「长记忆被截断后语义漂移」两个根因做了系统性重写。语义检索现在以**绝对置信度 × 批内对比度 × RRF 排名**三者乘积作为最终信号，关键词与时间衰减仅作辅助。

### 记忆检索 (`memory-scoring.ts` / `memory-service.ts`)

- **绝对置信度校准**：原始余弦映射到 `[SEMANTIC_CONFIDENCE_FLOOR=0.45, SEMANTIC_CONFIDENCE_FULL=0.75]` 区间；低于 floor 视为无语义证据，避免无意义查询硬凑出高分
- **批内对比度门控**：候选数 ≥ 4 时，中等相似度必须**比本批中位数高出 0.08** 才能拿到完整对比度置信度，杜绝「全批都无关但相对第一名仍被 RRF 抬成满分」
- **权重切换**：嵌入可用时 `语义 0.85 / 关键词 0.10 / 时间衰减 0.05`（语义主导）；嵌入不可用时 `关键词 0.75 / 时间衰减 0.25`（fallback）。`MemoryReferencePanel` 的权重展示从硬编码改为按 `scoringMode` 动态读取
- **长记忆分段嵌入**：新增 `embedding-text-segments.ts`，按段落 + 句末标点把长文本切成 ≤1200 字的短段，超过 12 段时均匀采样保留首尾中段代表；记忆与查询都走分段 → embedBatch → 稳健聚合，单条超长记忆不再被截断后语义漂移
- **章节标题语义锚点**：`buildChapterSemanticQuery` 把章节原标题与已有译名一并送入嵌入模型，作为翻译 chunk 的低权重辅助 query，增强跨语言标题语义召回

### 章节检索 (`chapter-embedding-service.ts`)

- **chunk 粒度恢复 100 字**：实书对比显示 200 字 chunk 会把多个短对话场景合并稀释，跨语言查询漏召；100 字保留更精确的场景语义与预览定位（chunk 布局版本 `cs400` → `cs100`，触发章节 chunk 重算）
- **语义权重提升到 0.85**：embedding 可用时语义必须是主信号，关键词（0.15）仅用于纠正近邻排序与精确字面命中
- **绝对阈值兜底**：新增 `CHAPTER_QUERY_MIN_SCORE=0.45` 过滤弱相对命中，避免任何 query 都硬凑出 5 个章节；明确字面命中可越过阈值（`KEYWORD_FALLBACK_FLOOR=0.5`），确保语义无区分度时仍能用关键词兜底
- **content max/top3 blend α=0.85**：偏向 max 避免长章节里单个强场景被其它 chunk 稀释，仍保留 0.15 给 top3 mean 用于同分附近提升整章中等命中排名

### 用户可见效果

- 「测试查询」对话框的相似度分数更贴近真实相关性，弱相关条目不再被排到前列
- 翻译时注入的相关记忆 / 章节段落准确度提升，长章节与跨语言标题场景尤为明显
- **首次启动 v0.14.3 后嵌入队列会自动重算所有 stale 条目**（章节 chunk + 记忆向量），期间检索质量会短暂下降，完成后恢复

---

## ⚡ 翻译流程 Todo 与状态机优化 (Todo & State Machine Optimization)

针对长章节翻译中 Todo 清单上下文线性堆积、preparing 阶段冗余等问题做了集中优化，降低 token 开销并改善后续 chunk 的稳定性。

- **合并 preparing 阶段**：原 `planning → preparing → working → review → end` 五阶段中，preparing 的「创建/更新术语/角色/记忆」三条数据维护项已并入 planning 末条；状态机移除 `preparing` 分支、metrics 不再记录 `preparingTime`，AI 翻译少一次状态切换与上下文推送
- **Todo 清单单份化**：旧版每轮工具调用后会向 history 末尾追加最新 Todo 快照，但旧快照不会被清理，长章节翻译时上下文按轮次线性堆积（working 阶段每份含逐段明细，上百行很常见）。现在 `injectTodoContext` 全局只保留最新一份，**按对象引用定位旧消息**（而非扫描 content）移除，避免误删模型自然复述待办的消息
- **简短规划模板**：后续 chunk 已继承前一个 chunk 的规划上下文，新增 `BRIEF_PLANNING_TEMPLATE` 只保留「本部分衔接确认」与「补充新术语/角色/记忆」两项，planning 模板从 10+ 条压缩到 2 条
- **后续 chunk 重新生成阶段 Todo**：旧版非首 chunk 跳过 planning / preparing 的预定义规则，导致后续 chunk 缺少阶段级 Todo；现在所有 chunk 都会生成对应阶段的预定义 Todo，多 chunk 翻译的进度可视化更完整
- **测试覆盖**：新增 `todo-flow-optimization.test.ts`、`task-runner-todo-context.test.ts` 覆盖 Todo 单份化、简短规划模板与状态机合并

---

## 📝 问题修复

- 修复：思考过程与输出内容分两块独立滚动，推理 → 输出 的因果联系被滚动条切断
- 修复：从 IndexedDB 恢复的历史任务挂载时已有思考消息但 watch 不触发解析，思考过程区块空白
- 修复：长章节翻译时 Todo 清单按轮次线性堆积，working 阶段每份含逐段明细导致上下文膨胀
- 修复：非首 chunk 跳过 planning / preparing 预定义 Todo，多 chunk 翻译缺少阶段进度
- 修复：嵌入模型 mean pooling + query 前缀方案在跨语言短查询场景区分度不足
- 修复：记忆语义检索仅依赖 RRF 相对排名，整批都无关时仍会抬出「满分」无关记忆
- 修复：长记忆被截断后语义漂移，单条记忆无法完整参与嵌入比对
- 修复：章节 chunk 粒度过大（200/400 字）导致多个短对话场景被合并稀释
- 修复：记忆详情弹窗在窄屏下的布局拥挤
- 修复：同步数据服务、Gist 同步、AI 助手与术语翻译服务的一批代码质量隐患（错误信息标准化、空值兜底）

---

## ⚠️ 升级提示

- **嵌入模型版本号变更**：`gte-multilingual-base@256@mean` → `gte-multilingual-base@256@cls@raw`，旧的章节 chunk 与记忆向量会被判定为 stale 自动重算。**首次启动 v0.14.3 后请保留窗口前台，等待嵌入队列完成重算**（章节 chunk 布局版本 `cs400` → `cs100` 也会触发章节重嵌）。重算期间检索质量会临时降级，完成后恢复
- **无 IndexedDB schema 变更，无 manifest schema 迁移**：书籍与同步数据结构完全兼容
- **无需重新导入书籍或重建术语 / 角色设定**：本地嵌入重算不影响其它数据
- 多设备用户建议逐台升级，待嵌入队列处理完毕后再触发同步，避免旧向量覆盖新向量

---

## 📚 相关文档

- **本地嵌入**: [`help/local-embedding.md`](help/local-embedding.md) — 嵌入模型、CLS pooling、stale 重算与故障排查
- **记忆管理**: [`help/book-details-memory.md`](help/book-details-memory.md) — 三信号评分公式（语义主导 / 关键词 fallback）
- **AI 翻译功能**: [`help/book-details-translation.md`](help/book-details-translation.md) — 翻译进度面板的合并时间线与阶段说明

---

_本文档基于 git changes v0.14.2..v0.14.3_
