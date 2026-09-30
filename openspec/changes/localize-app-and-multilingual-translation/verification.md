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

# 固定文案清单复核（任务 12.3）

记录日期：2026-09-30，基于合并 10.1/10.2/10.4/10.5 后的 `feat/i18n-implementation`。

## 资源检查

- `bun run check:i18n`：三语言用户可见资源的 key、参数与模板编译检查通过（模型可见文字为简中单源，不在此列）。
- 帮助正文与链接：扫描 `public/help/{,zh-TW/,en-US/}*.md` 全部站内链接与锚点，三语言均可解析且锚点集合与简中一致；`ai-models-guide` 中依赖中文别名的锚点已改为稳定 ID。
- 全量 Vitest（418 个文件 / 3768 个用例）、lint、type-check、quality-check 通过。

## 直接旧字段读写扫描

扫描生产源码中的 `.translation.translation`、`selectedTranslationId`、`hasNonEmptyTranslation`（`services/localization/**` 与 `models/**` 为归一化/持久化边界，不计）。剩余消费者均属以下已验收类别：

| 类别 | 位置 |
| --- | --- |
| 新建段落写入兼容投影 `''` | `chapter-service.ts:279/1067`、`book-sync-service.ts:448`、`import-paragraph-matching.ts:258/276`、`paragraph-tools.ts:1050` |
| 导入/备份形状校验 | `import-library-reader.ts:29`、`character-setting-service.ts:342`、`terminology-service.ts:368` |
| 指定语言优先、未指定语言时的明确旧式回退 | `chapter-service.ts:464/1510`、`full-text-index-service.ts:135` |
| 撤销快照：仅对简中使用旧投影 | `book-service.ts:79-83`、`paragraph-tools.ts:1552`、`tools/types.ts:135` |

`utils/action-info/named-entity-details.ts` 原先直接显示简中投影，已改为按操作语言 / 书籍目标读取语言槽（10.4）。

## 固定文案清单

非注释、非 console 代码行中的剩余中文共 304 行 / 67 个文件，全部属于以下明确例外，没有依赖 fallback 宣称完成的界面文字：

1. **模型可见文字（简中单源）**：提示词、工具说明与工具结果、`taskLabel`、`（工具返回为空）`、`[章]` 嵌入前缀、`TOOL_CALL_PLACEHOLDER`；`src/services/ai/**`、`src/services/import/import-agent-prompt.ts` 等。
2. **可解析的存储协议 / 哨兵值**：思考流标记与正则（`useThinkingFormatter.ts`、`task-runner.ts`、`text-task-processor.ts`、`constants/ai` `TASK_TYPE_LABELS`）、会话默认标题与总结气泡（显示时按界面语言渲染）。
3. **存储的数据默认值**：卷名 `正文`、`未知标题`、`未命名书籍`、`YYYY年M月D日` 日期串（书籍同步按原值比较）；内置代理名称/说明（显示时投影为界面语言）。
4. **匹配日文/中文来源站点的正则与分词表**：scraper、`challenge-detection.ts`、`import-html-parser.ts`、`useSearchReplace`、`memory-scoring.ts`、`chapter-embedding-service.ts`。
5. **品牌名**：`APP_NAME`（月詠 / 月夜翻译器）、Electron 启动页、`TSUKUYOMI 月詠`、日文站点名。
6. **仅控制台 / 诊断**：多行 `console.*` 续行、`degradation-detector` 日志标签、`ai-processing` 历史裁剪日志、`DOMException('操作已取消')`（按 `name === 'AbortError'` 判定）、`error-message.ts` 低层默认值、`id-generator.ts` 内部错误。
7. **开发者断言**：dispatcher 外调用 `inject*()` 的错误、`import-structure-validation.ts` 内部占位章。
8. **有意保持英文**：页脚更新徽标（`latest` / `… available`，悬停说明已本地化）、`API Key`、`URL` 等技术标签。

## 已知限制

- 导入记录中已持久化的 `TARGET_BUSY` 错误：句子按界面语言重投影，占用者名称为保存时的简中串（实时显示已完全本地化）。
- 旧版本页面写入的无 `labelKey` 的执行占用者，按保存的简中标签显示。
- 界面切换不重译历史 toast、AI 生成文字与用户内容（按设计）。
