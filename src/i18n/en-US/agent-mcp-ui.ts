export default {
  agentMcp: {
    eyebrow: 'EXTERNAL AGENT / MCP',
    title: 'External Agent Workbench',
    subtitle:
      'Let external agents such as Claude Code use the subscription you already have to work on your library and translate novels directly.',
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
    steps: {
      desktopEnableTitle: 'Turn on the local MCP server',
      desktopEnableHint: 'Listens on 127.0.0.1 only and requires a token.',
      enableDesktop: 'Enable the local MCP server',
      endpoint: 'Server address',
      copyEndpoint: 'Copy address',
      webEnableTitle: 'Turn on WebMCP',
      webEnableHint:
        'Exposes the tools to an in-browser agent in a browser or bridge extension that supports WebMCP.',
      enableWebMcp: 'Enable WebMCP tool registration',
      webUnavailableHint:
        'No WebMCP interface was detected in this browser. Switch to a browser that supports WebMCP or install a bridge extension, then reload. If you use a local coding agent, the desktop app is the better fit.',
      clientTitle: 'Connect your agent client',
      clientHint: 'The current address and token are already filled in.',
      clientLocked: 'Turn on the server above before using this configuration.',
      copySnippet: 'Copy configuration',
      tabClaudeCode: 'Claude Code',
      tabPi: 'Pi',
      tabAntigravity: 'Antigravity',
      placeClaudeCode:
        'Run this command in a terminal, then run claude mcp list to confirm the connection.',
      placePi:
        "Merge this into mcpServers in Pi's MCP configuration file; see Pi's documentation for its location.",
      placeAntigravity:
        "Merge this into mcpServers in Antigravity's MCP configuration file; see Antigravity's documentation for its location.",
      waitingFirstCall:
        'No calls received yet. This will show as connected once the client sends its first instruction.',
      firstCallReceived: 'Connected: last call {tool} ({time})',
      guideTitle: 'Give your agent a quick start guide',
      guideHint:
        "Paste this guide to your agent, or put it in the agent's project instructions, so it knows which tools exist and how to use them.",
      copyGuide: 'Copy guide',
    },
    guide: {
      title: 'Tsukuyomi quick start guide',
      intro:
        "You are connected over MCP to Tsukuyomi, a novel translation tool (server name: tsukuyomi). Use its tools to read and write the user's library directly, and write results back into the app rather than only printing them in the chat.",
      introWeb:
        "This page is Tsukuyomi, a novel translation tool, and it exposes a set of tools to you through WebMCP. Use those tools to read and write the user's library directly, and write results back into the app rather than only printing them in the chat.",
      overviewTitle: 'Get your bearings',
      overviewContext:
        'get_app_context: the book and chapter the user has open, and the interface language.',
      overviewLibrary:
        'list_books lists the library; get_book shows the chapter list and per-chapter translation progress of one book.',
      overviewWorkflows:
        'The full procedure for each kind of task is in the MCP prompts translate-chapter, polish-chapter and import-and-translate; read the relevant one with prompts/get before starting.',
      overviewWorkflowsWeb:
        'Read the full procedure for each kind of task with get_workflow_guide; workflow can be "translate-chapter", "polish-chapter" or "import-and-translate".',
      tasksTitle: 'Common tasks',
      taskTranslate:
        'Translate: get_translation_chunk (mode "untranslated") fetches a chunk; translate it paragraph by paragraph and write it back with submit_translations; repeat until remaining_untranslated_count is 0. Each chunk comes with preceding context, matched terms and characters, related memories and special instructions — follow them.',
      taskPolish:
        'Polish and proofread: get_translation_chunk (mode "all", task_type "polish") returns the source and current translation; call submit_translations only for paragraphs that need improvement and follow next_cursor to the end of the chapter.',
      taskImport:
        'Import a new book: import_book_from_url; when it returns has_more: true, call it again to fetch the remaining chapters. If the site is unsupported or fetching fails, fetch the text yourself and write it with create_book and add_chapters.',
      taskUpdate:
        'Follow an ongoing serial: check_book_updates shows new chapters on the source site, apply_book_updates imports them.',
      taskConsistency:
        'Keep wording consistent: check existing renderings with list_terms and list_characters first; record new names and proper nouns with upsert_terms and upsert_characters, and important plot points with upsert_memory.',
      rulesTitle: 'Rules',
      ruleIds:
        'Submit strictly one translation per returned paragraph ID; do not merge, split or skip paragraphs.',
      ruleNoRepeat:
        'Do not submit different translations for the same paragraph repeatedly. If a submission is rejected, fix it using the returned reason and resubmit only the rejected paragraphs.',
      ruleConfirm:
        'include_updated on apply_book_updates applies text changes to chapters already imported and clears the translations of revised paragraphs; confirm with the user before using it.',
      ruleAsk:
        'Ask the user when it is unclear which book or chapters to work on, report progress after each chapter, and stop to explain if a permission is missing or a tool fails.',
    },
    activity: {
      title: 'Call activity',
      hint: 'Kept for this session only, up to 200 entries.',
      clear: 'Clear',
      empty:
        'No calls yet. Once the agent starts working, every tool call appears here in real time.',
      statusSuccess: 'Success',
      statusError: 'Failed',
      statusDenied: 'Denied',
    },
    permission: {
      title: 'Permissions',
      readOnly: 'Read only',
      readOnlyDesc:
        'Can query the library and read source text and translation context. Cannot write anything.',
      translateEdit: 'Translate and edit',
      translateEditDesc:
        'Can create books, add chapters, import, write translations back and maintain terms and characters. Cannot delete books.',
      full: 'Full control',
      fullDesc: 'Everything in "Translate and edit", plus permanently deleting books.',
      toolCount: '{count} tools exposed',
      recommended: 'Recommended',
      fullConfirmTitle: 'Allow external agents to delete books?',
      fullConfirmBody:
        'Once enabled, an agent can permanently delete books and all their translations. This cannot be undone.',
      fullConfirmAccept: 'Enable full control',
      cancel: 'Cancel',
      writeMode: 'Writing to paragraphs that already have a translation',
      writeAppend: 'Add a new version and select it (keeps history)',
      writeOverwrite: 'Overwrite the selected version',
      notifyOnWrite: 'Notify when a write completes',
      notifyOnWriteHint:
        'Shows a notification after an agent creates a book, submits translations or updates settings.',
    },
    connectionSettings: {
      title: 'Connection settings',
      localOnly:
        'The port and token stay on this device. They are not synced to Gist or exported to backup files.',
      port: 'Port',
      savePort: 'Apply',
      token: 'Access token',
      showToken: 'Show token',
      hideToken: 'Hide token',
      copyToken: 'Copy token',
      regenerate: 'Regenerate token',
      regenerateConfirm:
        'Connected clients stop working immediately and need the configuration copied again.',
      regenerateAccept: 'Regenerate',
      cancel: 'Cancel',
    },
    catalog: {
      title: 'Exposed capabilities',
      summary: '{count} tools exposed at the current permission level',
      categoryContext: 'App and navigation',
      categoryLibrary: 'Library and import',
      categoryTranslation: 'Translation',
      categoryWorldbuilding: 'Terms, characters and memories',
      workflows: 'Workflow templates',
      readOnlyBadge: 'Read',
      writeBadge: 'Write',
      dangerBadge: 'Danger',
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
      check_book_updates:
        "Checks a book's source site for new chapters, optionally comparing the text of imported chapters for changes.",
      apply_book_updates:
        'Imports updates from the source site: new chapters by default, optionally text changes to chapters already imported.',
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
    notify: {
      writeTitle: 'External agent updated data',
      writeDetail: '[{channel}] executed {tool}',
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed; please copy manually',
      tokenRegenerated: 'Bearer token regenerated; old token revoked immediately',
      portSaved: 'Listen port updated to {port}',
      serverStartFailed: 'Failed to start local MCP server',
      serverNotRunning: 'The server is not running. Turn it on before copying the configuration.',
    },
  },
};
