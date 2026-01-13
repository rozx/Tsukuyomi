## Context

项目当前的“配置”主要包含两类：

- **应用级 settings**：`src/stores/settings.ts`（`AppSettings` + `SyncConfig[]`），启动后加载并驻留内存
- **书籍级 settings/config**：以 `Novel` 字段形式存储于 `src/stores/books.ts` 的 `books[]` 中（例如 `skipAskUser`、`translationChunkSize` 等）

多数业务代码能够直接使用 store 的内存态读取配置，但仍存在少量模块在运行时为了读取配置而直接访问 IndexedDB（例如 AI tool 内部使用 `BookService.getBookById()` 读取 `skipAskUser`，并附带一个短 TTL cache）。

## Goals / Non-Goals

- Goals
  - 提供一个统一的全局配置访问层（GlobalConfig），使 settings/config 在任何模块中“全局可读”
  - 避免在运行时反复触发 IndexedDB 读取（允许启动阶段/首次初始化一次性读取）
  - 保持现有 stores 作为事实来源（source of truth），GlobalConfig 仅提供“快照/门面”
  - 清晰定义缓存一致性：store 更新后，GlobalConfig 的读取结果 MUST 立即反映更新

- Non-Goals
  - 不引入新的持久化存储（仍使用 IndexedDB）
  - 不改变 settings/books 的数据模型（本变更以读取路径与缓存策略为主）
  - 不将“章节内容/大文本块”纳入全局配置缓存（避免高内存占用）

## Decisions

- Decision: GlobalConfig 以 Pinia store 为主数据源
  - 原因：项目已经在 `App.vue` 启动时并行加载 `booksStore.loadBooks()` 与 `settingsStore.loadSettings()`，store 内存态即为“全局可用”的现成缓存

- Decision: 为“非 store 场景”提供一致的初始化入口，而不是各模块自行 TTL cache
  - 形式：提供 `ensureInitialized()`（或等价 API）
  - 规则：初始化阶段允许触发一次 store load / 单次 DB 读；初始化完成后，读取 MUST 不再触发 DB 访问

- Decision: 一致性由“订阅 store 变更/显式写入钩子”保障
  - 选项 A（优先）：在 GlobalConfig 初始化时订阅 store（例如 `store.$subscribe`）并刷新快照
  - 选项 B（备选）：在 `settingsStore.updateSettings/importSettings`、`booksStore.updateBook` 等写路径显式调用 GlobalConfig 的 `updateSnapshotFromStores()`
  - 取舍：选项 A 更不易遗漏；选项 B 更显式但需要维护多个写路径

## Risks / Trade-offs

- “全局同步读取”与“异步初始化”之间存在时间窗口
  - 缓解：GlobalConfig 提供默认值快照（等价于当前 store 默认 state），并允许调用方在关键路径上 `await ensureInitialized()`

- 测试环境/无 Pinia 初始化的场景
  - 缓解：GlobalConfig 支持测试注入（例如 `setSnapshotForTests()` 或 `initWithStores(stores)`），避免隐式依赖 UI/App 启动逻辑

## Migration Plan

- 第一阶段：新增 GlobalConfig（不改现有读取逻辑），并在启动阶段初始化
- 第二阶段：逐步迁移“配置 DB 直读点”到 GlobalConfig
- 第三阶段：删除各模块内的临时 TTL cache（例如 `ask-user-tools.ts` 的 `skipAskUserCache`）

## Open Questions

- GlobalConfig 的“配置范围”边界：
  - 仅覆盖 `AppSettings/SyncConfig` 与书籍级字段（推荐），还是也包含 `AIModel`、封面历史等“偏数据”对象？
- 是否需要为某些配置提供“按 bookId 的细粒度订阅”，以减少无关更新带来的刷新成本？

