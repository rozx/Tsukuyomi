# 发布说明 - v0.10.1

## 版本信息

- **版本号**: 0.10.1
- **发布日期**: 2026年4月19日
- **基于版本**: v0.9.4

> 这是 Tsukuyomi 自 v0.9 系列以来最大规模的一次版本更新，涵盖记忆系统重构、章节嵌入检索、同步引擎 Manifest 化、移动端与平板端全新设计、以及跨设备变体架构。建议升级前先在 "设置 → 数据同步" 进行一次完整同步，以确保数据安全。

---

## 🧠 记忆系统重构 (Memory System Overhaul)

本版本将记忆库从简单的列表存储升级为具备语义检索与自动打分能力的智能上下文系统。

### 三信号评分引擎

- 新增 `memory-scoring` 打分流水线，综合三项信号计算注入优先级：
  - **语义相似度**（权重 0.6）：基于本地嵌入的余弦相似度。
  - **关键词匹配**（权重 0.3）：标题、内容与别名的字面命中。
  - **时间衰减**（权重 0.1）：指数衰减偏好近期记忆。
- 总分统一归一到 0–1.0 区间，并提供可视化的分数分解（`ScoreBreakdown`）便于调试和透明化展示。
- 引入**人口感知**（population-aware）打分：按候选池大小自动调整分数分布，解决嵌入分数通胀问题。
- 新增**相对排名过滤器**（relative ranking filter），在嵌入分数整体偏高时仍能挑出真正相关的记忆。
- 统一**严格过滤器**接口，区分硬性最低分阈值与相对相关性裁剪。

### 字符预算注入

- 注入上下文时按字符预算贪心选择，按分数降序填充，超出预算自动截断。
- 新增**记忆注入设置面板**（`MemoryInjectionSettings`），可调节最低分数阈值、字符预算、权重组合。
- 记忆摘要权重提升，并对复合查询自动拆分后分别检索、合并结果。

### 本地嵌入服务

- 引入 `EmbeddingService` + `EmbeddingQueue`：
  - 浏览器内运行的 **Transformers.js** 本地嵌入管线，动态加载以避免污染主 bundle。
  - 异步队列对书籍进行**串行化批量处理**，避免并发写冲突与显存抖动。
  - WebGPU + q4f16 量化优先，失败自动回退到 WASM + q8。
  - 引擎默认模型切换为 **`gte-multilingual-base`**（300M 多语种编码器），并针对查询/文档应用不同任务前缀（EmbeddingGemma 风格）。
- 新增**全局开关 `enableLocalEmbedding`**（默认关闭），确保未启用嵌入的用户不承担模型下载与加载成本；开关关闭时自动停止队列、隐藏相关 UI 与 AI 工具，开启时自动预热。
- 移动端（Quasar Platform 检测）**强制禁用本地嵌入**，规避浏览器 WASM 内存限制。
- 新增浏览器 **Cache Storage 检测**，仅在曾经缓存过模型时启动自动预热，避免首次访问即触发下载。
- 新增嵌入重试机制与退化评分权重，在嵌入不可用时仍可依赖关键词检索提供降级服务。

### 记忆管理 UI

- 新增 **`MemoryPanel`** 组件：书籍级记忆搜索、预览、CRUD，并共享 AI 注入时的打分逻辑以便复现选择结果。
- 记忆 CRUD 与 EmbeddingQueue 联动：新增/编辑记忆后自动入队重新计算向量。
- **测试查询对话框**：在嵌入设置页可直接测试本地向量检索结果与分数。

### AI 工具变化

- 新增工具 **`search_memories`**：接受自然语言 query，内部混合关键词 + 语义检索，取代旧版 `get_recent_memories`。
- 记忆上下文构建器改由 `context-builder` 驱动，AI 翻译/润色/校对任务的上下文注入走统一路径。

---

## 📚 章节嵌入与混合检索 (Chapter Embedding & Hybrid Retrieval)

取代旧的"章节摘要"机制，本版本为每本书的章节建立多向量嵌入索引，并为 AI 提供全文级检索工具。

### 多向量章节索引

- 章节内容按段落分块嵌入，每章额外写入一条 **`kind: 'title'`** chunk（章节标题 + 首段），使得"系列名 / 主题型"查询也能命中。
- 新增 `chapter-embedding-service`、`chapter-embedding-debouncer`、`chapter-status` 工具，支持批量重算、去抖、状态展示。
- 本地向量索引弹窗显示**实际 DB 记录数**，提供批量清理、单书重建、操作按钮等。

### `query_chapter` 混合打分工具

- AI 工具 **`query_chapter`** 使用 z-score 归一化的混合分数：
  - 语义分：`max(title_norm, α·content_max + (1-α)·content_top3_mean)`，α = 0.6
  - 字面关键词分：标题加权 1.0、正文 0.6
  - 总分：`0.65 × semantic + 0.35 × keyword`
- 翻译、润色、校对、聊天助手四类任务的系统提示词均已学习如何调用 `query_chapter` 查找上下文与参考段落。
- 启用 `enableLocalEmbedding` 后工具与提示词引导自动出现；关闭时自动隐藏。

---

## 🔄 同步引擎 Manifest 化 (Manifest-driven Sync)

GitHub Gist 同步从"整包上传"改为基于 **manifest.json** 的增量式流程，在多设备场景下更快、更安全、更节省流量。

### Manifest 架构

- 新增 `sync-manifest-builder`、`content-hash`、`canonical-json` 等工具。
- `manifest.json` 为每个条目（settings / ai-models / cover-history / `novel:<id>` / `memories:<id>` 等）记录 SHA-256 哈希。
- 上传时只推哈希发生变化的文件；下载时只解析变化条目。
- Memory / AI 模型 / 封面历史各自独立成文件，避免单一大文件写放大。

### 并发安全：条件 GET + 伪 CAS

- `useSyncExecutor` 使用 `If-None-Match` 条件 GET 拉取远端 manifest；若 ETag 未变直接跳过解析。
- 上传前采用**伪 CAS**：PATCH 前再次校验远端 ETag，避免多设备静默覆盖。
- `SyncConfig` 新增 `lastRemoteETag` / `knownRemoteHashes` 字段，持久化同步状态。
- 统一处理 **304 Not Modified**，使用直接 fetch 避免 Octokit 噪声日志。

### 删除语义与墓碑

- Manifest 引入**墓碑（tombstones）**机制，使跨设备删除语义正确：A 删除的条目不会被 B 重新推回。
- 上传阶段按远端快照过滤删除目标，修复 "422 Unprocessable" 的空批次错误。
- 恢复页面（"已删除项恢复"）支持 Memory 在内的全部可恢复条目。

### 哈希稳定性

- 哈希输入剥离 **embeddings** 与 **scoreBreakdowns**，向量重算不再触发虚假上传。
- AppSettings 哈希剥离 `syncs`、设备本地字段（如 `lastRemoteETag`），避免同步元信息自身造成循环上传。
- 段落合并采用 **paragraph union + canonical JSON**，解决跨端不同 ID 引发的重复上传。

### 强制推送与可见性

- 新增**强制推送模式**（Force Push），可用本地数据一键覆盖远端，适用于迁移或远端损坏的场景。
- 同步 Header 显示**待同步变更数量**，Popover 展示每一项的详细修改列表（覆盖桌面 / 平板 / 移动端）。
- 撤销/恢复面板识别 Manifest 新增的文件类型。

---

## 📱 移动端全面改版 (Tsukuyomi Mobile Redesign)

结合全新 Tsukuyomi 设计系统，移动端获得一套原生化、跨页一致的专属体验。

### 应用壳层

- 新增**底部 Tab Bar**（阅读 / AI / 帮助 / 书库 / AI 模型等，按上下文自适应）与顶部**系统工具栏（SysBar）**。
- 所有弹窗/Popover/Drawer 统一收敛到 **`MobileBottomSheet`** 与 **`AdaptiveDialog`**，桌面保持 Dialog、移动自动转底部薄片。
- Toast 下移至 SysBar 下方，全宽紧凑样式不再遮挡头部。

### 页面重做

- **首页 / 书库 / 书籍详情 / AI 模型 / 帮助** 全部提供手机专属模板。
- **书籍详情**：实时翻译进度 + 设计一致的章节树 + 卷/章节操作薄片（编辑 / 删除 / 排序）。
- **阅读**：原生堆叠段落布局 + 悬浮操作条 + 批量菜单（翻译 / 续译 / 润色 / 校对 / 重译）；顶部应用栏显示"书名 · 进度%"。
- **翻译进度**：Hero Meter + 分段 Tabs（实时 / 日志 / 待办）+ 待办计数徽章 + 真实的停止/清空/章节过滤操作。
- **聊天**：专属 AppBar + 胶囊输入（pill composer），默认隐藏 tabs / todo / stats。
- **设置**：由弹窗改为独立路由页，桌面和平板新增返回按钮。

### 交互细节

- 首次启动 UX 打磨，整合平台检测逻辑；首次启动引导统一通过 Markdown 渲染。
- Tab 栏保留 `阅读`，移除多余项并按"内容 → AI → 元数据"重排。
- 聊天/翻译进度切换不再错误关闭面板，翻译任务角标只统计翻译类任务。

---

## 💻 平板端专属布局 (Tablet Layouts)

- 新增独立的平板变体（非简单拉伸桌面布局），通过 Quasar 断点驱动。
- **阅读器**双面板、**AI 页**分屏、**聊天**三面板。
- **书籍详情**：可停靠的聊天 / 翻译进度面板、可折叠侧边栏、移动风格章节树 + 工具栏。
- **书库 / 首页 / 设置 / 导航栏**全面打磨，移除水平溢出；帮助移到侧边栏。
- **帮助与 AI 页**在竖屏下重做为 overlay drawer（导航/目录/路由）+ 堆叠头部 + 2 列参数。
- 提取**共享侧栏 + 方向辅助函数 + 右面板状态**，去重 books / book-details 代码。

---

## 🧩 设备变体架构 (Dispatcher + Desktop/Tablet/Mobile)

为根治桌面/平板/移动端差异带来的重复 `v-if="isPhone"` 分支，本版本引入强制性的设备变体规则：

- 新增 **`useDeviceVariant`** composable：Electron 永远强制 `'desktop'`；Web 按响应式断点分派 `'mobile' | 'tablet' | 'desktop'`。
- 所有 `layouts/*.vue` 与 `pages/*.vue` 拆分为 **dispatcher + 三变体** 结构，业务逻辑统一进 composable（`use<Name>.ts`）并通过 `provide / inject` 共享。
- 一次性副作用（auto-sync、AI 任务 watcher、embedding warmup、toast 初始化等）只在 composable 或 dispatcher 注册一次，避免断点切换时重复触发。
- 跨变体共享的弹窗 / Toast 挂载在 dispatcher 层，避免三个变体各自渲染造成状态分叉。
- 已完成迁移：**MainLayout / AppRightPanel / BookDetailsPage / IndexPage / BooksPage / AIPage / HelpPage / NotFoundPage / SettingsPage / TranslationProgress**。

完整规则参见 [CLAUDE.md](../../CLAUDE.md) 的"设备变体规则"章节。

---

## 🎨 Tsukuyomi 设计系统 (Design System)

- 全应用（App Shell / Pages / Reader / 侧栏 / AI 助手）采用统一 Tsukuyomi 设计 token 与色彩。
- 预连接字体 CDN，作用域化 `tracking` token，去除重复侧栏规则。
- 翻译正文色调调整为 `tsukuyomi-200`，长阅读更柔和清晰。
- 面板消息、BatchSummaryPanel 统计、KeyboardShortcutsPopover、ChapterContentPanel 聚焦态、帮助页、AppSideMenu 等组件采用统一排版 tokens。

---

## ⚙️ AI 任务与性能 (AI & Performance)

- **TodoWorkflow 自动化**：根据任务状态自动生成待办、带状态转换门控与清晰的错误消息；chunk index 传递使任务粒度更细。
- **思考流解析**增量化：思考面板支持虚拟渲染，长时间推理不再卡顿；新增思考详情对话框。
- **节流持久化**：AI 处理中对 IDB 写入节流（flush on clear），防止写风暴导致工具结果丢失。
- **翻译进度面板**重构为单任务视图 + 下拉切换；TaskStream 自动滚动更可靠；内联样式迁移到 Tailwind。
- **`getBookById`** 使用 Map 索引，修复并发删除导致的查找异常。
- **上下文溢出保护**：工具调用循环在达到上下文上限前自动截断，避免会话崩溃。
- 导出书籍 JSON 时**包含记忆**（Memory），支持数据完整迁移。

---

## 📝 问题修复 (Bug Fixes)

- 修复：移动端首次启动的 UX 细节与平台检测逻辑不一致问题。
- 修复：`ForceSyncToggle` DOM id 不唯一导致的焦点异常，以及 `useForceSync` Promise 不一致。
- 修复：工具调用循环中上下文溢出导致的聊天失败。
- 修复：书籍页面刷新后活动聊天会话丢失。
- 修复：批量嵌入 Popover 在重建时样式抖动与水平溢出。
- 修复：`enableLocalEmbedding` 开关刷新后未持久化。
- 修复：AI 工具入参空值未校验与未 trim 导致的异常。
- 修复：同步状态 Popover 中长标题溢出、长章节标题溢出、测试查询对话框溢出。
- 修复：单段落翻译因内容全为符号触发完整性警告。
- 修复：Reader 桌面端段落选中高亮丢失（content-visibility 导致的 paint-containment 裁剪）。
- 修复：多章节并发嵌入批次时的池化对齐与陈旧向量写入。
- 修复：IndexedDB v9 升级时阻塞场景的提示。
- 修复：Copilot 代码评审反馈中列出的多项 UI、事件与类型安全问题（PR #80 / #81 / #78）。

---

## 🔧 破坏性变更与迁移 (Breaking Changes)

- **记忆系统**：旧的 `get_recent_memories` 工具已移除，迁移至 `search_memories`（支持自然语言检索）。章节摘要相关 UI 与提示词已下线，使用 `query_chapter` 替代。
- **本地嵌入**：默认关闭；需在"设置 → 本地嵌入"中手动启用。移动端始终禁用。
- **设置弹窗**：改为独立路由页 `/settings`，原弹窗调用入口保留但内部跳转到路由。
- **同步数据格式**：远端 Gist 新增 `manifest.json` 与按条目拆分的多个文件。首次升级会触发一次 Legacy 迁移（自动），如遇跨设备冲突请先在主设备强制推送一次。
- **设备变体**：页面/布局开发必须采用 dispatcher + 三变体模式，不得直接在页面内使用 `v-if="isPhone"`。详见 [CLAUDE.md](../../CLAUDE.md)。

---

## 📚 相关文档

- **设置说明**: `help/settings-guide.md`
- **书籍详情页概览**: `help/book-details-overview.md`
- **记忆管理**: `help/book-details-memory.md`
- **AI 翻译功能**: `help/book-details-translation.md`
- **聊天助手**: `help/chat-assistant-guide.md`

---

_本文档基于 git changes v0.9.4..v0.10.1_
