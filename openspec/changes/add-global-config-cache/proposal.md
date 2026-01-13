# Change: 全局配置缓存（避免重复读取 IndexedDB）

## Why

当前项目的设置与书籍级配置，主要由 Pinia stores（如 `settings`、`books`）在应用启动时从 IndexedDB 加载并缓存于内存中。

但在部分**非组件/非 store**上下文（例如 AI tools 内部）仍存在“为了读取一个配置字段而直接访问 IndexedDB”的实现（典型例子：`ask_user` 工具为读取 `skipAskUser` 会调用 `BookService.getBookById()`，并额外做了 TTL 缓存）。

这会带来几个问题：

- 配置读取路径不一致：同一字段在不同模块里分别走 store / DB / TTL cache
- 性能与可预测性：高频工具调用可能反复触发 IndexedDB I/O（即使有短 TTL 也只是缓解）
- 可测试性：不同路径对“Pinia 是否已初始化/是否已加载”更敏感

因此需要一个**统一的“全局配置访问层”**，把 settings/config 作为“全局可用”的内存快照来访问，避免模块在运行时再去“读一遍数据库”。

## What Changes

- 新增一个全局配置缓存/访问层（下称 **GlobalConfig**）：
  - 提供同步读取 API（例如 `getAppSettingsSnapshot()`、`getBookConfigSnapshot(bookId)`），可在任何模块中调用
  - 数据来源优先使用 Pinia store（`settingsStore` / `booksStore`）的内存态
  - 在 store 未就绪的情况下，允许通过一个统一的 `ensureInitialized()` 做**一次性**的初始化（触发 store load 或等价的单次 DB 读取）
  - 提供订阅/事件机制（可选），让需要响应更新的模块在配置变更时获得通知
- 将现有“直接读 DB 获取配置”的散点收敛到 GlobalConfig：
  - 例如 `src/services/ai/tools/ask-user-tools.ts` 的 `skipAskUser` 读取：改为读 GlobalConfig（不再自己实现 TTL + inFlight）
  - 其他类似的配置读取点（若存在）也应迁移
- 明确“配置更新/导入/同步”时的缓存一致性策略：
  - 当 `settingsStore.updateSettings/importSettings/updateGistSync` 或 `booksStore.updateBook/bulkAddBooks` 等变更发生时，GlobalConfig MUST 反映最新值
  - 严禁在更新后出现“缓存值落后于 store/数据库”的状态（至少在同一进程/同一窗口内）

## Impact

- Affected specs:
  - 新增 capability：`global-config-cache`
- Affected code (预计实现阶段修改/新增):
  - 新增：`src/services/global-config-cache.ts`（或等价位置）
  - 修改：`src/services/ai/tools/ask-user-tools.ts`（移除 DB 直读 + TTL cache，改读 GlobalConfig）
  - 可能修改：`src/services/ai/tasks/utils/ai-task-helper.ts`（统一书籍级配置读取入口）
  - 可能修改：`src/App.vue`（在启动阶段显式初始化 GlobalConfig，确保 AI 相关流程在配置就绪后开始）

