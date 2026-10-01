export default {
  aiAssistant: {
    emptyReply: '抱歉，我沒有收到有效的回覆。請重試。',
    finished: '助手回覆完成',
    cancelled: '已取消',
    cancelRequest: '請求已取消',
    unknownError: '未知錯誤',
    processing: '正在處理助手請求…',
    compactFailed: '上下文壓縮失敗',
    historyKept: '原始歷史已保留，將繼續傳送本次請求。',
    contextLimit: '對話超出模型上下文，壓縮後仍無法繼續。請建立新對話或改用更大視窗的模型。',
    continueCompact: '上下文已壓縮為摘要，請根據摘要與目前任務資料繼續先前的整理。',
    summaryWindow: '摘要輸入超出模型可用視窗，無法安全壓縮；請更換更大視窗的模型。',
    summaryEmpty: '沒有可以產生摘要的內容',
    summaryFailed: '摘要產生失敗：內容為空或過短，原始歷史已保留。',
  },
  aiCommon: {
    languages: {
      zhCN: '簡體中文',
      zhTW: '繁體中文',
      enUS: '英文',
    },
  },
};
