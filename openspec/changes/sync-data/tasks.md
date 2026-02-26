## 1. Composable 重构

- [x] 1.1 在 `useGistUploadWithConflictCheck.ts` 中新增 `sync()` 方法，实现双向同步流程：下载远程→应用/合并→检测变更→上传（参考 `useAutoSync.performAutoSync` 的流程，但手动同步时 `applyDownloadedData` 传入 `isManualRetrieval=true` 以返回 `RestorableItem[]`）
- [x] 1.2 从 `useGistSync` 返回值中移除 `uploadToGist`、`downloadFromGist`、`confirmUploadWithLocalData`、`cancelPendingUpload`、`hasPendingUpload`、`pendingUploadData`，只导出 `sync()`、`restoreDeletedItems`
- [x] 1.3 移除 `pendingUploadData` ref 和相关的上传确认逻辑（`confirmUploadWithLocalData`、`cancelPendingUpload`），因为统一同步在下载失败时直接终止

## 2. UI 组件更新

- [x] 2.1 在 `SyncStatusPanel.vue` 中将"上传配置"和"下载配置"两个按钮替换为单个"同步"按钮（图标 `pi-sync`），调用新的 `sync()` 方法
- [x] 2.2 从 `SyncStatusPanel.vue` 中移除上传确认对话框（`showUploadConfirmDialog`）及相关逻辑（`confirmLocalUpload`、`cancelUpload`、`pendingUploadData` watch）
- [x] 2.3 在 `SyncSettingsTab.vue` 中将"上传到 Gist"和"从 Gist 下载"两个按钮替换为单个"同步"按钮
- [x] 2.4 更新 `SyncSettingsTab.vue` 中的文案，移除上传/下载分离的措辞

## 3. 验证与清理

- [x] 3.1 运行 `bun run lint && bun run type-check` 确保无类型错误和 lint 问题
- [x] 3.2 手动验证：同步按钮正常触发双向同步流程，进度条正确显示各阶段
- [x] 3.3 手动验证：下载失败时显示错误 toast 并终止（不弹出确认对话框）
- [x] 3.4 手动验证：恢复已删除项目对话框在手动同步时正常弹出
