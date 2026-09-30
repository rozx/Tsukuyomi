export default {
  aiAssistant: {
    emptyReply: 'No valid response was received. Please try again.',
    finished: 'Assistant reply complete',
    cancelled: 'Cancelled',
    cancelRequest: 'Request cancelled',
    unknownError: 'Unknown error',
    processing: 'Processing the assistant request…',
    compactFailed: 'Context compression failed',
    historyKept: 'The original history is preserved. This request will continue.',
    contextLimit:
      'The conversation still exceeds the model context after compression. Start a new conversation or use a model with a larger context window.',
    continueCompact:
      'The context has been compressed into a summary. Continue the previous work using the summary and current task data.',
    summaryWindow:
      'The summary input exceeds the available model context and cannot be compressed safely. Use a model with a larger context window.',
    summaryEmpty: 'There is no content to summarize',
    summaryFailed:
      'Summary generation returned empty or short content. The original history is preserved.',
  },
  aiCommon: {
    languages: {
      zhCN: 'Simplified Chinese',
      zhTW: 'Traditional Chinese',
      enUS: 'English',
    },
  },
};
