export default {
  agentMcp: {
    eyebrow: '外部 AGENT / MCP',
    title: '外部 Agent 工作台',
    subtitle: '讓 Claude Code 等外部 Agent 用你已有的訂閱額度，直接操作書庫並翻譯小說。',
    sections: {
      connect: '接入',
      activity: '呼叫活動',
      permission: '權限與寫回',
      tools: '開放的能力',
      connection: '連線設定',
    },
    summary: {
      status: '服務',
      permission: '權限',
      tools: '開放工具',
      calls: '本次呼叫',
    },
    status: {
      running: '執行中',
      starting: '啟動中',
      stopped: '已停止',
      error: '異常',
      registered: '已開啟',
      unregistered: '未開啟',
      unsupported: '無法開啟',
    },
    steps: {
      desktopEnableTitle: '開啟本機 MCP 服務',
      desktopEnableHint: '只監聽本機 127.0.0.1，並要求權杖驗證。',
      enableDesktop: '啟用本機 MCP 服務',
      endpoint: '服務位址',
      copyEndpoint: '複製位址',
      clientTitle: '接入你的 Agent 用戶端',
      clientHint: '設定裡已填入目前的位址與權杖。',
      clientLocked: '先開啟上面的服務，設定才能使用。',
      copySnippet: '複製設定',
      tabClaudeCode: 'Claude Code',
      tabPi: 'Pi',
      tabAntigravity: 'Antigravity',
      placeClaudeCode: '在終端機執行這條指令；之後執行 claude mcp list 可確認已連線。',
      placePi: '把這段設定合併到 Pi 的 MCP 設定檔的 mcpServers 中，具體位置請見 Pi 的文件。',
      placeAntigravity:
        '把這段設定合併到 Antigravity 的 MCP 設定檔的 mcpServers 中，具體位置請見 Antigravity 的文件。',
      waitingFirstCall: '還沒有收到呼叫。用戶端發出第一條指令後，這裡會顯示已連通。',
      firstCallReceived: '已連通：最近一次呼叫 {tool}（{time}）',
      webEnableTitle: '開啟 WebMCP',
      webEnableHint:
        '在本頁註冊工具，並連線到你電腦上執行的 WebMCP 中繼，讓 Claude Code 等本機 Agent 可以使用。',
      enableWebMcp: '開啟 WebMCP',
      webInsecure:
        '本頁不是透過 HTTPS 或 localhost 開啟的，瀏覽器不允許在這樣的頁面上提供 WebMCP。請改用 HTTPS 位址存取。',
      relayClientHint: '在 Agent 用戶端裡加入 WebMCP 本機中繼。中繼只接受來自本頁位址的連線。',
      tabRelayJson: '其他用戶端（JSON）',
      placeRelayClaudeCode:
        '在終端機執行這條指令（需要 Node.js 22 或更高版本），然後重新啟動 Claude Code。之後讓 Agent 呼叫 webmcp_list_sources，能看到本頁就表示已連線。',
      placeRelayJson:
        '把這段設定合併到用戶端 MCP 設定的 mcpServers 中（Cursor、Claude Desktop、Windsurf 等通用），需要 Node.js 22 或更高版本。',
      guideTitle: '把快速上手指南交給 Agent',
      guideHint:
        '把這份指南貼給 Agent：它會幫你建好專案資料夾、設定好 MCP，並把指南存為那裡的 AGENTS.md。以後在這個資料夾裡啟動 Agent，就不用再貼上。',
      copyGuide: '複製指南',
      manualToggle: '手動加入 MCP',
      manualHint: '不使用指南、想自己在 Agent 用戶端裡加入時再展開。',
      webKeepOpen:
        '使用期間請保持本頁開啟，並且只開一個 Tsukuyomi 分頁：工具來自這個分頁，關閉或重新整理後 Agent 會暫時看不到它們；同時開著多個時，Agent 看到的工具名會帶上分頁後綴。',
      webLegacyNative:
        '瀏覽器開著舊版的 WebMCP 實驗開關，中繼無法轉發本頁的工具。請開啟 chrome://flags/#enable-webmcp-testing 把它關閉並重新啟動瀏覽器，或把瀏覽器升級到最新版本。',
      webRelayFailed: 'WebMCP 執行階段載入失敗，請重新整理頁面後重試。',
      relayConnected: '已接上本機中繼（連接埠 {port}）。Agent 現在可以使用本頁的工具。',
      relayNotLinked:
        '本機有中繼在執行，但本頁還沒有接上。中繼只接受啟動參數 --widget-origin 指定的頁面位址，本頁位址是 {origin}；兩者不一致時，請重新複製下面的指南或設定，並在 Agent 用戶端裡更新後重新啟動。剛開啟的幾秒內出現這則提示屬於正常。',
      relayNotFound:
        '還沒有找到本機中繼。中繼由 Agent 用戶端啟動：把下面的指南交給 Agent（或手動新增 MCP）後重新啟動用戶端即可。本頁位址：{origin}',
    },
    guide: {
      overviewContext:
        'get_app_context：使用者現在在哪個頁面、開啟的書和章節（含翻譯進度）、選取的段落及其原文與譯文、在頁面上反白選取的文字（selected_text），以及介面語言。使用者說「這一段」「這一章」「這裡」時先呼叫它，不要猜。',
      overviewLibrary:
        'list_books 列出書庫；get_book 查看一本書的章節列表與各章翻譯進度。長篇不要讀整本目錄：用 recent_chapters 只取最近幾章，用 volume_id 只看某一卷，或把 include_chapters 設為 false 只看卷的概覽。術語、角色很多時，list_terms / list_characters 用 limit、offset 分頁並把 compact 設為 true。',
      overviewSearch:
        '要知道一個詞在全書哪些地方出現，用 search_paragraphs（可搜原文、譯文，支援正規表示式）或 count_occurrences（統計次數與章節分布），不要逐章讀取；啟用了本機嵌入時還可以用 search_chapters 依內容描述找章節。這些搜尋以及 get_chapter_paragraphs、list_terms、list_characters、search_help_docs 的關鍵字預設都是精確比對；記不清確切寫法，或原文可能有錯字、異寫時，加上 fuzzy: true 做模糊比對。',
      overviewHelp:
        '使用者問 Tsukuyomi 怎麼用、某個功能在哪裡時，先用 search_help_docs 找到相關文件，再用 get_help_doc 讀完全文後回答，不要憑印象回答。',
      overviewWorkflows:
        '每類任務的完整流程就寫在下面的「工作流程」裡，不需要另外讀取。MCP 提示詞 translate-chapter、polish-chapter、import-and-translate（prompts/get）給出的是同一份步驟，供使用者直接發起任務。',
      overviewWorkflowsWeb:
        '每類任務的完整流程就寫在下面的「工作流程」裡，不需要另外讀取。get_workflow_guide 回傳的是同一份步驟，只有本指南已經過期時才需要用它讀取最新的流程。',
      ruleIds: '嚴格按回傳的段落 ID 一一對應提交，不要合併、拆分或省略段落。',
      ruleNoRepeat:
        '同一段不要重複提交不同的譯文；提交被拒絕時按回傳的原因修正，只重提被拒絕的段落。',
      intro:
        '這是小說翻譯工具 Tsukuyomi 的使用說明。它透過 MCP 服務（服務名稱 tsukuyomi）提供工具：用這些工具直接讀寫使用者的書庫，結果寫回應用程式，不要只輸出在對話裡。',
      introWeb:
        '這是小說翻譯工具 Tsukuyomi 的使用說明。它執行在使用者的瀏覽器裡，透過 webmcp-local-relay 這個本機中繼提供工具：用這些工具直接讀寫使用者的書庫，結果寫回應用程式，不要只輸出在對話裡。工具來自開啟中的頁面，頁面被關閉或重新整理時會暫時消失。',
      versionNote: '本指南對應 Tsukuyomi {version}。',
      overviewVersion:
        'get_app_context 回傳的 app_version 與本指南開頭寫的版本不同時，這份指南已經過期：呼叫 get_quick_start_guide 取得目前版本的指南，用它替換儲存的 AGENTS.md，現有的 MCP 設定不用改。',
      conceptsTitle: '資料模型',
      conceptStructure:
        '層級是 書籍 → 卷 → 章節 → 段落。每本書有一個目標語言，譯文都針對這個語言。',
      conceptVersions:
        '每個段落在每種語言下可以有多個譯文版本，其中一個是目前選用的版本。每種語言最多保留 5 個版本，超出時最早的版本會被移除。',
      conceptWorld:
        '每本書有術語表、角色設定和記憶（可重複使用的翻譯決定：稱呼、術語譯法、文風），還可以有書籍層級和章節層級的特殊指令。翻譯時必須遵守它們。',
      conceptIds:
        'book_id、chapter_id 和段落 ID 都來自工具的回傳值，不要自己編造。省略 book_id 時使用使用者目前開啟的書；使用者沒有開啟任何書時必須明確傳入。',
      overviewTitle: '先了解現狀',
      toolsTitle: '工具一覽',
      toolsNote:
        '標註「寫入」的工具會修改使用者的資料；標註「危險」的工具無法復原，並且只在使用者開啟完全控制權限時可用。',
      toolWriteMark: '（寫入）',
      toolDangerMark: '（危險）',
      toolSeparator: '：',
      workflowsTitle: '工作流程',
      workflowsNote: '下面是每類任務的步驟，照著執行即可。',
      wfTranslateTitle: '翻譯一章',
      wfTranslate1: '呼叫 get_translation_chunk，傳入 chapter_id，mode 設為 "untranslated"。',
      wfTranslate2:
        '回傳的 paragraphs 是待翻譯段落（含 id 與原文）；context_before 是本章前文已有的譯文，用來銜接語氣；本章還沒有譯文時改看 previous_chapter_tail，它是上一章末尾的原文與譯文，標點習慣和章末固定用語要與它保持一致；recent_chapter_titles 是最近幾章的標題原文與譯名，新章節的標題格式要與它們一致。matched_terms、matched_characters 是這一塊命中的術語和角色；possible_terms、possible_characters 是原文寫法略有出入的近似命中（text_in_source 是原文裡的寫法），可能是原文的錯字或異寫，確認是同一個詞後再使用。memories 是相關記憶，special_instructions 是特殊指令，target_language 是目標語言。',
      wfTranslate3:
        '逐段翻譯：一個原文段落對應一個譯文段落，不合併、不拆分、不省略；術語和角色名使用給出的譯法。',
      wfTranslate4:
        '呼叫 submit_translations，paragraphs 裡每項包含 paragraph_id 和 translated_text。書籍啟用了原文前綴校驗時，還要帶上 original_text_prefix（對應原文開頭 3~20 個字元）。翻譯章節第一塊時可以同時用 chapter_title_translation 提交章節標題譯文；model_label 填你使用的模型名稱。',
      wfTranslate5:
        '查看回傳的 failed_items：只修正並重提失敗的段落。remaining_untranslated_count 大於 0 時回到第 1 步，等於 0 時本章完成。',
      wfTranslatePlan:
        '提交譯文之前先做準備，與內建翻譯的規劃階段相同。新術語、新角色和可重複使用的翻譯決定在這一步就建好，不要留到譯完之後：',
      wfTranslateReview: '這一塊提交之後複核，與內建翻譯的複核階段相同：',
      wfTranslateBrief: '之後的每一塊只需簡短準備，然後同樣翻譯、提交、複核：',
      wfPolishTitle: '潤飾校對',
      wfPolish1:
        '呼叫 get_translation_chunk，mode 設為 "all"，task_type 設為 "polish"（校對用 "proofreading"）；不寫 task_type 時拿到的是翻譯用的特殊指令。每個段落會帶上 current_translation。',
      wfPolish2: '只對確實需要改進的段落呼叫 submit_translations，沒有改動的段落不要提交。',
      wfPolish3:
        '預設會新增一個譯文版本並選用它；只有使用者明確要求直接改寫目前版本時才把 write_mode 設為 "overwrite"。',
      wfPolish4: '用回傳的 next_cursor 作為下一次呼叫的 cursor，直到章節結束。',
      wfPolishPlan: '修改之前先做準備，與內建潤色、校對的規劃階段相同（潤色與校對沒有複核階段）：',
      wfImportTitle: '匯入新書',
      wfImport1:
        '有網址時呼叫 import_book_from_url。每次呼叫最多抓取 20 章（可用 max_chapters 調整，上限 50）；回傳 has_more 為 true 時再次呼叫以繼續。',
      wfImport2:
        '回傳 IMPORT_IN_PROGRESS 表示同一網址的匯入還在進行，等它完成後再試，不要重複發起。',
      wfImport3:
        '站點不受支援或抓取失敗時，自行取得正文，用 create_book 建書，再用 add_chapters 寫入章節。錯誤裡帶有 book_id 時表示書已存在，只需要 add_chapters，不要重新建書。',
      wfUpdateTitle: '跟進連載更新',
      wfUpdate1: '呼叫 check_book_updates 查看來源站點的新章節。',
      wfUpdate2:
        '呼叫 apply_book_updates 匯入，預設只匯入新章節。回傳的 applied_chapters 裡就有新章節的 chapter_id，不需要再讀整本目錄。status 為 partial 表示有章節沒能檢查或匯入，見 failed，不要當作已經更新完。',
      wfUpdate3:
        'include_updated 會套用已匯入章節的正文改動，並清除被改段落的譯文，使用前必須先得到使用者同意。',
      wfUpdate4: '匯入完成後按「翻譯一章」處理新章節。',
      wfWorldTitle: '維護術語、角色與記憶',
      wfWorld1: '開始翻譯一本書之前，先用 list_terms 和 list_characters 了解已有的譯法。',
      wfWorld2:
        '遇到作品特有的新術語或新角色時，用 upsert_terms、upsert_characters 記錄下來，之後全書沿用。通用詞彙不建術語；人名放角色表，不放術語表；建角色前先確認它不是既有角色的別名。',
      wfWorld3:
        '可重複使用的翻譯決定（稱呼怎麼譯、某個詞固定怎麼譯、文風偏好、固定用語）用 upsert_memory 記下，取翻譯塊時會依相關度自動帶出；劇情、背景和世界觀不要寫進記憶。需要查找時用 search_memories，結果依相關度排序並帶有分數。',
      wfWorld4:
        '使用者對文風或稱呼有長期要求時，用 update_special_instructions 寫成書籍層級或章節層級的特殊指令：特殊指令每次取翻譯塊都會帶上。',
      wfWorld5:
        '用 list_memories 可以翻頁查看全部記憶。過時或重複的項目用 delete_terms、delete_characters、delete_memories 刪除，刪除前先向使用者確認。',
      wfRenameTitle: '統一修改譯名',
      wfRename1: '先用 upsert_terms 或 upsert_characters 把譯名改成新的，之後的翻譯會沿用新譯名。',
      wfRename2:
        '用 count_occurrences 統計舊譯名還剩多少處：keywords 填舊譯名，search_in 設為 "translation"。',
      wfRename3:
        '呼叫 replace_in_translations 並把 dry_run 設為 true 預覽：find 填舊譯名，replace_with 填新譯名，original_contains 填原文裡的名字，避免誤改同字的其他詞。檢查回傳的 samples。',
      wfRename4:
        '確認無誤後去掉 dry_run 再呼叫一次。回傳 has_more 為 true 時，把回傳的 next_cursor 作為 cursor 傳入繼續呼叫（其餘參數不變），直到為 false；不帶 cursor 會從頭再來，取代內容包含尋找內容時會把同一處取代兩遍。預設會給每個改動的段落追加一個新版本，舊版本仍然保留。',
      wfRename5: '最後再用 count_occurrences 確認舊譯名已經沒有殘留，並向使用者回報改了多少處。',
      translationRulesTitle: '翻譯規則',
      translationRulesNote:
        '下面的規則與 Tsukuyomi 內建翻譯使用的是同一份（以簡體中文書寫），翻譯、潤飾、校對時都要遵守。',
      rulesTitle: '規則',
      ruleWriteBack: '所有譯文和設定都透過工具寫回應用程式，不要只貼在對話裡。',
      ruleConfirm:
        'apply_book_updates 的 include_updated、delete_book，以及 delete_terms、delete_characters、delete_memories 會遺失使用者的資料，使用前必須先得到使用者同意。',
      ruleAsk: '不確定要處理哪本書、哪些章節時先問使用者；每完成一章回報進度。',
      errorsTitle: '出錯時',
      errPermission:
        'PERMISSION_DENIED：目前的權限模式不允許這個操作。告訴使用者需要在「外部 Agent」頁面調整權限，不要嘗試繞過。',
      errNotReady: 'NOT_READY：應用程式剛啟動，書庫還沒載入完，稍等片刻再試。',
      errBookRequired:
        'BOOK_ID_REQUIRED：使用者沒有開啟任何書，先用 list_books 找到目標並明確傳入 book_id。',
      errNotFound:
        'BOOK_NOT_FOUND、CHAPTER_NOT_FOUND：識別碼不存在或已被刪除，用 list_books、get_book 重新取得。',
      errSource:
        'UPDATE_SOURCE_MISSING、UPDATE_SOURCE_INVALID：這本書沒有可用的更新來源，請使用者在應用程式裡設定或修復。',
      errOther: '其他錯誤：把工具回傳的錯誤訊息原樣告訴使用者，不要猜測原因後反覆重試。',
      errRelay:
        '看不到任何 Tsukuyomi 工具，或 webmcp_list_sources 回傳 0 個來源：請使用者查看 Tsukuyomi「外部 Agent」頁面第一步的中繼狀態。頁面沒開或 WebMCP 沒開啟時請使用者開啟；顯示「本機有中繼在執行，但本頁還沒有接上」時，表示中繼的 --widget-origin 與頁面位址不一致，依頁面顯示的位址更新 MCP 設定後重新啟動用戶端；顯示「還沒有找到本機中繼」時，表示中繼沒有啟動或連接埠被占用。',
      title: 'Tsukuyomi 快速上手指南',
      setupTitle: '首次設定（只需做一次）',
      setupIntro:
        '使用者把這份指南交給你，是希望你替他把環境準備好。依序完成下面四步；如果目前的資料夾裡已經有這份指南，並且你能看到後面提到的工具，表示已經設定過，跳過這一節。',
      setupFolder:
        '**建立專案資料夾。** 詢問使用者想把翻譯專案放在哪裡；使用者沒有偏好時，在他的家目錄下新建 `tsukuyomi-translation` 資料夾。之後的操作都在這個資料夾裡進行。',
      setupMcp: '**在這個資料夾裡設定 MCP。** 如果你是 Claude Code，在該資料夾下執行：',
      setupMcpOtherDesktop:
        '其他用戶端：在它的專案層級 MCP 設定裡加入一個 HTTP 服務，位址為 {url}，請求標頭為 Authorization: Bearer {token}。',
      setupMcpOtherRelay: '其他用戶端：把下面的內容寫入它的專案層級 MCP 設定：',
      setupSave:
        "**把這份指南保存為該資料夾裡的 AGENTS.md。** 原樣保存全部內容。如果你是 Claude Code，再建一個 CLAUDE.md，內容只寫一行 `{'@'}AGENTS.md`。檔案已經存在時，把這份指南作為單獨一節追加進去，不要覆蓋已有內容；以後拿到新版本時只替換這一節。",
      setupFinish:
        '**告訴使用者接下來怎麼做。** 說明專案資料夾的位置，並請他在這個資料夾裡重新啟動或重新載入你，讓 MCP 生效。以後只要在這個資料夾裡啟動，就不用再貼上這份指南。',
      setupPrereqDesktop:
        '前提：使用者已在 Tsukuyomi 桌面版的「外部 Agent」頁面開啟本機 MCP 服務。連不上時先請使用者確認這一點。',
      setupPrereqWeb:
        '前提：使用者已在瀏覽器裡開啟 Tsukuyomi 的「外部 Agent」頁面並開啟 WebMCP，且保持該頁面開啟；執行中繼需要 Node.js 22 或更高版本。連不上時先請使用者確認這幾點。',
      setupTokenWarning:
        '注意：上面的指令和保存下來的檔案裡包含存取權杖，不要把這個資料夾提交到公開儲存庫。',
      overviewRelay:
        '先呼叫 webmcp_list_sources 確認 Tsukuyomi 頁面已連線。如果在工具列表裡看不到下面提到的工具，用 webmcp_list_tools 列出它們，再用 webmcp_call_tool 按名稱呼叫。工具名帶有類似 `_a1b2` 的後綴時，表示使用者同時開著多個 Tsukuyomi 頁面：請使用者只保留一個，或者呼叫時使用帶後綴的完整名稱。',
    },
    activity: {
      title: '呼叫活動',
      hint: '重新整理頁面後仍會保留，關閉分頁後清空；最多 200 筆。',
      clear: '清空',
      empty: '還沒有呼叫記錄。Agent 開始工作後，每一次工具呼叫都會即時顯示在這裡。',
      statusSuccess: '成功',
      statusError: '失敗',
      statusDenied: '拒絕',
      argsLabel: '參數',
      resultLabel: '結果',
      noArgs: '無參數',
    },
    permission: {
      title: '權限與寫回',
      readOnly: '僅唯讀',
      readOnlyDesc: '只能查詢書庫、讀取原文與翻譯上下文，不能寫入任何內容。',
      translateEdit: '翻譯與編輯',
      translateEditDesc:
        '可以建書、加章、匯入、寫回與批次取代譯文，新增、修改和刪除術語、角色與記憶，不能刪除書籍。',
      full: '完全控制',
      fullDesc: '在「翻譯與編輯」之上，還允許永久刪除書籍。',
      toolCount: '開放 {count} 個工具',
      recommended: '建議',
      fullConfirmTitle: '允許外部 Agent 刪除書籍？',
      fullConfirmBody: '開啟後，Agent 可以永久刪除書庫中的書籍及其全部譯文，無法復原。',
      fullConfirmAccept: '開啟完全控制',
      cancel: '取消',
      writeMode: '已有譯文的寫回方式',
      writeAppend: '追加新版本並選用（保留歷史）',
      writeOverwrite: '覆寫目前選用的版本',
      notifyOnWrite: '寫入完成時提示',
      notifyOnWriteHint: 'Agent 建書、提交譯文或更新設定後跳出一則通知。',
    },
    connectionSettings: {
      title: '連線設定',
      localOnly: '連接埠與權杖只保存在本機，不會同步到 Gist，也不會匯出到備份檔。',
      port: '監聽連接埠',
      savePort: '套用',
      token: '存取權杖',
      showToken: '顯示權杖',
      hideToken: '隱藏權杖',
      copyToken: '複製權杖',
      regenerate: '重新產生權杖',
      regenerateConfirm: '已接入的用戶端會立即失效，需要重新複製設定。',
      regenerateAccept: '確認重新產生',
      cancel: '取消',
    },
    catalog: {
      title: '開放的能力',
      summary: '目前權限下共開放 {count} 個工具',
      categoryContext: '應用程式與導覽',
      categoryLibrary: '書庫與匯入',
      categoryTranslation: '翻譯',
      categoryWorldbuilding: '術語、角色與記憶',
      workflows: '工作流程範本',
      readOnlyBadge: '唯讀',
      writeBadge: '寫入',
      dangerBadge: '危險',
    },
    prompts: {
      'translate-chapter': '按區塊拉取章節原文、術語、角色設定與記憶，逐段翻譯並批次寫回。',
      'polish-chapter': '結合術語、角色語氣與潤飾指令審校既有譯文，僅提交需要改進的段落。',
      'import-and-translate': '從 URL 或本機文字匯入小說並立即開始分塊翻譯。',
    },
    tools: {
      get_app_context:
        '讀取使用者所在頁面、開啟的書籍與章節、選取段落的原文與譯文、反白選取的文字，以及介面語言與執行環境。',
      get_quick_start_guide: '回傳目前版本的快速上手指南，用來更新 Agent 儲存的舊指南。',
      navigate_to: '切換介面至首頁、書庫、指定書籍、章節或定位至特定段落。',
      get_workflow_guide:
        '取得 translate-chapter / polish-chapter / import-and-translate 標準工作流指引。',
      search_help_docs: '依標題、簡介和內文搜尋內建使用文件；不帶搜尋詞時列出全部文件。',
      get_help_doc: '讀取一篇內建使用文件的全文。',
      list_books: '列出本機書庫全部書籍的中繼資料、卷章數與目標翻譯語言。',
      get_book: '取得單本書籍完整卷章目錄及各章翻譯進度統計。',
      create_book: '於本機書庫建立新書籍，支援同時寫入初始章節。',
      add_chapters: '依純文字分段或段落陣列向指定卷批次新增章節。',
      update_book: '修改書籍的作者、簡介、標籤與別名。',
      move_chapters: '調整章節在卷內的順序，或把章節移到另一卷（可新建一卷）。',
      import_book_from_url: '透過內建站點能力從支援的 URL 匯入或增量更新書籍及章節正文。',
      check_book_updates: '檢查書籍來源站點是否有新章節，可選比對已匯入章節的正文是否改動。',
      apply_book_updates:
        '把來源站點的更新匯入書籍：預設只匯入新章節，可選套用已匯入章節的正文改動。',
      search_chapters: '依內容描述找出最相關的章節（需要啟用本機嵌入）。',
      delete_book: '永久刪除指定書籍與章節（僅完全控制模式可用）。',
      get_translation_chunk: '依字元預算打包待譯段落、前文銜接、命中術語/角色/記憶與特殊指令。',
      submit_translations: '驗證並批次儲存段落譯文及可選章節標題譯文，即時重新整理介面。',
      get_chapter_paragraphs: '依索引區間或關鍵字讀取章節段落、目前譯文及可選歷史版本。',
      update_chapter_title: '更新指定章節在目標語言下的譯文標題。',
      search_paragraphs:
        '在全書或單一章節裡依關鍵字或正規表示式搜尋原文與譯文，回傳命中段落及所在章節。',
      count_occurrences: '統計關鍵字在全書原文或譯文裡出現的次數、段落數與章節分布。',
      replace_in_translations: '在全書或單一章節目前選用的譯文裡尋找並取代文字，可先預覽再寫入。',
      list_terms: '列出書籍全部術語及目前目標語言譯法。',
      upsert_terms: '依名稱批次新增或更新術語譯法與說明。',
      list_characters: '列出書籍全部角色設定、別名與說話風格。',
      upsert_characters: '依角色名批次新增或更新角色設定與別名譯法。',
      search_memories:
        '依自然語言混合檢索書籍的記憶（可重複使用的翻譯決定），結果依相關度排序；不帶查詢時列出最近的記憶。',
      upsert_memory:
        '新增或更新一則記憶：只記可重複使用的翻譯決定（稱呼、術語譯法、文風），不記故事內容。',
      list_memories: '分頁列出書籍的全部記憶，可選帶上內文。',
      delete_terms: '依 ID 批次刪除術語。',
      delete_characters: '依 ID 批次刪除角色設定。',
      delete_memories: '依 ID 批次刪除記憶。',
      get_special_instructions: '讀取書籍級與可選章節級的翻譯/潤飾/校對特殊指令。',
      update_special_instructions: '更新書籍級或章節級的翻譯/潤飾/校對特殊指令。',
    },
    notify: {
      writeTitle: '外部 Agent 已更新資料',
      writeDetail: '[{channel}] 執行 {tool} 成功',
      copied: '已複製到剪貼簿',
      copyFailed: '複製失敗，請手動複製',
      tokenRegenerated: '已重新產生 Bearer Token，舊權杖已立即失效',
      portSaved: '監聽連接埠已更新為 {port}',
      serverStartFailed: '啟動本機 MCP 服務端失敗',
      serverNotRunning: '服務還沒有執行，先開啟服務再複製設定',
    },
  },
};
