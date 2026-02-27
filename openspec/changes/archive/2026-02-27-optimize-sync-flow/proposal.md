## Why

当前同步流程每次都执行完整的「下载 → 应用/合并 → 检测变更 → 上传」四步流程，即使远程数据没有任何变化也会下载并 apply 全部数据，即使本地没有任何变化也会走完 hasChangesToUpload 检测。自动同步场景下（每隔 N 分钟触发），这造成了不必要的 API 调用、数据处理开销和 UI 进度闪烁。需要在同步流程中引入前置的变更检测，跳过无意义的操作。

## What Changes

- 引入**远程变更检测**：在下载数据之前，通过 Gist 的 `updated_at` 时间戳与本地记录的 `lastSyncTime` 对比，判断远程是否有变更。如果没有变更，跳过下载和 apply 阶段。
- 引入**本地变更预检**：在执行完下载/apply 后（或跳过下载后），先快速判断本地是否有变更需要上传。如果没有变更，直接跳过整个上传阶段（包括数据准备和序列化）。
- 为 `SyncConfig` 新增 `lastRemoteUpdatedAt` 字段，存储上次同步时远程 Gist 的 `updated_at` 时间戳，作为远程变更检测的基准。
- 在 `GistSyncService` 中新增轻量级方法 `checkRemoteUpdated`，使用 Gist GET API 仅获取元数据（不解析文件内容）来判断远程是否有更新。
- 优化 `useAutoSync` 和 `useGistSync` 的同步流程，集成前置检测逻辑。
- 重构 `useAutoSync` 与 `useGistSync` 之间的**重复代码**：两者的同步核心流程（下载 → apply → 检测 → 上传）逻辑高度重复，应抽取为共享的同步执行器。

## Capabilities

### New Capabilities

- `sync-change-detection`: 同步变更检测能力，包括远程变更检测（通过 Gist updated_at 时间戳）和本地变更预检，以及共享同步执行器的设计。

### Modified Capabilities

_(无现有 spec 需要修改)_

## Impact

- **Services 层**:
  - `gist-sync-service.ts`: 新增 `checkRemoteUpdated` 方法
  - `sync-data-service.ts`: `hasChangesToUpload` 逻辑无需修改，但调用时机和上下文会改变
- **Models 层**:
  - `sync.ts`: `SyncConfig` 接口新增 `lastRemoteUpdatedAt` 字段
- **Composables 层**:
  - `useAutoSync.ts`: 同步流程重构，集成前置检测，复用共享执行器
  - `useGistUploadWithConflictCheck.ts`: 同步流程重构，集成前置检测，复用共享执行器
- **Store 层**:
  - `settings.ts`: 需要新增 `updateLastRemoteUpdatedAt` 方法来持久化远程时间戳
- **向后兼容**: 完全向后兼容。`lastRemoteUpdatedAt` 默认为 0，首次同步仍执行完整流程
