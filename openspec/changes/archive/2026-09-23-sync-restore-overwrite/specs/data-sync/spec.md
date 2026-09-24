## ADDED Requirements

### Requirement: 恢复到修订版本时执行完全覆盖

恢复到 GitHub Gist 历史修订版本 SHALL 使用完全覆盖语义：本地已同步数据存储（书籍、AI 模型、记忆、封面历史等）在写入远程快照前被清空，恢复完成后本地状态等于该版本快照，不保留任何本地独有且不在快照中的条目。

#### Scenario: 用户确认恢复修订版本

- **WHEN** 用户在同步设置的修订版本列表中点击"恢复"并在确认对话框中确认
- **THEN** 系统清空本地所有已同步的数据存储，然后按远程快照批量写入数据，完成后本地状态与该修订版本快照一致

#### Scenario: 本地独有数据被丢弃

- **WHEN** 用户确认恢复修订版本，且本地存在未包含在该快照中的书籍、AI 模型或记忆
- **THEN** 这些本地独有条目被删除，不出现在恢复后的本地状态中

#### Scenario: 不弹出恢复已删除项对话框

- **WHEN** 恢复修订版本的流程结束
- **THEN** 系统不弹出"恢复已删除项目"对话框（该对话框仅用于手动同步合并场景）

#### Scenario: 确认对话框警告数据丢失

- **WHEN** 用户点击修订版本旁的"恢复"按钮
- **THEN** 系统弹出确认对话框，文案明确提示"将用该版本的快照完全覆盖本地数据，本地独有且未同步的内容将会丢失，无法找回"

### Requirement: 恢复修订版本时保留同步凭据

恢复修订版本 SHALL 覆盖 `appSettings`，但 MUST 保留 GitHub Gist 同步凭据字段（`token`、`gistId`、`username`、`enabled`）与 `lastSyncTime`，避免用户被登出或丢失同步链接。

#### Scenario: 保留 Gist 凭据

- **WHEN** 恢复的快照中 `appSettings.gistSync` 包含与当前不同的凭据字段
- **THEN** 系统以本地当前凭据覆盖快照中的 `token`、`gistId`、`username`、`enabled` 以及 `lastSyncTime`，其他设置字段采用快照值

### Requirement: 恢复修订版本后清空删除记录

恢复修订版本后，系统 SHALL 清空 `deletedNovelIds` 和 `deletedModelIds` 的删除记录，因为它们相对的是恢复前的时间点，在快照恢复后不再有意义。

#### Scenario: 清空删除记录

- **WHEN** 恢复修订版本成功完成
- **THEN** `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds` 被重置为空数组

### Requirement: 恢复失败时回滚到覆盖前状态

恢复修订版本期间若写入远程快照失败，系统 SHALL 回滚到覆盖开始前的本地状态，避免用户同时失去原始数据与快照数据。

#### Scenario: 写入失败触发回滚

- **WHEN** 恢复流程中清空数据存储成功但写入远程快照过程中抛出异常
- **THEN** 系统使用恢复前创建的备份还原所有已同步数据存储，并向用户显示恢复失败的错误提示
