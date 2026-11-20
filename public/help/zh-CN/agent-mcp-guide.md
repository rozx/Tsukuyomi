# 外部 Agent 与 MCP 接入指南 {#agent-mcp-guide-section-1}

通过 **外部 Agent 工作台**（`/mcp`），你可以让 Claude Code、Pi、Antigravity 等本地 Agent 直接操控 Tsukuyomi，使用已有 Agent 订阅额度完成建书、加章、维护设定与分块翻译。

## 运行模式 {#agent-mcp-guide-section-2}

### 桌面版：本地 Streamable HTTP MCP 服务端 {#agent-mcp-guide-section-3}

- 仅绑定本机回环地址 `127.0.0.1`（默认端口 `48321`），默认关闭，需要在 `/mcp` 页面手动开启。
- 强制校验 `Authorization: Bearer <token>`、`Host` 与 `Origin`，防止跨站网页误访问。
- 同一 `POST /mcp` 端点同时兼容 `2026-07-28` 无状态协议（`server/discover`）与 `2025-03-26` 握手协议（`initialize`）。
- 本机端口、Bearer Token、服务开关与权限模式仅保存于当前设备，不会同步到 GitHub Gist，也不会包含在导出备份文件中。

### 浏览器版：WebMCP 本地中继 {#agent-mcp-guide-section-4}

- 浏览器版通过 **WebMCP 本地中继**（`@mcp-b/webmcp-local-relay`）让 Claude Code、Cursor 等本地 Agent 使用本页的工具，不需要打开浏览器的实验开关。
- 在页面第一步开启 WebMCP 后，应用会在本页注册当前权限允许的工具（含只读的工作流指南 `get_workflow_guide`），并连接你电脑上运行的中继。
- 在 Agent 客户端里添加中继：Claude Code 运行 `claude mcp add webmcp-local-relay -- npx -y @mcp-b/webmcp-local-relay@latest --widget-origin <本页地址>`，其他客户端把页面给出的 JSON 合并到 MCP 配置里。需要 Node.js 22 或更高版本。页面给出的配置已经填好本页地址，中继只接受来自它的连接。
- 开启后，页面第一步会显示是否真的接上了本机中继：已接上、本机有中继但本页没有接上（多半是中继的 `--widget-origin` 与本页地址不一致），或还没有找到中继（Agent 客户端还没有启动它）。
- 让 Agent 调用 `webmcp_list_sources`，能看到本页就说明已连接。工具列表里看不到本页工具时，可用 `webmcp_list_tools` 列出、`webmcp_call_tool` 按名称调用。
- 使用期间请保持本页打开：工具来自这个标签页，关闭或刷新后 Agent 会暂时看不到它们。
- 只开一个 Tsukuyomi 标签页：同时开着多个时，Agent 看到的工具名会带上标签页后缀。
- 页面给出的配置里的地址取自你打开页面时的地址；换一个地址访问（例如 `localhost` 换成 `127.0.0.1`，或换了域名）后需要重新复制配置。
- 浏览器开着旧版的 WebMCP 实验开关时，应用会在本页自动改用内置实现；个别情况下无法替换，页面会提示去 `chrome://flags/#enable-webmcp-testing` 关闭该开关。
- 本页必须通过 HTTPS 或 localhost 打开，否则无法开启。
- 浏览器环境因跨域限制无法抓取部分站点时，可让 Agent 自行获取正文后调用 `create_book` 与 `add_chapters` 直接导入。

## 权限分级与多版本写回 {#agent-mcp-guide-section-5}

- **仅只读（`read_only`）**：仅开放书库、章节、术语、角色、记忆查询，全书搜索与词频统计，分块上下文拉取，以及读取你当前的页面位置和内置使用文档。
- **翻译与编辑（`translate_and_edit`，默认）**：允许建书、修改书籍信息、导入、批量加章、检查并导入书籍更新、提交与批量替换译文，新增、修改和删除术语/角色/记忆，但禁止删除书籍。
- **完全控制（`full`）**：额外开放 `delete_book`；切换到该模式时页面会要求再确认一次。
- **译文版本策略**：默认以 `append` 追加新译文版本并设为选中；每种语言每段最多保留 5 个历史版本，超过上限时会逐出最早版本，因此请避免对同一段落反复提交不同译文。

## 推荐翻译工作流 {#agent-mcp-guide-section-6}

1. 在 `/mcp` 页面只需要两步：开启服务，然后复制「快速上手指南」并粘贴给 Agent。
2. 指南开头的「首次设置」会让 Agent 替你完成准备：询问并建立项目文件夹、在其中配置好这个 MCP、把指南保存为该文件夹里的 AGENTS.md（Claude Code 另建一个引用它的 CLAUDE.md）。之后在这个文件夹里启动 Agent 就能直接工作，不用再粘贴。指南后面是数据模型、全部工具、分步工作流、规则与出错处理。桌面版的指南里包含访问令牌，不要把这个文件夹提交到公开仓库。想自己在客户端里添加 MCP 时，展开页面上的「手动添加 MCP」。
3. 大部头网页小说通过 `import_book_from_url` 默认按批抓取最多 20 章，可按返回的 `pending_chapter_count` 重复调用续传，并通过 `max_chapters` 调节单批章数。
4. 连载中的书籍可用 `check_book_updates` 检查来源站点的新章节，再用 `apply_book_updates` 导入。默认只导入新章节；应用已导入章节的正文改动（`include_updated`）会清除被改段落的译文。
5. 翻译落盘后会立即刷新书库与阅读页面，页面上的「调用活动」会实时显示每次工具调用的参数与返回结果摘要（刷新页面后仍保留，关闭标签页后清空），译文历史中会展示对应的外部来源标签（如 `MCP · claude-opus-4`）。
6. Agent 能知道你正在看什么：`get_app_context` 会返回你所在的页面、打开的书和章节、选中的段落及其原文与译文，以及你在页面上划选的文字。所以可以直接说「润色我选中的这一段」。
7. 统一修改译名时，Agent 会先用 `count_occurrences` 统计旧译名的出现次数，再用 `replace_in_translations` 预览并批量替换。按默认的写回方式，每个改动的段落会追加一个新版本，旧版本仍然保留。全书范围的查找用 `search_paragraphs`（支持正则）；开启了本地嵌入时还可以用 `search_chapters` 按内容描述找章节。
8. 可以直接问 Agent「Tsukuyomi 怎么导入小说」这类使用问题：它会用 `search_help_docs` 和 `get_help_doc` 查阅本帮助文档后回答。
9. `delete_terms`、`delete_characters`、`delete_memories` 用于清理过时或重复的条目。指南要求 Agent 在删除前先征得你的同意。
10. 翻译新章节的第一块时，Agent 会同时拿到上一章末尾的原文与译文，以及最近几章的标题译名，用来延续语气、标点习惯和标题格式。
11. 原文把术语或角色名写错字（例如同音字）时，这些条目会作为「可能相关」单独列出并标明原文里的写法，由 Agent 确认后使用。站内的翻译、润色、校对也有同样的提示。
12. 每一章都要遵守的翻译规范（称呼约定、固定用语、拟声词处理等）请写进书籍或章节的特殊指令，而不是记忆：特殊指令每次都会带上，记忆只在与当前内容相关时才出现。
13. 长篇书籍不需要读整本目录：`get_book` 可以只取最近几章或某一卷，`list_terms` / `list_characters` 支持分页和精简输出。
14. 搜索类工具（全书搜索、词频统计、章节段落、术语与角色列表、使用文档）默认精确匹配，另有可选的模糊匹配：Agent 记不清确切写法或原文有错字时可以开启。批量替换译文不支持模糊匹配，避免改到不该改的文字。
