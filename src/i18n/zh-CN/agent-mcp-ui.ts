export default {
  agentMcp: {
    eyebrow: '外部 AGENT / MCP',
    title: '外部 Agent 工作台',
    subtitle: '让 Claude Code 等外部 Agent 用你已有的订阅额度，直接操作书库并翻译小说。',
    sections: {
      connect: '接入',
      activity: '调用活动',
      permission: '权限与写回',
      tools: '开放的能力',
      connection: '连接设置',
    },
    summary: {
      status: '服务',
      permission: '权限',
      tools: '开放工具',
      calls: '本次调用',
    },
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
      webKeepOpen:
        '使用期间请保持本页打开，并且只开一个 Tsukuyomi 标签页：工具来自这个标签页，关闭或刷新后 Agent 会暂时看不到它们；同时开着多个时，Agent 看到的工具名会带上标签页后缀。',
      webLegacyNative:
        '浏览器开着旧版的 WebMCP 实验开关，中继无法转发本页的工具。请打开 chrome://flags/#enable-webmcp-testing 把它关闭并重启浏览器，或把浏览器升级到最新版本。',
      webRelayFailed: 'WebMCP 运行时加载失败，请刷新页面后重试。',
      relayConnected: '已接上本机中继（端口 {port}）。Agent 现在可以使用本页的工具。',
      relayNotLinked:
        '本机有中继在运行，但本页还没有接上。中继只接受启动参数 --widget-origin 指定的页面地址，本页地址是 {origin}；两者不一致时，请重新复制下面的指南或配置，并在 Agent 客户端里更新后重启。刚开启的几秒内出现这条提示属于正常。',
      relayNotFound:
        '还没有找到本机中继。中继由 Agent 客户端启动：把下面的指南交给 Agent（或手动添加 MCP）后重启客户端即可。本页地址：{origin}',
    },
    guide: {
      overviewContext:
        'get_app_context：用户现在在哪个页面、打开的书和章节（含翻译进度）、选中的段落及其原文与译文、在页面上划选的文字（selected_text），以及界面语言。用户说「这一段」「这一章」「这里」时先调用它，不要猜。',
      overviewLibrary:
        'list_books 列出书库；get_book 查看一本书的章节列表与各章翻译进度。长篇不要读整本目录：用 recent_chapters 只取最近几章，用 volume_id 只看某一卷，用 from_first_untranslated 配合 limit 只取从第一个没译完的章节起的几章，或把 include_chapters 设为 false 只看卷的概览。术语、角色很多时，list_terms / list_characters 用 limit、offset 分页并把 compact 设为 true。',
      overviewSearch:
        '要知道一个词在全书哪些地方出现，用 search_paragraphs（可搜原文、译文，支持正则）或 count_occurrences（统计次数与章节分布），不要逐章读取；开启了本地嵌入时还可以用 search_chapters 按内容描述找章节。这些搜索以及 get_chapter_paragraphs、list_terms、list_characters、search_help_docs 的关键词默认都是精确匹配；记不清确切写法，或原文可能有错字、异写时，加上 fuzzy: true 做模糊匹配。',
      overviewHelp:
        '用户问 Tsukuyomi 怎么用、某个功能在哪里时，先用 search_help_docs 找到相关文档，再用 get_help_doc 读完全文后回答，不要凭印象回答。',
      overviewWorkflows:
        '每类任务的完整流程就写在下面的「工作流」里，不需要另外读取。MCP 提示词 translate-chapter、polish-chapter、import-and-translate（prompts/get）给出的是同一份步骤，供用户直接发起任务。',
      overviewWorkflowsWeb:
        '每类任务的完整流程就写在下面的「工作流」里，不需要另外读取。get_workflow_guide 返回的是同一份步骤，只有本指南已经过期时才需要用它读取最新的流程。',
      ruleIds: '严格按返回的段落 ID 一一对应提交，不要合并、拆分或省略段落。',
      ruleNoRepeat:
        '同一段不要重复提交不同的译文；提交被拒绝时按返回的原因修正，只重提被拒绝的段落。',
      intro:
        '这是小说翻译工具 Tsukuyomi 的使用说明。它通过 MCP 服务（服务名 tsukuyomi）提供工具：用这些工具直接读写用户的书库，结果写回应用，不要只输出在对话里。',
      introWeb:
        '这是小说翻译工具 Tsukuyomi 的使用说明。它运行在用户的浏览器里，通过 webmcp-local-relay 这个本地中继提供工具：用这些工具直接读写用户的书库，结果写回应用，不要只输出在对话里。工具来自打开着的页面，页面被关闭或刷新时会暂时消失。',
      versionNote: '本指南对应 Tsukuyomi {version}。',
      overviewVersion:
        'get_app_context 返回的 app_version 与本指南开头写的版本不同时，这份指南已经过期：调用 get_quick_start_guide 取得当前版本的指南，用它替换保存的 AGENTS.md，现有的 MCP 配置不用改。',
      conceptsTitle: '数据模型',
      conceptStructure:
        '层级是 书籍 → 卷 → 章节 → 段落。每本书有一个目标语言，译文都针对这个语言。',
      conceptVersions:
        '每个段落在每种语言下可以有多个译文版本，其中一个是当前选用的版本。每种语言最多保留 5 个版本，超出时最早的版本会被移除。',
      conceptWorld:
        '每本书有术语表、角色设定和记忆（可复用的翻译决定：称呼、术语译法、文风），还可以有书籍级和章节级的特殊指令。翻译时必须遵守它们。',
      conceptIds:
        'book_id、chapter_id 和段落 ID 都来自工具的返回值，不要自己编造。省略 book_id 时使用用户当前打开的书；用户没有打开任何书时必须显式传入。',
      overviewTitle: '先了解现状',
      toolsTitle: '工具一览',
      toolsNote:
        '标注「写入」的工具会修改用户的数据；标注「危险」的工具不可撤销，并且只在用户开启完全控制权限时可用。各工具的参数与完整说明见它自带的描述。',
      toolWriteMark: '（写入）',
      toolDangerMark: '（危险）',
      toolSeparator: '：',
      toolListJoin: '、',
      workflowsTitle: '工作流',
      workflowsNote: '下面是每类任务的步骤，照着执行即可。',
      wfTranslateTitle: '翻译一章',
      wfTranslate1:
        '调用 get_translation_chunk，传入 chapter_id，mode 设为 "untranslated"。一块最多 60 段（不计标点不超过 8 个字的短行算半段）、约 4000 字原文，整个响应不超过约 9000 字节（可用 max_paragraphs、chunk_size、max_response_bytes 调整），正好一次译完、一次提交；续取同一章的后续块时加上 compact: true，省略第一块已给过的信息和为空的列表。',
      wfTranslate2:
        '返回的 paragraphs 是待翻译段落（含 id 与原文）；context_before 是本章前文已有的译文，用来衔接语气；本章还没有译文时改看 previous_chapter_tail，它是上一章末尾的原文与译文，标点习惯和章末固定用语要与它保持一致；style_hints（只在第一块）统计了前文译文的引号、破折号、省略号、对白句末句号、数字与空格的写法，特殊指令没有规定时照多数的写法；recent_chapter_titles 是最近几章的标题原文与译名，新章节的标题格式要与它们一致。matched_terms、matched_characters 是这一块命中的术语和角色；possible_terms、possible_characters 是原文写法略有出入的近似命中（text_in_source 是原文里的写法），可能是原文的错字或异写，确认是同一个词后再使用。repeated_passages 列出本块里与前文同文的段落（本章前文或之前 30 章里原文完全相同、已有译文）和当时的译法：回忆、首尾呼应的句子沿用它，语境不同时再调整；更早的章节和只是相近的句子不会列出，遇到前后篇、回忆、复述前文的段落时用 search_paragraphs 查前文的译法。memories 是相关记忆，special_instructions 是特殊指令，target_language 是目标语言。',
      wfTranslate3:
        '逐段翻译：一个原文段落对应一个译文段落，不合并、不拆分、不省略；术语和角色名使用给出的译法。',
      wfTranslate4:
        '调用 submit_translations，paragraphs 里每项包含 paragraph_id 和 translated_text。书籍启用了原文前缀校验时，还要带上 original_text_prefix（对应原文开头 3~20 个字符）。翻译章节第一块时可以同时用 chapter_title_translation 提交章节标题译文；model_label 填你使用的模型名称。取到的一块一次提交完，等它返回后再处理下一块，同一章不要并行提交。',
      wfTranslate5:
        '查看返回的 failed_items：只修正并重提失败的段落。remaining_untranslated_count 大于 0 时取下一块继续，等于 0 时本章完成。连续翻译多章时，每一章都做完复核再开始下一章，不要为了赶进度省略。',
      wfTranslatePlan:
        '提交译文之前先做准备，与内置翻译的规划阶段相同。新术语、新角色和可复用的翻译决定在这一步就建好，不要留到译完之后：',
      wfTranslateReview:
        '这一块提交之后复核，与内置翻译的复核阶段相同。修正自己刚提交的译文时把 write_mode 设为 "overwrite"，就地改写这份草稿，不多占一个版本。靠 search_paragraphs 查前文才确定的称呼、口吻、标点或固定译法，说明设定里缺了它：复核时补进该角色的 speaking_style，或并入已有记忆（带敬称的称呼记进记忆，不加进角色别名）。留意原文没有的“”或——、错别字，以及给性别不明的角色用了「他」「她」。清单如下：',
      wfTranslateBrief: '之后的每一块只需简短准备，然后同样翻译、提交、复核：',
      wfPolishTitle: '润色校对',
      wfPolish1:
        '调用 get_translation_chunk，mode 设为 "all"，task_type 设为 "polish"（校对用 "proofreading"）；不写 task_type 时拿到的是翻译用的特殊指令。每个段落会带上 current_translation。',
      wfPolish2: '只对确实需要改进的段落调用 submit_translations，没有改动的段落不要提交。',
      wfPolish3:
        '润色校对的对象是已有的译文：默认会新增一个译文版本并选用它，只有用户明确要求直接改写当前版本时才把 write_mode 设为 "overwrite"。',
      wfPolish4:
        '用返回的 next_cursor 作为下一次调用的 cursor；has_more 为 false 时这一块已经到章末，处理完就结束。续取同一章的后续块时可以加上 compact: true，省略第一块已给过的信息和为空的列表。',
      wfPolishPlan: '修改之前先做准备，与内置润色、校对的规划阶段相同（润色与校对没有复核阶段）：',
      wfImportTitle: '导入新书',
      wfImport1:
        '有网址时调用 import_book_from_url。每次调用最多抓取 20 章（可用 max_chapters 调整，上限 50）；返回 has_more 为 true 时再次调用以继续。',
      wfImport2:
        '返回 IMPORT_IN_PROGRESS 表示同一网址的导入还在进行，等它完成后再试，不要重复发起。',
      wfImport3:
        '站点不受支持或抓取失败时，自行获取正文，用 create_book 建书，再用 add_chapters 写入章节。错误里带有 book_id 时说明书已存在，只需要 add_chapters，不要重新建书。',
      wfUpdateTitle: '跟进连载更新',
      wfUpdate1:
        '调用 check_book_updates 查看来源站点的新章节。返回的 local_progress 给出本地的翻译进度：用户可能已经手动导入了新章节，has_updates 为 false 时也要看还有没有没译完的章节。',
      wfUpdate2:
        '调用 apply_book_updates 导入，默认只导入新章节。返回的 applied_chapters 里就有新章节的 chapter_id，不需要再读整本目录。status 为 partial 表示有章节没能检查或导入，见 failed，不要当作已经更新完。',
      wfUpdate3:
        'include_updated 会应用已导入章节的正文改动，并清除被改段落的译文，使用前必须先得到用户同意。',
      wfUpdate4: '导入完成后按「翻译一章」处理新章节。',
      wfWorldTitle: '维护术语、角色与记忆',
      wfWorld1:
        '开始翻译一本书之前，先用 list_terms 和 list_characters 了解已有的译法。get_app_context 返回 local_embedding_enabled: false 时，记忆只按关键词带出：再用 list_memories 浏览全部摘要，确认标点、称呼等全书约定。',
      wfWorld2:
        '遇到作品特有的新术语或新角色时，用 upsert_terms、upsert_characters 记录下来，之后全书沿用。无歧义的日常词不建术语；有多种常见译法、需要全书统一的词（职业、魔物类别、设定高频词，如魔道具、アンデッド）要建，按块带出；人名放角色表，不放术语表；建角色前先确认它不是已有角色的别名。更新时只传 id（或名称）和要改的字段，省略的字段保留原值；给角色补别名用 append_aliases，不会覆盖已有的别名。',
      wfWorld3:
        '可复用的翻译决定（称呼怎么译、某个词固定怎么译、文风偏好、固定用语）用 upsert_memory 记下，取翻译块时会按相关度自动带出；剧情、背景和世界观不要写进记忆。需要查找时用 search_memories，结果按相关度排序并带有分数。',
      wfWorld4:
        '每章都要遵守的全书规范（标题格式、标点约定、叙事文风）和用户的长期要求，用 update_special_instructions 写成特殊指令（mode 用 append）：特殊指令每次取翻译块都会带上，记忆只按相关度带出，可能取不到。',
      wfWorld5:
        '用 list_memories 可以翻页查看全部记忆。过时或重复的条目用 delete_terms、delete_characters、delete_memories 删除，删除前先向用户确认。',
      wfRenameTitle: '统一修改译名',
      wfRename1: '先用 upsert_terms 或 upsert_characters 把译名改成新的，之后的翻译会沿用新译名。',
      wfRename2:
        '用 count_occurrences 统计旧译名还剩多少处：keywords 填旧译名，search_in 设为 "translation"。',
      wfRename3:
        '调用 replace_in_translations 并把 dry_run 设为 true 预览：find 填旧译名，replace_with 填新译名，original_contains 填原文里的名字，避免误改同字的其他词。检查返回的 samples。',
      wfRename4:
        '确认无误后去掉 dry_run 再调用一次。返回 has_more 为 true 时，把返回的 next_cursor 作为 cursor 传入继续调用（其余参数不变），直到为 false；不带 cursor 会从头再来，替换内容包含查找内容时会把同一处替换两遍。默认会给每个改动的段落追加一个新版本，旧版本仍然保留。',
      wfRename5: '最后再用 count_occurrences 确认旧译名已经没有残留，并向用户汇报改了多少处。',
      translationRulesTitle: '翻译规则',
      translationRulesNote:
        '下面的规则与 Tsukuyomi 内置翻译使用的是同一份，翻译、润色、校对时都要遵守。',
      rulesTitle: '规则',
      ruleWriteBack: '所有译文和设定都通过工具写回应用，不要只贴在对话里。',
      ruleConfirm:
        'apply_book_updates 的 include_updated、delete_book，以及 delete_terms、delete_characters、delete_memories 会丢失用户的数据，使用前必须先得到用户同意。',
      ruleAsk:
        '不确定要处理哪本书、哪些章节时先问用户；开始或换到下一章时用一句话说明在做什么，每完成一章汇报进度。',
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
        '看不到任何 Tsukuyomi 工具，或 webmcp_list_sources 返回 0 个来源：中继刚启动时页面要二十秒左右才接上，先稍等再试一次；仍然不行时请用户查看 Tsukuyomi「外部 Agent」页面第一步的中继状态。页面没开或 WebMCP 没开启时请用户开启；显示「本机有中继在运行，但本页还没有接上」时，说明中继的 --widget-origin 与页面地址不一致，按页面显示的地址更新 MCP 配置后重启客户端；显示「还没有找到本机中继」时，说明中继没有启动或端口被占用。',
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
        "**把这份指南保存为该文件夹里的 AGENTS.md。** 「首次设置」这一节只用一次，不用保存；其余内容（标题、开头的说明与版本，以及「数据模型」起的各节）原样保存。如果你是 Claude Code，再建一个 CLAUDE.md，内容只写一行 `{'@'}AGENTS.md`。文件已经存在时，把这份指南作为单独一节追加进去，不要覆盖已有内容；以后拿到新版本时只替换这一节。",
      setupFinish:
        '**告诉用户接下来怎么做。** 说明项目文件夹的位置，并请他在这个文件夹里重启或重新加载你，让 MCP 生效。以后只要在这个文件夹里启动，就不用再粘贴这份指南。',
      setupPrereqDesktop:
        '前提：用户已在 Tsukuyomi 桌面版的「外部 Agent」页面开启本地 MCP 服务。连不上时先请用户确认这一点。',
      setupPrereqWeb:
        '前提：用户已在浏览器里打开 Tsukuyomi，在「外部 Agent」页面开启 WebMCP，之后保持 Tsukuyomi 打开（不必停留在「外部 Agent」页面）；运行中继需要 Node.js 22 或更高版本。连不上时先请用户确认这几点。',
      setupTokenWarning:
        '注意：上面的命令和写入的 MCP 配置里包含访问令牌，不要把这个文件夹提交到公开仓库。',
      overviewRelay:
        '先调用 webmcp_list_sources 确认 Tsukuyomi 页面已连接。有些客户端不直接列出 MCP 工具，而是按需加载：没看到 webmcp_ 开头的工具时，先按客户端的方式搜索或调用，不要直接认定没连上。如果在工具列表里看不到下面提到的工具，用 webmcp_list_tools 列出它们，再用 webmcp_call_tool 按名称调用。工具名带有类似 `_a1b2` 的后缀时，说明用户同时开着多个 Tsukuyomi 页面：请用户只保留一个，或者调用时使用带后缀的完整名称。',
    },
    activity: {
      title: '调用活动',
      hint: '刷新页面后仍会保留，关闭标签页后清空；最多 200 条。',
      clear: '清空',
      empty: '还没有调用记录。Agent 开始工作后，每一次工具调用都会实时显示在这里。',
      statusSuccess: '成功',
      statusError: '失败',
      statusDenied: '拒绝',
      argsLabel: '参数',
      resultLabel: '结果',
      noArgs: '无参数',
    },
    permission: {
      title: '权限与写回',
      readOnly: '仅只读',
      readOnlyDesc: '只能查询书库、读取原文与翻译上下文，不能写入任何内容。',
      translateEdit: '翻译与编辑',
      translateEditDesc:
        '可以建书、加章、导入、写回与批量替换译文，新增、修改和删除术语、角色与记忆，不能删除书籍。',
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
      get_app_context:
        '读取用户所在页面、打开的书籍与章节、选中段落的原文与译文、划选的文字，以及界面语言与运行环境。',
      get_quick_start_guide: '返回当前版本的快速上手指南，用来更新 Agent 保存的旧指南。',
      navigate_to: '切换界面到首页、书库、指定书籍、章节或定位到具体段落。',
      get_workflow_guide:
        '获取 translate-chapter / polish-chapter / import-and-translate 标准工作流指引。',
      search_help_docs: '按标题、简介和正文搜索内置使用文档；不带搜索词时列出全部文档。',
      get_help_doc: '读取一篇内置使用文档的全文。',
      list_books: '列出本地书库全部书籍的元数据、卷章数与目标翻译语言。',
      get_book: '获取单本书籍卷章目录及各章翻译进度，可从第一个没译完的章节起只取几章。',
      create_book: '在本地书库创建新书籍，支持同时写入初始章节。',
      add_chapters: '按纯文本分段或段落数组向指定卷批量新增章节。',
      update_book: '修改书籍的作者、简介、标签与别名。',
      move_chapters: '调整章节在卷内的顺序，或把章节移到另一卷（可新建一卷）。',
      import_book_from_url: '通过内置站点能力从受支持 URL 导入或增量更新书籍及章节正文。',
      check_book_updates:
        '检查书籍来源站点是否有新章节，可选比对已导入章节的正文，并附带本地翻译进度。',
      apply_book_updates:
        '把来源站点的更新导入书籍：默认只导入新章节，可选应用已导入章节的正文改动。',
      search_chapters: '按内容描述找出最相关的章节（需要开启本地嵌入）。',
      delete_book: '永久删除指定书籍及章节（仅完全控制模式可用）。',
      get_translation_chunk:
        '按段数、字数与响应大小打包待翻段落、前文衔接、命中术语/角色/记忆、标点习惯与特殊指令。',
      submit_translations: '校验并批量持久化段落译文及可选章节标题译文，实时刷新界面。',
      get_chapter_paragraphs: '按索引区间或关键词读取章节段落、当前译文及可选历史版本。',
      update_chapter_title: '更新指定章节在目标语言下的译文标题。',
      search_paragraphs: '在全书或单个章节里按关键词或正则搜索原文与译文，返回命中段落及所在章节。',
      count_occurrences: '统计关键词在全书原文或译文里出现的次数、段落数与章节分布。',
      replace_in_translations: '在全书或单个章节当前选用的译文里查找并替换文字，可先预览再写入。',
      list_terms: '列出书籍全部术语及当前目标语言译法。',
      upsert_terms: '按名称或 ID 批量新增术语，或按补丁更新译法与说明。',
      list_characters: '列出书籍全部角色设定、别名与说话风格。',
      upsert_characters: '按角色名或 ID 批量新增角色，或按补丁更新设定、追加别名。',
      search_memories:
        '按自然语言混合检索书籍的记忆（可复用的翻译决定），结果按相关度排序；不带查询时列出最近的记忆。',
      upsert_memory:
        '新增或更新一条记忆：只记可复用的翻译决定（称呼、术语译法、文风），不记故事内容。',
      list_memories: '分页列出书籍的全部记忆，可选带上正文。',
      delete_terms: '按 ID 批量删除术语。',
      delete_characters: '按 ID 批量删除角色设定。',
      delete_memories: '按 ID 批量删除记忆。',
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
