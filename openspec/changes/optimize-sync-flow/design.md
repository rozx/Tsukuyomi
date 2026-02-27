## Context

当前同步系统通过 GitHub Gist API 实现双向数据同步。每次同步周期（自动/手动）都执行固定的四步流程：下载 → 应用 → 检测 → 上传。`useAutoSync` 和 `useGistUploadWithConflictCheck` 两个 composable 各自独立实现了这套流程，逻辑高度重复（差异仅在进度消息前缀、错误展示方式和是否返回可恢复项）。

核心问题：

1. 即使远程无变更，每次也会调用 `gists.get` 下载全部数据并执行 apply
2. `useAutoSync`（288 行）和 `useGistUploadWithConflictCheck`（427 行）中同步核心逻辑重复
3. 自动同步每隔数分钟触发，无效操作累积浪费 API 配额和处理时间

## Goals / Non-Goals

**Goals:**

- 引入远程变更检测，在远程无变更时跳过下载和 apply
- 引入上传前预检，在本地无变更时跳过上传（download 被跳过的场景下尤为关键）
- 抽取共享同步执行器，消除两个 composable 之间的代码重复
- 保持完全向后兼容，已有 SyncConfig 数据无需迁移

**Non-Goals:**

- 不做增量上传优化（只上传变化的数据而非全量上传）——这是一个更大的改动，超出本次范围
- 不改变 Gist 的存储结构或文件名约定
- 不改变冲突解决策略（仍然是 last-write-wins + timestamp 比对）
- 不改变 `SyncDataService.applyDownloadedData` 或 `hasChangesToUpload` 的内部逻辑

## Decisions

### Decision 1: 使用 Gist `updated_at` 作为远程变更检测依据

**选择**: 调用 `octokit.rest.gists.get({ gist_id })` 获取 Gist 元数据，比对 `response.data.updated_at` 与本地存储的 `lastRemoteUpdatedAt`。

**备选方案**:

- **HTTP ETag/If-None-Match**: GitHub Gist API 支持条件请求，304 响应可以避免传输数据。但 `octokit.rest.gists.get` 返回的响应中包含所有文件内容，即使我们只需要 `updated_at`——304 只节省传输不节省 API 调用。
- **Gist revision history**: 通过 `list_revisions` 检查最新版本 hash。但这是额外 API 调用且 revision API 不一定更轻量。

**理由**: `gists.get` 调用无法避免（我们还需要在有变更时读取数据），但通过先比对 `updated_at`，可以在无变更时不解析 `response.data.files`。实际上更优的方案是：使用同一次 GET 请求的响应，如果 `updated_at` 没变则直接丢弃响应，这样避免了额外的 API 调用。但考虑到 `gists.get` 返回大量数据（包含所有文件内容），真正的优化应该是**完全跳过这个 API 调用**。

**最终方案**: `checkRemoteUpdated` 独立调用 `gists.get`，但**只读取** `response.data.updated_at`，不解析文件内容。虽然这仍是一次完整的 API 调用，但跳过了后续的 JSON 解析、解压缩、apply/merge 等 CPU 密集操作。未来可以考虑用更轻量的 API（如 GraphQL）进一步优化。

### Decision 2: `lastRemoteUpdatedAt` 存储为 ISO 8601 字符串

**选择**: `SyncConfig.lastRemoteUpdatedAt` 存储 Gist API 返回的 `updated_at` 原始字符串（ISO 8601 格式，如 `"2025-01-15T08:30:00Z"`），直接做字符串比较。

**备选方案**:

- 转换为 Unix 时间戳（毫秒数）存储。

**理由**: 直接存储原始字符串避免了精度损失和时区转换问题。字符串等值比较足以判断"是否有变化"，不需要大于/小于比较。

### Decision 3: 共享同步执行器作为独立 composable

**选择**: 创建新的 `src/composables/useSyncExecutor.ts`，封装核心同步流程：远程检测 → 下载 → apply → 本地检测 → 上传。通过参数控制行为差异。

**接口设计**:

```typescript
interface SyncExecutorOptions {
  messagePrefix: string; // '[自动同步] ' 或 ''
  isManualRetrieval: boolean; // 控制 applyDownloadedData 是否返回可恢复项
  onError: (error: string) => void; // toast.add 或 console.error
  onProgress: (stage: string, message: string, current: number, total: number) => void;
}
```

**备选方案**:

- 在 `GistSyncService` 中封装同步流程。但 service 层不应依赖 Vue 状态（stores），同步流程需要读写 booksStore/aiModelsStore/settingsStore 等。
- 使用简单的工具函数。但流程中需要访问 Vue store 和 reactive 状态，composable 模式更自然。

**理由**: composable 可以通过闭包访问 Vue stores，同时保持可测试性。两个现有 composable 变为薄包装层：`useAutoSync` 负责定时器和单例管理，`useGistSync` 负责 UI 反馈和返回值类型。

### Decision 4: 远程检测失败时 fail-open

**选择**: 如果 `checkRemoteUpdated` 调用失败（网络错误、auth 错误等），返回 `hasChanges: true`，让同步继续执行完整流程。

**理由**: 这是一个优化性质的前置检查，不应阻塞核心同步功能。最坏情况是退化为当前行为（每次都完整同步），不会造成数据丢失。

### Decision 5: 上传响应中获取新的 `updated_at`

**选择**: 上传后从 `gists.update` 或 `gists.create` 的响应中读取 `updated_at`，更新到 `lastRemoteUpdatedAt`。这样下次同步的远程检测才能正确判断"上传后远程是否又有新变更"。

**理由**: 如果只在下载后更新 `lastRemoteUpdatedAt`，上传操作会改变远程的 `updated_at`，导致下次远程检测误判为"有变更"。必须在上传后也更新这个值。

### Decision 6: 合并远程检测与下载为一次 API 调用

**选择**: 不单独实现 `checkRemoteUpdated` 方法。改为修改 `downloadFromGist`，使其在获取 Gist 响应后先比对 `updated_at`，如果远程无变更则提前返回（不解析 files），如果有变更则继续解析。这样无论远程是否有变更，都只需一次 `gists.get` 调用。

**返回类型调整**:

```typescript
// downloadFromGist 返回新增 skipped 和 remoteUpdatedAt 字段
interface DownloadResult extends SyncResult {
  data?: GistSyncData;
  skipped?: boolean; // true 表示远程无变更，跳过了解析
  remoteUpdatedAt?: string; // Gist 的 updated_at 值
}
```

**备选方案**:

- 独立的 `checkRemoteUpdated` + `downloadFromGist` 两次调用：职责更清晰，但远程有变更时浪费一次 API 调用。

**理由**: Gist API 无法只获取元数据（每次 GET 都返回完整内容），所以两次调用没有网络传输优势。合并后在任何场景下都只有一次 API 调用，更高效。`downloadFromGist` 新增一个可选的 `lastRemoteUpdatedAt` 参数，不传时退化为当前行为，保持向后兼容。

## Risks / Trade-offs

- **[风险] `gists.get` 仍是完整 API 调用**: 即使远程无变更时跳过文件解析，GitHub API 仍返回完整 Gist 数据。网络传输量不变，优化收益在于跳过 CPU 密集的 JSON 解析、解压缩和 apply/merge 处理。 → **缓解**: 这是 Gist REST API 的限制。未来可考虑 GraphQL API 进一步优化。

- **[风险] 时间戳比较可能遗漏边缘场景**: 如果两次 Gist 修改发生在同一秒内（相同 `updated_at`），第二次修改可能被漏检。 → **缓解**: 实际场景中极不可能（需要在 API 调用间隙内发生另一次修改）。且手动同步始终可作为 fallback。

- **[权衡] 新增一个 composable 文件**: 引入 `useSyncExecutor.ts` 增加了文件数量，但显著减少了总代码量（消除两处重复逻辑）。

- **[风险] 重构共享执行器可能引入回归**: 将两个 composable 的逻辑合并为一个共享执行器时，细微的行为差异（如 `updateLastSyncedModelIds` 只在自动同步的 download 分支调用）可能被遗漏。 → **缓解**: 仔细对比两套现有逻辑，编写测试覆盖关键路径。

## Open Questions

_(已全部解决)_
