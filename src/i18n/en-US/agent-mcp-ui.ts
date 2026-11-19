export default {
  agentMcp: {
    eyebrow: 'EXTERNAL AGENT / MCP',
    title: 'External Agent Workbench',
    subtitle:
      'Connect Claude Code, Pi, Antigravity, or WebMCP-capable browser agents to manage your library and translate novels using your existing agent quota.',
    metrics: {
      channel: 'Active transport',
      channelDesktop: 'Desktop Local MCP',
      channelWeb: 'Browser WebMCP',
      status: 'Status',
      exposedTools: 'Exposed tools',
      recentCalls: 'Session calls',
    },
    status: {
      running: 'Running',
      starting: 'Starting',
      stopped: 'Stopped',
      error: 'Error',
      registered: 'Registered',
      unregistered: 'Unregistered',
      nativeDocument: 'Native (document.modelContext)',
      nativeNavigator: 'Compatible (navigator.modelContext)',
      unavailable: 'WebMCP not detected',
    },
    connection: {
      title: 'Connection & Runtime',
      desktopTitle: 'Local Streamable HTTP MCP Server',
      desktopHint:
        'Binds strictly to 127.0.0.1 with mandatory Bearer token authentication. Port and token stay local and are never synced to Gist.',
      enableDesktop: 'Enable local MCP server',
      endpoint: 'Endpoint URL',
      port: 'Listen port',
      savePort: 'Apply port',
      token: 'Bearer token',
      showToken: 'Show',
      hideToken: 'Hide',
      copyToken: 'Copy token',
      regenerateToken: 'Regenerate',
      regenerateHint:
        'Regenerating immediately invalidates the old token. Update your external client configs afterwards.',
      webTitle: 'Browser WebMCP Bridge',
      webHint:
        'Registers tools with W3C WebMCP (or compatible bridge extensions) so browser agents can interact with Tsukuyomi directly.',
      enableWebMcp: 'Enable WebMCP tool registration',
      webUnavailableHint:
        'Neither document.modelContext nor navigator.modelContext was detected in this browser. Open Tsukuyomi in a WebMCP-capable browser or install a compatible bridge extension, or use the desktop app to connect local coding agents directly.',
      safetyTitle: 'Permissions & Write Defaults',
      permissionMode: 'Permission mode',
      permissionReadOnly: 'Read only (inspect library & fetch translation chunks only)',
      permissionTranslateEdit: 'Translate & edit (recommended; blocks book deletion)',
      permissionFull: 'Full control (includes deleting books)',
      defaultWriteMode: 'Default write mode for existing translations',
      writeAppend: 'Append new version & select (keeps history)',
      writeOverwrite: 'Overwrite currently selected version',
      notifyOnWrite: 'Show toast on external writes',
      notifyOnWriteHint:
        'Displays a lightweight toast notification when an external agent creates books, submits translations, or edits settings.',
    },
    quickConnect: {
      title: 'Quick Connect',
      subtitle: 'Snippets automatically include your active port and Bearer token.',
      webSubtitle:
        'The web build exposes tools via the browser WebMCP model context, including the workflow guide tool.',
      tabClaudeCode: 'Claude Code',
      tabPi: 'Pi',
      tabAntigravity: 'Antigravity',
      tabWebMcp: 'WebMCP',
      copySnippet: 'Copy snippet',
      desktopRequiredNotice:
        'The local Streamable HTTP MCP server is only available in the desktop app. Use the WebMCP tab in a browser.',
      promptsTitle: 'Built-in Translation Workflows',
      promptsHint:
        'Exposed as MCP prompts via prompts/list on desktop and via get_workflow_guide on WebMCP.',
      webSnippet:
        '// Browser WebMCP (document.modelContext / navigator.modelContext)\n// 1. Enable "Enable WebMCP tool registration" on this page.\n// 2. Connect your WebMCP-capable browser agent or compatible bridge extension.\n// 3. Call get_workflow_guide (workflow = "translate-chapter") to start translating.',
    },
    prompts: {
      'translate-chapter':
        'Translate a novel chapter chunk-by-chunk using terms, character settings, memories, and batch writeback.',
      'polish-chapter':
        'Review and polish an already translated chapter for terminology consistency, character voice, and prose quality.',
      'import-and-translate':
        'Import a novel from URL or local text into Tsukuyomi and immediately start translating chapters.',
    },
    tools: {
      get_app_context:
        'Read the currently open book/chapter/paragraph context, UI locale, and runtime capability flags.',
      navigate_to:
        'Navigate the UI to home, library, a book, a chapter, or scroll directly to a paragraph.',
      get_workflow_guide:
        'Retrieve workflow instructions for translate-chapter, polish-chapter, or import-and-translate.',
      list_books:
        'List all books in the local library with metadata, volume/chapter counts, and target language.',
      get_book: 'Get full volumes, chapters, and per-chapter translation progress for a book.',
      create_book: 'Create a new book in the local library with optional initial chapters.',
      add_chapters: 'Batch-add chapters from plain text or paragraph arrays to a volume.',
      import_book_from_url:
        'Fetch and import or incrementally update a book and its chapter contents from a supported URL.',
      delete_book: 'Permanently delete a book and its chapters (full permission mode only).',
      get_translation_chunk:
        'Bundle the next paragraph chunk with preceding context, matched terms, characters, memories, and instructions.',
      submit_translations:
        'Validate and persist batch paragraph translations and optional chapter title translation with live UI refresh.',
      get_chapter_paragraphs:
        'Read chapter paragraphs by index range or keyword filter with optional translation history.',
      update_chapter_title: 'Update the translated chapter title in the book target language.',
      list_terms: 'List all terminology entries for a book.',
      upsert_terms: 'Batch create or update terminology translations and descriptions.',
      list_characters: 'List all character settings, aliases, and speaking styles for a book.',
      upsert_characters: 'Batch create or update character settings and alias translations.',
      search_memories:
        'Search book plot memories via hybrid semantic + keyword retrieval, or list all.',
      upsert_memory: 'Create or update a book plot memory entry.',
      get_special_instructions:
        'Read book-level and optional chapter-level translation/polish/proofreading instructions.',
      update_special_instructions:
        'Update book-level or chapter-level translation/polish/proofreading instructions.',
    },
    toolsAndLog: {
      toolsTitle: 'Exposed Tool Catalog',
      searchPlaceholder: 'Filter tools by name or description…',
      readOnlyBadge: 'Read',
      writeBadge: 'Write',
      dangerBadge: 'Danger',
      noToolsMatch: 'No matching tools.',
      logTitle: 'Live Activity Log',
      logHint: 'Kept in memory for this session (last 200 calls); cleared on reload.',
      clearLog: 'Clear log',
      emptyLog:
        'No external agent calls yet. Enable the transport and connect a client to see live tool activity here.',
      statusSuccess: 'OK',
      statusError: 'Error',
      statusDenied: 'Denied',
    },
    notify: {
      writeTitle: 'External agent updated data',
      writeDetail: '[{channel}] executed {tool}',
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed; please copy manually',
      tokenRegenerated: 'Bearer token regenerated; old token revoked immediately',
      portSaved: 'Listen port updated to {port}',
      serverStartFailed: 'Failed to start local MCP server',
    },
  },
};
