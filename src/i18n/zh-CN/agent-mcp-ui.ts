export default {
  agentMcp: {
    eyebrow: '外部 AGENT / MCP',
    title: '外部 Agent 工作台',
    subtitle: '让 Claude Code 等外部 Agent 用你已有的订阅额度，直接操作书库并翻译小说。',
    status: {
      running: '运行中',
      starting: '启动中',
      stopped: '已停止',
      error: '异常',
      registered: '已开启',
      unregistered: '未开启',
      unsupported: '无法开启',
    },
    steps: {
      desktopEnableTitle: '开启本地 MCP 服务',
      desktopEnableHint: '只监听本机 127.0.0.1，并要求令牌鉴权。',
      enableDesktop: '启用本地 MCP 服务',
      endpoint: '服务地址',
      copyEndpoint: '复制地址',
      clientTitle: '接入你的 Agent 客户端',
      clientHint: '配置里已填入当前地址与令牌。',
      clientLocked: '先开启上面的服务，配置才能使用。',
      copySnippet: '复制配置',
      tabClaudeCode: 'Claude Code',
      tabPi: 'Pi',
      tabAntigravity: 'Antigravity',
      placeClaudeCode: '在终端运行这条命令；之后运行 claude mcp list 可确认已连接。',
      placePi: '把这段配置合并到 Pi 的 MCP 配置文件的 mcpServers 中，具体位置见 Pi 的文档。',
      placeAntigravity:
        '把这段配置合并到 Antigravity 的 MCP 配置文件的 mcpServers 中，具体位置见 Antigravity 的文档。',
      waitingFirstCall: '还没有收到调用。客户端发出第一条指令后，这里会显示已连通。',
      firstCallReceived: '已连通：最近一次调用 {tool}（{time}）',
      webEnableTitle: '开启 WebMCP',
      webEnableHint:
        '在本页注册工具，并连接你电脑上运行的 WebMCP 中继，让 Claude Code 等本地 Agent 可以使用。',
      enableWebMcp: '开启 WebMCP',
      webInsecure:
        '本页不是通过 HTTPS 或 localhost 打开的，浏览器不允许在这样的页面上提供 WebMCP。请改用 HTTPS 地址访问。',
      webKeepOpen:
        '使用期间请保持本页打开：工具来自这个标签页，关闭或刷新后 Agent 会暂时看不到它们。',
      relayClientHint: '在 Agent 客户端里添加 WebMCP 本地中继。中继只接受来自本页地址的连接。',
      tabRelayJson: '其他客户端（JSON）',
      placeRelayClaudeCode:
        '在终端运行这条命令（需要 Node.js 22 或更高版本），然后重启 Claude Code。之后让 Agent 调用 webmcp_list_sources，能看到本页就说明已连接。',
      placeRelayJson:
        '把这段配置合并到客户端 MCP 配置的 mcpServers 中（Cursor、Claude Desktop、Windsurf 等通用），需要 Node.js 22 或更高版本。',
      guideTitle: '把快速上手指南交给 Agent',
      guideHint:
        '把这份指南粘贴给 Agent：它会帮你建好项目文件夹、配置好 MCP，并把指南存为那里的 AGENTS.md。以后在这个文件夹里启动 Agent，就不用再粘贴。',
      copyGuide: '复制指南',
      manualToggle: '手动添加 MCP',
      manualHint: '不使用指南、想自己在 Agent 客户端里添加时再展开。',
    },
    guide: {
      overviewContext: 'get_app_context：用户当前打开的书、章节，以及界面语言。',
      overviewLibrary: 'list_books 列出书库；get_book 查看一本书的章节列表与各章翻译进度。',
      overviewWorkflows:
        '每类任务的完整流程在 MCP 提示词 translate-chapter、polish-chapter、import-and-translate 里，开工前用 prompts/get 读取。',
      overviewWorkflowsWeb:
        '每类任务的完整流程用 get_workflow_guide 读取，workflow 可取 "translate-chapter"、"polish-chapter"、"import-and-translate"。',
      ruleIds: '严格按返回的段落 ID 一一对应提交，不要合并、拆分或省略段落。',
      ruleNoRepeat:
        '同一段不要重复提交不同的译文；提交被拒绝时按返回的原因修正，只重提被拒绝的段落。',
      overviewRelay:
        '先调用 webmcp_list_sources 确认 Tsukuyomi 页面已连接。如果在工具列表里看不到下面提到的工具，用 webmcp_list_tools 列出它们，再用 webmcp_call_tool 按名称调用。',
      intro:
        '这是小说翻译工具 Tsukuyomi 的使用说明。它通过 MCP 服务（服务名 tsukuyomi）提供工具：用这些工具直接读写用户的书库，结果写回应用，不要只输出在对话里。',
      introWeb:
        '这是小说翻译工具 Tsukuyomi 的使用说明。它运行在用户的浏览器里，通过 webmcp-local-relay 这个本地中继提供工具：用这些工具直接读写用户的书库，结果写回应用，不要只输出在对话里。工具来自打开着的页面，页面被关闭或刷新时会暂时消失。',
      conceptsTitle: '数据模型',
      conceptStructure:
        '层级是 书籍 → 卷 → 章节 → 段落。每本书有一个目标语言，译文都针对这个语言。',
      conceptVersions:
        '每个段落在每种语言下可以有多个译文版本，其中一个是当前选用的版本。每种语言最多保留 5 个版本，超出时最早的版本会被移除。',
      conceptWorld:
        '每本书有术语表、角色设定和记忆（剧情与世界观要点），还可以有书籍级和章节级的特殊指令。翻译时必须遵守它们。',
      conceptIds:
        'book_id、chapter_id 和段落 ID 都来自工具的返回值，不要自己编造。省略 book_id 时使用用户当前打开的书；用户没有打开任何书时必须显式传入。',
      overviewTitle: '先了解现状',
      toolsTitle: '工具一览',
      toolsNote:
        '标注「写入」的工具会修改用户的数据；标注「危险」的工具不可撤销，并且只在用户开启完全控制权限时可用。',
      toolWriteMark: '（写入）',
      toolDangerMark: '（危险）',
      toolSeparator: '：',
      workflowsTitle: '工作流',
      workflowsNote: '下面是每类任务的步骤。开始之前按「先了解现状」里的方式读取对应的完整工作流。',
      wfTranslateTitle: '翻译一章',
      wfTranslate1: '调用 get_translation_chunk，传入 chapter_id，mode 设为 "untranslated"。',
      wfTranslate2:
        '返回的 paragraphs 是待翻译段落（含 id 与原文）；context_before 是前文已有的译文，用来衔接语气；matched_terms、matched_characters 是这一块命中的术语和角色，memories 是相关记忆，special_instructions 是特殊指令，target_language 是目标语言。',
      wfTranslate3:
        '逐段翻译：一个原文段落对应一个译文段落，不合并、不拆分、不省略；术语和角色名使用给出的译法。',
      wfTranslate4:
        '调用 submit_translations，paragraphs 里每项包含 paragraph_id 和 translated_text。书籍启用了原文前缀校验时，还要带上 original_text_prefix（对应原文开头的几个字符）。翻译章节第一块时可以同时用 chapter_title_translation 提交章节标题译文；model_label 填你使用的模型名称。',
      wfTranslate5:
        '查看返回的 failed_items：只修正并重提失败的段落。remaining_untranslated_count 大于 0 时回到第 1 步，等于 0 时本章完成。',
      wfPolishTitle: '润色校对',
      wfPolish1:
        '调用 get_translation_chunk，mode 设为 "all"，task_type 设为 "polish"（校对用 "proofreading"）。每个段落会带上 current_translation。',
      wfPolish2: '只对确实需要改进的段落调用 submit_translations，没有改动的段落不要提交。',
      wfPolish3:
        '默认会新增一个译文版本并选用它；只有用户明确要求直接改写当前版本时才把 write_mode 设为 "overwrite"。',
      wfPolish4: '用返回的 next_cursor 作为下一次调用的 cursor，直到章节结束。',
      wfImportTitle: '导入新书',
      wfImport1:
        '有网址时调用 import_book_from_url。每次调用最多抓取 20 章（可用 max_chapters 调整，上限 50）；返回 has_more 为 true 时再次调用以继续。',
      wfImport2:
        '返回 IMPORT_IN_PROGRESS 表示同一网址的导入还在进行，等它完成后再试，不要重复发起。',
      wfImport3:
        '站点不受支持或抓取失败时，自行获取正文，用 create_book 建书，再用 add_chapters 写入章节。错误里带有 book_id 时说明书已存在，只需要 add_chapters，不要重新建书。',
      wfUpdateTitle: '跟进连载更新',
      wfUpdate1: '调用 check_book_updates 查看来源站点的新章节。',
      wfUpdate2: '调用 apply_book_updates 导入，默认只导入新章节。',
      wfUpdate3:
        'include_updated 会应用已导入章节的正文改动，并清除被改段落的译文，使用前必须先得到用户同意。',
      wfUpdate4: '导入完成后按「翻译一章」处理新章节。',
      wfWorldTitle: '维护术语、角色与记忆',
      wfWorld1: '开始翻译一本书之前，先用 list_terms 和 list_characters 了解已有的译法。',
      wfWorld2:
        '遇到新的专有名词或人名时，用 upsert_terms、upsert_characters 记录下来，之后全书沿用。',
      wfWorld3:
        '重要的剧情转折、人物关系和世界观设定用 upsert_memory 记下；需要回忆前文时用 search_memories。',
      wfWorld4:
        '用户对文风或称呼有长期要求时，用 update_special_instructions 写成书籍级或章节级的特殊指令。',
      rulesTitle: '规则',
      ruleWriteBack: '所有译文和设定都通过工具写回应用，不要只贴在对话里。',
      ruleConfirm:
        'apply_book_updates 的 include_updated 和 delete_book 会丢失用户的数据，使用前必须先得到用户同意。',
      ruleAsk: '不确定要处理哪本书、哪些章节时先问用户；每完成一章汇报进度。',
      errorsTitle: '出错时',
      errPermission:
        'PERMISSION_DENIED：当前权限模式不允许这个操作。告诉用户需要在「外部 Agent」页面调整权限，不要尝试绕过。',
      errNotReady: 'NOT_READY：应用刚启动，书库还没加载完，稍等片刻再试。',
      errBookRequired:
        'BOOK_ID_REQUIRED：用户没有打开任何书，先用 list_books 找到目标并显式传入 book_id。',
      errNotFound:
        'BOOK_NOT_FOUND、CHAPTER_NOT_FOUND：标识不存在或已被删除，用 list_books、get_book 重新获取。',
      errSource:
        'UPDATE_SOURCE_MISSING、UPDATE_SOURCE_INVALID：这本书没有可用的更新来源，请用户在应用里设置或修复。',
      errOther: '其他错误：把工具返回的错误信息原样告诉用户，不要猜测原因后反复重试。',
      errRelay:
        '看不到任何 Tsukuyomi 工具：调用 webmcp_list_sources 检查页面是否已连接；没有连接时请用户确认页面开着并且 WebMCP 已开启。',
      title: 'Tsukuyomi 快速上手指南',
      setupTitle: '首次设置（只需做一次）',
      setupIntro:
        '用户把这份指南交给你，是希望你替他把环境准备好。按顺序完成下面四步；如果当前文件夹里已经有这份指南，并且你能看到后面提到的工具，说明已经设置过，跳过这一节。',
      setupFolder:
        '**建立项目文件夹。** 询问用户想把翻译项目放在哪里；用户没有偏好时，在他的主目录下新建 `tsukuyomi-translation` 文件夹。之后的操作都在这个文件夹里进行。',
      setupMcp: '**在这个文件夹里配置 MCP。** 如果你是 Claude Code，在该文件夹下运行：',
      setupMcpOtherDesktop:
        '其他客户端：在它的项目级 MCP 配置里添加一个 HTTP 服务，地址为 {url}，请求头为 Authorization: Bearer {token}。',
      setupMcpOtherRelay: '其他客户端：把下面的内容写入它的项目级 MCP 配置：',
      setupSave:
        "**把这份指南保存为该文件夹里的 AGENTS.md。** 原样保存全部内容。如果你是 Claude Code，再建一个 CLAUDE.md，内容只写一行 `{'@'}AGENTS.md`。文件已经存在时，把这份指南作为单独一节追加进去，不要覆盖已有内容；以后拿到新版本时只替换这一节。",
      setupFinish:
        '**告诉用户接下来怎么做。** 说明项目文件夹的位置，并请他在这个文件夹里重启或重新加载你，让 MCP 生效。以后只要在这个文件夹里启动，就不用再粘贴这份指南。',
      setupPrereqDesktop:
        '前提：用户已在 Tsukuyomi 桌面版的「外部 Agent」页面开启本地 MCP 服务。连不上时先请用户确认这一点。',
      setupPrereqWeb:
        '前提：用户已在浏览器里打开 Tsukuyomi 的「外部 Agent」页面并开启 WebMCP，且保持该页面打开；运行中继需要 Node.js 22 或更高版本。连不上时先请用户确认这几点。',
      setupTokenWarning:
        '注意：上面的命令和保存下来的文件里包含访问令牌，不要把这个文件夹提交到公开仓库。',
    },
    activity: {
      title: '调用活动',
      hint: '只保存在本次会话中，最多 200 条。',
      clear: '清空',
      empty: '还没有调用记录。Agent 开始工作后，每一次工具调用都会实时显示在这里。',
      statusSuccess: '成功',
      statusError: '失败',
      statusDenied: '拒绝',
    },
    permission: {
      title: '权限',
      readOnly: '仅只读',
      readOnlyDesc: '只能查询书库、读取原文与翻译上下文，不能写入任何内容。',
      translateEdit: '翻译与编辑',
      translateEditDesc: '可以建书、加章、导入、写回译文、维护术语与角色，不能删除书籍。',
      full: '完全控制',
      fullDesc: '在「翻译与编辑」之上，还允许永久删除书籍。',
      toolCount: '开放 {count} 个工具',
      recommended: '推荐',
      fullConfirmTitle: '允许外部 Agent 删除书籍？',
      fullConfirmBody: '开启后，Agent 可以永久删除书库中的书籍及其全部译文，无法撤销。',
      fullConfirmAccept: '开启完全控制',
      cancel: '取消',
      writeMode: '已有译文的写回方式',
      writeAppend: '追加新版本并选中（保留历史）',
      writeOverwrite: '覆盖当前选中的版本',
      notifyOnWrite: '写入完成时提示',
      notifyOnWriteHint: 'Agent 建书、提交译文或更新设定后弹出一条通知。',
    },
    connectionSettings: {
      title: '连接设置',
      localOnly: '端口与令牌只保存在本机，不会同步到 Gist，也不会导出到备份文件。',
      port: '监听端口',
      savePort: '应用',
      token: '访问令牌',
      showToken: '显示令牌',
      hideToken: '隐藏令牌',
      copyToken: '复制令牌',
      regenerate: '重新生成令牌',
      regenerateConfirm: '已接入的客户端会立即失效，需要重新复制配置。',
      regenerateAccept: '确认重新生成',
      cancel: '取消',
    },
    catalog: {
      title: '开放的能力',
      summary: '当前权限下共开放 {count} 个工具',
      categoryContext: '应用与导航',
      categoryLibrary: '书库与导入',
      categoryTranslation: '翻译',
      categoryWorldbuilding: '术语、角色与记忆',
      workflows: '工作流模板',
      readOnlyBadge: '只读',
      writeBadge: '写入',
      dangerBadge: '危险',
    },
    prompts: {
      'translate-chapter': '按块拉取章节原文、术语、角色设定与记忆，逐段翻译并批量回写。',
      'polish-chapter': '结合术语、角色语气与润色指令审校已有译文，只提交需要改进的段落。',
      'import-and-translate': '从 URL 或本地文本导入小说并立即开始分块翻译。',
    },
    tools: {
      get_app_context: '读取当前打开的书籍/章节/段落上下文、界面语言与运行环境能力标记。',
      navigate_to: '切换界面到首页、书库、指定书籍、章节或定位到具体段落。',
      get_workflow_guide:
        '获取 translate-chapter / polish-chapter / import-and-translate 标准工作流指引。',
      list_books: '列出本地书库全部书籍的元数据、卷章数与目标翻译语言。',
      get_book: '获取单本书籍完整卷章目录及各章翻译进度统计。',
      create_book: '在本地书库创建新书籍，支持同时写入初始章节。',
      add_chapters: '按纯文本分段或段落数组向指定卷批量新增章节。',
      import_book_from_url: '通过内置站点能力从受支持 URL 导入或增量更新书籍及章节正文。',
      check_book_updates: '检查书籍来源站点是否有新章节，可选比对已导入章节的正文是否改动。',
      apply_book_updates:
        '把来源站点的更新导入书籍：默认只导入新章节，可选应用已导入章节的正文改动。',
      delete_book: '永久删除指定书籍及章节（仅完全控制模式可用）。',
      get_translation_chunk: '按字符预算打包待翻段落、前文衔接、命中术语/角色/记忆与特殊指令。',
      submit_translations: '校验并批量持久化段落译文及可选章节标题译文，实时刷新界面。',
      get_chapter_paragraphs: '按索引区间或关键词读取章节段落、当前译文及可选历史版本。',
      update_chapter_title: '更新指定章节在目标语言下的译文标题。',
      list_terms: '列出书籍全部术语及当前目标语言译法。',
      upsert_terms: '按名称批量新增或更新术语译法与说明。',
      list_characters: '列出书籍全部角色设定、别名与说话风格。',
      upsert_characters: '按角色名批量新增或更新角色设定与别名译法。',
      search_memories: '按自然语言混合检索书籍剧情记忆，或列出全部记忆。',
      upsert_memory: '新增或更新书籍剧情记忆条目。',
      get_special_instructions: '读取书籍级与可选章节级的翻译/润色/校对特殊指令。',
      update_special_instructions: '更新书籍级或章节级的翻译/润色/校对特殊指令。',
    },
    notify: {
      writeTitle: '外部 Agent 已更新数据',
      writeDetail: '[{channel}] 执行 {tool} 成功',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请手动复制',
      tokenRegenerated: '已重新生成 Bearer Token，旧令牌已立即失效',
      portSaved: '监听端口已更新为 {port}',
      serverStartFailed: '启动本地 MCP 服务端失败',
      serverNotRunning: '服务还没有运行，先开启服务再复制配置',
    },
  },
};
