## Why

当前"恢复到某修订版本"的流程虽然在 UI 层会清空书籍/模型/封面历史，但随后仍调用通用的 `applyDownloadedData` 合并函数：它会根据 `lastEdited` 时间戳比较、保留本地独有条目、弹出"恢复已删除项"对话框，结果是"合并"而非"覆盖"。这违背用户对"恢复到某版本"的直觉——应当是"回到那个时间点的完整状态"，而不是与当前本地状态合并。

## What Changes

- **BREAKING**：恢复到修订版本后，本地独有且未同步的内容（书籍、AI 模型、记忆、封面历史等）将被删除，不再保留。
- 在 `SyncDataService` 新增专用方法 `overwriteFromSnapshot(remoteData)`，执行纯覆盖：清空所有已同步数据存储，再按快照批量写回。
- 恢复流程 `revertToRevision`（[SyncSettingsTab.vue](src/components/settings/SyncSettingsTab.vue)）改为调用 `overwriteFromSnapshot`，不再调用 `applyDownloadedData`。
- 恢复场景不再弹出"恢复已删除项"对话框（覆盖语义下该对话框无意义）。
- 恢复时覆盖 `appSettings`，但保留 GitHub Gist 凭据字段（`token` / `gistId` / `username` / `enabled`）以及 `lastSyncTime`，避免用户被登出。
- 恢复后清空 `deletedNovelIds` / `deletedModelIds` 删除记录（快照之前的删除记录不再有意义）。
- 确认对话框文案更明确地警告数据丢失风险。
- 自动同步与手动拉取仍保持现有的合并语义（`applyDownloadedData`），本次变更不影响它们。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `data-sync`：新增"恢复到修订版本时执行完全覆盖"的需求；与现有"手动同步时恢复已删除项目"需求并列但互斥——恢复修订版本不触发该对话框。

## Impact

- 代码：
  - [src/services/sync-data-service.ts](src/services/sync-data-service.ts) — 新增 `overwriteFromSnapshot` 方法
  - [src/components/settings/SyncSettingsTab.vue](src/components/settings/SyncSettingsTab.vue) — 修改 `revertToRevision` 调用路径与确认文案
- 测试：[src/__tests__/sync-data-service.test.ts](src/__tests__/sync-data-service.test.ts) 新增覆盖场景
- 用户行为：从"恢复后还保留本地未同步数据"变为"恢复后本地状态 = 该版本快照"；用户被警告文案提示数据丢失风险
- 依赖/API：无新增，不影响外部契约
