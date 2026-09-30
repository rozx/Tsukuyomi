export default {
  aiValidation: {
    sourceKept: '段落 {id} 已原樣提交。已符合目標語言的內容可保留原文，不需為改變文字而改寫。',
  },
  aiTasks: {
    explain:
      '請用繁體中文簡短解釋以下文字的含義、語法、文化背景，以及與目前書籍的關聯。自動判斷原文語言；按需要分別解釋混合語言內容：\n\n{text}',
    term: {
      base: '你是小說翻譯助手。自動判斷每段原文的語言，將術語譯為自然、準確的{targetLanguage}。原文已經符合目標語言時保留原文；簡繁中文視為不同目標。\n\n',
      rules:
        '【核心規則】\n1. 使用目標語言的術語表和角色表，保持譯名一致。\n2. 結合書籍、章節與原文語境理解術語，保留原文格式和結構。\n3. 翻譯所有需要轉換的詞語；已符合目標語言的內容、專有名詞和符號可保留。混合語言文字按需要分別處理。\n4. 只回傳 JSON，使用 t 表示譯文。不要附加說明或程式碼區塊。範例：{example}\n\n',
      user: '請將以下術語譯為{targetLanguage}，自動判斷原文語言並保留格式和結構。只回傳 JSON（t 為譯文），不要附加說明或程式碼區塊。範例：{example}\n\n待翻譯術語：\n\n{text}{relatedContextInfo}',
      retry: '回應格式錯誤。請只回傳 JSON（t 為譯文），不要附加說明或程式碼區塊。範例：{example}',
      example: '翻譯結果',
      related: '\n\n相關背景資訊（從目前書籍中比對到）：\n',
      characters: '登場角色：\n{details}\n',
      terms: '相關術語：\n{details}\n',
      sex: '性別：{value}',
      description: '描述：{value}',
      speakingStyle: '說話風格：{value}',
      male: '男',
      female: '女',
      other: '其他',
      unset: '未設定',
      none: '無',
    },
    context: { aliases: '別名：{aliases}' },
  },
};
