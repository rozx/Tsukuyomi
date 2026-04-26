# 发布说明 - v0.12.1

## 版本信息

- **版本号**: 0.12.1
- **发布日期**: 2026年4月26日
- **基于版本**: v0.11.1

> 本版本是 Tsukuyomi 桌面端的一次**全面重设计** — 把"窗口里塞着一个网页"的旧桌面外观，重塑为统一在 `tsukuyomi-sky` 主题语言下的工作台（Workbench）形态：sysbar chip 化的顶/底栏、左/右图标轨道（icon rails）、聊天与进度独立面板、批量嵌入抽屉、可折叠的设置菜单，以及全新的主页"继续阅读"hero。配套地，云同步 / 修订恢复 / 嵌入队列做了一轮稳定性加固，AI Todo 工作流也加了状态校验闸门。配合彻底的主题统一与多处 PR 复审复杂度削减，桌面端在视觉一致性、信息密度与多设备协同上都有显著提升。

---

## 🖥️ 桌面端工作台重设计 (Desktop Workbench Redesign)

桌面端从"页面"语言整体迁移到"工作台"语言：所有桌面页面现在共享 `DesktopWorkbenchHeader` / `DesktopWorkbenchSurface` / `DesktopWorkbenchMetrics` 三件套，统一标题区、内容容器、指标条的视觉与间距规范，便于后续追加新工作页时保持一致。

### 顶/底栏 chip 化（与平板 sysbar 对齐）

- **`refactor(desktop): align header/footer with tablet sysbar language via shared useSystemBar`**：`AppHeader` 与 `AppFooter` 改用 chip 风格 sysbar，与 `TabletSysBar` / `MobileSysBar` 共用 `useSystemBar()` 的状态聚合，避免在三套变体里各写一份"同步状态 / 任务进度 / AI 处理中"指示器。
- **`refactor: refresh desktop shell chrome to match tablet/mobile design language`**：删除大量硬编码 rgba，改走设计令牌（`--white-opacity-*` / `--moon-opacity-*` / `--accent-silver` 等）；菜单项、状态点、capsule composer 在三个变体之间像素级一致。
- **`fix(main-layout): align desktop canvas overlay with mobile/tablet`**：桌面 canvas overlay 不再与移动 / 平板存在透明度与边距漂移，跨设备截图终于能"看上去就是同一款应用"。

### 左右栏改为图标轨道 + 面板拆分

- **`feat(desktop-rails): collapse side/right bars into icon rails and split chat/progress panels`**：
  - 左侧 `AppSideMenu` 折叠为图标轨道（icon rail），鼠标悬停展开成完整菜单，工作区在常态下能多吃一截宽度。
  - 右侧 `AppRightPanelDesktop` 不再把"聊天 + 进度 + 批量嵌入"塞进同一个 793 行的巨型组件，**按职责拆成 `AppChatPanelDesktop`（646 行）+ `AppProgressPanelDesktop`（147 行）**，各自维护自己的状态与 watcher，外壳只负责固定宽度、拖拽 resize 手柄与 active 面板切换。
  - 切换右栏 tab 时，未激活的面板**不再**继续注册 watcher 与 toast 监听，整体内存占用与不可见态副作用都明显减少。
- **`feat(desktop-rails): move batch embeddings to right rail and convert to drawer`**：批量嵌入面板从 Header 操作下移到右栏轨道入口，并改造成抽屉形式 — 进入书籍详情页时随路由参数自动出现，未进入则不渲染。
- **`fix(desktop): prevent horizontal scroll in batch embeddings drawer`** + **`fix(desktop): deliver copy-to-assistant when chat tab is hidden`**：抽屉里因长文件名导致的水平溢出消除；切到进度 tab 时调用「复制到助手」也能正确投递到聊天面板（此前事件被未激活组件吞掉）。

### 主页：连续阅读 Hero + 工作台语言

- **`refactor(index-desktop): rebuild home in workbench language with continue-reading hero`**：`IndexPageDesktop` 整页重写（+1098 行 / -285 行），首屏改为「继续阅读」hero 卡 — 直接显示最近正在翻译的书籍封面、章节进度、上次活动时间，并支持一键回到上次阅读位置。
- 下方按"今日 / 本周 / 全部"分组展示工作台指标（章节、字数、翻译比例、待同步），配合统一的 `DesktopWorkbenchMetrics` 组件，与 `BooksPageDesktop` / `AIPageDesktop` / `SettingsPageDesktop` 视觉对齐。

### 书籍列表 / AI 模型卡片瘦身

- **`feat(books-page): shrink desktop book cards and align bottom action rows`**：桌面书籍卡缩小一档，封面比例固定，底部操作行（继续翻译 / 打开 / 收藏 / 更多）现在严格对齐基线，密集库（数十本以上）一屏可见数量明显增加。
- **`feat(ai-page): shrink desktop AI model cards and switch list to responsive grid`**：AI 模型卡片改为响应式 grid，宽屏放更多列、窄屏自动回退到 2 列；并补齐了任务路由与模型选择的工作台头部。

### 书籍详情页：可折叠 SETTINGS 菜单 + 侧栏调整

- **`feat(book-details): add collapsible SETTINGS menu with expand/collapse animation`**：书籍详情侧栏的「术语 / 角色 / 记忆」三个设置入口收纳进可折叠的 SETTINGS 分组，默认收起；动画用统一的 expand/collapse easing，不打扰阅读节奏。
- **`refactor(book-details-desktop): tighten sidebar width/tone, drop redundant back button and catalog title`**：侧栏宽度收窄、色调与正文 surface 区分度提高，移除冗余的「返回」按钮与「目录」副标题（Header 已有 breadcrumb）。
- **`fix(book-details-desktop): stop clipping paragraph highlight and sidebar chapter edges`**：段落高亮与侧栏章节项不再被 surface 边缘裁掉。
- **`refactor(book-details-desktop): section 4 — sidebar/reading/settings workbench language`** + **`fix(book-details-desktop): tint sidebar/reading/settings surfaces with tsukuyomi to match sky shell`**：详情页内部三个工作面（侧栏 / 阅读区 / 设置）颜色 token 化，与 sky 外壳的天空蓝灰色调统一。

### 帮助页与设置页

- **`refactor(help-desktop): branded landing + workbench nav/TOC/article hierarchy`**：帮助页桌面端重做着陆区，保留品牌 banner、左侧导航、右侧目录（TOC）+ 主体文章三栏布局，长文档阅读体验对齐主流 docs 站。
- **`refactor(settings-desktop): lift back chip into its own breadcrumb row`**：设置页"返回"chip 提到独立 breadcrumb 行，避免与设置项标题挤压。

### 主题统一

- **`refactor(theme): unify variants through tsukuyomi-preset, delete duplicate theme.ts`**：删除 `src/constants/theme.ts`（154 行重复定义），所有变体改为从 `tsukuyomi-preset` 单一来源消费令牌。
- **`fix(desktop-theme): align desktop shell with tsukuyomi-sky and tokenize workbench surface`**：桌面外壳颜色与 `tsukuyomi-sky` 对齐，工作台 surface 改用 tokenize 后的 CSS 变量，浅 / 深色切换时不再出现"几个面板各自变色但节奏不同步"。
- **`refactor(quality): dedupe settings panel dispatcher and unexport internal theme constants`** + **`fix(quality): drop unused theme re-exports flagged by fallow`**：删掉残留的 theme 重新导出与 dispatcher 重复代码。

---

## 🔄 同步与修订恢复加固 (Sync & Revision Reliability)

### ETag 漂移不再误报"其他设备频繁写入"

- **`fix(sync): treat ETag drift with unchanged manifest as 'unchanged' in pseudo-CAS`**：单设备使用时，GitHub Gist 偶尔会返回新 ETag 但 manifest 内容并未真的变化（描述字段被改、Web UI 编辑了非 manifest 文件、或后端 ETag 漂移）。此前 `runPseudoCasCheck` 见到 ETag 不一致就抛出"其他设备正在频繁写入"提示，让单设备用户莫名其妙看到冲突警告。
- 修复后：从 verify.files 解析 `manifest.json`，若哈希仍与 `latestConfig.knownRemoteHashes` 完全一致，直接判定为 `'unchanged'` 走快速路径；解析失败或哈希真的发生分叉才回落到原有重试与冲突分支。新增 97 行测试覆盖 ETag 漂移、manifest 解析失败、真分叉等路径。

### 修订恢复期间彻底冻结 embedding 写入

- **`fix(sync): harden revision restore and pause embedding during sync`**：
  - 引入专用 sync gate：`isSyncing` 或 `isRestoringSyncSnapshot` 为真时暂停 `EmbeddingQueue`，**只**恢复闸门自己挂起的任务，用户在 UI 主动暂停的状态被完整保留。
  - 修订恢复不再"静默丢弃"反序列化失败的 entry — 任何条目失败立即中止恢复（在 `overwriteFromSnapshot` 抹除本地数据**之前**），错误消息列出问题条目与原因（缺少 chunks / 文件被截断 / 布局不匹配）。
  - 修订读取容忍历史 chunk 分隔符（`_` / `#` / `-`）与 manifest / 布局漂移：标记为 `chunks=0` 但实际是 chunks 存储的条目会被扫描重组；标记为 chunked 但只剩单文件 body 的条目回退到单文件读取。
- 新增 64 行 EmbeddingQueue 闸门测试 + 169 行 Gist 修订测试覆盖：合法分隔符、错误消息内容、嵌入闸门优先级。

---

## 📱 平板 / 移动端体验

- **`fix(layout): 平板布局根容器改用 100dvh 以适配 Edge 移动端动态 URL 栏`**：`MainLayoutTablet` 把根容器从 `h-screen` (`100vh`) 改成 `h-[100dvh]`。Edge 移动端 / 部分 iOS 浏览器会随用户滚动动态收缩 URL 工具栏，`100vh` 在这些浏览器里超过实际可见区域，把内部本应滚动的面板推出屏幕；改为动态视口高度后，内部 main 区域承担滚动，与 `MainLayoutMobile` 行为一致。

---

## 🤖 AI 工作流 (AI Workflow Hardening)

### Todo 必须先进入「working」才能标记完成

- **`feat(todo): enforce working state requirement before marking todos as done`**：
  - `todo-list-service` 加入校验：尝试将一个非 working 状态的 todo 直接置为 done 会立刻抛错。
  - `todo-list-tools`、`todo-helper`、`todo-workflow` 与对应的系统 prompt 同步更新，明确「`pending → working → done`」工作顺序，让 AI 在长链路任务中更难"跳过执行直接打勾"。
  - 新增 21 行测试覆盖非法跃迁。

### 角色工具的章节作用域 + 别名匹配

- **`fix: add chapter scope tests for character tools and alias handling`**：`character-tool-helpers` 与 `text-matcher` 接受了一轮章节作用域回归（198 行）+ 别名提取/匹配回归（20 行）。文本匹配在含全角空格、连字符、或标点不一致的别名上，定位准确度更高。

### Cover service / Embedding queue 健壮性

- `cover-service` 与 `embedding-queue` 跟随 sync gate 调整后做了一轮加固，详见上文同步章节。

---

## 🎨 视觉细节与样式

- **`style: update text wrapping and overflow behavior for consistent text rendering`**：`StreamToolCall` / `TaskStream` 的长文本换行 / 溢出策略统一，AI 思考流不再出现某些工具调用单独溢出滚动条。

---

## 🛡️ PR 复审与 CRAP 削减

桌面重设计期间陆续接受了多轮 PR review，对应的复杂度热点同步削减：

- **`refactor(quality): address PR review feedback and reduce CRAP hotspots`** + **`refactor(quality): address second-pass PR feedback on sync split, prune watcher and tokens`**：拆分 sync 流程中的复合函数、移除残留 watcher、修剪重复 token。
- **`fix(desktop): address PR review feedback + split refreshStats to lower CRAP`**：`BatchEmbeddingsPanel.refreshStats` 拆出 stats 收集、文件读取、UI 投影三段。
- **`chore(vscode): remove duplicate Quality Check task from tasks.json`**：清理 VSCode 任务定义里重复的 Quality Check 入口。

---

## 📸 文档与截图

- **`docs(screenshots): refresh desktop redesign captures and switch to variant-first naming`** + **`docs(screenshots): refresh desktop reader and book-details captures`** + **`chore: update desktop library screenshot`** + **`docs: update desktop application screenshots`**：桌面端截图全量刷新到 sky / workbench 主题；命名改为 `<variant>-<surface>` 风格，便于在帮助文档里按设备变体引用。

---

## 📝 问题修复总览

- 修复：单设备用户在 ETag 漂移时被错误提示"其他设备正在频繁写入"。
- 修复：修订恢复在 entry 反序列化失败时静默丢弃数据，可能造成本地不可逆覆盖。
- 修复：修订读取无法兼容旧分隔符 / 旧 chunk 布局。
- 修复：同步过程中嵌入队列继续写入，可能与 `overwriteFromSnapshot` 竞态。
- 修复：平板布局在 Edge 移动端因 `100vh` 导致内部面板被推出屏幕。
- 修复：右栏切到进度 tab 时「复制到助手」事件被未激活面板吞掉。
- 修复：批量嵌入抽屉因长文件名出现水平滚动条。
- 修复：书籍详情页段落高亮与侧栏章节项被 surface 边缘裁掉。
- 修复：AI Todo 工具可绕过 working 状态直接标记完成，规避审计的执行步骤。
- 修复：桌面 canvas overlay 与移动 / 平板透明度不一致。
- 修复：桌面 shell 颜色与 `tsukuyomi-sky` 偏色，不同 surface 切换时主题节奏不同步。

---

## ⚠️ 升级提示

- **桌面端布局已重排**：习惯从 Header 进入「批量嵌入」的用户，请改从右栏图标轨道入口；详情页的「术语 / 角色 / 记忆」入口已折叠在侧栏 SETTINGS 分组下，点开即可。
- **本版本不引入新的 IndexedDB schema**：从 v0.11.1 升级直接生效；同步配置完全兼容（修订恢复路径增强后只对 v0.10.1 之前的旧布局更宽容）。
- **多设备用户**：建议升级前在每台设备上完成一次手动同步，让所有 manifest 哈希进入相同基线，新引入的 ETag 漂移快速路径就能在第一时间生效。

---

## 📚 相关文档

- **主页介绍**: `help/library-guide.md`
- **书籍列表页**: `help/books-page-guide.md`
- **顶部工具栏**: `help/toolbar-guide.md`（桌面端 sysbar chip 化后概念仍然适用）
- **书籍详情页概览**: `help/book-details-overview.md`
- **设置说明**: `help/settings-guide.md`

---

_本文档基于 git changes v0.11.1..v0.12.1_
