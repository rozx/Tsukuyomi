# Design

## Context

Tsukuyomi 的核心业务数据（书籍、卷章、段落多版本译文、术语、角色设定、记忆、本地嵌入索引）均持久化在渲染进程的 IndexedDB 中，由 `BookService` / `ChapterService` / `MemoryService` 等服务层读写。注意 UI 刷新并非写盘自动触发：`bookCommitBus` 目前只由书籍同步（`book-sync/persistence.ts`）与 AI 导入（`import-application-service.ts`）发布；常规写入靠 `useBooksStore` 的 action 在写盘后调用 `refreshBookFromStorage` 刷新 Store。另外 `TerminologyService` / `CharacterSettingService` 直接依赖 `useBooksStore().getBookById`，要求书库 Store 已加载。同时，应用已具备成熟的站内 AI 工具体系（`src/services/ai/tools/`）与翻译上下文组装器（`src/services/ai/tasks/utils/context-builder.ts`、`chunk-formatter.ts`）。

背景与目标见 [proposal.md](./proposal.md)，外部可见行为契约见各 `specs/*/spec.md`。当前技术约束如下：
- **双端运行形态**：同一套 Vue 3 + Quasar 代码同时构建为 Web SPA（运行于浏览器，不能监听 TCP 端口）与 Electron 45 桌面应用（主进程为 Node.js，渲染进程拥有 IndexedDB 与业务服务）。
- **主流 Coding Agents 接入方式**：Antigravity、Pi、Claude Code 均原生支持 Streamable HTTP MCP（`POST /mcp` + `Authorization: Bearer <token>`）；浏览器侧则面向 W3C WebMCP（`document.modelContext` / `navigator.modelContext`）及 `@mcp-b` 等浏览器桥接生态。
- **既有架构约束**：所有顶层页面必须遵循 Dispatcher + `Desktop / Tablet / Mobile` 三变体模式（`useDeviceVariant`）；`AppSettings` 中涉及本机凭据的字段在 Gist 同步时必须剥离并在下载时保留本机值。

## Goals / Non-Goals

**Goals:**
- 以一套协议无关的渲染进程工具内核同时驱动 **Electron 本地 Streamable HTTP MCP 服务端** 与 **浏览器 WebMCP 适配层**，避免双端逻辑分叉。
- 让外部 Coding Agent 无需重复理解站内底层表结构，单次调用即可获得与站内翻译引擎同等级的上下文（分块、上文衔接、命中术语/角色、三信号打分记忆、特殊指令）。
- 确保安全基线：默认关闭、仅绑 `127.0.0.1`、强制 Bearer Token + `Host`/`Origin` 校验、三级权限门禁、令牌绝不泄露至 Gist 同步。
- 提供独立一级工作台 `/mcp`（平行于 `/import` 与 `/ai`），支持一键接入配置复制与实时调用观测。

**Non-Goals:**
- 不提供面向公网或局域网的多用户远程 MCP 服务（严禁监听 `0.0.0.0`）。
- 不内置完整的 OAuth 2.1 授权服务器（本机回环采用高熵随机 Bearer Token 即可满足安全与易用平衡）。
- 不取代或改动站内已有 AI 翻译引擎与 `ToolRegistry` 内部调用协议。
- 不在仓库中捆绑独立的浏览器扩展或外部 CLI 进程（Web 端兼容浏览器原生 WebMCP 及社区桥接扩展即可）。

## Architecture Overview

```text
   Antigravity / Pi / Claude Code              Browser Agent / WebMCP Extension
                 |                                             |
                 | Streamable HTTP MCP (JSON-RPC 2.0)          | WebMCP API
                 | http://127.0.0.1:<port>/mcp                 | document / navigator
                 | Authorization: Bearer <token>               | .modelContext
                 v                                             v
   +-------------------------------+             +-------------------------------+
   | Electron Main Process         |             | Renderer: WebMCP Adapter      |
   | src-electron/mcp-server.ts    |             | src/services/agent-mcp/       |
   | - node:http on 127.0.0.1      |             |   webmcp-adapter.ts           |
   | - Bearer + Host/Origin guard  |             | - feature detect              |
   | - dual-era: server/discover + |             | - AbortSignal / unregister    |
   |   legacy initialize; tools/*  |             | - dynamic permission sync     |
   +---------------+---------------+             +---------------+---------------+
                   | Electron IPC (requestId correlated)         | Direct call
                   | src-electron/mcp-ipc.ts <-> electron-preload|
                   v                                             v
   +-----------------------------------------------------------------------------+
   |       Renderer: Shared Agent Tool Kernel (src/services/agent-mcp/)          |
   |                                                                             |
   |  kernel.ts            - registry, permission gate, dispatch, activity hook  |
   |  tools/library.ts     - list_books, get_book, create_book, add_chapters,    |
   |                         delete_book                                         |
   |  tools/url-import.ts  - import_book_from_url                                |
   |  tools/translation.ts - get_translation_chunk, submit_translations,         |
   |                         get_chapter_paragraphs, update_chapter_title        |
   |  tools/worldbuilding.ts - list/upsert terms & characters, memories,         |
   |                         get/update_special_instructions                     |
   |  tools/context.ts     - get_app_context, navigate_to, get_workflow_guide    |
   |  prompts.ts           - translate-chapter, polish-chapter,                  |
   |                         import-and-translate                                |
   +--------------------------------------+--------------------------------------+
                                          |
                                          v
       BookService / ChapterService / MemoryService / NovelScraperFactory
       + chunk-formatter / context-builder / add_translation_batch helpers
                                          | booksStore actions / refreshBookFromStorage
                                          v
                        Pinia Stores -> Live Reactive UI
```

## Decisions

### 1. 渲染进程共享工具内核 + 双传输薄绑定
- **决策**：将全部外部工具定义、参数校验、权限门禁、业务执行、Prompt 模板组装与活动日志记录集中在渲染进程纯 TypeScript 模块 `src/services/agent-mcp/`；Electron 主进程 MCP Server 与浏览器 WebMCP 适配层只做协议适配与转发。
- **理由**：IndexedDB、`BookService`、本地嵌入 Worker、爬虫服务及 Pinia 状态全部位于渲染进程。渲染进程共享内核使桌面端与浏览器端 90%+ 代码复用，写入统一经 `useBooksStore` 的 action（如 `editParagraphTranslations`、`updateBook`，写盘后 `refreshBookFromStorage`）以刷新 UI；确需直接调用 `BookService` 的路径由内核在写盘后显式调用 `refreshBookFromStorage` 或发布 `bookCommitBus`。内核在书库 Store 加载完成前收到调用时返回 `NOT_READY` 结构化错误。
- **备选方案**：在 Electron 主进程单独读 SQLite/文件或另起一套独立工具实现。由于 Tsukuyomi 数据存在浏览器 IndexedDB 中，主进程无法直接安全并发访问，故否决。

### 2. Electron 主进程使用零额外依赖的 `node:http` 实现双代（dual-era）Streamable HTTP MCP
- **决策**：在 `src-electron/mcp-server.ts` 中基于 Node 内置 `node:http` 与 `node:crypto` 直接实现 MCP Streamable HTTP，在同一个 `POST /mcp` 端点上同时服务两代客户端，按每个请求的开场方式分流：
  - **现代无状态（`2026-07-28`）**：请求 `params._meta` 带 `io.modelcontextprotocol/protocolVersion` 时走无状态语义，没有握手也没有会话。实现 `server/discover`（返回 `supportedVersions`、`capabilities` 等）、`tools/list`、`tools/call`、`prompts/list`、`prompts/get`。校验 `MCP-Protocol-Version`（须与 `_meta` 一致）、`Mcp-Method`，以及 `tools/call` / `prompts/get` 的 `Mcp-Name`；缺失或不一致返回 HTTP 400 + `-32020`（HeaderMismatch），版本不支持返回 400 + `-32022` 并在 `data.supported` 列出支持版本，未知方法返回 404 + `-32601`。所有结果带 `resultType`，`tools/list` / `prompts/list` 结果另带 `ttlMs` 与 `cacheScope`。
  - **旧代握手（`2025-03-26`）**：`initialize` 请求选择旧语义，继续支持 `notifications/initialized`（返回 202）、`ping`、`tools/*`、`prompts/*`；不带 `MCP-Protocol-Version` 头的非现代请求按 `2025-03-26` 处理。不签发也不回显 `Mcp-Session-Id`（旧规范中会话本就可选），因此两代都无服务端会话状态。
  - `GET /mcp` 与 `DELETE /mcp` 一律返回 405（不提供 SSE 流，也没有会话可终止）。
  - 两代共用同一套鉴权/来源校验与同一条 IPC 转发路径，差异只在信封（请求头校验、`_meta`、结果附加字段）。结果字段的精确形状（`ListToolsResult` 等）实现前须对照 `2026-07-28` schema 页原文核对。
- **理由**：
  - 避免引入 `@modelcontextprotocol/sdk` 在 `zod@^4` 与 Quasar Electron esbuild 打包中的潜在版本/模块解析风险（见 `quasar.config.ts` 中对 Electron 打包的特殊处理）。
  - `2026-07-28` 修订取消了 `initialize` 握手、会话、`ping`、GET 流与 DELETE，且规范的兼容矩阵明确「仅现代客户端 + 仅旧代服务端 = 失败」，客户端回退旧握手并非强制；只实现 `2025-03-26` 会把可用性押在各家客户端是否保留回退上，因此采用双代。
  - 本服务端只需要核心的无状态 JSON-RPC 路由（约 350~500 行），手写完全透明，便于用 Vitest 针对 `127.0.0.1`、Header 校验、错误码与并发请求做 100% 确定性测试。
  - 安全校验逻辑集中在一个 HTTP 中间件入口：`Host` 白名单（`127.0.0.1:*` / `localhost:*`）、拒绝非空且非本机的 `Origin`、`crypto.timingSafeEqual` 比对 `Authorization: Bearer <token>`、请求体大小上限（如 10 MB，防止大文本加章超限又避免内存滥用）。
- **备选方案**：引入 `@modelcontextprotocol/sdk`。若未来需要扩展复杂 MCP 特性（如服务端主动 sampling / SSE 推送订阅），再平滑迁移至官方 SDK 也不影响内核与 IPC 边界。

### 3. 主进程 <-> 渲染进程请求关联 IPC 协议
- **决策**：新增 `src-electron/mcp-ipc.ts` 并在 `electron-preload.ts` 暴露 `window.electronAPI.mcp`：
  - **渲染 -> 主进程**：`start(config)`、`stop()`、`updateConfig(config)`、`getStatus()`、`onStatus(cb)`、`onRequest(cb)`、`sendResponse(payload)`。
  - **主进程 -> 渲染**：每收到一次需要内核处理的 MCP 请求，主进程生成唯一 `requestId`，通过 `webContents.send('agent-mcp:request', { requestId, method, params, clientName })` 投递给渲染进程并挂起带超时（默认 60s；`DESKTOP_MCP_LONG_OPERATION_TOOLS` 中的长操作 `import_book_from_url`、`add_chapters`、`check_book_updates`、`apply_book_updates` 放宽至 180s，清单定义在 `src/models/desktop-mcp.ts` 并有测试校验其均为已注册工具）的 Promise；渲染进程通过 `ipcRenderer.send('agent-mcp:response', { requestId, result | error })` 回传。
  - **渲染就绪信号**：页面加载完成不代表 boot 已注册请求监听。渲染进程在桥接层注册 `onRequest` 之后发送 `agent-mcp:ready`，主进程收到可信来源的就绪信号前不转发请求。主框架跨文档导航（整页重载）、`render-process-gone` 与窗口关闭都会清除就绪状态并结束挂起请求，新页面须重新就绪。
  - 窗口已销毁、页面仍在加载或渲染进程尚未就绪时，主进程立即返回 JSON-RPC `-32002` 错误，避免客户端死等。
  - 主进程对 `agent-mcp:response` 及 `start` / `stop` / `updateConfig` / `getStatus` 一律用既有 `trustedDesktopSender(event, mainWindow)`（`src-electron/trusted-sender.ts`）校验来源，非主窗口顶层页面的消息直接丢弃（主窗口为 `webSecurity: false`，不能默认信任任意 frame）。
  - `mainWindow` 会被置空并重建（macOS 关窗后 `activate` 重新 `createWindow`）：服务端每次请求时动态取当前窗口而不是缓存 `webContents`；窗口 `closed` 时立即以 `-32002` 结束所有挂起请求。
- **理由**：复用现有 `electron-preload.ts` 中 `desktop-update:prepare` / `prepared` 已验证的 `id` 关联模式，类型安全且无需在渲染进程暴露任何 Node 能力。

### 4. 精选面向工作流的聚合工具（而非透传 50+ 内部工具）
- **决策**：对外提供一组高内聚工具（首批 22 个，WebMCP 通道额外暴露 `get_workflow_guide`；后按 4.1 补到 33 个），底层复用现有 services 与验证逻辑：
  - **应用与导航（2）**：`get_app_context`（读）、`navigate_to`（写 UI，支持跳转首页/书库/书籍/章节/段落）。
  - **书库与导入（6）**：`list_books`（读）、`get_book`（读）、`create_book`（写）、`add_chapters`（写，支持纯文本按空行/换行分段或段落数组，自动创建或追加到指定卷）、`import_book_from_url`（写，实现位于 `tools/url-import.ts`，调用 `NovelScraperFactory`；按规范化目录 URL 匹配已有书并增量合并目录，不覆盖用户改过的书名/作者/简介；每次调用抓取至多 `max_chapters` 个缺正文章节（默认 20、上限 50），返回 `pending_chapter_count` / `has_more` 供 Agent 续调；同一 URL 的重叠调用返回 `IMPORT_IN_PROGRESS`；已有正文的章节不重抓、不覆盖；新建书在未写入任何章节就失败时回滚删除空壳；失败时若书仍在书库则带回 `book_id` 且只建议 `add_chapters`，否则给出 `create_book` + `add_chapters` 的降级指引；Web 端 CORS 失败与站点不受支持同样返回结构化降级指引）、`delete_book`（危险写，仅 `full` 模式）；后补 `check_book_updates`（写级权限：快速检查可能把手动章节关联到目录网址，但不改章节内容；`deep` 时比对已导入章节正文）与 `apply_book_updates`（写：默认只导入站点新增章节，`include_updated` 才应用已导入章节的正文改动，`urls` 可限定范围），实现位于 `tools/book-updates.ts`，直接复用 `BookSyncService.openSession` 的检查与应用会话，每次调用重新检查而不跨调用保留会话。
  - **翻译核心循环（4）**：
    - `get_translation_chunk`（读）：分块大小取 `book.translationChunkSize`（经 `resolveTaskChunkSize`，显式 `chunk_size` 经 `resolveRuntimeTaskChunkSize`），复用 `buildChunks`、`resolveSpecialInstructionsForTask` 与术语/角色匹配；记忆使用只读的 `selectRelevantMemoriesForChunk`（返回结构化结果），**不**使用 `getRelatedMemoriesForChunk`——后者返回拼好的提示词字符串，并会写入按书共享的 `lastScoreBreakdownsByBook`，与站内同书任务并发时会互相覆盖打分明细。参数 `book_id?`、`chapter_id`、`mode: 'untranslated' | 'all'`、`cursor`、`chunk_size?`、`context_before?`（默认 3 段已译衔接）、`task_type?: 'translation' | 'polish' | 'proofreading'`（默认 `'translation'`，用于解析对应的书/章级特殊指令）。
      - **游标语义**：`cursor` 是章节原始段落序列中的起始段落索引（不是块序号）。`untranslated` 模式下每次提交后未翻集合都会缩小，块序号会跳块；因此该模式从 `cursor`（缺省为 0）起向后取第一批仍未翻译的段落，校验失败而未写入的段落在下一次不带 `cursor` 的调用中会再次返回。
    - `submit_translations`（写）：站内 `add_translation_batch` 不能直接调用——其入口要求 `aiProcessingStore` 中存在 `working` 状态的任务，`processTranslationBatch` 未导出且只做校验，真正落盘由任务侧 `onParagraphsExtracted` 回调完成。因此本工具把原文前缀校验/段落 ID 容错从 `translation-tools.ts` 抽成可共享的纯函数（站内行为与既有 `tools.test.ts` 保持不变），落盘走 `ParagraphTranslationEdit`：`append` → `{ type: 'append' }`（同 `saveLanguageParagraphResults`），`overwrite` → `{ type: 'update', translationId: <当前选中> }`，目标语言无选中译文时退化为 `append`。支持 `write_mode: 'append' | 'overwrite'`（默认跟随用户配置的 `defaultWriteMode`，即 `append`）、可选 `chapter_title_translation` 与 `model_label`，落盘后返回 `{ savedCount, failedItems, chapterTranslatedCount, chapterTotalCount, remainingUntranslatedCount, nextCursor }` 驱动 Agent 续翻。
    - `get_chapter_paragraphs`（读）：按范围或关键词检索章节段落与译文历史。
    - `update_chapter_title`（写）：独立更新章节标题译文。
  - **世界观维护（8）**：`list_terms`（读）、`upsert_terms`（写，支持单次数组批量新增/更新）、`list_characters`（读）、`upsert_characters`（写，支持批量新增/更新含性别/说话风格/别名）、`search_memories`（读，复用混合检索）、`upsert_memory`（写）、`get_special_instructions`（读）与 `update_special_instructions`（写，按读写拆分以保证 `readOnlyHint` 与权限门禁静态精确）。
  - **工作流指引（WebMCP 专用补充）**：`get_workflow_guide`（读，返回与 MCP Prompts 等价的 `translate-chapter` / `polish-chapter` / `import-and-translate` 文本）。
- **理由**：
  - 减少外部 Agent 上下文里的工具 schema 体积，同时用「打包拉取 + 批量 upsert」把翻译一章的轮次压到最低。
  - 拆分 `get_special_instructions` 与 `update_special_instructions` 让每个工具的 `readOnlyHint` 与三级权限门禁 100% 静态明确，无参数级歧义。

### 4.1 与站内 Agent 的能力对齐：补 11 个工具并扩充用户上下文

站内翻译 / 助手 Agent 共有 55 个工具。逐项对照后，其中多数已被外部工具合并覆盖（章节与书籍信息 → `get_book`；段落读取与译文历史 → `get_chapter_paragraphs`；术语 / 角色 / 记忆的读写 → `list_*` 与 `upsert_*`；写译文 → `submit_translations`），待办、`ask_user`、任务状态与联网搜索是站内任务循环自身的能力、外部 Agent 自带，不提供。真正缺的补成以下 11 个工具（共 33 个，WebMCP 通道另有 `get_workflow_guide`）：

- **全书搜索（`tools/search.ts`）**：
  - `search_paragraphs`（读）：关键词或正则，搜原文、当前选用的译文或两者；`chapter_id` 可选，省略时按卷章顺序扫全书；`limit`（默认 20、上限 100）与 `offset` 翻页，多找到一条即可判断 `has_more`，不必扫完全书。正则写错返回 `INVALID_REGEX`，而不是空结果。
  - `count_occurrences`（读）：至多 20 个关键词，统计出现次数、段落数与章节分布；默认统计原文，`search_in: "translation"` 统计当前选用的译文（用于确认旧译名还剩多少处）。
  - `replace_in_translations`（写）：在当前选用的译文里做字面替换，可用 `chapter_id` 限定章节、`original_contains` 限定「原文包含某词」的段落、`dry_run` 预览；单次最多改 `max_paragraphs` 段（默认 200、上限 1000），超出时返回 `has_more`。写入方式与 `submit_translations` 一致：跟随用户的 `defaultWriteMode`，`append` 为每个改动的段落追加新版本并选用（旧版本保留），`overwrite` 就地修改当前版本；替换后会变成空白的译文跳过不改。按章节分组后一次提交（`BookService.editParagraphTranslationGroups`），再刷新书库。
  - `search_chapters`（读）：按内容描述找章节，复用 `ChapterEmbeddingService.queryChapters`；本地嵌入未开启或模型未就绪时返回 `EMBEDDING_DISABLED` / `EMBEDDING_NOT_READY`，并提示改用 `search_paragraphs`。工具始终列出而不是按开关隐藏，保证工具清单只由权限决定。
  - **扫描方式**：三个全书工具共用同一个逐章扫描器，正文不在内存里的章节按 40 章一批从存储读取，不一次性把整本书放进内存；没有复用站内的全文索引，结果因此是确定的、与索引是否建好无关。三者加入桌面端长操作清单（180s）。
- **删除与浏览设定**：`delete_terms`、`delete_characters`、`delete_memories`（写，按 ID 批量删除，找不到或失败的逐项报告）与 `list_memories`（读，分页列出全部记忆，默认只带摘要）。删除类工具放在 `translate_and_edit` 权限下（用户决定）：它们只影响设定条目、不动正文与译文，与「删除书籍」不是一个量级；快速上手指南要求 Agent 删除前先征得用户同意。
- **书籍信息**：`update_book`（写）修改作者、简介、标签与别名，只改传入的字段，空字符串或空数组表示清空；不改书名与章节。
- **内置使用文档**：`search_help_docs`（读，按标题、简介与正文匹配并给出片段，不带搜索词时列出全部文档，不含更新日志）与 `get_help_doc`（读，返回全文），按界面语言读取。用户可以直接问 Agent「怎么用」，指南要求 Agent 先查文档再回答。这两个工具不依赖书库加载完成。
- **用户上下文**：`get_app_context` 除了原有的书籍 / 章节 / 段落 ID，还返回用户所在的页面（由路由路径解析为 `home` / `books` / `book` / `book_settings` / `import` / `ai_models` / `agent_mcp` / `settings` / `help` 等，书籍设置页带上具体分栏，帮助页带上文档 ID）、当前章节的标题与翻译进度、选中段落与鼠标所在段落的序号、原文与译文，以及用户在页面上划选的文字（`selected_text`，至多 2000 字符）。路由路径由 boot 层通过 `getCurrentPath` 钩子传入内核（与 `navigate` 同一条通路），services 层不直接依赖路由。

工具清单集中在 `tools/all-tools.ts`，内核注册与快速上手指南共用同一份，不再各自维护。

### 4.2 实际使用反馈后的修正

另一个 Agent 用这套工具跑完「检查更新 → 导入 → 翻译 → 查设定 → 回顾剧情」后给出的反馈，逐条对照代码核实后做了以下修正：

- **取翻译块时记忆经常为空（bug）**：记忆的关键词得分是「命中数 ÷ 传入的实体数」。站内只传本块命中的术语和角色，`get_translation_chunk` 却把全书的术语和角色都传了进去，得分被稀释到阈值以下；同时也没有带章节标题参与匹配。现改为与站内一致：只传本块命中的实体，并传入 `buildChapterSemanticQuery` 的结果。
- **角色用姓或名单独出现时不命中（bug）**：外部工具原先用简单子串匹配，现改用站内同一套匹配器（`findUniqueTermsInText` / `findUniqueCharactersInText`，含姓名拆分与注音归一化）。
- **近似匹配**：原文的错字、同音异写（如 `エロ性女` 之于术语 `エロ聖女`）精确匹配找不到，站内翻译同样受影响。在 `src/utils/text-matcher.ts` 增加 `findNearTermsInText` / `findNearCharactersInText`，用项目已有的 Fuse.js 做近似子串搜索（阈值 0.3，与全文搜索一致：4～6 个字容许 1 处差错，7 个字以上容许 2 处；不足 4 个字的名称不做）。排除三种情况以减少误报：原文里已有完全一致的写法、命中的那一段本身是另一个已知名称、差异落在标点或空白上。结果不并入确定命中，单独作为「可能相关」给出并标明原文写法——`get_translation_chunk` 返回 `possible_terms` / `possible_characters`（含 `text_in_source`），站内的分块翻译 / 润色 / 校对上下文与单段上下文增加对应一节。用户明确接受「多匹配些总比完全不匹配好」。
- **新章节第一块缺少衔接**：本章没有已译前文时返回 `previous_chapter_tail`（上一章末尾的已译段落，条数沿用 `context_before`），并始终返回 `recent_chapter_titles`（之前最近 5 章已有译名的标题），用于延续语气、标点习惯与标题格式。
- **导入后拿不到章节 ID**：`apply_book_updates` 返回 `applied_chapters`，`import_book_from_url` 返回 `fetched_chapters`（章节 ID、所在卷、标题、来源网址），长篇不必为此再读整本目录。
- **大书输出过大**：`get_book` 支持 `volume_id`、`recent_chapters`、`include_chapters: false`，并返回每卷的章节数；`list_terms` / `list_characters` 支持 `limit` / `offset` / `compact`（不传 `limit` 时仍返回全部，保持原行为）；`get_chapter_paragraphs` 支持 `skip_empty` 与 `from_end`，并返回 `has_more` / `next_start_index`。
- **`search_memories` 多关键词时只返回一两条**：站内搜索有意与翻译注入采用同一套取舍（绝对阈值 + 只保留紧贴最高分的条目），外部 Agent 的主动搜索不适用。`MemoryService.searchMemoriesWithScores` 增加 `ranked` 选项：只去掉完全没有命中的条目，其余按分数取前 `limit` 条；外部工具使用该选项并返回分数，站内行为不变。原实现经 `searchMemories` 固定只取 8 条，`limit` 参数实际不生效，一并修正。
- **翻译规范类内容不应依赖记忆召回**：没有给记忆增加「置顶 / 分类」（要改数据模型并牵涉同步）。称呼约定、固定用语这类每章都要遵守的规范属于特殊指令，每次取翻译块都会带上；快速上手指南已写明这一点。
- **连不上中继时看不出原因**：中继脚本不向页面报告连接状态，但有两处可观察——中继接受本页后脚本会在 `sessionStorage` 记下所连地址（被拒绝时删除），以及中继支持只用于发现的 WebSocket 子协议（连上即收到问候，不会把页面登记为工具来源）。`src/services/agent-mcp/relay-link.ts` 据此给出三种状态：已接上、本机有中继但本页没有接上（多半是 `--widget-origin` 与页面地址不一致）、没有找到中继；页面第一步显示状态与本页地址，开启后 2.5 秒做第一次检查、之后每 15 秒复查，只在浏览器端、开关打开且本页开着时进行。这两处是中继脚本的内部约定，升级依赖时由测试校验。

- **可选的模糊搜索**：`search_paragraphs`、`count_occurrences`、`get_chapter_paragraphs`、`list_terms`、`list_characters`、`search_help_docs` 都增加 `fuzzy` 参数，默认 `false`（精确匹配，行为不变），由 Agent 按需开启。实现共用 `tools/helpers.ts` 的 `fuzzyMatchIndexes`（Fuse.js，阈值与近似匹配、全文搜索同为 0.3）。几点取舍：`search_paragraphs` 的 `fuzzy` 与 `regex` 互斥；模糊词频每个命中段落计一次（无法可靠数出同一段里的多处近似写法）；术语、角色与使用文档的模糊结果按接近程度排序；`replace_in_translations` 不提供模糊模式，避免改到不该改的文字。

- **第二轮实测后的打磨**：
  - 近似匹配的误报与漏报：带敬称的别名（`優ちゃん`）原先整体参与近似匹配，会因为敬称相同而命中别人（`理央ちゃん`），而同一个人换了敬称（`優さん`）反而认不出。现在敬称后缀（さん / ちゃん / くん / 様 / 殿 / 先生 等）不参与近似匹配，只拿敬称前面的名字去比；同时把「同一个名字 + 另一种敬称」直接识别为该角色，名字不足 3 个字时要求前面不紧挨汉字（`俳優さん` 不是 `優さん`）。另外，恰好错一个字、且名称里是汉字或片假名而原文里是平假名的，多半是名称的一部分后面跟了助词（`向こう側` 之于 `向こうに`），不再算作近似写法。
  - 第三轮实测补充的两处去重：近似匹配原先只按「名称是否原样出现」判断是否已精确命中，漏掉了精确匹配器能认出的其他情形（姓、名单独出现，带分隔符的全名，注音写法），导致同一个条目既在确定命中里、又在「可能相关」里。现在近似匹配先跑一遍精确匹配，命中的条目直接排除。另外，命中的片段里夹着名称里没有的标点或空白（`アリア、` 之于 `アリシア`）时，说明片段跨过了词的边界，不再算作近似写法。
  - `apply_book_updates` / `import_book_from_url` 早已返回章节 ID，但工具说明里没写，Agent 无从得知；已写进说明。
  - `get_book` 增加 `include_description: false`，可省略较长的简介。
  - 前文衔接（`context_before` 与 `previous_chapter_tail`）跳过只有符号的段落（章末分隔线等），不让它们占用名额。章末的作者感言无法可靠识别，仍由 Agent 调大 `context_before` 解决。

### 5. 外部译文 `aiModelId` 约定与兼容渲染
- **决策**：
  - `Translation.aiModelId` 保持现有 `string` 类型不变，不修改 IndexedDB / Gist 同步数据格式。
  - 外部写入的 `aiModelId` 采用规范前缀：`mcp:<sanitized-label>`（桌面 MCP 通道，未传 `model_label` 时为 `mcp:external`）或 `webmcp:<sanitized-label>`（WebMCP 通道，未传时为 `webmcp:external`）。
  - 新增纯工具函数 `src/utils/translation-model-label.ts`（`resolveTranslationModelLabel(aiModelId, models, unknownLabel)`），先查 `aiModelsStore`，未命中时解析 `mcp:` / `webmcp:` 前缀为可读标签（如 `MCP · claude-opus-4`、`WebMCP`），其余才回退 `unknownLabel`。
  - 在 `TranslationHistoryDialog.vue`（`getModelName`）与 `useBookDetailsPage.ts`（`getParagraphModelName`）统一消费该辅助函数。
  - `overwrite` 走 `reviseLanguageTranslation`，只改文本与 revision、保留原 `aiModelId`，因此覆盖后的版本仍显示原来源；外部来源标识只在 `append` 新版本上出现。
  - `append` 的两个既有约束：同语言同文本时复用已有版本而不新增；每种语言最多保留 5 个版本（新版本 + 最近 4 个），更早的版本会被逐出。
- **理由**：零 schema 破坏、完全兼容 Gist 双向同步和历史修订恢复，且老版本客户端也能无损读取该译文记录。

### 6. 浏览器端：页面 WebMCP 运行时 + 本地中继（webmcp-local-relay）
- **决策**（取代最初「只适配浏览器原生 WebMCP、不引入 polyfill」的方案）：
  - 浏览器版开启 WebMCP 时，`src/services/agent-mcp/webmcp-relay.ts` 做两件事：动态 `import('@mcp-b/global')` 让 `document.modelContext` 存在；注入 `@mcp-b/webmcp-local-relay` 的 `embed.js`，由它创建隐藏 iframe，经本机 WebSocket（默认 `ws://127.0.0.1:9333`）把本页注册的工具转发给用户电脑上的中继进程，本地 Agent 再经 stdio 连接该进程。
  - `@mcp-b/global` 作为运行时依赖但只动态加载，不进主包。它一加载就会以「任意来源可连」的配置自动初始化，因此加载前先设置 `window.__webModelContextOptions = { autoInitialize: false }`，再以 `tabServer.allowedOrigins = [本页来源]` 显式初始化。
  - `embed.js` 与 `widget.html` 原样复制到 `public/webmcp-relay/` 随应用分发（应用强调离线可用，不从 CDN 加载）；`@mcp-b/webmcp-local-relay` 仅作为开发依赖提供这两个文件，测试校验两者逐字节一致且与 `@mcp-b/global` 主版本相同。这两个文件加入 ESLint 与 Prettier 的忽略列表。
  - `webmcp-adapter.ts` 保持不变，仍向 `document.modelContext`（回退 `navigator.modelContext`）注册工具：定义含 `name`、`description`、`inputSchema`、`annotations: { readOnlyHint }` 与 `execute(args)`，支持 `registerTool(def, { signal })` 与 `unregisterTool(name)` 两种注销方式，重注册前先注销。
  - 运行时顺序：开启时先接通运行时与中继再注册工具；关闭时先注销工具，再移除中继脚本与 iframe 并清理运行时。Electron 渲染进程不创建适配器和中继。
  - 页面不在安全上下文时不加载运行时，开关不可开启。
  - **旧版原生实现**：开着 WebMCP 实验开关的旧版 Chromium（155 之前）自带的 `document.modelContext`，`getTools()` 以 JSON 字符串返回 `inputSchema`；中继组件遇到这种格式拒绝转发，`@mcp-b/global` 也无法暴露这些工具并会刷出大量告警，而 polyfill 在已有原生接口时不安装且没有强制选项。因此开启时先注册一个临时探测工具判断是否为旧版（用完即注销，只探测一次）；是旧版就从 `Document.prototype` 删除原生 getter，让运行时在本页安装 polyfill（刷新后恢复）；删不掉时返回 `legacy-native`、不加载运行时，界面提示关闭实验开关或升级浏览器。这会让本页的浏览器内置 Agent 看不到原生接口，权衡后以中继可用为先。
  - 中继接通状态（`idle` / `enabled` / `insecure` / `legacy-native` / `failed`）经运行时回调写入 `useAgentMcpStore`，页面据此显示原因。
  - 多个标签页同时连接同一中继时，中继会给同名工具加标签页后缀（如 `list_books_5cc1`）；页面提示只开一个标签页，指南说明遇到后缀时的处理。
  - 配置里的 `--widget-origin` 取 `window.location.origin`，换地址访问后需重新复制。
  - 客户端配置：`claude mcp add webmcp-local-relay -- npx -y @mcp-b/webmcp-local-relay@latest --widget-origin <本页来源>`，以及通用 `mcpServers` JSON。中继默认接受任何网站接入，因此页面给出的配置一律带 `--widget-origin` 限定为本页来源。
  - Agent 侧看到的是本页工具（按原名注册）加中继自带的 `webmcp_list_sources` / `webmcp_list_tools` / `webmcp_call_tool` / `webmcp_open_page`；快速上手指南的浏览器版据此说明如何确认连接与兜底调用。
- **理由**：浏览器原生 WebMCP 仍是实验特性，各浏览器开启方式不一且不稳定（曾做过按浏览器的开启指南，随后弃用）；本地中继不依赖浏览器开关，并让浏览器版也能接入 Claude Code 等本地 Agent，这正是复用订阅额度的主要场景。
- **已验证**：用真实浏览器加本机中继进程做过端到端检查——中继列出本页 22 个工具与 4 个管理工具，`list_books`、`get_workflow_guide` 调用成功，页面调用活动同步记录。分别在「没有原生接口」和「启动参数开启旧版原生接口」（Edge 154）两种情况下验证通过；后者是在用户真实浏览器报出工具未被转发之后补做的。
- **已知限制**：页面必须保持打开；需要 Node.js 22+ 来运行中继；从 HTTPS 页面连接 `ws://127.0.0.1` 在部分浏览器可能受限或弹出本地网络访问授权（未逐一验证）；中继没有令牌鉴权，安全边界是回环地址加来源限定；页面侧没有连接状态接口，是否连通靠「已收到首次调用」体现。

### 7. 设备本地配置持久化与 Gist 同步隔离
- **决策**：在 `src/models/settings.ts` 的 `AppSettings` 中新增可选字段 `agentMcp?: AgentMcpSettings`：
  ```ts
  export type AgentMcpPermissionMode = 'read_only' | 'translate_and_edit' | 'full';
  export type AgentMcpWriteMode = 'append' | 'overwrite';

  export interface AgentMcpSettings {
    desktopServerEnabled: boolean;       // 默认 false
    desktopPort: number;                 // 默认 48321 (1024..65535)
    desktopAuthToken: string;            // 首次开启或初始化时生成 32 字节 hex
    webMcpEnabled: boolean;              // 默认 false
    permissionMode: AgentMcpPermissionMode; // 默认 'translate_and_edit'
    defaultWriteMode: AgentMcpWriteMode; // 默认 'append'
    notifyOnWrite: boolean;              // 默认 true
  }
  ```
  沿用**设备本地字段**（`syncs`、`memoryInjection.embeddingModelCached`）的处理路径，而不是 `tavilyApiKey` / `firecrawlApiKey`——后两者实际会随 Gist 同步并按 `apiKeysUpdatedAt` 合并（`services/settings/api-keys.ts`）：
  - 上传与 manifest 哈希：在 `src/utils/sync-strip.ts` 的 `stripAppSettingsLocalFields` 中剥离 `agentMcp`（调用点 `useSyncExecutor.ts`、`sync-local-checkpoint.ts`），开关/端口变化不会造成设置哈希变化。
  - 下载合并：`settingsStore.importSettings` 忽略传入的 `agentMcp`，保留本机值。
  - 恢复修订 / 强制下载：`settingsStore.replaceSettingsFromSyncSnapshot` 以默认值为基线重建设置，必须像 `embeddingModelCached` 一样显式带回本机 `agentMcp`，否则会被清空并关停服务。
  - 备份文件：`useSettingsImportExport` 导出的是未剥离的 `getAllSettings()`，导出前同样剥离 `agentMcp`；导入他机备份经 `importSettings`，不会改动本机 MCP 配置。
- **理由**：与既有设备本地字段机制一致，零额外存储表，且确保 Token 与本机端口不经 Gist 或备份文件外泄。

### 8. 独立一级工作台 `/mcp` 与三变体页面结构
- **决策**：
  - 路由：`{ path: 'mcp', component: () => import('src/pages/AgentMcpPage.vue') }`。
  - 文件组织严格遵循 `device-variant-dispatch` 与 `desktop-tool-pages`：
    - `src/pages/AgentMcpPage.vue`（Dispatcher，调用 `provideAgentMcpPage()`）
    - `src/pages/agent-mcp/AgentMcpDesktop.vue`（铺满窗口的看板，按可用宽度分三档，见下方「桌面布局」）
    - `src/pages/agent-mcp/AgentMcpTablet.vue`（复用桌面布局）
    - `src/pages/agent-mcp/AgentMcpMobile.vue`（同一组面板按使用顺序单列排列）
    - `src/composables/agent-mcp-page/useAgentMcpPage.ts`（`provideAgentMcpPage` / `injectAgentMcpPage`，保存跨断点存活的当前分栏、配置标签页、已展开的工具类别、端口草稿与两处待确认状态）
    - `src/components/agent-mcp/`：`AgentMcpPanel`（共用面板与小部件样式；手机端是基于 `DesktopWorkbenchSurface` 的独立卡片，桌面工作区内通过 `panel-surface.ts` 的 provide / inject 改为不带外框的一节）、`AgentMcpSetupSteps`、`AgentMcpActivityLog`、`AgentMcpPermissionPanel`、`AgentMcpConnectionSettings`、`AgentMcpToolCatalog`。
  - **页面按「用户要完成什么」组织，而不是按设置项平铺**：
    - 接入步骤只有两步：开启服务 → 把快速上手指南交给 Agent；客户端配置片段收进默认折叠的「手动添加 MCP」（展开状态存于 composable），桌面端服务未运行时片段置灰且不可复制；底部显示是否已收到首次调用。
    - 第二步是把快速上手指南交给 Agent，由 `src/services/agent-mcp/agent-quick-start.ts` 的 `buildAgentQuickStartGuide` 生成。指南以「首次设置」开头，让 Agent 替用户完成：询问并建立项目文件夹（默认 `~/tsukuyomi-translation`）、在其中以项目级方式配置 MCP（Claude Code 用 `claude mcp add --scope project …`）、把指南保存为该文件夹的 AGENTS.md（Claude Code 另建只含 `@AGENTS.md` 的 CLAUDE.md，已有文件时追加为一节）、告知用户之后在该文件夹里启动即可、无需再粘贴。随后是数据模型、了解现状、工具一览、五个分步工作流、规则、出错处理。它是通用内容，不让用户选任务或书籍。配置命令与「手动添加」里的片段共用 `src/services/agent-mcp/client-config.ts`（指南用项目级作用域，手动片段用客户端默认作用域）；工具一览由已注册工具和界面文案生成，测试校验其完整。桌面端指南含访问令牌，因此附带「不要把该文件夹提交到公开仓库」的提醒。（这一步的形态经过三次调整：按任务和书籍拼接的任务提示 → 简短指南 → 误改成纯 AGENTS.md 说明 → 现在的「首次设置 + 参考」。）
    - （已弃用，见决策 6）浏览器端检测不到 WebMCP 接口时：状态只显示「浏览器不支持」，开关禁用且始终显示为关（已保存的开启设置保留，接口出现后自动生效）；按浏览器给出开启指南，默认选中 `src/utils/browser-kind.ts` 按 UA 识别出的当前浏览器。Chrome 给出 `chrome://flags/#enable-webmcp-testing`（WebMCP for testing）；Edge 的确切开关名未能核实，只引导到 `edge://flags` 搜索；Firefox 与 Safari 未查到原生支持，引导改用 Chrome / Edge。页面不在安全上下文时另行提示。这些说明依据的是 2026-11 的公开资料，实验特性变化快，需要随浏览器版本复核。
    - 工具目录收成按类别折叠的概览，不再提供搜索。
    - **桌面布局**：页面固定为视口高度、自身不滚动，只有栏内滚动（与其他桌面页面一致）；页头带一行概览（服务状态、当前权限、开放的工具数、本次会话的调用次数，由 composable 的 `summaryMetrics` 提供）。页头下方是铺满剩余高度的看板，按本页可用宽度（CSS 容器查询，而不是窗口宽度，侧边栏展开与否都能正确切换）分三档：
      - **宽（≥ 78rem）**：三栏并排——接入（指南文本框占满剩余高度）、调用活动（标题固定、只有列表滚动）、权限与写回 + 开放的能力（桌面端另有连接设置，整栏滚动）。
      - **中（52–78rem）**：两栏——左栏固定为接入，右栏用标签在调用活动 / 权限与写回 / 开放的能力（/ 连接设置）之间切换；右栏显示哪一个由 `secondarySection` 决定（选中「接入」时为调用活动）。
      - **窄（< 52rem，含平板）**：顶部分栏标签，一次显示一栏。
      分栏状态由 composable 的 `sections` / `activeSection` / `selectSection` 提供，调用活动分栏带调用次数。各栏的外框由页面提供，面板在栏内不再套卡片。手机端保持单列卡片。
      - **走过的弯路**：最初是两栏、五张高度不一的卡片，整页滚动且显得杂乱；随后照「设置」页改成「左侧分栏导航 + 右侧单一内容区」，在宽屏上内容只占一窄条、留下大片空白，被否定。看板方案同时满足「不整页滚动」和「宽屏不留白」。
    - 权限以带后果说明和工具数量的选项呈现；切换到 `full` 与重新生成令牌用页面内的二次确认（状态保存在 composable，不依赖全局确认对话框）。
  - 导航入口：
    - `MainNavTab` / `MainNavTarget` 新增 `'mcp'`；
    - `AppSideMenu.vue` 与 `TabletNavRail.vue` 在主功能区 `ai` 之后加入 `mcp` 入口；
    - `MobileTabBar.vue` 保持现有 5 个核心 tab 不变，在 `IndexPage` 快捷入口或 `SettingsPage` 通用区提供跳转 `/mcp` 的卡片/入口，保证手机端可达。
  - 启动初始化：新增 `src/boot/agent-mcp.ts`（在 `quasar.config.ts` 的 `boot` 列表中注册），应用启动且 settings 加载完成后，按运行环境分别同步：Electron 仅同步本地 MCP 服务端状态（不注册 WebMCP），浏览器端仅同步 WebMCP 注册状态（均默认关闭，仅在用户上次已开启时恢复）。

## Risks / Trade-offs

- **[Risk] 本机其他网页尝试通过 `localhost` 访问 Electron MCP 端口（DNS Rebinding / CSRF）** → **Mitigation**: 强制仅绑定 `127.0.0.1`、强制校验 `Host` 为回环地址、拒绝携带非本机 `Origin` 的浏览器请求、每个请求均校验高熵 Bearer Token，且服务默认关闭。
- **[Risk] 外部 Coding Agent 与用户同时编辑同一章节导致竞态覆盖** → **Mitigation**: 写回路径全部走 `booksStore.editParagraphTranslations` → `LibraryPersistence` 事务（原文变化时以 `PARAGRAPH_SOURCE_CHANGED` 拒绝）；默认采用 `append` 新增译文版本并选中，不改写用户当前版本。但每种语言最多保留 5 个版本，Agent 对同一段反复提交不同译文会逐出最早的版本（可能包含用户手改版本）——工作流模板要求 Agent 不对同一段重复提交，帮助文档说明该上限。
- **[Risk] 浏览器 WebMCP 标准仍在快速演进，不同浏览器/扩展 API 形态存在差异** → **Mitigation**: 将 WebMCP 适配隔离在单一文件 `webmcp-adapter.ts`，同时兼容 `document.modelContext` 与 `navigator.modelContext`、`AbortSignal` 与 `unregisterTool`；后续规范稳定时只需改这一个适配文件。
- **[Risk] 超长章节调用 `get_translation_chunk` 或 `add_chapters` 触发 IPC/HTTP 载荷过大或超时** → **Mitigation**: `get_translation_chunk` 强制按 `chunk_size` 分块（带硬上限保护）并返回游标分批拉取；Electron HTTP 端设 10 MB 请求体上限，长耗时爬虫调用配置独立超时阈值。
- **[Risk] 活动日志在长时间翻译任务中无限增长占内存** → **Mitigation**: `useAgentMcpStore` 中的调用活动日志采用固定容量上限（最近 200 条），支持手动清空。日志保存在 `sessionStorage`（键 `tsukuyomi-agent-mcp-activities`）：刷新页面或开发时热重载后仍在，关闭标签页或退出桌面应用才清空；不写 IndexedDB、不参与 Gist 同步。读取时逐条校验，存储不可用或内容损坏时从空开始。每条记录除参数摘要外还带返回结果的一行摘要（数组给出条数、字符串截断、嵌套对象不展开），没有参数时摘要为空并由界面显示「无参数」，避免只显示一对花括号让人误以为记录是空的。

## Migration Plan

1. **零破坏平滑上线**：`agentMcp` 字段为 `AppSettings` 可选属性，旧版用户升级后自动补齐安全默认值（`desktopServerEnabled: false`、`webMcpEnabled: false`、`permissionMode: 'translate_and_edit'`、`defaultWriteMode: 'append'`），对未启用该功能的用户无任何运行时开销或端口监听。
2. **回滚策略**：如需紧急停用，只需在 `quasar.config.ts` 移除 `agent-mcp` boot 或将服务开关置为关闭；已由外部 Agent 写入的译文均为标准 `Translation` 记录，不受回滚影响，仍可正常阅读、切换历史版本与 Gist 同步。
