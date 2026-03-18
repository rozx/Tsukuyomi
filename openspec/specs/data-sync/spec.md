# data-sync Specification

## Purpose
TBD - created by archiving change sync-data. Update Purpose after archive.
## Requirements
### Requirement: 统一手动同步操作

系统 SHALL 提供单一的"同步"操作替代独立的"上传"和"下载"操作。手动同步 SHALL 执行完整的双向同步流程：下载远程数据 → 合并/应用 → 检测本地变更 → 上传变更。

#### Scenario: 正常双向同步

- **WHEN** 用户点击"同步"按钮且 Gist 同步已启用并配置
- **THEN** 系统下载远程 Gist 数据，与本地数据合并（基于 `lastEdited` 时间戳），检测是否有本地变更需要上传，若有则上传合并后的数据到 Gist

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

