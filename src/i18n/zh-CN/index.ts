// 简体中文（zh-CN）文案

export default {
  failed: '操作失败',
  success: '操作成功',
  memoryInjection: {
    tabTitle: '记忆注入',
    charBudget: '记忆注入字符预算',
    charBudgetDesc: '每次翻译时注入的记忆总字符数上限',
    semanticSearch: '语义检索',
    semanticSearchDesc: '使用本地嵌入模型为记忆生成向量，提升相关记忆的匹配精度',
    modelStatus: {
      idle: '未加载',
      loading: '加载中…',
      ready: '已就绪',
      failed: '加载失败',
    },
    downloadModel: '下载模型',
    reload: '重新加载',
    retry: '重试',
    modelInfo: '模型: {modelId} (~195 MB, 首次使用需下载)',
    advanced: '高级设置',
    minScoreThreshold: '最低分数阈值',
    minScoreThresholdDesc: '低于此分数的记忆不会被注入（满分 6.0）',
    minScoreAll: '0（全部注入）',
    infoText:
      '记忆注入使用三信号评分（语义相似度 + 关键词匹配 + 时间衰减）自动选择与当前翻译内容最相关的记忆。即使未启用语义检索，关键词和时间衰减仍会生效。',
  },
  memoryPanel: {
    reEmbed: '重新向量化本书',
    embeddingProgress: '向量化进度',
    pause: '暂停',
    resume: '继续',
    unembeddedOnly: '仅显示未向量化',
    embeddingReady: '已向量化',
    embeddingStale: '向量版本过期，将被重新计算',
    embeddingPending: '待向量化',
  },
  scoring: {
    semanticSimilarity: '语义相似度',
    keywordMatch: '关键词匹配',
    timeDecay: '时间衰减',
    totalScore: '总分',
    maxScore: '满分 6.0',
    aiInvoked: '由 AI 主动调用',
  },
};
