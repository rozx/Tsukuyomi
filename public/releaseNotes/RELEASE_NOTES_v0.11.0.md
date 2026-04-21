# 发布说明 - v0.11.0

## 版本信息

- **版本号**: 0.11.0
- **发布日期**: 2026年4月21日
- **基于版本**: v0.10.1

> 本版本是 Tsukuyomi 的一次大规模**工程内化**升级：引入 Fallow 代码健康度扫描、完成数百处函数拆分与公共逻辑提取、迁移测试框架至 Vitest + Istanbul 覆盖率、修复多项云同步边界问题并加固撤销恢复语义。面向用户的使用方式不变，但在稳定性、响应速度、长期可维护性上有显著收益。建议升级前先在"设置 → 数据同步"完成一次同步。

---

## 🛡️ 代码质量工程体系 (Code Health Pipeline)

本次版本将代码质量检查内化为项目工程链的一部分，并完成一轮全仓复杂度削减。

### Fallow 接入

- 新增 `bun run quality-check` 命令，基于 **Fallow** 扫描未使用代码、循环依赖、架构边界违规、复杂度热点与重复片段，并以基线文件（`.fallow-baseline.json`）冻结历史遗留项，只针对新增/变更代码强制门控。
- **CI 工作流**新增 fallow 质量作业：安装依赖 → 跑 Vitest 生成 Istanbul 覆盖率 → 基于 `origin/main` 差分执行 `--changed-since`；与本地 `bun run quality-check` 行为一致，避免本地通过 CI 红灯。
- 质量门 **CRAP 上限降为 100**，迫使新代码采用更细粒度的函数拆分。
- 提供完整的 Fallow Skill 文档集（SKILL.md、CLI 参考、常见陷阱、模式库），指导在遇到误报时优先**删真死代码**、其次用行内注释抑制（`// fallow-ignore-next-line`），**不**污染 `.fallowrc.json`。

### 全仓复杂度削减

- 超过 **120 次 refactor 提交**，范围覆盖 services / composables / stores / utils / AI tools / scraper：
  - 服务层：`book-service` / `chapter-service` / `chapter-content-service` / `memory-service` / `terminology-service` / `character-setting-service` / `sync-data-service` / `gist-sync-service` / `full-text-index-service` 多处函数拆分与 helper 提取。
  - AI 工具层：`paragraph-tools` / `book-tools` / `character-tools` / `memory-tools` / `translation-tools` / `task-status-tools` / `todo-list-tools` 抽离 `resolveBookForTool` / `resolveBookAndParagraphLocation` / `resolveCharacterForTool` / `requireMemoryById` / `locateTranslationById` 等通用定位 helper，统一错误语义与返回结构。
  - 抓取器：`BaseScraper` 收归 `fetchNovel` 模板、`fetchChapterContent`、`parseChapterDate`、`buildNovelFromParsedInfo`、`selectContentElement`、`visitCheerioContents` 等共享逻辑；三个 Syosetu / Kakuyomu 子类减少大量重复。
  - 同步：`useSyncExecutor`、`gist-sync-incremental`、`sync-data-service` 抽出 `makeDownloadProgressHandler` / `buildKnownAsManifest` / `prepareGistSession` / `rollbackThenRethrow` / `mergeDeletionsByKey` / `mergeVolumesWithoutCounterpart` / `shouldUseRemoteByLastEdited` 等流程片段。
  - 共用工具：新增 `serialize-dates`、`dispatch-custom-event`、`is-cancelled-error`、`chapter-book-lookup`、`memory-embedding-lookup`、`settings-lookup`、`sync-revision-guards`、`novel-form` 等工具模块，替代散落的内联复制。
- 多处 Pinia store 解耦：`embedding-queue` / `embedding-service` 不再反向 import `MemoryService` 或 `stores/books`，改由 `memory-cache` 叶子模块承担缓存与事件总线，打破 `memory-service ↔ embedding-queue` 循环。
- `chapter-content-service` 拆分出 `chapter-content-loader` 叶子模块，`require bookId` 参数以消除反向查找。
- AI 服务层新增 `ai-service-factory` / `tool-registry` / `tool-call-invoker`，替换 `services/ai` 内的 barrel 自引用循环。
- **删除真死代码**：移除未使用的 `src/theme/luna-preset.ts`（与 tsukuyomi preset 重复）、`TestResult.vue`、`token-counter-service`、`model-selector`、`id-generator`、`vite-plugin-node-polyfills` 依赖（用 `atob/btoa` 替代 Buffer fallback）、多处 `SyncDataService` 僵尸方法。

### 架构规则文档化

- `CLAUDE.md` / `AGENTS.md` 新增"Fallow 误报抑制"章节，强制抑制注释走行内、不进 `.fallowrc.json`、规则名使用单数。
- 新增 `.agents/skills/fallow/` 与 `.claude/skills/fallow` 骨架，提供跨代理统一的调用说明。

---

## 🔄 云同步稳定性 (Sync Reliability)

针对 v0.10.1 Manifest 化同步在复杂多设备场景下暴露的若干问题，本版本做了一轮加固。

- **修复：两端合并时丢失 novel 实体** — `fix(sync): preserve novel entities across two-way merge and propagate deletions correctly`。保留对方端新增的小说，同时正确传播删除，不再出现"其中一端的书在合并后消失"。
- **撤销/恢复语义修复（PR #85）**：
  - `fix: lock revision restores during sync` — 恢复期间上锁，避免同步流程写入覆盖待恢复的数据。
  - `fix: lock sync settings during revision restore` — 恢复期间同步设置保持冻结，防止异步刷新把旧 ETag 写回。
  - `fix: block auto sync during revision restore` — 自动同步在恢复窗口内暂停。
  - `fix: harden snapshot settings restore` — 快照设置恢复不再丢字段。
  - `fix: fully apply sync revision restores` — 恢复步骤完整落库，避免半应用。
- **导入语义修正**：`fix(import): treat field-present as replace, clear memories before upsert`。导入 JSON 时若字段显式存在则视为"替换"而非"合并"；记忆在 upsert 前清空，避免历史残留。
- **安全加固**：`fix(security): use URL hostname (not substring) for scraper dispatch; coerce axios content-type header`。抓取器分派改用 URL 对象 hostname 比对，防止恶意域名通过子串匹配绕过白名单。
- **其他**：
  - `fix(cover-dialog): await addCover before reading allCovers` — 修复封面上传后立即选择出现竞态。
  - `fix(memory-embedding): propagate IDB errors` — 嵌入写入失败时不再静默吞错，缓存与 `embedding-updated` 事件只在真正成功后触发。
  - `fix(types)`: 修复 `ChatSession` 类型查询与 `CharacterSetting` / `loopResult` 等类型收窄问题。

---

## 🧪 测试框架迁移 (Vitest + Istanbul)

- 测试运行器从 `bun test` 迁移到 **Vitest (jsdom)** + **Istanbul** 覆盖率：
  - `bun run test` / `bun run test:watch` / `bun run test:coverage` 使用 Vitest。
  - `bun:test` 风格的 `import` 通过 `src/__tests__/bun-test-shim.ts` 继续兼容，便于渐进迁移。
  - 全局 Pinia 与 PrimeVue `useToast` 在 `src/__tests__/vitest-setup.ts` 预先 mock，测试文件无需重复设置。
- `bun run test:bun` 保留给少数依赖 Bun 专属 API 的抓取器测试（`Bun.file(...)`）。
- 模块级 mock 采用 `vi.mock + vi.hoisted`，运行时动态 mock 采用 `vi.doMock + vi.resetModules`，替代不被 Vite transform 提升的 `await mock.module(...)`。
- 新增测试套件覆盖之前薄弱的区域：
  - `action-field-builders.test.ts` / `read-details.test.ts` / `simple-details.test.ts` / `named-entity-details.test.ts` / `navigate-and-translation-details.test.ts` / `get-action-details.test.ts` 覆盖聊天 action 详情渲染。
  - `books-store.test.ts` / `novel-form.test.ts` / `settings-parsers.test.ts` / `sync-revision-guards.test.ts` / `use-auto-sync.test.ts` 覆盖 store、解析器与自动同步分支。
  - 章节嵌入混合打分增加 `identifier-boost`、`proper-noun-boost`、`backlog-title` 等回归用例。
- CI 先跑 `quasar prepare` + 覆盖率再执行 Fallow，确保 CRAP 数据与源码对齐。

---

## ✨ 细节增强 (Minor Enhancements)

- **翻译进度面板**：`feat(translation-progress): auto-switch panel to newly started batch task` — 开始一项新批量任务时面板自动切到该任务，无需手动下拉切换。
- **AI Todo 工作流模板**：`feat(ai): enhance todo workflow templates with comprehensive steps` — 内置模板包含更完整的步骤，长任务过程中 AI 更少遗漏关键节点。
- **性能**：`perf(books): use Map lookup and parallelize chapter cleanup in bulkAddBooks` — 批量导入书籍时用 Map 查找并并行清理章节，大库导入明显更快。
- **响应式布局**：`feat: implement responsive layout components, AI task instrumentation, and comprehensive OpenSpec documentation updates` — 补齐了一批响应式布局组件与 AI 任务埋点。

---

## 📝 问题修复 (Bug Fixes)

- 修复：两端双向合并时部分 novel 实体丢失、删除未正确传播。
- 修复：撤销恢复过程中被同步流程打断导致的半应用状态。
- 修复：导入 memory 时字段残留与重复 upsert。
- 修复：抓取器 URL 白名单基于子串匹配可能被子域名绕过的安全问题。
- 修复：封面上传后立即选择的竞态。
- 修复：Memory 嵌入写入 IDB 失败时被静默吞掉，缓存与事件仍然更新造成状态错位。
- 修复：聊天会话/角色设定等类型在 store `$state` 查询下推断失败的类型错误。
- 修复：`TextTaskProcessor` 缺少显式重试上限与 `pickTextTaskOptions` 未穷举字段的问题。
- 修复：多处 fallow 报告的"表面死代码但实际通过 Vue template 消费"的误报，统一用行内注释处理。
- 修复：`tsconfig.tsbuildinfo` 被误 track，影响跨机器增量构建。

---

## ⚠️ 破坏性变更与升级提示

- **质量门**：外部贡献者本地需先运行 `bun run test:coverage` 生成 `coverage/coverage-final.json` 才能得到 CRAP 数据；`bun run quality-check` 默认使用基线 + 覆盖率 + `--changed-since origin/main`，与 CI 保持一致。
- **测试写法**：依赖 `await mock.module(...)` 的旧测试需要改写为 `vi.mock(..., factory)` + `vi.hoisted(...)`；动态 mock 改用 `vi.doMock + vi.resetModules + 动态 import()`。参考 `src/__tests__/local-embedding.test.ts`。
- **依赖瘦身**：移除了 `vite-plugin-node-polyfills`。若外部脚本依赖 Node Buffer，请改用 `atob` / `btoa` 或显式 polyfill。
- **主题 preset**：删除 `src/theme/luna-preset.ts`，请改用 `tsukuyomi` preset。
- **数据迁移**：本版本不引入新的 IndexedDB schema；从 v0.10.1 升级直接生效。如恢复流程曾在旧版本被打断，建议升级后重新执行一次撤销恢复，确保数据一致。

---

## 📚 相关文档

- **设置说明**: `help/settings-guide.md`
- **主页介绍**: `help/library-guide.md`
- **书籍详情页概览**: `help/book-details-overview.md`
- **AI 翻译功能**: `help/book-details-translation.md`
- **记忆管理**: `help/book-details-memory.md`

---

_本文档基于 git changes v0.10.1..v0.11.0_
