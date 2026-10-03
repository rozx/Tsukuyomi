# data-sync Specification

## Purpose

定义基于 GitHub Gist 的数据同步操作：统一的手动同步入口、错误处理与进度反馈、手动同步时恢复已删除项，以及恢复到修订版本时完全覆盖本地数据并保留同步凭据。

## Requirements

### Requirement: 统一手动同步操作

系统 SHALL 提供单一的"同步"操作替代独立的"上传"和"下载"操作。手动同步 SHALL 执行完整的双向同步流程：下载远程数据 → 合并/应用 → 检测本地变更 → 上传变更。

#### Scenario: 正常双向同步

- **WHEN** 用户点击"同步"按钮且 Gist 同步已启用并配置
- **THEN** 系统下载远程 Gist 数据，与本地数据合并（书内术语/角色/别名及语言槽遵循稳定身份、删除优先和逻辑版本；其他数据沿用其既有领域合并规则），检测是否有本地变更需要上传，若有则上传合并后的数据到 Gist

#### Scenario: 首次同步（无 Gist ID）

- **WHEN** 用户点击"同步"按钮且尚未配置 Gist ID
- **THEN** 系统跳过下载阶段，直接上传本地数据到 Gist，并保存返回的 Gist ID

#### Scenario: 无本地变更

- **WHEN** 同步下载并应用远程数据后，本地数据与远程数据无差异
- **THEN** 系统跳过上传阶段，显示"同步完成（无更改需要上传）"

#### Scenario: 同步未启用

- **WHEN** 用户点击"同步"按钮且 Gist 同步未启用或凭证未配置
- **THEN** 系统显示警告提示"请先在设置中配置 Gist 同步"

### Requirement: 同步错误处理

系统 SHALL 在同步过程中发生错误时终止同步并向用户反馈错误信息。

#### Scenario: 下载阶段失败

- **WHEN** 同步过程中下载远程数据失败（网络错误、认证失败等）
- **THEN** 系统终止同步流程，显示错误 toast，不继续执行上传操作

#### Scenario: 上传阶段失败

- **WHEN** 同步过程中上传数据到 Gist 失败
- **THEN** 系统显示错误 toast，已下载并应用的远程数据保留（不回滚）

#### Scenario: 同步进行中重复触发

- **WHEN** 同步正在进行时用户再次点击"同步"按钮
- **THEN** 同步按钮 SHALL 处于禁用状态，阻止重复触发

### Requirement: 同步进度反馈

系统 SHALL 在同步过程中向用户展示实时进度，包括当前阶段和完成百分比。

#### Scenario: 显示分阶段进度

- **WHEN** 同步正在执行
- **THEN** 系统在 SyncStatusPanel 中显示进度条和当前阶段标签（下载中/应用中/合并中/上传中），百分比反映整体进度（下载占 50%，应用/合并占 10%，上传占 40%）

#### Scenario: 同步完成

- **WHEN** 同步流程全部完成（无论是否有数据需要上传）
- **THEN** 系统显示成功 toast"同步完成"，更新最后同步时间，清理过期的删除记录

### Requirement: 手动同步时恢复已删除项目

手动同步 SHALL 在应用远程数据时检测本地已删除但远程仍存在的项目，并允许用户选择恢复。

#### Scenario: 发现可恢复项目

- **WHEN** 手动同步下载远程数据后发现本地已删除但远程存在的项目（书籍、AI 模型、封面）
- **THEN** 系统显示恢复对话框，列出可恢复项目的名称、类型和删除时间，用户可选择恢复或跳过

#### Scenario: 用户选择恢复

- **WHEN** 用户在恢复对话框中选中项目并点击"恢复选中项目"
- **THEN** 系统恢复选中的项目到本地，并从删除记录中移除已恢复项目的 ID

#### Scenario: 用户跳过恢复

- **WHEN** 用户在恢复对话框中点击"跳过"
- **THEN** 系统关闭对话框，不恢复任何项目，继续正常的同步流程

### Requirement: 移除独立的上传和下载按钮

系统 SHALL 从所有 UI 入口移除独立的"上传配置"和"下载配置"按钮，替换为统一的"同步"按钮。

#### Scenario: SyncStatusPanel 按钮替换

- **WHEN** 用户打开 SyncStatusPanel 弹出面板
- **THEN** 面板底部显示单个"同步"按钮（图标使用 `pi-sync`），替代之前的"上传配置"和"下载配置"两个按钮

#### Scenario: SyncSettingsTab 按钮替换

- **WHEN** 用户打开设置页面的同步设置标签
- **THEN** 页面显示单个"同步"按钮，替代之前的"上传到 Gist"和"从 Gist 下载"两个按钮

### Requirement: Composable 接口简化

`useGistSync` composable SHALL 导出统一的 `sync()` 方法替代 `uploadToGist()` 和 `downloadFromGist()`。

#### Scenario: sync 方法返回值

- **WHEN** 调用 `sync()` 方法
- **THEN** 方法返回 `Promise<RestorableItem[]>`，包含可恢复的已删除项目列表（无可恢复项目时返回空数组）

#### Scenario: 移除废弃方法

- **WHEN** 重构 `useGistSync` composable
- **THEN** composable 不再导出 `uploadToGist`、`downloadFromGist`、`confirmUploadWithLocalData`、`cancelPendingUpload`、`hasPendingUpload`、`pendingUploadData`

### Requirement: 恢复到修订版本时执行完全覆盖

恢复到 GitHub Gist 历史修订版本 SHALL 使用完全覆盖语义：本地已同步数据存储（书籍、AI 模型、记忆、封面历史等）在写入远程快照前被清空，恢复完成后本地可见业务内容等于该版本快照，不保留任何本地独有且不在快照中的活动条目。对于书内术语/角色/别名及多语言槽，协议元数据 SHALL 按 book-entity-sync 执行明确恢复：保留已知 tombstone、使用新身份和新版本及固定引用映射，不要求协议元数据逐字等于旧快照。

#### Scenario: 用户确认恢复修订版本

- **WHEN** 用户在同步设置的修订版本列表中点击"恢复"并在确认对话框中确认
- **THEN** 系统清空本地所有已同步的数据存储，然后按远程快照批量写入数据，完成后本地可见业务内容与该修订版本快照一致，书内实体身份及删除/版本元数据遵循明确恢复协议

#### Scenario: 本地独有数据被丢弃

- **WHEN** 用户确认恢复修订版本，且本地存在未包含在该快照中的书籍、AI 模型或记忆
- **THEN** 这些本地独有条目被删除，不出现在恢复后的本地状态中

#### Scenario: 不弹出恢复已删除项对话框

- **WHEN** 恢复修订版本的流程结束
- **THEN** 系统不弹出"恢复已删除项目"对话框（该对话框仅用于手动同步合并场景）

#### Scenario: 确认对话框警告数据丢失

- **WHEN** 用户点击修订版本旁的"恢复"按钮
- **THEN** 系统弹出确认对话框，文案明确提示"将用该版本的快照完全覆盖本地数据，本地独有且未同步的内容将会丢失，无法找回"

#### Scenario: 恢复已删除的书内实体后同步

- **GIVEN** 选中修订包含当前已删除的角色或别名
- **WHEN** 恢复并再次正常同步
- **THEN** 恢复结果 SHALL 以新身份保留，旧删除记录不能删除新实例；同一次恢复重试不得产生第二套身份

### Requirement: 恢复修订版本时保留同步凭据

恢复修订版本 SHALL 覆盖 `appSettings`，但 MUST 保留 GitHub Gist 同步凭据字段（`token`、`gistId`、`username`、`enabled`）与 `lastSyncTime`，避免用户被登出或丢失同步链接。

#### Scenario: 保留 Gist 凭据

- **WHEN** 恢复的快照中 `appSettings.gistSync` 包含与当前不同的凭据字段
- **THEN** 系统以本地当前凭据覆盖快照中的 `token`、`gistId`、`username`、`enabled` 以及 `lastSyncTime`，其他设置字段采用快照值

### Requirement: 恢复修订版本后清空删除记录

恢复修订版本后，系统 SHALL 清空 `deletedNovelIds` 和 `deletedModelIds` 的删除记录，因为它们相对的是恢复前的时间点，在快照恢复后不再有意义。该历史行为 MUST NOT 清除书内实体 tombstone；这些记录按 book-entity-sync 保留，恢复通过新身份表达。

#### Scenario: 清空删除记录

- **WHEN** 恢复修订版本成功完成
- **THEN** `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds` 被重置为空数组

### Requirement: 恢复失败时回滚到覆盖前状态

恢复修订版本期间若写入远程快照失败，系统 SHALL 回滚到覆盖开始前的本地状态，避免用户同时失去原始数据与快照数据。

#### Scenario: 写入失败触发回滚

- **WHEN** 恢复流程中清空数据存储成功但写入远程快照过程中抛出异常
- **THEN** 系统使用恢复前创建的备份还原所有已同步数据存储，并向用户显示恢复失败的错误提示

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

当用户确认强制推送时，系统 SHALL 通过 `useSyncExecutor.executeForceSync()` 执行单向覆盖流程：可见业务内容以本地为准。书内实体版本/删除元数据 SHALL 按 book-entity-sync 处理：读取远端相关元数据，保留已知 tombstone，为明确排除的远端实体记录删除，对需要恢复的已删除身份生成新 ID，并为覆盖值分配新版本；这些协议元数据不要求与覆盖前的本地字节相同。

#### Scenario: 跳过远端数据应用

- **WHEN** `executeForceSync()` 执行
- **THEN** 系统拉取远端文件清单及协议处理所需的书内版本/删除元数据，但 SHALL NOT 把远端业务值并入本地期望快照；用于已观察版本和保留删除的协议元数据可在受保护的覆盖操作中持久化

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

#### Scenario: 强制推送发现更高协议版本

- **WHEN** 远端 manifest 或书籍协议高于客户端支持版本
- **THEN** SHALL 在任何 PATCH 前拒绝并要求升级，不能仅提取文件清单后继续覆盖

#### Scenario: 远端已经删除本地希望保留的别名

- **WHEN** 用户明确确认强制推送本地快照
- **THEN** 该别名 SHALL 按新身份恢复且旧 tombstone 保留，后续正常同步不得复活旧身份或删除新身份

#### Scenario: 同一强制操作重试

- **WHEN** 上传失败后重试同一份已确认覆盖操作
- **THEN** SHALL 复用该操作已确定的 ID 映射与版本，不不断重新创建实体

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

### Requirement: Memory 访问与内容修改分离

Memory SHALL 使用独立的 `updatedAt` 表达内容或摘要修改。`lastAccessedAt` SHALL 仅影响本设备的 LRU、排序和检索，不得因读取而改变上传载荷、manifest 哈希或待同步状态。同步合并和单条删除裁决 SHALL 使用内容修改时间；旧数据首次读写时冻结原访问时间作为内容时间，后续读取不再改变它。

#### Scenario: 读取与重复保存

- **WHEN** 用户或 AI 读取 Memory，或保存相同内容与摘要
- **THEN** 同步内容与哈希 SHALL 保持不变，本地访问时间可继续更新

#### Scenario: 访问与远端修改或删除竞争

- **WHEN** 本地仅有较新的访问时间，而远端修改了内容或发布删除记录
- **THEN** 本地访问 SHALL 不得压过较新的内容修改或使被删除的 Memory 复活

#### Scenario: 不完整下载、应用或本地读取

- **WHEN** 任一远端条目读取、应用或删除失败，或构建本地快照时读取失败
- **THEN** 本轮同步 SHALL 中止，不继续上传或推进成功时间；下载及应用失败 SHALL 保留旧 ETag，确保后续重新读取远端
- **AND** 已成功应用的条目可保留，本轮不得显示完全成功
