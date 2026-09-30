export default {
  appUi: {
    taskTypes: {
      translation: 'translation',
      proofreading: 'proofreading',
      polish: 'polishing',
      termsTranslation: 'term translation',
      assistant: 'assistant',
      config: 'config fetch',
      other: 'other',
    },
    taskToast: {
      failed: 'AI task failed',
      failedDetail: '{model} failed during the {type} task: {message}',
      unknownError: 'Unknown error',
      cancelled: 'AI task cancelled',
      cancelledDetail: '{model}: {type} task cancelled',
      assistantCancelled: 'Cancelled {count} assistant tasks',
    },
    bookAdded: {
      summary: 'Book added',
      detail: 'Added book "{title}"',
    },
    duration: {
      seconds: '{seconds}s',
      minutesSeconds: '{minutes}m {seconds}s',
    },
    notFound: {
      oops: 'Oops. Nothing here...',
      title: 'No page was found in this night sky',
      subtitle: 'The link may have expired, or the book was moved elsewhere.',
      goHome: 'Go home',
      openLibrary: 'Open library',
    },
    askUser: {
      suggested: 'Suggested answers',
      prev: 'Previous',
      next: 'Next',
    },
    eyebrow: {
      aiModel: 'AI · Model',
      guide: 'Guide',
      helpDocs: 'Help · Docs',
      toc: 'Table of contents',
    },
    modelTestDuration: '({ms} ms)',
    errors: {
      importDisabled:
        'IMPORT_DISABLED: AI import is turned off in this version; existing tasks and novels are kept',
      unsupportedUiLocale: 'Unsupported interface language',
    },
  },
};
