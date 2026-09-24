## ADDED Requirements

### Requirement: 强制推送模式 toggle

系统 SHALL 在 Gist 同步 UI 中提供一个持久化的 "强制推送本地数据到远程" toggle，用户可手动开启以进入强制模式。toggle 状态 SHALL 保存在 `SyncConfig.forceSyncMode.active` 中。

#### Scenario: toggle 默认关闭

- **WHEN** 用户首次使用应用或旧版本升级后 `SyncConfig.forceSyncMode` 字段不存在
- **THEN** toggle 显示为关闭状态，等同 `forceSyncMode.active = false`

#### Scenario: 用户开启 toggle

- **WHEN** 用户在 `SyncSettingsTab` 或 `SyncStatusBody` 中勾选 toggle
- **THEN** 系统将 `forceSyncMode.active` 设为 `true` 并持久化到 IndexedDB，两处 UI 通过 Pinia 响应性同步更新

#### Scenario: 用户关闭 toggle

- **WHEN** 用户在任一 UI 入口取消勾选 toggle
- **THEN** 系统将 `forceSyncMode.active` 设为 `false`，清除 `forceSyncMode.lastFailedAt`，两处 UI 同步更新

### Requirement: 强制推送模式 UI 入口

`ForceSyncToggle` 组件 SHALL 同时出现在 `SyncSettingsTab`（设置页）和 `SyncStatusBody`（顶栏同步面板的桌面 Popover 与手机 BottomSheet）中。两处共享同一 Pinia 状态，任一处的变更 SHALL 立即反映到另一处。

#### Scenario: SyncSettingsTab 渲染 toggle

- **WHEN** 用户打开设置页的"同步"标签
- **THEN** 页面在"操作按钮"区块顶部（"同步"按钮正上方）渲染 ForceSyncToggle，包含 toggle 控件、警告文字和失败时的 badge

#### Scenario: SyncStatusBody 渲染 toggle

- **WHEN** 用户从顶栏打开同步面板（桌面 Popover 或手机 BottomSheet）
- **THEN** 面板底部按钮区上方渲染 ForceSyncToggle，与设置页使用同一组件

#### Scenario: 两处状态同步

- **WHEN** 用户在一处切换 toggle
- **THEN** 另一处的 toggle 状态通过 Pinia 响应性自动更新，无需刷新页面

### Requirement: 强制推送主按钮动态切换

"同步"按钮 SHALL 基于 `forceSyncMode.active` 动态切换 label、severity 与 handler：

- `active = false` → label "同步"、severity `primary`、handler 调用普通双向同步
- `active = true` → label "强制推送到远程"、severity `danger`、handler 调用强制推送流程

#### Scenario: 普通模式点击主按钮

- **WHEN** `forceSyncMode.active` 为 `false` 且用户点击主按钮
- **THEN** 系统调用 `useGistSync().sync()`，执行双向同步流程，不弹出任何确认对话框

#### Scenario: 强制模式点击主按钮

- **WHEN** `forceSyncMode.active` 为 `true` 且用户点击显示为 "强制推送到远程" 的主按钮
- **THEN** 系统弹出 PrimeVue ConfirmDialog（`group="force-sync"`、`severity="danger"`），内容警告将永久删除远端独有条目，用户必须显式点击 "确认" 才会执行强制推送

#### Scenario: 用户在确认对话框点击取消

- **WHEN** 用户在强制推送确认对话框中点击 "取消" 或关闭
- **THEN** 系统不执行推送，`forceSyncMode.active` 保持为 `true`，toggle 状态不变

### Requirement: 强制推送单向覆盖流程

当用户确认强制推送时，系统 SHALL 通过 `useSyncExecutor.executeForceSync()` 执行单向覆盖流程：以本地为准，严格镜像到远端。

#### Scenario: 跳过远端数据应用

- **WHEN** `executeForceSync()` 执行
- **THEN** 系统拉取远端文件清单（`remoteFilesSnapshot`），但 SHALL NOT 将远端条目应用到本地任何 store

#### Scenario: 跳过 pseudo-CAS 预检

- **WHEN** `executeForceSync()` 准备上传
- **THEN** 系统 SHALL NOT 调用 `verifyRemoteUnchanged`，即使远端自上次已知状态后发生变更也直接覆盖

#### Scenario: 本地 manifest 完整上传

- **WHEN** `executeForceSync()` 上传阶段
- **THEN** 系统构造 `effectiveConfig = { ...config, knownRemoteHashes: {}, knownRemoteEntries: {} }` 并调用 `uploadToGistIncremental`，使其将所有本地 manifest 条目视为新增/修改

#### Scenario: 远端独有条目被删除

- **WHEN** 远端 Gist 包含本地 manifest 中不存在的条目（小说、memories、AI 模型、封面）
- **THEN** `uploadToGistIncremental` 将这些条目对应的 Gist 文件 PATCH 删除，使远端与本地严格一致

#### Scenario: 墓碑合并

- **WHEN** `executeForceSync()` 构建上传 payload
- **THEN** 系统按现有规则合并本地 `deletedNovelIds` 和本次拉取的远端墓碑，写入新 manifest.tombstones

### Requirement: 强制推送成功自动重置 toggle

系统 SHALL 在强制推送成功完成后自动关闭 toggle，确保每次强制推送都是显式发起。

#### Scenario: 推送成功

- **WHEN** `executeForceSync()` 返回 `success: true`
- **THEN** 系统更新 `forceSyncMode.active = false`，清除 `lastFailedAt`，更新 `lastSyncTime`，持久化新的 `knownRemoteHashes` / `knownRemoteEntries` / `knownRemoteTombstones` / `lastRemoteETag`，显示成功 toast

### Requirement: 强制推送失败保留 toggle 并显示失败提示

系统 SHALL 在强制推送失败后保持 toggle 开启，并在 UI 中显示失败 badge，避免用户误以为已退出强制模式。

#### Scenario: 拉取远端清单失败

- **WHEN** `executeForceSync()` 阶段 1 拉取远端 Gist 失败（网络错误、认证失败等）
- **THEN** 系统保持 `forceSyncMode.active = true`，设置 `forceSyncMode.lastFailedAt = Date.now()`，显示错误 toast

#### Scenario: 上传失败

- **WHEN** `executeForceSync()` 调用 `uploadToGistIncremental` 失败
- **THEN** 系统保持 `forceSyncMode.active = true`，设置 `lastFailedAt`，显示错误 toast

#### Scenario: 失败后显示 badge

- **WHEN** `forceSyncMode.active = true` 且 `forceSyncMode.lastFailedAt` 存在
- **THEN** ForceSyncToggle 在 toggle 下方显示 badge "上次失败 — 点击同步重试，或关闭 toggle 退出"

#### Scenario: 失败后重试

- **WHEN** 用户在失败状态下再次点击 "强制推送到远程" 主按钮并确认
- **THEN** 系统再次执行 `executeForceSync()`；成功后按成功流程重置 toggle 和 badge

### Requirement: 自动同步豁免强制推送

自动同步 SHALL 忽略 `forceSyncMode.active`，无论 toggle 状态如何，自动同步永远执行常规双向同步（`executeSync`）。

#### Scenario: toggle 开启时自动同步触发

- **WHEN** 定时器触发自动同步且 `forceSyncMode.active = true`
- **THEN** 系统调用 `executeSync()`，执行正常双向同步流程，不触及 `executeForceSync()`，`forceSyncMode.active` 状态不变

### Requirement: 首次同步（无 Gist ID）时 toggle 失效

当 Gist ID 未配置时，即使 toggle 开启，系统也 SHALL 走普通首次上传流程并自动重置 toggle。

#### Scenario: 无 gistId 情况下点击主按钮

- **WHEN** `forceSyncMode.active = true` 但 `SyncConfig.syncParams.gistId` 为空且用户点击 "强制推送到远程"
- **THEN** 系统 SHALL NOT 弹出确认对话框，而是调用普通首次上传逻辑（由 `executeSync` 的首次同步分支处理），创建新 Gist，完成后显示 toast 提示"未检测到远程 Gist，已按普通同步处理"，并将 `forceSyncMode.active` 重置为 `false`
