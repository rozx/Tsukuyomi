// This is just an example,
// so you can safely delete all default props below

export default {
  failed: 'Action failed',
  success: 'Action was successful',
  memoryInjection: {
    tabTitle: 'Memory Injection',
    charBudget: 'Memory Injection Character Budget',
    charBudgetDesc: 'Maximum total characters of memory injected per translation',
    semanticSearch: 'Semantic Search',
    semanticSearchDesc:
      'Use local embedding model to generate vectors for memories, improving matching accuracy',
    modelStatus: {
      idle: 'Not loaded',
      loading: 'Loading…',
      ready: 'Ready',
      failed: 'Load failed',
    },
    downloadModel: 'Download Model',
    reload: 'Reload',
    retry: 'Retry',
    modelInfo: 'Model: {modelId} (~195 MB, downloaded on first use)',
    advanced: 'Advanced Settings',
    minScoreThreshold: 'Minimum Score Threshold',
    minScoreThresholdDesc: 'Memories below this score will not be injected (max 1.0)',
    minScoreAll: '0 (inject all)',
    infoText:
      'Memory injection uses a three-signal scoring system (semantic similarity + keyword matching + time decay) to automatically select the most relevant memories. Even without semantic search, keyword and time decay signals remain active.',
  },
  memoryPanel: {
    reEmbed: 'Re-embed this book',
    embeddingProgress: 'Embedding progress',
    pause: 'Pause',
    resume: 'Resume',
    unembeddedOnly: 'Show unembedded only',
    embeddingReady: 'Embedded',
    embeddingStale: 'Embedding version outdated, will be recomputed',
    embeddingPending: 'Pending embedding',
  },
  scoring: {
    semanticSimilarity: 'Semantic Similarity',
    keywordMatch: 'Keyword Match',
    timeDecay: 'Time Decay',
    totalScore: 'Total Score',
    maxScore: 'Max 1.0',
    aiInvoked: 'AI invoked',
  },
};
