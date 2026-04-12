// 繁體中文（zh-TW）文案

export default {
  failed: '操作失敗',
  success: '操作成功',
  memoryInjection: {
    tabTitle: '記憶注入',
    charBudget: '記憶注入字元預算',
    charBudgetDesc: '每次翻譯時注入的記憶總字元數上限',
    semanticSearch: '語義檢索',
    semanticSearchDesc: '使用本地嵌入模型為記憶生成向量，提升相關記憶的匹配精度',
    modelStatus: {
      idle: '未載入',
      loading: '載入中…',
      ready: '已就緒',
      failed: '載入失敗',
    },
    downloadModel: '下載模型',
    reload: '重新載入',
    retry: '重試',
    modelInfo: '模型: {modelId} (~195 MB, 首次使用需下載)',
    advanced: '進階設定',
    minScoreThreshold: '最低分數閾值',
    minScoreThresholdDesc: '低於此分數的記憶不會被注入（滿分 6.0）',
    minScoreAll: '0（全部注入）',
    infoText:
      '記憶注入使用三信號評分（語義相似度 + 關鍵詞匹配 + 時間衰減）自動選擇與當前翻譯內容最相關的記憶。即使未啟用語義檢索，關鍵詞和時間衰減仍會生效。',
  },
  memoryPanel: {
    reEmbed: '重新向量化本書',
    embeddingProgress: '向量化進度',
    pause: '暫停',
    resume: '繼續',
    unembeddedOnly: '僅顯示未向量化',
    embeddingReady: '已向量化',
    embeddingStale: '向量版本過期，將被重新計算',
    embeddingPending: '待向量化',
  },
  scoring: {
    semanticSimilarity: '語義相似度',
    keywordMatch: '關鍵詞匹配',
    timeDecay: '時間衰減',
    totalScore: '總分',
    maxScore: '滿分 6.0',
    aiInvoked: '由 AI 主動調用',
  },
};
