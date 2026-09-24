## Context

当前 `useSyncExecutor.executeSync()` 实现了严格的双向同步：条件 GET 下载远端 → 应用远端变更 → 检测本地变更 → pseudo-CAS 预检 → 增量上传。流程鲁棒，但不支持"本地单向覆盖远端"。

用户已确认语义：强制同步 = **严格镜像**（远端独有条目必须被删除），**toggle 形式持久化**，成功自动重置、失败保持开启并显示失败 badge，且**入口需要同时出现在 `SyncSettingsTab`（设置页）和 `SyncStatusBody`（顶栏同步面板）**。

## Goals / Non-Goals

**Goals:**

- 提供一条显式的单向推送路径，不触碰现有双向同步逻辑
- 两处 UI 入口共享同一状态（Pinia），任一处切换立即反映到另一处
- 每次强制推送都是显式动作：需要 toggle + 确认对话框双重确认
- 失败后用户清楚知道"仍处于强制模式"，避免误以为已退出

**Non-Goals:**

- 不改变普通同步、pseudo-CAS、manifest 结构、墓碑机制
- 不覆盖自动同步的语义（自动同步永远走双向）
- 不提供"远端覆盖本地"的反向 force 操作（已有 revision revert 覆盖该场景）
- 不更改 Gist ID（与"删除 Gist 重建"相比，保留 ID 是本功能的核心价值）

## Decisions

### Decision 1: 新增独立方法 `executeForceSync`，不复用 `executeSync`

采用方案 A（brainstorming 中讨论）：在 `useSyncExecutor` 中新增 `executeForceSync()`，与 `executeSync()` 并列。共享的 helper（`collectMemoriesByBook`、manifest 构建片段）抽为私有函数。

**Alternatives considered:**

- **方案 B（给 `executeSync` 加 `forceMode` flag）**：让单条路径内部三处分支（跳过 apply、跳过 hash 比对、跳过 pseudo-CAS）。拒绝理由：`executeSync` 已接近 420 行，再引入 `if (forceMode)` 分支会让双向同步这条主线的可读性恶化，且强制模式的 bug 有污染普通同步的风险。
- **方案 C（清空 known 状态后调用 `executeSync`）**：阶段 2 仍会 apply 远端数据到本地，与强制模式语义（本地为准）相悖。必须再加分支才能跳过 apply，退化为方案 B。

**Rationale:** 两条路径语义完全不同（双向 vs 单向），"两个函数 + 少量重复"比"一个函数 + 多处分支"更符合本项目的代码规范（CLAUDE.md 明确 "Three similar lines is better than a premature abstraction"）。约 40 行的上传阶段重复代码可通过共享的内部 helper `runUploadPhase(progressMapper, uploadCall)` 降低。

### Decision 2: 强制推送时仍需拉取远端文件清单

强制模式跳过"应用远端到本地"，但**不跳过远端文件列表的获取**。`uploadToGistIncremental` 需要 `remoteFilesSnapshot` 参数来计算要 PATCH 删除的远端独有文件。

**实现**：复用 `gistSyncService.downloadFromGistWithManifest(config)`，仅使用返回值中的 `remoteFilesSnapshot` 和 `remoteETag`，丢弃 `changedEntries` / `manifest` / `deletedEntries`。

**Alternatives considered:** 新增一个专门的 "list remote files" 方法。拒绝：重复下载同一 Gist 响应的两次解析，不如复用现有方法并丢弃不需要的字段；多出一个 API 面也增加维护成本。

### Decision 3: 通过"清空内存中的 known 状态"让 `uploadToGistIncremental` 计算出严格镜像

强制推送时构造 `effectiveConfig = { ...config, knownRemoteHashes: {}, knownRemoteEntries: {} }` 传给 `uploadToGistIncremental`。

- 本地所有 manifest 条目都被视为 "added/modified"（因为 known 为空）→ 全部重新上传
- 远端存在但本地 manifest 中没有的条目 → `uploadToGistIncremental` 应计算出 "需删除"，触发对应文件的 PATCH 删除

**Rationale:** 这是 `uploadToGistIncremental` 现有的 diff 语义的自然应用，不需要新代码路径，也不需要新 API。`knownRemoteHashes` 只存在于 `SyncConfig` 内存副本中——修改副本不影响 store 中的持久化状态，不会污染后续双向同步。

### Decision 4: 跳过 pseudo-CAS

`executeSync` 在上传前通过 `verifyRemoteUnchanged(config)` 检测远端在本次同步期间是否被其他设备改动，以防止覆盖并发写入。**强制模式下必须跳过此检查**——因为用户明确选择覆盖，并发写入正是要抹掉的内容。

**Risk:** 两台设备同时点"强制推送"会产生后写胜出的竞争，但这属于用户刻意触发的破坏性操作的既有风险，不需要额外保护。

### Decision 5: 共享 UI 抽象——`ForceSyncToggle` 组件 + `useForceSync` composable

两处入口（`SyncSettingsTab`、`SyncStatusBody`）共享：

- `ForceSyncToggle.vue` — 受控组件，渲染 toggle + 警告文字 + 失败 badge，读写 `settingsStore.gistSync.forceSyncMode`
- `useForceSync()` — composable，暴露 `confirmAndForceSync()`：弹 PrimeVue `ConfirmDialog`（group="force-sync"）→ 调 `useGistSync().forceSync()`

两处的"同步"按钮各自维护，基于 `forceSyncMode.active` 切换 label/severity/handler。不把按钮抽为共享组件——两处对 `isSyncing`、disabled 条件、loading 状态的绑定方式略有差异，强抽会引入更多 props。

### Decision 6: toggle 持久化行为

`SyncConfig.forceSyncMode: { active: boolean; lastFailedAt?: number }`：

- **成功推送 →** `active: false`，清除 `lastFailedAt`
- **失败 →** `active: true` 保持，设 `lastFailedAt = Date.now()`
- **用户主动关闭 toggle →** `active: false`，清除 `lastFailedAt`
- **未初始化 / 旧数据 →** 字段缺失 = 等同 `active: false`

**Rationale:** 用户选择 B（sticky but self-resetting on success）+ C（失败显示 badge）。持久化保证用户关闭设置页再回来时状态保留，同时"成功自动重置"保证每次强制推送都是显式动作。

### Decision 7: Popover 在确认对话框打开前关闭

`SyncStatusBody` 渲染在 `Popover` 内。`confirmAndForceSync` 弹 ConfirmDialog 时，Popover 的 dismissable 行为可能会导致 popover 在 confirm 按钮被点击前关闭。

**解决方案:** `SyncStatusPanel` 通过 `defineExpose` 暴露 `close()` 方法；`useForceSync` 接收可选的 `onBeforeConfirm` 回调，在弹 ConfirmDialog 前先关闭父面板（SyncStatusBody 调用时传入）。设置页调用时 `onBeforeConfirm` 为空。

ConfirmDialog 走全局 portal，不依赖父容器存活。

## Risks / Trade-offs

- **[风险] 用户开启 toggle 后忘记关闭，下次同步时误触发强制推送** → 主按钮在 toggle 开启时显示为 `p-button-danger` + "强制推送到远程" label，+ 必弹确认对话框，+ 警告文字中包含"会删除远程上本地没有的条目"。三重提示降低误触概率。
- **[风险] 失败后用户误以为已退出强制模式** → Decision 6 的持久化 + 失败 badge ("上次失败 — 点击同步重试，或关闭 toggle") 直接解决。
- **[风险] 强制推送与另一台设备的普通同步竞争** → 如 Decision 4 所述，属于刻意破坏性操作的既有风险，不额外防护。
- **[权衡] 40 行上传阶段重复代码** → 用内部 helper 抽出后降至 ~10 行。保留少量重复以换取两条路径的可读性独立。
- **[权衡] 首次同步（无 gistId）遇 toggle 开启** → 退化为普通首次上传（无 remote 可覆盖），但需要一条轻量的分支处理：检测到无 gistId 时不弹确认对话框、toast 提示"未检测到远程 Gist，已按普通同步处理，toggle 已关闭"，然后复用首次上传逻辑并重置 toggle。

## Migration Plan

- 无数据迁移需要。`SyncConfig.forceSyncMode` 对旧数据缺失时视为 `active: false`，等同未启用。
- 无需 feature flag：功能对用户完全不可见直到 toggle 被开启，toggle 默认关闭。
- 回滚：删除新增代码即可；无持久化格式破坏性变更。

## Open Questions

（无 — 所有语义已在 brainstorming 中与用户确认。）
