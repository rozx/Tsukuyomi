# 发布说明 - v0.14.0

## 版本信息

- **版本号**: 0.14.0
- **发布日期**: 2026 年 6 月 27 日
- **基于版本**: v0.13.0

> 本版本带来三件大事：
>
> 1. **章节段落虚拟滚动** — 长章节不再一次性把成百上千个段落塞进 DOM。基于 `@tanstack/vue-virtual` 只渲染可视窗口内的段落行，配自定义滚动条，长章节滚动、编辑、搜索的卡顿与内存占用大幅下降。同时彻底修掉了"拖动滚动条后光标失同步""编辑中段落滚出窗口丢失未保存草稿"两个老顽疾。
>
> 2. **全仓代码质量重构** — 对整个 `services/` `stores/` `composables/` 做了一轮以降复杂度（CRAP）为目标的重构，删除大量死代码，并新增 `quality-check:ci` 在本地复刻 CI 的 Fallow 重复 / 健康度门禁，让"过不了 CI"在提交前就能发现。
>
> 3. **月詠上下文压缩触发修复** — 把聊天助手"何时该压缩历史"的计数逻辑抽成单一可测的 `chat-session-context` 工具，统一 `apiMessageHistory` 优先、可见消息增量、工具占位符过滤三条规则，修复压缩过早 / 过晚触发。
>
> 此外还有一轮覆盖**安全与正确性**的 CodeRabbit 评审加固（URL 协议白名单、键盘可达性、抓取异常兜底、代理回滚），以及一次较大的依赖升级（uuid 14 / quasar 2.20 / vue 3.5.39 等）。

---

## ✨ 章节段落虚拟滚动 + 自定义滚动条 (Chapter Paragraph Virtualization)

长章节（数百上千段）此前会把每一段都渲染成真实 DOM 节点，滚动掉帧、内存暴涨，编辑大章时尤其明显。本版本引入虚拟滚动从根上解决（PR #97，commit `4c5d69f`）。

### 虚拟滚动核心

- **`@tanstack/vue-virtual` 驱动**：只渲染可视窗口（含上下缓冲区）内的段落行，DOM 节点数与章节长度解耦。新增 [`useChapterVirtualizer.ts`](src/composables/book-details/useChapterVirtualizer.ts)（297 行）封装测量、滚动定位与窗口计算
- **单段落行组件** [`ChapterParagraphRow.vue`](src/components/novel/ChapterParagraphRow.vue)：把原文 / 译文 / 编辑态拆成独立可复用的行，便于虚拟器按需挂载 / 卸载
- **自定义滚动条** [`ChapterScrollbar.vue`](src/components/novel/ChapterScrollbar.vue)：替换原生滚动条，**修复拖动滚动条时与光标 / 选区失同步**的问题；滑块最小高度同步，超长章节也能拖得动

### 编辑态在虚拟窗口下的正确性

虚拟滚动最大的坑是"正在编辑的段落被滚出窗口后整行被卸载"。本版本逐个补齐：

- **滚出窗口不丢草稿**（`eb63758`）：编辑中的段落滚出虚拟窗口被卸载、再滚回来重新挂载时，未保存草稿经 `editDraftStore` 暂存 / 恢复，跨父级重挂载也不丢
- **实时同步到 editDraftStore**（`e8d2bac`）：修复"钉住段落后继续输入、滚走再滚回内容回退"的竞态——每次输入实时写入草稿 store，不再等到失焦
- **钉住项偏移与同 id ref 防误删**：修正钉住段落的偏移取值，避免相同 id 的行 ref 被错误回收

### 切章 / 换模式 / 导航的测量与滚动

- **切章 / 切换编辑模式重置测量**（`7e1d82a`）：避免上一章的行高缓存污染新章布局
- **导航令牌**：上一 / 下一段导航在异步测量未完成时用令牌防止跳到过期位置
- **章节切换滚动到顶部**（`2eec1cb`）：上 / 下一章导航在桌面 / 平板 / 移动**全部三个变体**统一滚动到章节顶部
- **移动端空章节态 + 焦点可访问性**：空章节有明确占位，键盘焦点在虚拟行间正确流转

### 规格与测试

- OpenSpec 变更 `chapter-paragraph-virtualization`：proposal / design / spec / tasks 完整留档；移动端滚动条 Teleport 目标对齐为 `.mbr-scroll-wrap`（`df550f9`）
- 新增 [`use-chapter-virtualizer.test.ts`](src/__tests__/use-chapter-virtualizer.test.ts)（123 行）、[`chapter-virtual-navigation.test.ts`](src/__tests__/chapter-virtual-navigation.test.ts)（99 行），替换旧的 `paragraph-navigation-scroll.test.ts`

---

## 🧹 全仓代码质量重构 (Codebase-wide Quality Refactor)

PR #98 对整个运行时层做了一轮以**降复杂度**为目标的重构，并把质量门禁工程化。

### 重构本体

- **`refactor: refactored the entire codebase to pass code quality tests`**（`026b92b`）：覆盖 `services/ai/*`、`stores/*`、`composables/*`、`scraper/*` 等几乎所有运行时模块，拆分高 CRAP 函数、删除未使用的 export / class member / store 字段（`ai-models` −51、`book-details` −84、`settings` −63、`ask-user` −27 行等）
- **补测试消 CRAP 超阈**（`a29a6b7`）：为 `collectTranslationSearchChapters` / `resolveSpecialInstructionsForTask` 补测试，把覆盖率拉上来后这些热点函数的 CRAP 评分回落到阈值内

### `quality-check:ci` — 本地复刻 CI 门禁

- **新增 `quality-check:ci`**（`5de01b4`）：[`scripts/fallow-ci-check.ts`](scripts/fallow-ci-check.ts) 在本地跑出与 CI 相同的 Fallow 重复 / 健康度判定，`bun run quality-check` 现在会**串联**跑它，重复克隆 / 健康度回退在提交前硬失败，不必等推上去才发现
- **覆盖未跟踪新文件**（`5237277`）：`quality-check:ci` 把尚未 `git add` 的新文件也纳入扫描，避免"新文件带着问题溜过门禁"
- **消除 Fallow 重复克隆 + 回补丢失样式**（`475b003`）：重构过程中误删的组件 `<style scoped>` 已补回，并修掉重构引入的 lint
- **升级 fallow 到 2.102.0**（`26b006d`）：满足 GitHub Action 的二进制签名校验

---

## ✏️ 原文编辑新增格式化按钮 (Original Text Formatting Button)

原文编辑模式新增**「格式化」按钮**（`01a90f1`），一键清理从网页 / PDF 粘贴进来的原文里堆积的多余空行。

- **减一行规则，保留相对间距**（`b874376`）：每段连续空行减少一行（2 → 1、6 → 5），大段留白按比例保留而**不会被压扁成单空行**；首尾空行整段去掉。规则实现见 [`removeExtraBlankLines`](src/utils/text-utils.ts)
- **全角空格识别**：仅含全角空格（U+3000）的行也算空行，日文原文粘贴常见的"看不见的空行"也能清掉
- **防连按 + 可撤销**：编辑框记住上次格式化结果，连按两次不再误删；支持原生 `Ctrl+Z` 撤销回格式化前
- 新增 [`text-utils.test.ts`](src/__tests__/text-utils.test.ts)（107 行）覆盖减一行、首尾去除、全角空格、幂等边界

---

## 🤖 月詠上下文压缩触发修复 (Assistant Context Compression)

聊天助手在历史变长时会自动压缩（摘要）早期消息以控制 token。此前"何时该压缩"的计数分散在多处、口径不一，导致压缩**过早或过晚**触发（`0c1e014`）。

- **抽出单一计数工具** [`chat-session-context.ts`](src/utils/chat-session-context.ts)（137 行）：统一三条规则——`apiMessageHistory` 优先计数、其后叠加可见消息增量（`apiMessageHistoryVisibleMessageCount` 之后的部分）、过滤掉摘要消息 / 上下文消息 / 工具调用占位符
- **占位符常量集中**（[`constants/chat.ts`](src/constants/chat.ts)）：`TOOL_CALL_PLACEHOLDER`（「月詠施术中」）与向后兼容的旧文案变体集中一处，计数 / 摘要 / 输出过滤共用同一份
- **流式与摘要路径对齐**：`useChatSending` / `useChatSummarizer` / `useRightPanel` / `assistant-service` / `stream-handler` 统一调用新工具，消除各自维护一套计数的偏差
- 大量新增测试：[`chat-session-context-count.test.ts`](src/__tests__/chat-session-context-count.test.ts)（188 行）、[`use-chat-sending.context-compression.test.ts`](src/__tests__/use-chat-sending.context-compression.test.ts)（245 行）、`assistant-service.in-loop-summary.test.ts`（194 行）、`use-chat-summarizer.token-summary.test.ts`（100 行）

---

## 🛡️ 安全与正确性评审加固 (Security & Correctness Hardening)

三轮 CodeRabbit 评审意见的落地，集中在 URL 协议白名单、抓取健壮性与可访问性。

- **封面 URL 协议全源校验**（`744e348`）：封面图 URL 在所有来源路径统一校验协议白名单，拒绝非 `http` / `https` / `data:` 的可疑协议；抓取批量过程加异常兜底，单条失败不再拖垮整批；代理映射回滚加固
- **键盘可达性 + URL 协议白名单 + 数据完整性**（`284ba18`）：交互元素补齐键盘可达性，URL 入口收紧协议白名单，并修了一批数据完整性 / 正确性问题
- **发送按钮 type / 触屏反馈 / 覆盖率门禁**（`4d72d31`）：发送按钮显式 `type` 避免误触表单提交，回补触屏反馈，覆盖率门禁改为硬失败，修正测试 setup 与样式
- 日志文案修正（`f0a87c0`）：`saveContextToStorage` 写入失败日志改为「to storage」

---

## 🔄 同步 · 记忆访问后刷新待同步 (Sync Pending-Changes Refresh)

- **修复**：`fix(sync): refresh pending changes after memory access`（`1b42307`）
- 访问 / 更新记忆（刷新 `lastAccessedAt` 等）后，待同步徽标 / pending 变更集没有及时刷新，用户看不到"有改动待上传"。修复后记忆访问会正确触发待同步状态重算

---

## ⬆️ 依赖升级 (Dependency Upgrades)

- **`chore(deps)`**（`adbc014`）：一次较大的兼容升级，含 **uuid 14**、**globals 17**、**sharp 0.35**，以及 `quasar 2.20`、`vue 3.5.39`、`openai 6.45`、`primevue 4.5.5`、`puppeteer 24.43`、`@huggingface/transformers 4.2`、`marked 17.0.6`、`axios 1.18` 等
- 新增运行时依赖 **`@tanstack/vue-virtual`**（虚拟滚动）
- `fallow` 升级到 2.102.0（见上文质量门禁）

---

## 📝 问题修复

- 修复：长章节渲染全部段落导致滚动掉帧与内存暴涨——改为虚拟滚动只渲染可视窗口
- 修复：拖动自定义滚动条时与光标 / 选区失同步
- 修复：编辑中的段落滚出虚拟窗口被卸载后，未保存草稿丢失
- 修复：钉住段落后继续输入、滚走再滚回时内容回退的竞态
- 修复：上 / 下一章导航在部分变体没有滚动到章节顶部
- 修复：原文里多余空行无法一键清理；连按格式化会过度删除
- 修复：聊天助手上下文压缩触发计数口径不一，导致压缩过早 / 过晚
- 修复：封面 URL 未在全部来源校验协议白名单，存在可疑协议风险
- 修复：抓取批量过程单条异常会拖垮整批
- 修复：记忆访问后待同步状态未刷新，看不到待上传改动
- 修复：发送按钮缺少显式 `type`，触屏反馈缺失
- 修复：`saveContextToStorage` 写入失败日志文案方向写反

---

## ⚠️ 升级提示

- **无 IndexedDB schema 变更，无 manifest schema 变更**：从 v0.13.0 升级直接生效，本地数据与云同步完全兼容
- **虚拟滚动为透明升级**：编辑 / 阅读交互不变，长章节性能自动改善；若发现滚动定位异常，切换章节或编辑模式会重置测量
- 依赖升级较多，自建 / fork 用户升级后请重跑 `bun install`

---

## 📚 相关文档

- **内容编辑**: [`help/book-details-editing.md`](help/book-details-editing.md) — 新增「原文格式化按钮」与「虚拟滚动 / 自定义滚动条」说明
- **书籍详情页概览**: [`help/book-details-overview.md`](help/book-details-overview.md) — 章节内容区性能与滚动行为
- **月詠 · 聊天助手**: [`help/chat-assistant-guide.md`](help/chat-assistant-guide.md) — 上下文压缩行为

---

_本文档基于 git changes v0.13.0..v0.14.0_
