## 1. 模型与类型基础

- [ ] 1.1 在 `src/models/sync.ts` 的 `SyncConfig` 中新增 `lastRemoteETag: string`（默认 `''`）和 `knownRemoteHashes: Record<string, string>`（默认 `{}`）
- [ ] 1.2 保留 `lastRemoteUpdatedAt` 字段，标注 `@deprecated`，用于读取旧配置兼容
- [ ] 1.3 创建 `src/models/manifest.ts`：定义 `GistManifest`、`ManifestEntry`、`MANIFEST_SCHEMA_VERSION` 常量（= 2）和 `MANIFEST_FILE_NAME` 常量
- [ ] 1.4 在 `src/stores/settings.ts` 的 gistSync 初始化/更新逻辑中支持新字段的持久化与默认值回填

## 2. 哈希与 manifest 工具

- [ ] 2.1 新建 `src/utils/content-hash.ts`：导出 `hashJson(payload: unknown): Promise<string>`，使用 `crypto.subtle.digest('SHA-256', ...)` 计算十六进制小写 hash；传入前先走 `serializeDates`
- [ ] 2.2 新建 `src/services/sync-manifest-builder.ts`：
  - `buildLocalManifest(localData): Promise<GistManifest>` — 根据当前本地数据计算所有条目的 hash
  - `diffManifests(local, knownRemote): { changed, added, deleted }` — 返回三组 entry key
  - `manifestFromRemoteFiles(files): GistManifest | null` — 从远程原始文件内容回退重建 manifest（用于 manifest 丢失场景）
- [ ] 2.3 为 `content-hash.ts` 和 `sync-manifest-builder.ts` 编写单元测试，覆盖稳定性（同输入同输出）、空输入、变更检测

## 3. GistSyncService：新布局读写

- [ ] 3.1 在 `src/services/gist-sync-service.ts` 的 `GIST_FILE_NAMES` 中新增 `MANIFEST`、`AI_MODELS`、`COVER_HISTORY`、`MEMORIES_PREFIX`、`MEMORIES_CHUNK_PREFIX` 常量
- [ ] 3.2 实现 `uploadToGistIncremental(config, data, manifestDiff, onProgress)`：
  - 仅为 diff 中的条目序列化+压缩
  - 组装 `files` 对象：manifest 必写，changed/added → 新内容，deleted → `null`
  - 复用现有 chunking 逻辑（novel/memories 文件 >1MB 时）
  - 调用 `PATCH /gists/{id}`，保留现有批处理 + 重试逻辑
- [ ] 3.3 实现 `downloadFromGistWithManifest(config, lastRemoteETag, knownRemoteHashes, onProgress)`：
  - 用 `If-None-Match: lastRemoteETag` 发起 `gists.get`
  - 若 304：返回 `{ success: true, skipped: true, remoteETag }`
  - 若 200：解析 manifest → diff → 仅反序列化变化的文件（含 raw_url 处理 truncated 文件）
  - 返回 `{ success, skipped, remoteETag, remoteManifest, changedEntries }`
- [ ] 3.4 修改 `uploadToGist` 和 `downloadFromGist`，识别 `schemaVersion` 后分流到新/旧路径
- [ ] 3.5 为 Memory-per-book 文件添加序列化（`memories-<bookId>.json`、chunked 变体、`.meta.json`），反序列化同理
- [ ] 3.6 为 ai-models.json 与 cover-history.json 添加独立的序列化/反序列化；从 settings.json 的序列化中移除这些字段

## 4. SyncDataService：适配 manifest 差分

- [ ] 4.1 新增 `SyncDataService.applyPartialRemoteData(changedEntries, isManualRetrieval)`：只合并变化的条目，保持现有 merge 业务规则不变
- [ ] 4.2 新增 `SyncDataService.hasLocalChangesByHash(localManifest, knownRemoteHashes): boolean`：完全取代基于时间戳的 `hasLocalChangesSinceLastSync`（后者保留但标注 deprecated 以防滚回）
- [ ] 4.3 `mergeDataForUpload` 的调用方不再传全量 localData，改为只传 diff 条目；适配函数签名
- [ ] 4.4 确认 Memory 合并逻辑（内容去重、lastAccessedAt 比较）在 per-book 入口下仍正确

## 5. 伪 CAS 与执行器集成

- [ ] 5.1 新建 `src/services/sync-concurrency.ts`：导出 `verifyRemoteUnchanged(config, etag): Promise<'unchanged' | 'changed' | 'error'>`，基于条件 GET 实现
- [ ] 5.2 修改 `src/composables/useSyncExecutor.ts`：
  - 下载阶段改为 `downloadFromGistWithManifest`
  - 上传前调用 `verifyRemoteUnchanged`
  - `'changed'` → 重启同步循环（最多 3 轮总尝试）
  - `'error'` → 走现有错误处理
- [ ] 5.3 将冲突超限（3 轮后仍 `'changed'`）作为特定错误类型上报，展示 "同步冲突：其他设备正在频繁写入" 消息
- [ ] 5.4 确保下载/上传成功后 `knownRemoteHashes` 与 `lastRemoteETag` 在 settings store 中被持久化

## 6. 一次性迁移路径

- [ ] 6.1 在 `downloadFromGistWithManifest` 中检测 `manifest.json` 缺失 → 返回特殊标识 `{ needsMigration: true }`
- [ ] 6.2 在 `useSyncExecutor` 中处理迁移信号：
  - 调用现有旧 `downloadFromGist` 完成合并
  - 计算新布局 manifest
  - 组装一次性 PATCH：写入所有新文件 + 把旧 `settings.json` 字段（memories/aiModels/coverHistory）从中移除 + 删除不再存在的文件
  - 成功后更新 `lastRemoteETag` 与 `knownRemoteHashes`
- [ ] 6.3 为迁移失败场景设计恢复：本地数据不变，错误提示"迁移待重试"，下次同步自动再试
- [ ] 6.4 在应用启动或同步发现新 schemaVersion 且本地客户端不识别时，显示"请升级客户端"的提示并阻止同步

## 7. 测试

- [ ] 7.1 `src/__tests__/sync-manifest-builder.test.ts`：覆盖 hash 稳定性、diff 分类（changed/added/deleted）、manifest 回退重建
- [ ] 7.2 `src/__tests__/gist-sync-service-incremental.test.ts`：覆盖选择性上传（只打包变更文件）、选择性下载（跳过未变条目）、条件 GET 304 路径、PATCH 后 ETag 更新
- [ ] 7.3 `src/__tests__/sync-concurrency.test.ts`：覆盖伪 CAS 的 304/200/错误三条路径、重试上限、冲突错误上报
- [ ] 7.4 `src/__tests__/sync-migration.test.ts`：覆盖"存在旧布局 → 一次性迁移 PATCH → 后续走新路径"、迁移失败保留本地、schemaVersion 超前客户端拒绝同步
- [ ] 7.5 更新 `src/__tests__/sync-data-service.test.ts` 与 `src/__tests__/use-gist-sync.test.ts` 以适配新签名；保留关键业务合并场景的断言
- [ ] 7.6 在 `src/__tests__/sync-progress.test.ts` 中补充增量上传的进度事件断言

## 8. 清理与文档

- [ ] 8.1 从 `SyncConfig` 的主路径代码中移除对 `lastRemoteUpdatedAt` 的读写（保留字段定义用于兼容）
- [ ] 8.2 运行 `bun run lint && bun run type-check`，修复所有报告
- [ ] 8.3 运行 `bun test` 全量，确保通过
- [ ] 8.4 更新 `public/releaseNotes/` 下一版本的发布说明：强调"多设备用户需同步升级"
- [ ] 8.5 在 CLAUDE.md / AGENTS.md 的"关键设计"章节补充 manifest 驱动的增量同步说明
- [ ] 8.6 人工端到端回归：创建/编辑/删除书、Memory、AI 模型、封面 各触发一次手动同步，验证 PATCH 内只含预期文件（通过 DevTools 网络面板观察 payload）
