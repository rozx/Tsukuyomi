# 实施前方案审查

- 已验证：`uploadIncremental` 基于 manifest entry 做 diff，可复用组条目、压缩分块、逐批并发检查。
- 已验证：`conditionalGetGist` 遇到顶层 truncated 必须中止；因此用户选择固定小组并增加写前 300 文件检查。
- 已关闭缺口：`downloadRevisionFromManifestFiles` 原本逐 entry 直接收集 Novel，新布局需要先校验并组装全部组再恢复。
- 已关闭缺口：`recordSyncedStructureBaselines` 原本只检查 novel hash，需逐章节组确认正文哈希。
- 已关闭缺口：`mergeNovelChapters` 把缺少正文视为本地加载，需显式携带未下载章节集合，保留原始文本且不误写远端基准；真实空正文须区别处理。
- 已关闭缺口：迁移分批上传若覆盖旧 novel 文件会使围栏仍指向损坏旧载荷，新元数据采用 book- 文件名，旧文件在最终 manifest 提交时删除。进一步用设置与记忆同时修改的中断测试确认聚合文件也需要独立的 v6- 文件名，已覆盖迁移与重试。
- 已关闭缺口：原完整性校验使用当前 schema 常量作下限，升为 v6 后必须继续校验 v5。
- 明确范围：不引入多 Gist 分库；初次空 Gist 创建沿用旧创建接口，后续同步通过现有迁移入口升级。

公共测试接口：uploadIncremental、downloadWithManifest、SyncDataService.applyPartialRemoteData、GistSyncService.downloadRevision，以及既有同步执行器测试。

## 独立审查 P1 修复

独立审查复现了本地删除章节、远端仅修改标题时正文组因哈希未变被跳过，导致章节被恢复为空正文的问题。下载阶段现接收当前本地目录，对缺失章节补读并校验相应正文组；应用阶段对仍然缺失的未下载章节拒绝保存，避免下载与应用之间的本地删除竞态推进已知远端状态。已验证原文、译文、原始文本与后续上传哈希保留，以及补读失败时的中止行为。
