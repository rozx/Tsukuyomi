## Context

Tsukuyomi 的 Gist 同步系统已经过一轮优化（参见归档变更 `2026-02-27-optimize-sync-flow`），通过 `gist.updated_at` 字符串比对实现远程变更跳过、通过 `hasChangesToUpload` 跳过无变更上传、通过 `useSyncExecutor` 抽取共享流程。但仍存在三个核心问题：

1. **上传是全量的**：只要触发上传，就会序列化、压缩并重新上传**全部**书籍文件，即便用户只改了一本。对 50+ 本书的用户来说每次同步都要处理大量无变化数据。
2. **Memory 打包在 `settings.json` 中**：单本书几百条 Memory 会持续推高设置包体积，导致任意设置写入都要重传完整包。
3. **多设备并发写入可能静默丢数据**：当前使用 last-write-wins + `lastEdited` 时间戳合并，没有任何并发检测。[GitHub 社区讨论 #50084](https://github.com/orgs/community/discussions/50084) 已确认 `PATCH /gists/{id}` 不支持 `If-Match` CAS（返回 412 但仍然写入），所以我们无法依赖真 CAS。

研究得到的关键约束：

| 约束 | 值 | 来源 |
|---|---|---|
| 单文件内容上限（inline） | 1 MB，超过则 `truncated:true`，需用 `raw_url` | GitHub Docs |
| 单文件绝对上限（git 级别） | 10 MB | GitHub Docs |
| 单 Gist 文件数上限 | 300，超过则文件列表被截断 | GitHub Docs |
| PATCH 条件写 | **不可用**（`If-Match` 被忽略） | Community #50084 |
| 条件 GET (`If-None-Match`) | **可用且免 rate-limit** | GitHub REST best practices |
| 认证用户 rate limit | 5000 req/hr | GitHub REST 文档 |

## Goals / Non-Goals

**Goals:**

- 典型"编辑一本书"的同步周期上传量从 O(N) 降到 O(1)：只上传改动的书 + manifest
- 自动同步的"无变化"路径彻底免 rate-limit（304 条件 GET）
- 多设备并发写入不会静默覆盖未被双方同时修改的条目
- Memory 的上传负担从"整本库每次同步都重传"降到"只重传变更的那本"
- 升级后一次性迁移完成，无需用户介入

**Non-Goals:**

- 不实现章节/段落级别的增量（单本书内的修改仍触发整本书文件的重传——这需要更深入的数据结构改造）
- 不替换 Gist 后端（保留现状，不引入服务器/WebDAV/S3）
- 不引入 CRDT 或 op-log（last-writer-wins 在文件级别仍然生效，manifest 只降低冲突面）
- 不改变 `SyncDataService.mergeDataForUpload` / `applyDownloadedData` 内部的业务合并规则（翻译合并、Memory 内容去重、封面历史去重等逻辑照旧）

## Decisions

### D1: `manifest.json` 作为权威索引

**选择**：新增根级 `manifest.json` 文件，作为 Gist 内容的"目录"。结构：

```jsonc
{
  "schemaVersion": 2,
  "updatedAt": "2026-04-16T10:20:30Z",  // 客户端自报，仅供调试/审计
  "entries": {
    "settings":         { "hash": "sha256:...", "lastEdited": "..." },
    "ai-models":        { "hash": "sha256:...", "lastEdited": "..." },
    "cover-history":    { "hash": "sha256:...", "lastEdited": "..." },
    "novel:abc12345":   { "hash": "sha256:...", "lastEdited": "...", "chunks": 3 },
    "novel:def67890":   { "hash": "sha256:...", "lastEdited": "...", "chunks": 0 },
    "memories:abc12345":{ "hash": "sha256:...", "lastEdited": "...", "chunks": 0 }
  }
}
```

**备选**：将 hash 分散存储在每个文件内（如 `novel-X.json` 内部自带 `_hash` 字段）。
**理由**：分散存储要求下载每个文件才能判断是否需要处理，失去"先读索引再选择性下载"的优化空间。集中索引使一次 `gists.get` 返回 manifest（体积小，总是 inline）即可完成全局差异判断。

**权威 vs 咨询**：manifest 是**决策权威的**（决定哪些文件需要上下行），但**内容咨询的**（最终数据以实际文件为准）。如果发现 manifest 与实际文件不一致（例如第三方编辑了 Gist），客户端降级为"全量重建 manifest 并重新上传"。

### D2: 文件布局拆分

新的文件布局：

```
manifest.json              ← 必有，权威索引
settings.json              ← 仅 AppSettings（去掉 aiModels/covers/memories）
ai-models.json             ← 新：独立文件
cover-history.json         ← 新：独立文件
novel-<bookId>.json        ← 不变（或分块）
novel-chunk-<bookId>_N.json
novel-<bookId>.meta.json
memories-<bookId>.json     ← 新：每本书一个（或分块）
memories-chunk-<bookId>_N.json ← 若 >1MB
```

**300 文件上限核算**（50 本书场景）：
- 1 × manifest + 1 × settings + 1 × ai-models + 1 × cover-history = 4
- 50 × novel = 50，其中分块的额外 +chunks 数量；保守假设 10% 分块且平均 3 块 = 5 × 3 = 15 + 5 × 1 meta = 20
- 50 × memories = 50，通常不分块
- 合计约 124 文件，远低于 300 上限

**极端场景（50 本全部分块、每本 3 块）**：4 + 50 × 4（meta + 3 chunks）+ 50 = 254，仍在安全区。若用户真正触及 300，客户端在同步前检查 `entries` 数量并弹出警告（非本变更范围，但 design 记录）。

### D3: 哈希算法与内容

**选择**：SHA-256 of **压缩前的 JSON 字符串**。

**备选方案**：
- FNV-1a（更快但碰撞概率高）
- 压缩后字节哈希（简单但 gzip 非确定性可能导致同样内容哈希不同）
- MD5（性能相当，但输出更短；SHA-256 更现代且无实际劣势）

**理由**：Web/Electron 环境 `crypto.subtle.digest('SHA-256', ...)` 原生可用；压缩前字符串去除 gzip 参数不确定性；输出长度虽长但 manifest 本身很小，不影响传输。

**序列化稳定性**：依赖 `JSON.stringify` 的现有行为。现有 `serializeDates` 递归序列化 Date → ISO 字符串，顺序由对象属性插入顺序决定。由于 manifest 的权威性是"决策权威"而非"内容权威"，即便两次序列化产生不同字节，也只导致多一次冗余上传，不会破坏数据。无需引入 canonical JSON。

### D4: 使用 ETag + `If-None-Match` 替代 `updated_at` 字符串比对

**选择**：在 `SyncConfig` 中引入 `lastRemoteETag: string`。每次 `gists.get` / `gists.update` 响应都保存 ETag。下一次 GET 使用 `If-None-Match: <etag>`；若远程未变返回 304（免 rate-limit），直接跳过解析。

**与现有 `lastRemoteUpdatedAt` 的关系**：废弃但保留字段用于迁移读取——如果 `lastRemoteETag` 不存在但 `lastRemoteUpdatedAt` 存在，按照"首次使用 ETag 方案"处理，不影响同步正确性。

**为什么不直接用 `If-None-Match` 替代所有 `updated_at` 检查**：因为上传路径的伪 CAS（D5）也要求拿到 ETag，统一用 ETag 可以让读和写路径共用一个状态字段。

### D5: 上传前伪 CAS（pseudo-CAS）

**流程**：

```
upload phase:
  1. GET /gists/{id}  with  If-None-Match: lastRemoteETag
       ├─ 304  → 远程未变。安全。进入 PATCH。
       └─ 200  → 远程已变。中止上传，重新进入下载/合并循环（有上限的重试）。
  2. 计算本地 manifest 与 lastRemoteManifest 的 diff
  3. PATCH /gists/{id}  仅包含：
       - manifest.json（权威索引，总是重写）
       - diff 中新增或哈希变化的文件
       - diff 中本地删除的文件 → { content: null }
  4. 从 PATCH 响应读取新的 ETag 与 updated_at，更新 SyncConfig
```

**权衡**：步骤 1 与步骤 3 之间仍存在几十到几百毫秒的竞态窗口。在该窗口内若另一设备完成 PATCH，本设备的 PATCH 会覆盖对方写入那些**我们也修改了**的文件。但由于（D1/D2）本次 PATCH 只触及哈希变化的文件，未被本设备修改的远程新文件**不会被覆盖**（PATCH 是文件级合并而非整体 replace）。冲突面显著小于当前全量上传方案。

**重试策略**：伪 CAS 失败（步骤 1 返回 200）最多重试 2 次，每次重走完整下载-合并-上传循环。超过则向用户报告冲突并放弃本轮同步（不是数据丢失，只是这一轮未完成，下一轮会继续尝试）。

### D6: `schemaVersion` 版本门控与迁移

**升级时**（本地有数据 + 远程是旧布局 `manifest.json` 不存在）：
1. 正常执行一次旧式下载（复用现有 `downloadFromGist` 旧代码路径）
2. 合并后按新布局生成 manifest + 拆分文件
3. 一次性 PATCH 完成迁移（含老文件删除 + 新文件写入）
4. 此后所有同步走新路径

**降级兼容（新版本遇到新远程）**：正常走新路径。
**跨版本冲突（新版本本地 + 旧版本远程写入）**：升级路径的最终 PATCH 会删除旧文件；如果旧版本客户端同时也在写，可能导致部分遗留旧文件。由 manifest 权威性兜底——任何不在 manifest 中的"疑似 Tsukuyomi 文件"在下一次同步时被清理。

**旧版本阻止**：如果远程 `schemaVersion >= 2` 而本地客户端不认识，旧版本会走原有代码路径，产生兼容性破坏。但旧版本没有 manifest 概念，会把我们的 `memories-<id>.json` 当成垃圾文件扫过。**本变更无法完全保护旧客户端免受破坏**——只能在 RELEASE_NOTES 中要求多设备用户同时升级。

### D7: 本地哈希缓存位置

**选择**：`SyncConfig` 中新增 `knownRemoteHashes: Record<string, string>`（fileKey → hash）。与 `lastRemoteETag` 一起，代表"我们上次见到的远程状态"。

**备选**：单独一张 IndexedDB 表。
**理由**：同步状态本身属于同步配置域，放在 `SyncConfig` 的结构上更内聚；体积小（50 book × sha-256 hex ~50 × 64 byte ~3KB），不会撑大设置。

### D8: 迁移期的 `lastRemoteUpdatedAt` 保留

保留字段不清零，用于：
- 审计/调试
- 极端场景的回滚（若新逻辑出现 bug，可以 feature flag 回切到旧路径）

**非 Non-Goal**：提供运行时开关在新旧路径间切换——一旦本次变更发布就是单向切换。

## Risks / Trade-offs

- **[伪 CAS 竞态窗口] → 本改动无法消除竞态，但把冲突面从"任何文件"缩小到"本地修改过的文件"**。多设备同时编辑同一本书仍会 last-writer-wins。在 RELEASE_NOTES 中说明"建议在一台设备上完成编辑再切换"。
- **[manifest 与实际文件不一致] → 降级为"忽略 manifest、重建"**。第三方或旧客户端修改 Gist 时可能触发；代价是一次性全量上传，无数据损失。
- **[首次迁移期间并发写入] → 迁移 PATCH 作为一次原子性 PATCH 提交**（利用 GitHub Gist PATCH 的 all-or-nothing 语义，见 `uploadToGist` 现有逻辑）。失败则下次重试。
- **[Memory 拆文件后下载路径变长] → 串行加载 N 个 memories 文件可能比单 settings 慢**。缓解：下载路径里并行 fetch `raw_url`（`Promise.all`），因为独立文件没有顺序依赖。
- **[300 文件上限] → 50 本书场景留有充裕空间**，但若未来新增更多 per-entry 文件需重新核算。同步前预检 `entries.length` 并在接近上限时警告（后续工作）。
- **[SHA-256 计算成本] → 50 本书 × 每本若干 MB，首次同步约 10-100ms 总耗时**。可忽略。

## Migration Plan

**客户端升级路径**：

1. 新版本发布，用户打开应用
2. 下次同步触发时（自动或手动）：
   - 读取远程 Gist
   - 检测是否存在 `manifest.json` 且 `schemaVersion >= 2`
     - **是**：走新路径
     - **否**：触发一次性迁移
       1. 用旧路径完整下载 + 合并本地数据
       2. 重新按新布局序列化所有条目
       3. 计算 manifest
       4. 单次 PATCH 提交：写入所有新文件 + 删除所有旧布局文件
       5. 保存 ETag / hashes 到 SyncConfig
3. 迁移后后续同步一律走新路径

**回滚**：若迁移失败，降级到旧路径（由 `downloadFromGist` 的 error handling 保证），数据无损。新版本通过 `schemaVersion` 标识，发布后旧客户端同步会被"破坏"新布局（删除新文件），升级的用户需要尽快让所有设备升级。

## Open Questions

- 是否需要在 manifest 中记录"本条目对应的文件名集合"？目前通过命名约定推导（`novel:<id>` → `novel-<id>.json` [+ chunks]）。显式记录可以解耦命名约定与 manifest 语义，但增加复杂度。**倾向：不显式记录**，命名约定已稳定。
- Memory 的分块策略：单本书 Memory 超过 1MB 是否按现有 `chunked` 方案拆？还是改为"超过就拆到多个 memories-<id>-N.json"？**倾向：复用现有 chunked 方案**，保持一致性。
- 条件 GET 失败（旧 ETag 无效，例如 Gist 被重建）的降级：当前方案下 `If-None-Match` 只会收到 200 或 304，不会因 ETag 无效报错；但 Gist 被删除时需要 rebuild。这由现有的错误处理路径覆盖。
