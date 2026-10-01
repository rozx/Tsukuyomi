## MODIFIED Requirements

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

### Requirement: 恢复修订版本后清空删除记录

恢复修订版本后，系统 SHALL 清空 `deletedNovelIds` 和 `deletedModelIds` 的删除记录，因为它们相对的是恢复前的时间点，在快照恢复后不再有意义。该历史行为 MUST NOT 清除书内实体 tombstone；这些记录按 book-entity-sync 保留，恢复通过新身份表达。

#### Scenario: 清空删除记录

- **WHEN** 恢复修订版本成功完成
- **THEN** `gistSync.deletedNovelIds` 与 `gistSync.deletedModelIds` 被重置为空数组

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
