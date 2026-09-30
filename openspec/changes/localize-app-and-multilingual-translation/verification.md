# 多设备 / 多副本同步验证记录（任务 12.2）

记录日期：2026-09-30。以数据副本（测试中的独立书籍/设置快照与 IndexedDB 实例）模拟设备，
全部用例以 Vitest 自动执行并通过。

## 两副本场景

| 场景 | 覆盖用例（`src/__tests__/`） | 结果 |
| --- | --- | --- |
| 界面语言同步：显式偏好随应用设置同步，缺省语言不覆盖远端显式偏好，并发修改其他设置两项都保留 | `settings-locale.test.ts` | 4/4 通过 |
| 不同目标语言并发编辑：按逻辑版本逐语言合并选用、标题与实体译名，明确清空按槽传播 | `localized-merge.test.ts`、`localized-sync.test.ts` | 3/3、3/3 通过 |
| 旧数据迁移：无语言标记的旧译文归简中、IndexedDB 升级与本地数据迁移 | `localized-data.test.ts`、`indexed-db-migration.test.ts` | 7/7、3/3 通过 |
| 增量同步：manifest 哈希差异、条件请求、失败条目不记为已知、伪 CAS 重试 | `gist-sync-incremental-fixes.test.ts` 等（`gist-sync-incremental*`）、`use-gist-sync.test.ts` | 13/13、25/25 通过 |
| 原文修订：段落结构基准、单侧修改采纳、双侧修改冲突提示 | `sync-structure-merge.test.ts`、`sync-chapter-baselines.test.ts` | 16/16、8/8 通过 |
| 导入撤销：整次撤销恢复实体新身份与删除记录、修订撤销恢复全部语言 | `import-application-service.test.ts`、`multilingual-undo.test.ts` | 19/19、2/2 通过 |
| 备份恢复与失败回滚：备份覆盖重建身份、失败回滚正文与删除记录、修订恢复中止保护本地数据 | `entity-restore.test.ts`、`settings-snapshot-rollback.test.ts`、`gist-sync-service.revision.test.ts`、`sync-deletion-transaction.test.ts` | 7/7、3/3、22/22、4/4 通过 |
| 强制推送：只恢复已删除身份、协议写入原子提交、失败状态保留 | `entity-force.test.ts`、`sync-force-mode.test.ts` | 5/5、11/11 通过 |

## 三副本场景

| 场景 | 覆盖用例 | 结果 |
| --- | --- | --- |
| 所有合并到达顺序：交换、结合、幂等，任意到达顺序哈希一致 | `book-entity-sync.test.ts`、`multi-replica-offline-return.test.ts`（6 种到达顺序） | 3/3、1/1 通过 |
| 时钟偏移：选值只依据逻辑版本，与本机时间和传入顺序无关；一台设备墙上时钟快一年不改变结果 | `localized-merge.test.ts`、`sync-clock.test.ts`、`multi-replica-offline-return.test.ts` | 通过 |
| 删除/改名竞争：删除压过任何迟到编辑（含极大逻辑版本），别名改名与新增译名同时保留，删除角色阻止离线别名回流 | `book-entity-sync.test.ts`、`book-entity-edit.test.ts`、`localized-sync.test.ts` | 通过 |
| 超过 90 天的离线回流：离线 91 天的副本带着对已删除角色的改名回流，书内删除记录不按 90 天过期，旧身份不复活；其他实体的繁中/英文译名并存 | `multi-replica-offline-return.test.ts`、`book-entity-edit.test.ts` | 通过 |

## 说明

- manifest 级（整本书 / 记忆等条目）的墓碑沿用既有 90 天 TTL（`TOMBSTONE_TTL_MS`）；书内实体删除记录
  （`entityTombstones`）长期保留，与用户指南「多语言协议与实体删除」一节一致。
- 真实双设备、真实 Gist 的手工走查并入 12.1 的人工完整旅程。
