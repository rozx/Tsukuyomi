# 发布说明 - v0.11.1

## 版本信息

- **版本号**: 0.11.1
- **发布日期**: 2026年4月22日
- **基于版本**: v0.11.0

> 本版本是 v0.11.0 工程化升级之后的小修订版，聚焦**同步体验的可见性与可恢复性**：修复 Header 待同步徽标漏算记忆条目、补齐 Gist **修订历史**在新 manifest 布局下的恢复能力，并对翻译批量工具做了一处小修正。配合继续的 CRAP 复杂度削减与同步回归测试加固，整体稳定性进一步提升。

---

## 🔄 同步稳定性 (Sync Reliability)

### 待同步提示覆盖记忆变更

- **修复**：`fix(sync): show memory changes in pending sync status`。此前 Header 右上角的"待同步变更"徽标与下拉详情只统计书籍 / AI 模型 / 封面 / 设置以及墓碑删除记录，**记忆条目的新增和编辑不会出现**——用户在记忆管理页修改后徽标仍显示 0，容易误以为数据已同步。
- 修复后：`useSyncPendingChanges` 在加载时按书籍 ID 拉取全部记忆，过滤 `lastAccessedAt > lastSyncTime` 的条目，并订阅 `MemoryService.addMemoryChangeListener` 做增量刷新（过滤掉 `embedding-updated` 等异步事件，避免嵌入回写引发误报）。新增与编辑在下拉列表中分别以 `added` / `edited` 呈现，标签优先取摘要、否则截取内容前 24 字。
- 新增 `src/__tests__/use-sync-pending-changes.test.ts`（157 行）覆盖基线空、记忆 CRUD、嵌入事件过滤等回归分支。

### Gist 修订历史恢复支持新布局

- **修复**：`fix(sync): support manifest-based gist revision restore`。`v0.10.1` 起同步采用 manifest 驱动的分文件布局（独立的 `settings.json` / `ai-models.json` / `cover-history.json` / `memories/*.json` / `novel-<id>.json`），但 **"从历史修订恢复"** 的代码仍假设所有内容聚合在单个 settings 文件中，导致从新布局的历史快照恢复时 AI 模型、封面、记忆等条目全部丢失。
- 修复后：`GistSyncService.downloadRevisionFromManifestFiles` 直接读取 `manifest.json`，按 entries 顺序反序列化每个条目（settings / ai-models / cover-history / novel / memories），命中 manifest 时走新路径，否则回退旧布局兼容逻辑。`assignRevisionEntry` 将各类条目归位到 `GistSyncData` 结构中，小说逐条追加、记忆合并列表。
- 新增 `src/__tests__/gist-sync-service.revision.test.ts`（898 行）与 `src/__tests__/sync-data-service.test.ts` 扩展（+536 行）覆盖修订恢复、删除传播、合并回归等关键路径。

### 翻译批量动作上报取真实 ID

- **修复**：`translation-tools.handleAddTranslationBatch` 在发射批量动作汇总时原本取 `normalizedIds[0]`（规范化请求入参的第一个 ID），当该段落被其他规则跳过时会上报一个**实际未被处理的**段落 ID。改为取 `acceptedParagraphs[0]?.paragraph_id`，确保 UI 跳转时定位到真正写入翻译的段落。

---

## 🛡️ 代码质量持续优化 (Ongoing CRAP Reduction)

延续 v0.11.0 的复杂度削减工作，再覆盖 **17 处高 CRAP 热点函数**：

- **AI 任务 / 工具**：`assistant-service`（+256/-? 行）、`task-runner`、`translation-tools`（697 行级重构，拆解批量翻译的校验 / 定位 / 写入 / 上报四段）、`book-tools`、`chapter-service` 抽出内部 helper，降低单函数 CRAP 与嵌套层数。
- **同步层**：`gist-sync-service` / `gist-sync-incremental` / `sync-data-service` 将参数签名格式化为多行，抽出批处理、清单拉取、修订解析等子步骤。
- **书籍详情合成**：`useActionInfoToast` / `useChapterTranslation` / `useKeyboardShortcuts` 按阶段切分，便于单独调试。
- **评分与抓取**：`memory-scoring` 拆分三信号组合，`kakuyomu-scraper` 收归章节解析片段到 `BaseScraper` 共享 helper。

影响面：纯结构性重构，行为不变；总计 13 个文件，`+1607 / -977` 行。

---

## 🧪 测试加固 (Regression Coverage)

- `gist-sync-service.revision.test.ts` 新增 898 行场景：manifest 修订快照解析、旧布局回退、只读 novel 条目、记忆合并去重、entries 缺失 / 字段格式异常的错误路径。
- `sync-data-service.test.ts` 扩展 538 行：双向合并保留新增实体、墓碑删除正确传播、基于 `lastEdited` 选远端优先等。
- `use-sync-pending-changes.test.ts` 新增 157 行：记忆 CRUD、`embedding-updated` 过滤、baseline 为 0 时跳过读取、书籍列表变化触发刷新。

---

## 🧰 工程细节 (Dev Experience)

- **pre-commit 钩子位置调整**：`chore: move pre-commit hook into .git/hooks`。此前放在 `.githooks/pre-commit` 需要额外配置 `git config core.hooksPath .githooks` 才能生效，新 checkout 的开发者容易漏配。现改为直接放在 `.git/hooks/pre-commit`（通过 `bun run setup:git-hooks` 安装），与 git 默认路径一致，无需额外配置。

---

## 📝 问题修复总览

- 修复：Header 待同步徽标未统计记忆条目，编辑后数量始终显示为 0。
- 修复：Gist 修订历史恢复在 manifest 新布局下只还原了书籍内容，AI 模型 / 封面 / 记忆丢失。
- 修复：批量添加翻译的动作汇总可能上报一个实际被跳过的段落 ID。

---

## 📚 相关文档

- **设置说明**: `help/settings-guide.md`（已同步更新待同步徽标与修订历史章节）
- **记忆管理**: `help/book-details-memory.md`

---

_本文档基于 git changes v0.11.0..v0.11.1_
