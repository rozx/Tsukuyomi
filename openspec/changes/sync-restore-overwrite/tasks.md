## 1. Service 层：新增覆盖方法

- [x] 1.1 在 [src/services/sync-data-service.ts](src/services/sync-data-service.ts) 新增静态方法 `SyncDataService.overwriteFromSnapshot(remoteData)`，签名返回 `Promise<void>`
- [x] 1.2 方法开头调用 `validateRemoteData(remoteData)`，校验失败直接抛错
- [x] 1.3 调用 `createBackup()` 生成内存备份
- [x] 1.4 在 try 块中批量清空所有已同步 IndexedDB 存储（books / chapters / chapter-contents / paragraphs / memories / terminology / characters / ai-models / cover-history）及对应 Pinia store 的内存状态
- [x] 1.5 按快照批量写入 novels（含内嵌卷/章/段）、aiModels、coverHistory、memories
- [x] 1.6 合并 `appSettings`：以快照为基础，用当前本地 `gistSync` 的 `token` / `gistId` / `username` / `enabled` / `lastSyncTime` 覆盖，然后写入
- [x] 1.7 清空 `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds` 为空数组
- [x] 1.8 刷新相关 Pinia store（books / aiModels / coverHistory / memories）的内存状态以反映覆盖后的数据
- [x] 1.9 catch 块调用 `restoreFromBackup(backup)` 回滚并重新抛出原始异常

## 2. UI 层：切换调用路径

- [x] 2.1 修改 [src/components/settings/SyncSettingsTab.vue](src/components/settings/SyncSettingsTab.vue) 中 `revertToRevision`：移除手动的 `booksStore.clearBooks` / `aiModelsStore.clearModels` / `coverHistoryStore.clearHistory` 调用
- [x] 2.2 将 `applyDownloadedData(result.data, undefined, true)` 替换为 `SyncDataService.overwriteFromSnapshot(result.data)`
- [x] 2.3 移除 `revertToRevision` 中处理 `restorableItems` / `showRestoreDialog` 的分支（覆盖流程不再返回可恢复项）
- [x] 2.4 保留 `settingsStore.updateLastSyncTime` / `setupAutoSync` / 成功 toast / 错误 toast 的逻辑
- [x] 2.5 更新确认对话框 `message` 文案：从"确定要恢复到该修订版本吗？这将覆盖当前本地数据。"改为"确定要恢复到该修订版本吗？这将用该版本的快照完全覆盖本地数据，本地独有且未同步的内容（包括书籍、记忆、AI 模型等）将会丢失，无法找回。"

## 3. 测试

- [x] 3.1 在 [src/__tests__/sync-data-service.test.ts](src/__tests__/sync-data-service.test.ts) 新增 `describe('overwriteFromSnapshot', ...)`
- [x] 3.2 用例：覆盖后，本地独有的书籍、AI 模型、封面、记忆不再出现（被删除）
- [x] 3.3 用例：覆盖后，快照中的所有书籍、AI 模型、封面、记忆都出现，不受 lastEdited 早于 lastSyncTime 影响
- [x] 3.4 用例：覆盖后 `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds` 被清空为 `[]`
- [x] 3.5 用例：覆盖后 `appSettings` 被快照替换，但 `gistSync.token` / `gistId` / `username` / `enabled` / `lastSyncTime` 保留本地原值
- [x] 3.6 用例：`validateRemoteData` 失败时方法抛错且本地数据保持不变
- [x] 3.7 用例：写入过程抛异常时触发 `restoreFromBackup`，本地数据恢复到覆盖前状态

## 4. 验证

- [x] 4.1 运行 `bun run lint && bun run type-check`，无错误
- [x] 4.2 运行 `bun test sync-data-service`，新老用例全部通过
- [x] 4.3 手动验证：启动 dev 模式，准备本地独有数据与 Gist 远程快照，点击"恢复"按钮，确认 toast 文案、确认对话框文案、覆盖结果符合预期
