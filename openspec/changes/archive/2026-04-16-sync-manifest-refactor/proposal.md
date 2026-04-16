## Why

当前 Gist 同步系统每次上传都重新序列化并上传**全部**书籍文件（即使只改动了一本），对拥有 50+ 本书籍的用户而言既慢又浪费带宽。此外，基于 `lastEdited` 时间戳的冲突解决机制在多设备场景下可能静默覆盖并发修改，GitHub Gist API 的 `PATCH` 端点不支持 `If-Match` 真 CAS（[社区报告 #50084](https://github.com/orgs/community/discussions/50084) 确认 412 后仍会写入）。同时 Memory 数据被打包进 `settings.json` 单个文件，导致任何 Memory 写入都会重新上传完整设置包。

## What Changes

- **BREAKING** Gist 文件布局新增 `manifest.json` 作为权威索引，记录每个条目的内容哈希与 `lastEdited`
- 引入**按条目哈希**的增量上传：仅重传哈希变化的文件，跳过未变更的书籍/设置/模型/封面
- **BREAKING** 将 Memory 从 `settings.json` 拆出到 per-book 的 `memories-<bookId>.json` 文件（>1MB 时按现有规则分块）
- 将 `aiModels` 与 `coverHistory` 从 `settings.json` 拆出到独立文件（降低设置包大小、提升变更检测粒度）
- 将远程变更检测从 `updated_at` 字符串比较升级为 **ETag + `If-None-Match` 条件 GET**（304 响应不消耗 rate-limit 配额）
- 上传前执行**伪 CAS**：PATCH 之前通过条件 GET 验证远程 ETag 未变；若变更则中止并重新合并
- 首次升级后执行**一次性迁移**：读取旧布局 → 生成 manifest → 全量重写为新布局；通过 `schemaVersion` 字段阻止旧客户端破坏新布局
- 保持 Gist 作为唯一同步后端，不引入新依赖

## Capabilities

### New Capabilities

- `sync-manifest`: Gist 中 `manifest.json` 的语义——包含 `schemaVersion`、每个条目的内容哈希与 `lastEdited`、以及块计数；决定增量上传/下载的对象集合；规定迁移与版本拒绝规则

### Modified Capabilities

- `sync-change-detection`: 将现有的 `lastRemoteUpdatedAt` 字符串比对替换为 ETag + `If-None-Match` 条件 GET；新增上传前伪 CAS 校验要求；哈希驱动的"本地有变化"检测替代基于时间戳的扫描

## Impact

**代码**
- `src/services/sync-data-service.ts`（2431 行）——`mergeDataForUpload` / `applyDownloadedData` / `hasLocalChangesSinceLastSync` 接入 manifest；按条目而非全量合并
- `src/services/gist-sync-service.ts`（2266 行）——`uploadToGist` / `downloadFromGist` 改为 manifest 驱动的选择性 I/O；新增 ETag 读写；新增 Memory-per-book 文件的序列化/反序列化
- `src/composables/useSyncExecutor.ts`——流程中增加 manifest diff 阶段；条件 GET 替换 `updated_at` 检查
- `src/models/sync.ts`——`SyncConfig` 新增 `lastRemoteETag`、`knownRemoteHashes`（`Record<string, string>`），废弃 `lastRemoteUpdatedAt`（保留用于迁移读取）

**数据/存储**
- Gist 文件布局变更（新增 `manifest.json`、`ai-models.json`、`cover-history.json`、`memories-<bookId>.json`；`settings.json` 仅保留 `appSettings`）
- 本地 IndexedDB 无 schema 变化；`SyncConfig` 字段增量扩展，向后兼容旧值

**约束**
- GitHub Gist 文件列表上限 300 个文件——本改动增加每本书的文件数（novel + memories），需在设计阶段核算并提出降维策略
- Gist 单文件 1MB 上限——已有分块机制复用即可
- 多设备且其中一台使用旧版本的场景，新版本需通过 `schemaVersion` 拒绝写入，避免破坏布局
