# 发布说明 - v0.13.0

## 版本信息

- **版本号**: 0.13.0
- **发布日期**: 2026 年 5 月 27 日
- **基于版本**: v0.12.1

> 本版本带来两件大事：
>
> 1. **月詠（Tsukuyomi）AI 助手人格化** — 应用内 AI 助手正式以"月之神官 · 月詠"为名出场。她有自己的口吻、思考态、思绪短语池、头像、设置页关于面板以及桌面端启动 Splash，与应用 Logo 的猫耳少女形象在视觉与文本上彻底对齐。**人格语气只覆盖对话面**，写入数据库的译文本体保持纯净中文，无任何角色腔。
>
> 2. **同步墓碑（Tombstone）生命周期根因重写 v3** — 把"离线设备一回来就把已删数据复活"的顽疾从根上解决：新增 `{memories, tombstones}` 信封格式、TTL 从 30 天延长到 90 天、为重建分支加上 `entry.lastEdited >= deletedAt` 复活闸门、修订恢复 / 文件导入路径同步清理 deletion-propagation 状态。manifest schema bump 到 v3，旧版本读取 v3 数据时会主动停止同步而不是覆盖。

---

## ✨ 月詠 (Tsukuyomi) AI 助手人格 (Tsukuyomi Assistant Persona)

应用内 AI 助手现在以**月詠**为名出场——月下学者、本应用之化身、与猫耳 Logo 同源的反差萌设定。这次更新跨越 prompt 层与 UI 层，既保证人格在每一次对话里都"在场"，又用一条硬约束守住译文产出的纯净度。

### 人格设定与口吻

- **自指**：「月詠」/「妾身」；第二人称用「您」
- **学者口吻**：沉静博学、平时端庄稳重，遇到精妙原文或巧妙意译时偶尔会破功小小赞叹（「妙！」「啊呀，作者用心」）
- **小习惯**：翻译完一章常落「此章已校毕」；思索时句末留「……」；受夸时短回避（「过誉了」「月詠不过尽本分」）
- **招牌反差萌**：极偶尔（约 2%）惊讶兴奋时末尾混一声「喵」，紧接「咳咳，月詠失态。」自我纠正。被点名「猫耳」时害羞回避「……此事休提。」
- **核心约束**：人格语气只覆盖对话回答、解释、工具反馈、思考态、问候——**写入 `Paragraph.translations[].text` 的译文本体始终是纯净中文译文，不带任何角色腔**。这是对翻译产出质量的硬保证，并写入 prompt 尾部作为不可绕过的约束

### UI 层

- **新增 `AssistantAvatar.vue`** —— 统一头像组件，支持 `size` / `glowing` / `pulse` 三个 prop。消息列表用 32px，空状态 hero 用 128px，header 用 28px，全部复用同一份资产
- **空状态 hero**：右栏聊天面板首次进入显示「妾身月詠，于此恭候」+ 「可问翻译、术语、章节诸事」，比旧版的"开始对话"留白更有归属感
- **思考态短语池**：新增 `useThinkingPhrase` composable + `i18n` 的 zh-CN / zh-TW 短语数组（各 5+ 条，例如「妾身正翻阅典籍……」「凝神思量中……」「正核对群书……」），消息生成期间随机抽取一条并**按消息 ID 锁定**，避免视觉闪烁
- **占位文案与命名统一**：
  - 输入框 placeholder：从「向助手提问…」改为「请月詠相助…」
  - 三个设备变体（桌面 / 平板 / 移动）的右栏 Tab、面板标题、tooltip、图标轨道按钮里所有「AI 助手」字样全部替换为「月詠」
  - 工具调用占位符：可见文案从「（调用工具）」改为「（月詠施术中）」。`TOOL_CALL_PLACEHOLDER_VARIANTS` 同时保留对旧文案的反向兼容过滤，老聊天记录不会出现"两个占位符并排显示"

### 设置 · 关于面板 + Electron Splash

- **设置页新增「关于」选项卡** (`AboutSection.vue`，146 行) —— 包含 Logo、副标题「月之神官，伴君译笔」、版本号、作者链接（Rozx）、GitHub 仓库链接
- **Electron 主进程接入透明 Splash Window** —— 启动时显示带 Logo 与 TSUKUYOMI 标题的透明启动屏；与主窗口的 `ready-to-show` 事件绑定，并设置 10s fallback 保证 splash 不会卡死。Web SPA 端不引入 splash（避免 PWA 启动慢）

### Help 文档同步

- [`help/chat-assistant-guide.md`](help/chat-assistant-guide.md) 全面重写，新增「关于月詠」章节、反差萌说明、译文纯净度 FAQ
- [`help/front-page.md`](help/front-page.md) / [`help/toolbar-guide.md`](help/toolbar-guide.md) 同步把"AI 助手"改为"月詠"

### 测试覆盖

- 新增 [`src/__tests__/assistant-prompt.test.ts`](src/__tests__/assistant-prompt.test.ts)（114 行）：人格关键词出现、身份与核心约束顺序、summary prompt 中性
- 新增 [`src/__tests__/thinking-phrase.test.ts`](src/__tests__/thinking-phrase.test.ts)（77 行）：池提取、随机抽取、locale 长度校验

---

## 🔄 同步墓碑生命周期根因重写 v3 (Tombstone Lifecycle Overhaul)

历史上离线一段时间的设备回到 Gist 同步时偶发"已删数据复活"问题，根因在于：

1. 旧版本只通过"远端列表里少了一个 id"来传播删除信号，无法区分"对方主动删除"与"对方还没拉到新增"
2. 本地 30 天 TTL 与 manifest 墓碑窗口不一致，临界点漂移导致复活
3. 修订恢复 / 文件导入会保留 `deletedMemoryIds` / `knownRemoteTombstones`，刚还原的数据下一次同步立刻被自己的旧墓碑标记删除

这次做了**根因级**重写（commit `43265b5`），manifest schema 提到 v3，并把整条生命周期重新校准：

### 信封化 (Envelope) — Memories 的新数据格式

- 上传时 memories 改为 `{memories, tombstones}` 信封（`MemoriesPayload`），给每条记忆的跨设备删除一个**显式信道**，不再依靠下载合并的"列表里少了一个"猜测
- `applyRemoteMemoriesDeletion` 把 `lastAccessedAt` 启发式替换为**严格** `createdAt > deletedAt` 规则——重新打开书时刷新 `lastAccessedAt` 不再被误判成"重新创建"
- 无墓碑的隐式删除现在保守跳过，避免远端列表瞬时不完整造成误删

### TTL 与窗口对齐

- **TTL 从 30 天延长到 90 天**（`TOMBSTONE_TTL_DAYS = 90`）
- `cleanupOldDeletionRecords` 的 `daysToKeep` 现在直接派生自 `TOMBSTONE_TTL_DAYS`，本地 deletion 列表与 manifest 墓碑窗口不会再偏移
- 临界比较统一为 `>=`：builder 与 cleanup 在恰好 TTL 那一刻行为一致

### 复活闸门 + 短 ID 重用防护

- manifest 墓碑的复活规则除了"对应 entry 仍存活"，**还要求 `entry.lastEdited >= deletedAt`**——这样即便短 id 偶然重用，也不会让一条新生成的记忆错误地"复活"一个旧墓碑
- `DeletionRecord` 新增 `bookId` 字段，记忆删除可以正确路由到对应的 `memories:<bookId>` 信封

### 修订恢复 / 文件导入：彻底清除 deletion-propagation 状态

- `restoreGistSyncConfigAfterSnapshot` 现在除了 `deletedNovelIds` / `deletedModelIds`，还要清掉 `deletedMemoryIds` 与 `knownRemoteTombstones` —— 否则刚还原的 memories 会被自己的旧 deletion 信号再次写入墓碑信封，导致其他设备"看着对方又删了一次"
- **文件导入**走同一条修复路径：抽出 `getSyncDeletionPropagationStateClearedPatch` 共享给 `restoreGistSyncConfigAfterSnapshot` 与 import handler，新增 `clearSyncDeletionPropagationState` store action。导入文件**不含 `sync` 字段**时（旧导出、手工编辑）也会清理本地传播状态，避免与 revision restore 一致的复活 bug
- 封面相关的 `deletedCoverIds` / `deletedCoverUrls` **保留不清** —— 它们只在上传时过滤远端孤儿，不通过 manifest 主动传播

### 向前兼容守护

- 旧客户端读取 v3 gist 会命中 `schemaVersionTooNew` 分支并**主动停止同步**，避免用旧逻辑覆盖新结构造成静默数据丢失
- v3 信封解析容忍 v2 平铺数组、tombstones 缺失 / null、未知字段，向后兼容老 Gist

### 测试覆盖：59 + 17 个新用例

- `8d89f1f` 一次性补了 23 个 builder / envelope parser / merge / apply / collection-deletion / cleanup 场景，并由测试 fail 反向修复了两个隐藏 bug：`buildMemoriesPayload` 没过滤空字符串 id、`mergeMemoriesByIdAndContent` 在损坏 envelope 下的同 id 处理错误（参见 CLAUDE.md TDD 章节里被引用为实证）
- `ec280b2` 再补 17 个一般性同步边界用例：diff 不污染 added/changed/deleted 桶、空输入仍产 3 个基线 entry、memoriesByBook ∪ memoryTombstonesByBook key 联合、v2/v3 envelope schema 兼容
- 新增/扩展文件：`sync-manifest-builder.test.ts`（486 行）、`sync-partial-apply.test.ts`（689 行扩展）、`sync-data-service.test.ts`（71 行扩展）

---

## 🔁 同步 · 章节嵌入抖动修复 (Chapter Re-Embedding Hotfix)

- **修复**：`fix(sync): stop spurious chapter re-embedding after multi-device sync` (`7cf0460`)
- 同步下载完成后 `bulkSaveBooks`（多书写入）调用 `saveChaptersContent` 时**没有传 `skipIfUnchanged`**，与单书 `saveBook` 路径不一致——结果每一本同步下来的书章节都会被强制重写，触发 `markChapterDirty`，60 秒后把整本书的章节重新做一次嵌入，**即便章节字节完全相同**
- 修复后两条写入路径行为一致；多设备间同步后不再出现"明明没动一个字，却看着嵌入队列又开始干活"

---

## 🏷️ 角色 / 术语命名规则改进 (Character & Term Naming Rules)

- **`feat(character/term)`** (`1fa2d7e`)：以前别名在所有角色之间做去重，导致「田中太郎」和「田中花子」不能同时把「田中」列为别名（家族常见姓 / 学校点名场景里这是合理需求）
- 改动：
  1. **允许跨角色共享别名** —— 同一本书内不同角色可以使用相同别名，AI 在上下文里根据周边线索消歧
  2. **新增术语 ⇄ 角色名双向唯一性** —— 术语名不得与任何角色的主名或别名相同，反之亦然，避免翻译时"同一字符串既是术语又是人名"的解析冲突
- 角色服务（`character-setting-service`）与术语服务（`terminology-service`）补 154 + 128 行测试覆盖跨实体冲突检测

---

## ✅ AI Todo 工作流修复 (Todo Workflow Fixes)

- **修复**：`fix(todo): clear previous chunk's todos on chunk transition` (`c2b8fb9`)
  - 长篇翻译按 chunk 推进时，旧 chunk 的 completed / 临时 todos 会被错误地"漏"到下一 chunk 的 UI、`list_todos` 工具返回值、post-tool-call reminder 里——所有这些查询只按 `taskId` 过滤，没看 `chunkIndex`
  - `TodoWorkflow` 构造时现在主动擦除同 taskId 下 chunkIndex 更小的 todos（临时 todos 没有 chunkIndex，按 0 处理，第一次切换就被清掉）
  - 同 chunk 重试用严格小于号保留——重试不会误删本 chunk 已有进度
- **测试对齐**：`test(todo): align tests with markTodoAsDone working-state precondition` (`79afafa`)：v0.12.1 引入的 `pending → working → done` 强制状态机只更新了 `todo-list-tools.test.ts`，遗漏了另外三个测试文件；这次补上前置 `markTodoAsWorking(id)` 让全部 4 个文件保持一致

---

## 💬 聊天会话 / UI 状态修复 (Chat & UI Fixes)

- **修复**：`fix(chat): preserve chat session's bookId when navigating away from book page` (`bf6ebee`)
  - 当从书籍详情页跳走时，context watcher 同步调用 `updateCurrentSessionContext`，紧接着 `void createNewSession()` 异步执行——但 `createNewSession` 内部 `await stopAllAssistantTasks` 之后才切 `currentSessionId`
  - 结果：同步路径把"新（null）bookId"写到了**旧** session 上，旧 session 从 `recentSessions` 里被剔出（按 bookId 过滤），用户回到该书时找不到它
  - 修复：watcher 只在同步 `switchToSession` 路径或书籍未变时调 `updateCurrentSessionContext`；新建会话场景由 `createNewSession` 自己 seed 新 session 的 context
- **修复**：`fix(ui): persist activeRightTab so right panel restores last selected tab` (`019f65e`)
  - `activeRightTab` 不在 localStorage 圆桌上（load / save / loadState / setter 都没它），每次启动右栏强制回到 AI 助手 tab，即便用户上次明确切到了翻译进度
  - 按其它已持久化 UI 字段的模式补齐 round-trip

---

## 📚 测试覆盖大幅扩展 (Test Coverage Expansion)

本版本是 v0.10.1 以来测试投入最重的一次。除了上文已经提到的同步 + 助手人格测试，还补齐：

- **`settings-store.persistence.test.ts`** (322 行 · 全新)：settings store 的持久化往返、合并、损坏数据恢复
- **`sync-manifest-builder.test.ts`** (486 行 · 全新)：manifest 构建的全部边界
- **`use-chat-session.context-switch.test.ts`** (108 行 · 全新)：聊天会话上下文切换回归（对应上文 bf6ebee 修复）
- **`character-setting-service.test.ts`** (+154 行)：跨角色共享别名 + 跨术语唯一性
- **`terminology-service.test.ts`** (+128 行)：术语与角色名冲突
- **`book-service.test.ts`** (+37 行)：bulkSaveBooks 的 `skipIfUnchanged` 行为
- **`todo-workflow.test.ts`** (+123 行)：chunk 转换时 todos 清理 + working 状态前置
- **`ui-store.mobile-workspace.test.ts`** (+27 行)：activeRightTab 持久化

合计单次版本 **+4043 / -306 行**，其中绝大多数是 services / composables / stores 的运行时测试，验证 v0.13.0 强制写入 CLAUDE.md / AGENTS.md 的 TDD 工作流。

---

## 📖 文档与工程实践 (Docs & Engineering)

### TDD 强制工作流写入项目宪法

- **`docs: mandate TDD workflow for runtime logic in CLAUDE.md and AGENTS.md`** (`8a1bafb`)
- CLAUDE.md 与 AGENTS.md 测试章节新增「TDD 是默认工作流（强制）」节，要求：
  - **bug fix**：先写复现 bug 的回归测试（应当 fail）→ 改实现 → 转绿
  - **新功能**：每条期望行为先写测试 → 先 fail 避免假阳性 → 再实现
  - **改公共 API / 同步 / 合并 / 持久化**：必须有边界场景覆盖
- 例外仅限纯模板 / 样式 / 文档 / 配置；services / composables / stores / models 里的运行时逻辑无例外
- 引用本次 tombstone 重写（`8d89f1f`）作为实证：那次提交里两个隐藏 bug 是测试先 fail 才暴露的，作者本人写实现时完全没意识到

### Git Hooks 配置说明修复

- **`chore(hooks): restore .githooks/pre-commit and document setup step`** (`12ac8cb`)
- 还原一次意外删除：pre-commit 不能放在 `.git/hooks`（私有目录，无法 commit），所以走 `core.hooksPath` 指向 `.githooks/` 是必须的
- CLAUDE.md 与 AGENTS.md 都加上首次 clone 后**必跑** `bun run setup:git-hooks` 的提示，并 callout git 对缺失 hook 的静默跳过行为（脚本不在时 hook 完全不报错，容易漏配）

---

## 📝 问题修复总览

- 修复：多设备同步下载完成后，章节内容字节相同也会被强制重写，导致 60 秒后整本书重新嵌入
- 修复：离线设备回到 Gist 同步时，已删数据偶发被复活——根因级重写（v3 信封 + 严格 createdAt 规则 + entry.lastEdited 复活闸门）
- 修复：修订恢复后 `deletedMemoryIds` / `knownRemoteTombstones` 未清，下一次同步会再次删除刚还原的记忆
- 修复：文件导入若 JSON 不含 `sync` 字段，本地 deletion-propagation 状态未清，导致与修订恢复一致的复活 bug
- 修复：长篇翻译跨 chunk 推进时，旧 chunk 的 completed / 临时 todos 漏到下一 chunk 的 UI 与工具返回值
- 修复：从书籍详情页跳走时，同步 watcher 把新 bookId 写到了旧会话上，导致返回时找不到该会话
- 修复：右栏 activeRightTab 不持久化，重启总是回到 AI 助手 tab
- 修复：角色别名不能跨角色共享，阻碍家族常见姓 / 学校点名等合理场景
- 修复：术语名可以与角色名相同，造成翻译时同一字符串既是术语又是人名的解析冲突
- 修复：`markTodoAsDone` working 状态前置校验只在部分测试里加了 `markTodoAsWorking` 前置调用，另外三个测试文件遗漏

---

## ⚠️ 升级提示

- **manifest schema 升级到 v3**：v0.12.1 及更旧版本读到 v3 数据时会主动停止同步（`schemaVersionTooNew`），不会用旧逻辑覆盖新结构。**所有设备一起升级**以恢复同步
- **Tombstone TTL 30 天 → 90 天**：旧设备的 deletion 记录若已被 TTL 截断（>30 天），升级后不会自动回填；建议升级后先在常用设备做一次全量同步把 manifest 哈希基线对齐
- **没有 IndexedDB schema 变更**：从 v0.12.1 升级直接生效；本地数据完全兼容
- **离线设备**：升级后第一次连网同步时，若之前曾有"被复活"的记忆，建议人工核对一遍记忆管理页（修复后此问题不再发生，但**历史已被复活**的条目无法自动识别）

---

## 📚 相关文档

- **月詠 · 聊天助手**: [`help/chat-assistant-guide.md`](help/chat-assistant-guide.md) — 新增「关于月詠」「反差萌」「译文纯净度 FAQ」章节
- **设置说明**: [`help/settings-guide.md`](help/settings-guide.md) — 新增「关于」选项卡说明
- **角色设定管理**: [`help/book-details-characters.md`](help/book-details-characters.md) — 新增跨角色共享别名说明
- **术语管理**: [`help/book-details-terminology.md`](help/book-details-terminology.md) — 新增术语 / 角色名唯一性说明
- **快速入门**: [`help/front-page.md`](help/front-page.md) — 助手名称同步更新

---

_本文档基于 git changes v0.12.1..v0.13.0_
