## Context

当前应用已有完整的 GitHub Gist 同步系统，包括：

- **`useGistUploadWithConflictCheck.ts`**: 提供 `uploadToGist`（先下载远程→合并→上传）和 `downloadFromGist`（下载→应用）两个独立方法
- **`useAutoSync.ts`**: 自动同步，已实现完整的双向流程：下载→应用→检测变更→上传
- **`SyncStatusPanel.vue`**: 顶栏弹出面板，有独立的"上传配置"和"下载配置"按钮
- **`SyncSettingsTab.vue`**: 设置页面同步标签，有独立的"上传到 Gist"和"从 Gist 下载"按钮

核心矛盾：`uploadToGist` 内部已经执行下载→合并→上传的流程，`performAutoSync` 也是完整双向同步，但 UI 层面仍然暴露为两个独立操作，增加了用户的认知负担。

## Goals / Non-Goals

**Goals:**

- 将手动同步简化为单一"同步"操作，行为与自动同步一致
- 复用 `useAutoSync.performAutoSync` 的双向同步逻辑，避免重复实现
- 保留恢复已删除项目（RestoreDeletedItems）功能，手动同步时展示恢复对话框
- 保持现有的 Gist 修订历史和回滚功能不变
- 调整 UI 文案和按钮布局以反映统一同步概念

**Non-Goals:**

- 不改变底层数据格式或 Gist 存储结构
- 不改变 `GistSyncService` 或 `SyncDataService` 的核心逻辑
- 不增加新的同步后端（如 WebDAV、S3 等）
- 不实现实时同步或 WebSocket 推送

## Decisions

### D1: 统一为单一 `sync()` 方法，基于 auto-sync 流程

**选择**: 在 `useGistSync` composable 中新增 `sync()` 方法，复用 `useAutoSync.performAutoSync` 的双向流程（下载→应用→检测变更→上传），但增加手动同步特有的 UX 处理（恢复对话框、toast 反馈）。

**替代方案**:

- 直接调用 `performAutoSync()` — 不可行，因为手动同步需要返回 `RestorableItem[]` 给 UI 展示恢复对话框，而 auto-sync 静默跳过
- 保留 `uploadToGist` 改名为 `sync` — 不够，因为 `uploadToGist` 只在有 Gist ID 时才下载远程数据，且不包含 `hasChangesToUpload` 优化

**理由**: `performAutoSync` 的流程最完整、最健壮（下载→应用→检测变更→有变更才上传），是最佳参考模型。但手动同步需要额外支持恢复对话框，因此需要新方法而非直接复用。

### D2: 移除独立的 upload/download 方法的公开接口

**选择**: 从 `useGistSync` 的返回值中移除 `uploadToGist` 和 `downloadFromGist`，只保留 `sync()`。内部的 `downloadRemoteData` 和 `performUpload` 作为私有辅助方法保留。

**理由**: 如果仍然暴露独立的上传/下载方法，UI 层可能误用或者未来开发者可能恢复分离的 UX。移除公开接口可以从代码层面确保统一。

**例外**: 自动同步（`useAutoSync`）保持自己的实现，因为它有独立的进度前缀（`[自动同步]`）和静默处理逻辑。未来可考虑让 `useAutoSync` 也调用 `sync()`，但不在本次变更范围内。

### D3: 下载失败时的处理策略

**选择**: 下载失败时，显示错误 toast 并终止同步，不提供"仍然上传"的确认对话框。

**替代方案**: 保留当前的"下载失败→确认是否继续上传"对话框

**理由**: 统一同步的语义是"合并双方数据"，如果无法获取远程数据就无法合并。提供"仍然上传"选项违反了"同步"的语义，等同于"强制覆盖"。用户可以稍后重试。如果确实需要强制覆盖远程数据，可以通过 Gist 修订历史回滚。

### D4: 同步进度阶段调整

**选择**: 统一同步的进度分为三个阶段：下载（50%）→ 应用/合并（10%）→ 上传（40%），与当前 auto-sync 的比例一致。

**理由**: 复用已验证的进度映射逻辑，保持用户体验的一致性。

## Risks / Trade-offs

- **[移除强制上传能力]** → 用户在网络不稳定时无法绕过下载失败直接上传。缓解措施：引导用户在网络恢复后重试；Gist 修订历史提供数据安全网。
- **[auto-sync 未统一]** → `useAutoSync` 保持独立实现，存在两处同步逻辑。缓解措施：本次变更后两处逻辑行为一致，后续可统一。
- **[UI 文案变更]** → 用户习惯了"上传/下载"的措辞，切换到"同步"可能短暂困惑。缓解措施：按钮标签和 toast 消息使用清晰的"同步"措辞。
