## Context

当前恢复修订版本的实现（[SyncSettingsTab.vue:486-550](src/components/settings/SyncSettingsTab.vue#L486-L550)）分两步：

1. UI 层手动清空 `books` / `aiModels` / `coverHistory` store。
2. 调用 `SyncDataService.applyDownloadedData(data, undefined, /*isManualRetrieval=*/true)`。

`applyDownloadedData` 的职责是"自动/手动同步时的合并"，它包含：按 `lastEdited` 比较、对远程缺失但本地新增的条目做保留、发现本地已删除但远程存在的条目时返回 `RestorableItem[]` 以弹出恢复对话框。这些逻辑与"恢复到某版本快照"的语义不匹配——用户意图是"回到那个时间点的状态"，但实际结果保留了本地独有条目且弹出恢复对话框，体感上是"合并"。

相关代码：

- [src/services/sync-data-service.ts](src/services/sync-data-service.ts) — `applyDownloadedData`（约 L653）、`createBackup` / `restoreFromBackup`（约 L582）、`validateRemoteData`（约 L469）
- [src/components/settings/SyncSettingsTab.vue](src/components/settings/SyncSettingsTab.vue) — `revertToRevision`

## Goals / Non-Goals

**Goals:**

- 恢复修订版本后，本地状态 = 该版本快照（纯覆盖）
- 流程失败时能回滚到覆盖前状态，避免数据双失
- 保留 Gist 同步凭据，避免用户被登出
- 不污染 `applyDownloadedData` 的合并语义；自动同步与手动拉取的行为保持不变

**Non-Goals:**

- 不改变 Gist 修订历史的获取方式（`getGistRevision` / `downloadFromGistRevision`）
- 不改变自动同步与手动拉取的合并策略
- 不新增"导出快照到本地文件"之类的备份能力

## Decisions

### 决策 1：新增独立方法而非复用 `applyDownloadedData`

在 `SyncDataService` 新增 `overwriteFromSnapshot(remoteData)`，不走 `applyDownloadedData`。

**备选方案：** 给 `applyDownloadedData` 增加 `mode: 'merge' | 'overwrite'` 参数。

**理由：** `applyDownloadedData` 已有 `isManualRetrieval` 布尔参数和大量分支，再叠加一个 `overwrite` 模式会让该函数长度、复杂度、分支数继续膨胀，且两种模式实际共享逻辑极少（覆盖模式不需要 lastEdited 比较、不需要 deletedIds 对账、不返回 `RestorableItem[]`）。两个独立方法各自职责清晰。

### 决策 2：`overwriteFromSnapshot` 的执行顺序

1. `validateRemoteData(remoteData)` — 校验失败直接抛错，不动本地数据
2. `createBackup()` — 生成内存备份，用于失败回滚
3. `try`：
   - 批量清空：books + chapters + chapter-contents + paragraphs + memories + terminology + characters + ai-models + cover-history
   - 批量写入快照：novels（含内嵌卷/章/段）、aiModels、coverHistory、memories
   - 覆盖 `appSettings`：从快照 clone 一份，用当前本地值覆盖 `gistSync.token` / `gistSync.gistId` / `gistSync.username` / `gistSync.enabled` / `gistSync.lastSyncTime`，再写入
   - 清空 `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds`
   - 刷新相关 Pinia store 的内存状态（books / aiModels / coverHistory / memories）
4. `catch`：调用 `restoreFromBackup(backup)` 回滚，并向上抛原始异常

**理由：** 先校验再备份再清空，保证"要么成功覆盖，要么完全回滚"。凭据与 `lastSyncTime` 合并放在 appSettings 写入步骤内处理，避免散在多处。

### 决策 3：不返回 `RestorableItem[]`

`overwriteFromSnapshot` 返回 `void`（或 `{ success: true }`）。`revertToRevision` 不再读取可恢复项列表，不再弹出 `RestoreDeletedItemsDialog`。

**理由：** 覆盖语义下"已删除项"的概念不存在——所有条目都被覆盖，弹出恢复对话框会与"完全覆盖"的意图矛盾。

### 决策 4：确认对话框文案升级

文案从"确定要恢复到该修订版本吗？这将覆盖当前本地数据。"改为更明确的警告，指出本地独有未同步内容将丢失且无法找回。

**理由：** 方案 A（纯覆盖）的代价是潜在数据丢失，用户必须被明确告知才能做出知情决定。

## Risks / Trade-offs

- **风险：** 本地未同步的记忆/书籍/模型在恢复时永久丢失 → **缓解：** 确认对话框明确警告；`createBackup` + `restoreFromBackup` 保证单次操作失败时能回滚（但用户主动确认后的数据丢失是设计预期，不会回滚）。
- **风险：** 清空 `deletedNovelIds` / `deletedModelIds` 后，若用户在恢复后再次触发手动同步，可能表现出不同于预期的恢复对话框行为 → **缓解：** 删除记录在快照恢复后确实失去语义（它们记录的是"相对旧状态的删除"），清空是正确的。若快照里本就有条目，它们会作为本地条目存在，不会被误判为"已删除"。
- **风险：** 快照中 `appSettings` 缺少 `gistSync` 字段 → **缓解：** 保留凭据时做 null-safe 合并，以当前 `settingsStore.gistSync` 为准。
- **风险：** 写入过程中 IndexedDB 配额/权限异常导致部分写入 → **缓解：** `restoreFromBackup` 回滚；若回滚本身失败，复用现有的错误提示路径（参照 [sync-data-service.ts:1405](src/services/sync-data-service.ts#L1405)）。

## Migration Plan

一次性代码变更，无数据迁移。部署后下次用户点击"恢复"按钮时即采用新行为。无需特性开关，无需分阶段发布。

## Open Questions

无。确认点均已在 brainstorm 阶段与用户对齐（方案 A + 保留凭据 + 记忆全量覆盖 + 强化警告文案）。
