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
};
