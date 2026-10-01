export default {
  appUi: {
    taskTypes: {
      translation: '翻譯',
      proofreading: '校對',
      polish: '潤色',
      termsTranslation: '術語翻譯',
      assistant: '助手',
      config: '設定取得',
      other: '其他',
    },
    taskToast: {
      failed: 'AI 任務失敗',
      failedDetail: '{model} 執行{type}任務時出錯：{message}',
      unknownError: '未知錯誤',
      cancelled: 'AI 任務已取消',
      cancelledDetail: '{model} 的{type}任務已取消',
      assistantCancelled: '已取消 {count} 個助手任務',
    },
    bookAdded: {
      summary: '新增成功',
      detail: '已成功新增書籍「{title}」',
    },
    duration: {
      seconds: '{seconds}秒',
      minutesSeconds: '{minutes}分{seconds}秒',
    },
    notFound: {
      oops: '哎呀，這裡什麼都沒有……',
      title: '這片夜色裡沒有找到頁面',
      subtitle: '連結可能已經失效，或書冊被移到了別處。',
      goHome: '返回首頁',
      openLibrary: '打開書庫',
    },
    askUser: {
      suggested: '推薦答案',
      prev: '上一題',
      next: '下一題',
    },
    eyebrow: {
      aiModel: 'AI · 模型',
      guide: '指南',
      helpDocs: '說明 · 文件',
      toc: '目錄',
    },
    modelTestDuration: '（{ms} ms）',
    errors: {
      importDisabled: 'IMPORT_DISABLED: 目前版本已關閉 AI 匯入，既有任務與小說皆已保留',
      unsupportedUiLocale: '不支援的介面語言',
    },
  },
};
