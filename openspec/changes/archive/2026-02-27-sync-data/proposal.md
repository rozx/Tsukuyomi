## Why

当前同步功能将"上传"和"下载"作为两个独立操作暴露给用户，要求用户判断应该上传还是下载。这增加了认知负担，且容易因操作顺序不当导致数据被覆盖。实际上，自动同步（auto-sync）内部已经执行了"先下载、再合并、再上传"的完整双向流程，但手动操作却没有提供同等的体验。应将手动同步简化为一键"同步"，与自动同步行为一致。

## What Changes

- **移除** SyncStatusPanel 和 SyncSettingsTab 中独立的"上传配置"和"下载配置"按钮
- **新增** 统一的"同步"按钮，执行完整的双向同步流程（下载远程 → 合并 → 上传变更）
- **简化** `useGistUploadWithConflictCheck` composable，将 `uploadToGist` 和 `downloadFromGist` 合并为单一的 `sync` 方法
- **保留** 自动同步（auto-sync）现有行为不变，因为它已经是双向同步
- **保留** 恢复已删除项目（RestoreDeletedItems）功能，集成到同步流程中
- **保留** Gist 修订历史和回滚功能
- **调整** 同步进度显示，反映统一同步流程的阶段（下载 → 合并 → 上传）
- **调整** 设置页面中"同步设置"标签的文案和布局，移除上传/下载分离的措辞

## Capabilities

### New Capabilities

- `data-sync`: 统一的双向数据同步能力，替代独立的上传和下载操作。涵盖：手动一键同步触发、同步流程编排（下载→合并→上传）、冲突处理策略、进度反馈、错误处理与回退

### Modified Capabilities

_无需修改现有 spec — 当前 openspec/specs/ 中没有同步相关的 spec。_

## Impact

- **Composables**: `useGistUploadWithConflictCheck.ts` — 重构为统一 sync 接口；`useAutoSync.ts` — 可能复用新的 sync 方法
- **UI 组件**: `SyncStatusPanel.vue` — 移除上传/下载按钮，替换为同步按钮；`SyncSettingsTab.vue` — 移除独立的上传/下载按钮，替换为同步按钮，更新文案
- **Services**: `gist-sync-service.ts` 和 `sync-data-service.ts` — 底层逻辑基本不变，但可能需要调整接口以更好支持统一流程
- **Store**: `settings.ts` — 同步状态和进度可能需要微调以反映统一流程
- **无破坏性变更**: 底层数据格式、Gist 存储结构、合并逻辑均不变
