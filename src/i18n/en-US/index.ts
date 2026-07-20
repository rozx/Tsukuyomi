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
      'When embeddings are available, semantic similarity leads (0.85) while keywords and recency are auxiliary (0.10 / 0.05). When disabled or unavailable, scoring falls back to keywords and recency (0.75 / 0.25).',
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
  chat: {
    thinkingPhrases: [
      'Thinking…',
      'Working on it…',
      'Considering…',
      'One moment…',
      'Looking into it…',
    ],
  },
};
