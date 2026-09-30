export default {
  aiState: {
    labels: {
      translation: '翻譯',
      polish: '潤色',
      proofreading: '校對',
      assistant: '助手',
      termsTranslation: '術語翻譯',
    },
    planning:
      '目前狀態：規劃階段 (planning)。上下文中的術語、角色、記憶已為最新；按待辦確認，只在缺失時查詢。此處為輸出前唯一的資料維護視窗，可建立/更新術語、角色、記憶。禁止提交{task}結果。全部待辦 done 後呼叫 {transition}。',
    brief:
      '目前狀態：簡短規劃 (planning)。沿用前一部分的規劃上下文；僅補充目前需要的資訊或資料。全部待辦 done 後呼叫 {transition}。',
    working:
      '目前狀態：{task}中 (working)。{focus}禁止建立/更新術語、角色、記憶，請在 {maintenance} 處理。用 add_translation_batch 提交結果，單次最多 {max} 段。{changed}按待辦逐批完成並標記 done，之後呼叫 {transition}。',
    focusTranslation: '保持原文與譯文 1:1 對應，依實際原文處理稱呼與適用敬語。',
    focusPolish: '改善目標語言的語氣、表達自然度與節奏。',
    focusProofread: '檢查文字、標點、語法、內容一致性、邏輯與格式。',
    changed: '僅回傳有變化的段落。潤色與校對沒有 review 階段。',
    review:
      '目前狀態：複核 (review)。按待辦檢查，使用 add_translation_batch 修正；可更新術語、角色、記憶。全部待辦 done 後呼叫 {transition}。',
    end: '目前狀態：完成 (end)。{next}任務已結束，不再呼叫工具或輸出內容，直接結束本次對話。',
    next: '目前區塊已完成，系統將提供下一區塊。',
    last: '全部內容已處理，這是最後一區塊。',
    planningLoop: '規劃停留過久，請立即進入{task}輸出階段。呼叫 {transition}，不要繼續 planning。',
    planningContinue: '必要資訊與資料維護準備好後呼叫 {transition}。如仍缺資訊，先呼叫工具補充。',
    briefContinue:
      '沿用前一部分的術語、角色與記憶。只呼叫目前需要的工具；必要時預覽相鄰段落，依實際原文處理稱呼，再進入 working。',
    workingLoop:
      '工作階段停留過久，請立即提交{task}結果。使用 add_translation_batch 與 paragraph_id，單次最多 {max} 段。{changed}',
    noChanges: '沒有需要修改的段落時可呼叫 {transition} 結束；否則只提交變化段落。',
    finished: '全部段落的{task}已完成；無需繼續時呼叫 {transition}。{note}',
    noReview: '潤色與校對禁止 review，直接 end。',
    continue: '繼續{task}，完成後呼叫 {transition}。',
    missing:
      '{count} 段缺少{task}結果，paragraph_id：{ids}。直接用 add_translation_batch 補齊，單次最多 {max} 段；只修復缺失項，禁止重排或猜測 ID。',
    reviewLoop:
      '複核停留過久。有問題用 add_translation_batch 修正；無後續操作時立即呼叫 {transition}。',
    restricted:
      '目前狀態 {status} 禁止工具 {tool} 寫入資料。只在 {stages} 維護術語、角色、記憶；end 後不再寫入。',
    unauthorized:
      '工具 {tool} 不在本次 tools 清單中，禁止呼叫。使用可用工具或現有上下文繼續{task}。',
    limit: '工具 {tool} 呼叫已達上限 {limit}，請使用已取得的資訊繼續。',
    repeated: '該工具結果已在規劃上下文中，後續區塊不需重複呼叫。',
    gate: '無法進入 {status}：仍有 {count} 個未完成待辦。\n{items}\n請完成後再切換狀態。',
    invalidTransition: '狀態轉換 {previous} → {next} 不合法，請按工作流程繼續。',
  },
  aiRun: {
    init: {
      translation: '正在初始化翻譯工作階段...',
      polish: '正在初始化潤飾工作階段...',
      proofreading: '正在初始化校對工作階段...',
    },
    connecting: '正在建立連線...',
    chunk: {
      translation: '正在翻譯第 {current}/{total} 部分...',
      polish: '正在潤飾第 {current}/{total} 部分...',
      proofreading: '正在校對第 {current}/{total} 部分...',
    },
    single: {
      translation: '正在翻譯段落...',
      polish: '正在潤飾段落...',
      proofreading: '正在校對段落...',
    },
    working: {
      translation: '正在翻譯中...',
      polish: '正在潤飾中...',
      proofreading: '正在校對中...',
    },
    done: {
      translation: '翻譯完成',
      polish: '潤飾完成',
      proofreading: '校對完成',
    },
    failed: {
      translation: '翻譯出錯',
      polish: '潤飾出錯',
      proofreading: '校對出錯',
    },
    unknownError: {
      translation: '翻譯時發生未知錯誤',
      polish: '潤飾時發生未知錯誤',
      proofreading: '校對時發生未知錯誤',
    },
    emptyContent: {
      translation: '要翻譯的內容不能為空',
      polish: '要潤飾的內容不能為空',
      proofreading: '要校對的內容不能為空',
    },
    needsTranslation: {
      translation: '要翻譯的段落必須包含目前選用的翻譯',
      polish: '要潤飾的段落必須包含目前選用的翻譯',
      proofreading: '要校對的段落必須包含目前選用的翻譯',
    },
    incomplete: {
      translation: '翻譯任務未完成（狀態：{status}）。請重試。',
      polish: '潤飾任務未完成（狀態：{status}）。請重試。',
      proofreading: '校對任務未完成（狀態：{status}）。請重試。',
    },
    retriesExhausted: {
      translation: '翻譯任務重試 {max} 次後仍未完成',
      polish: '潤飾任務重試 {max} 次後仍未完成',
      proofreading: '校對任務重試 {max} 次後仍未完成',
    },
    maxTurns: {
      translation: 'AI 在 {turns} 回合內未完成翻譯任務（目前狀態：{status}）。請重試。',
      polish: 'AI 在 {turns} 回合內未完成潤飾任務（目前狀態：{status}）。請重試。',
      proofreading: 'AI 在 {turns} 回合內未完成校對任務（目前狀態：{status}）。請重試。',
    },
    degraded: 'AI 輸出出現重複字元，已停止本次請求',
    retrying: '偵測到 AI 輸出異常，正在重試第 {count}/{max} 次...',
    degradedFinal: 'AI 輸出持續出現重複字元，已重試 {max} 次仍失敗。請檢查 AI 服務狀態或稍後重試。',
    modelDisabled: '所選模型未啟用',
    cancelled: '已取消',
    cancelRequest: '請求已取消',
    emptyResult: 'AI 回傳結果為空',
    emptyText: 'AI 回傳的文字為空',
    term: {
      analyzing: '正在分析文字...',
      generating: '正在產生翻譯...',
      retryingJson: '正在重試取得規範 JSON 輸出...',
      done: '翻譯完成',
      unknownError: '翻譯時發生未知錯誤',
      emptyText: '要翻譯的文字不能為空',
      noJson: '找不到有效的 JSON 格式',
      missingField: 'JSON 中缺少 t/translation 欄位',
      formatError: 'AI 回應格式錯誤：{detail}。已達最大重試次數，無法取得有效翻譯。',
      termUnsupported: '所選模型不支援術語翻譯任務',
      translationUnsupported: '所選模型不支援翻譯任務',
    },
    summaryToolCall: '工具呼叫 {name} ({id}): {content}',
    summaryToolResult: '工具結果 {name} ({id}): {content}',
  },
};
