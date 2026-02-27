## 1. 数据模型层

- [x] 1.1 在 `SyncConfig` 接口中新增 `lastRemoteUpdatedAt?: string` 字段（`src/models/sync.ts`）
- [x] 1.2 在 `settings.ts` store 中新增 `updateLastRemoteUpdatedAt(timestamp: string)` 方法，用于持久化远程时间戳

## 2. GistSyncService 改造

- [x] 2.1 修改 `downloadFromGist`：新增可选参数 `lastRemoteUpdatedAt?: string`，在获取 Gist 响应后先比对 `updated_at`，如果远程无变更则提前返回 `{ success: true, skipped: true, remoteUpdatedAt }`，不解析 files
- [x] 2.2 修改 `downloadFromGist` 返回类型，新增 `skipped?: boolean` 和 `remoteUpdatedAt?: string` 字段
- [x] 2.3 修改 `uploadToGist` 的返回类型，新增 `remoteUpdatedAt` 字段（从 `gists.update`/`gists.create` 响应中提取 `updated_at`）

## 3. 共享同步执行器

- [x] 3.1 创建 `src/composables/useSyncExecutor.ts`，定义 `SyncExecutorOptions` 接口（`messagePrefix`、`isManualRetrieval`、`onError`、`onProgress`）
- [x] 3.2 实现核心执行流程：远程检测 → 条件下载 → apply → 本地变更检测 → 条件上传，包含所有进度回调和错误处理
- [x] 3.3 在执行器中集成 `lastRemoteUpdatedAt` 的读取和更新逻辑（下载后更新、上传后更新）

## 4. 重构现有 Composables

- [x] 4.1 重构 `useAutoSync.ts`：移除内联同步逻辑，改为调用共享执行器，保留定时器管理和单例模式
- [x] 4.2 重构 `useGistUploadWithConflictCheck.ts`：移除内联同步逻辑，改为调用共享执行器，保留 toast 通知和 `RestorableItem[]` 返回值

## 5. 验证与清理

- [x] 5.1 运行 `bun run lint && bun run type-check` 确保无类型错误和 lint 问题
- [x] 5.2 手动测试完整同步流程：首次同步（无 `lastRemoteUpdatedAt`）→ 二次同步（远程无变更，应跳过下载）→ 本地修改后同步（应上传）
- [x] 5.3 验证自动同步和手动同步都正常工作，进度显示正确
