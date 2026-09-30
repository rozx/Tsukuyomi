export default {
  appUi: {
    taskTypes: {
      translation: '翻译',
      proofreading: '校对',
      polish: '润色',
      termsTranslation: '术语翻译',
      assistant: '助手',
      config: '配置获取',
      other: '其他',
    },
    taskToast: {
      failed: 'AI 任务失败',
      failedDetail: '{model} 执行{type}任务时出错：{message}',
      unknownError: '未知错误',
      cancelled: 'AI 任务已取消',
      cancelledDetail: '{model} 的{type}任务已取消',
      assistantCancelled: '已取消 {count} 个助手任务',
    },
    bookAdded: {
      summary: '添加成功',
      detail: '已成功添加书籍 "{title}"',
    },
    duration: {
      seconds: '{seconds}秒',
      minutesSeconds: '{minutes}分{seconds}秒',
    },
    notFound: {
      oops: '哎呀，这里什么都没有……',
      title: '这片夜色里没有找到页面',
      subtitle: '链接可能已经失效，或书册被移动到了别处。',
      goHome: '返回首页',
      openLibrary: '打开书库',
    },
    askUser: {
      suggested: '推荐答案',
      prev: '上一题',
      next: '下一题',
    },
    eyebrow: {
      aiModel: 'AI · 模型',
      guide: '指南',
      helpDocs: '帮助 · 文档',
      toc: '目录',
    },
    modelTestDuration: '（{ms} ms）',
    errors: {
      importDisabled: 'IMPORT_DISABLED: 当前版本已关闭 AI 导入，已有任务与小说均已保留',
      unsupportedUiLocale: '不支持的界面语言',
    },
  },
};
