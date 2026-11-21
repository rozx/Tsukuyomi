export default {
  settings: {
    tabs: {
      general: 'General',
      models: 'AI models',
      proxies: 'Proxies',
      sites: 'Site mappings',
      apiKeys: 'API keys',
      sync: 'Sync',
      embedding: 'Local embeddings',
      scraper: 'Scraping',
      importExport: 'Import / export',
      about: 'About',
    },
    deskPet: {
      title: 'Desk companion',
      show: 'Show Tsukuyomi desk companion',
      showHint: 'Desktop only. While the task center or assistant panel is closed, Tsukuyomi in the bottom-right corner shows translation and assistant progress.',
      saveFailed: "Couldn't save the desk companion setting",
    },
    taskQueue: {
      title: 'Task queue',
      maxConcurrent: 'Max concurrent tasks',
      maxConcurrentHint: 'Shared across all books (1–5). Raising it starts queued chapter tasks right away; lowering it does not interrupt running tasks.',
      saveFailed: "Couldn't save task queue settings",
    },
    general: {
      title: 'General settings',
      language: 'Interface language',
      languageHint:
        'Your language preference syncs across devices. Existing books keep their target language.',
      saveFailed: 'Could not save the interface language',
      zhCN: '简体中文',
      zhTW: '繁體中文',
      enUS: 'English',
    },
  },
};
