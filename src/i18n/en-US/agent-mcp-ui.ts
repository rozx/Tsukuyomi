export default {
  agentMcp: {
    eyebrow: 'EXTERNAL AGENT / MCP',
    title: 'External Agent Workbench',
    subtitle:
      'Let external agents such as Claude Code use the subscription you already have to work on your library and translate novels directly.',
    sections: {
      connect: 'Connect',
      activity: 'Call activity',
      permission: 'Permissions',
      tools: 'Exposed capabilities',
      connection: 'Connection settings',
    },
    summary: {
      status: 'Service',
      permission: 'Permission',
      tools: 'Tools exposed',
      calls: 'Calls this session',
    },
    status: {
      running: 'Running',
      starting: 'Starting',
      stopped: 'Stopped',
      error: 'Error',
      registered: 'On',
      unregistered: 'Off',
      unsupported: 'Unavailable',
    },
    steps: {
      desktopEnableTitle: 'Turn on the local MCP server',
      desktopEnableHint: 'Listens on 127.0.0.1 only and requires a token.',
      enableDesktop: 'Enable the local MCP server',
      endpoint: 'Server address',
      copyEndpoint: 'Copy address',
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
      webEnableTitle: 'Turn on WebMCP',
      webEnableHint:
        'Registers the tools on this page and connects to the WebMCP relay running on your computer, so local agents such as Claude Code can use them.',
      enableWebMcp: 'Turn on WebMCP',
      webInsecure:
        'This page was not opened over HTTPS or localhost, and browsers do not allow WebMCP on such pages. Use an HTTPS address instead.',
      relayClientHint:
        "Add the WebMCP local relay to your agent client. The relay only accepts connections from this page's address.",
      tabRelayJson: 'Other clients (JSON)',
      placeRelayClaudeCode:
        'Run this command in a terminal (requires Node.js 22 or later), then restart Claude Code. Afterwards ask the agent to call webmcp_list_sources; seeing this page there means it is connected.',
      placeRelayJson:
        "Merge this into mcpServers in your client's MCP configuration (works for Cursor, Claude Desktop, Windsurf and others). Requires Node.js 22 or later.",
      guideTitle: 'Hand the quick start guide to your agent',
      guideHint:
        'Paste this guide to your agent: it will create a project folder for you, configure the MCP, and save the guide there as AGENTS.md. Afterwards, starting the agent in that folder is enough and you do not need to paste it again.',
      copyGuide: 'Copy guide',
      manualToggle: 'Add the MCP manually',
      manualHint:
        'Expand this only if you prefer to add it to your agent client yourself instead of using the guide.',
      webKeepOpen:
        'Keep this page open while you work, and keep only one Tsukuyomi tab open: the tools come from this tab, and the agent temporarily loses them when it is closed or reloaded. With several tabs open, the tool names the agent sees get a per-tab suffix.',
      webLegacyNative:
        'The browser has an old WebMCP experimental flag turned on, and the relay cannot forward the tools on this page. Open chrome://flags/#enable-webmcp-testing, turn it off and restart the browser, or update the browser to the latest version.',
      webRelayFailed: 'The WebMCP runtime failed to load. Reload the page and try again.',
      relayConnected:
        'Connected to the local relay (port {port}). The agent can now use the tools on this page.',
      relayNotLinked:
        'A relay is running on this computer, but this page is not connected to it. The relay only accepts the page address given by its --widget-origin option, and this page is {origin}. If they differ, copy the guide or configuration below again, update it in your agent client and restart the client. Seeing this for a few seconds right after turning WebMCP on is normal.',
      relayNotFound:
        'No local relay found yet. The relay is started by your agent client: give the guide below to the agent (or add the MCP manually), then restart the client. This page: {origin}',
    },
    guide: {
      overviewContext:
        'get_app_context: which page the user is on, the open book and chapter (with translation progress), the selected paragraph with its original text and translation, any text highlighted on the page (selected_text), and the interface language. Call it first when the user says "this paragraph", "this chapter" or "here" instead of guessing.',
      overviewLibrary:
        'list_books lists the library; get_book shows the chapter list and per-chapter translation progress of one book. For long books do not fetch the whole table of contents: use recent_chapters for only the latest chapters, volume_id for one volume, or set include_chapters to false for a volume outline. When a book has many terms or characters, page list_terms / list_characters with limit and offset and set compact to true.',
      overviewSearch:
        'To see where a word appears across the book, use search_paragraphs (original text or translations, regular expressions supported) or count_occurrences (counts and per-chapter distribution) instead of reading chapter by chapter. With local embedding enabled, search_chapters finds chapters from a description of their content. These searches, and the keyword filters of get_chapter_paragraphs, list_terms, list_characters and search_help_docs, match exactly by default; when you are unsure of the exact spelling, or the source may contain typos or variants, add fuzzy: true for fuzzy matching.',
      overviewHelp:
        'When the user asks how to use Tsukuyomi or where a feature is, find the relevant guide with search_help_docs, read it in full with get_help_doc, then answer. Do not answer from memory.',
      overviewWorkflows:
        'The full procedure for each kind of task is written under "Workflows" below; there is nothing else to read. The MCP prompts translate-chapter, polish-chapter and import-and-translate (prompts/get) contain the same steps and exist so the user can start a task directly.',
      overviewWorkflowsWeb:
        'The full procedure for each kind of task is written under "Workflows" below; there is nothing else to read. get_workflow_guide returns the same steps and is only needed to read the current procedure when this guide is out of date.',
      ruleIds:
        'Submit strictly one translation per returned paragraph ID; do not merge, split or skip paragraphs.',
      ruleNoRepeat:
        'Do not submit different translations for the same paragraph repeatedly. If a submission is rejected, fix it using the returned reason and resubmit only the rejected paragraphs.',
      intro:
        "This is the usage guide for Tsukuyomi, a novel translation tool. It provides tools through an MCP server (server name: tsukuyomi): use them to read and write the user's library directly, and write results back into the app rather than only printing them in the chat.",
      introWeb:
        "This is the usage guide for Tsukuyomi, a novel translation tool. It runs in the user's browser and provides tools through a local relay called webmcp-local-relay: use them to read and write the user's library directly, and write results back into the app rather than only printing them in the chat. The tools come from the open page and disappear temporarily when it is closed or reloaded.",
      versionNote: 'This guide is for Tsukuyomi {version}.',
      overviewVersion:
        'If the app_version returned by get_app_context differs from the version at the top of this guide, the guide is out of date: call get_quick_start_guide to get the guide for the current version and replace the saved AGENTS.md with it; the existing MCP configuration stays as it is.',
      conceptsTitle: 'Data model',
      conceptStructure:
        'The hierarchy is book → volume → chapter → paragraph. Each book has one target language, and translations are for that language.',
      conceptVersions:
        'Each paragraph can hold several translation versions per language, one of which is the selected version. At most 5 versions are kept per language; beyond that the oldest version is removed.',
      conceptWorld:
        'Each book has a term list, character settings and memories (reusable translation decisions: forms of address, term renderings, style), and may also have book-level and chapter-level special instructions. Follow them when translating.',
      conceptIds:
        'book_id, chapter_id and paragraph IDs all come from tool results; never invent them. When book_id is omitted the book the user has open is used; if no book is open you must pass it explicitly.',
      overviewTitle: 'Get your bearings',
      toolsTitle: 'Tool reference',
      toolsNote:
        'Tools marked "write" modify the user\'s data. Tools marked "danger" cannot be undone and are only available when the user has enabled full control. Each tool\'s own description covers its parameters and details.',
      toolWriteMark: ' (write)',
      toolDangerMark: ' (danger)',
      toolSeparator: ': ',
      toolListJoin: ', ',
      workflowsTitle: 'Workflows',
      workflowsNote: 'These are the steps for each kind of task; follow them as written.',
      wfTranslateTitle: 'Translate a chapter',
      wfTranslate1:
        'Call get_translation_chunk with the chapter_id and mode set to "untranslated". A chunk holds at most 50 paragraphs and about 4000 source characters (adjust with max_paragraphs, chunk_size): translate and submit it in one go. For later chunks of the same chapter pass compact: true to leave out the repeated titles and term/character descriptions.',
      wfTranslate2:
        'paragraphs are what to translate (id and source text); context_before is the existing translation of the preceding text in this chapter, for continuity; when this chapter has none yet, use previous_chapter_tail instead: the end of the previous chapter (source and translation), whose punctuation habits and fixed closing phrases you should follow; recent_chapter_titles are recent source and translated titles: follow their format for a new chapter title. matched_terms and matched_characters occur in this chunk; possible_terms and possible_characters are near matches where the source spelling differs slightly (text_in_source shows it), likely a typo or variant in the source: use them only after confirming it is the same word. repeated_passages lists the paragraphs of this chunk whose identical source was already translated earlier in this chapter or in the previous 30 chapters, with that translation: reuse it for flashbacks and callbacks unless the context differs. Older or merely similar lines are not listed; for two-part chapters, flashbacks or retold passages, look up the earlier wording with search_paragraphs. memories are related notes; follow special_instructions and translate into target_language.',
      wfTranslate3:
        'Translate paragraph by paragraph: one translated paragraph per source paragraph, with no merging, splitting or omission. Use the given renderings for terms and character names.',
      wfTranslate4:
        'Call submit_translations; each item in paragraphs has paragraph_id and translated_text. If the book has source-prefix validation enabled, also include original_text_prefix (the first 3 to 20 characters of the source paragraph). With the first chunk of a chapter you can also submit the translated chapter title as chapter_title_translation; put the name of the model you are using in model_label. Submit the whole chunk in one call and wait for the result before starting the next chunk; do not submit to the same chapter in parallel.',
      wfTranslate5:
        'Check failed_items in the result and fix and resubmit only those paragraphs. While remaining_untranslated_count is greater than 0, go back to step 1; when it reaches 0 the chapter is done. When translating several chapters in a row, finish the review of each chapter before starting the next; do not skip it to save time.',
      wfTranslatePlan:
        'Before submitting any translation, prepare the same way the built-in translation does in its planning phase. Create new terms, new characters and reusable translation decisions at this point instead of leaving them until afterwards:',
      wfTranslateReview:
        'After submitting this chunk, review it the same way the built-in translation does in its review phase. When correcting a translation you just submitted, set write_mode to "overwrite" to revise that draft in place instead of using up another version. Whatever you had to confirm with search_paragraphs (a form of address, a voice, punctuation, a fixed rendering) is missing from the settings: add it to that character\'s speaking_style or an existing memory (honorific address forms go in memories, not aliases). Checklist:',
      wfTranslateBrief:
        'For every later chunk a short preparation is enough, followed by the same translate, submit and review steps:',
      wfPolishTitle: 'Polish and proofread',
      wfPolish1:
        'Call get_translation_chunk with mode "all" and task_type "polish" (use "proofreading" for proofreading); without task_type you get the special instructions meant for translation. Each paragraph then includes current_translation.',
      wfPolish2:
        'Call submit_translations only for paragraphs that really need improvement; do not submit unchanged paragraphs.',
      wfPolish3:
        'Polishing and proofreading work on existing translations: by default a new version is added and selected. Set write_mode to "overwrite" only when the user explicitly asks to rewrite the current version in place.',
      wfPolish4:
        'Use the returned next_cursor as the cursor of the next call. When has_more is false, this chunk already reaches the end of the chapter: process it and stop. For later chunks of the same chapter you can pass compact: true to leave out the repeated titles and term/character descriptions.',
      wfPolishPlan:
        'Before changing anything, prepare the same way the built-in polishing and proofreading do in their planning phase (they have no review phase):',
      wfImportTitle: 'Import a new book',
      wfImport1:
        'When you have a URL, call import_book_from_url. Each call fetches at most 20 chapters (adjust with max_chapters, up to 50); when has_more is true, call it again to continue.',
      wfImport2:
        'IMPORT_IN_PROGRESS means an import of the same URL is still running. Wait for it to finish instead of starting another one.',
      wfImport3:
        'If the site is unsupported or fetching fails, fetch the text yourself, create the book with create_book and write the chapters with add_chapters. If the error includes a book_id the book already exists: use add_chapters only and do not create it again.',
      wfUpdateTitle: 'Follow an ongoing serial',
      wfUpdate1: 'Call check_book_updates to see which chapters are new on the source site.',
      wfUpdate2:
        'Call apply_book_updates to import them; by default only new chapters are imported. The returned applied_chapters already contains the chapter_id of each new chapter, so there is no need to fetch the table of contents again. A status of partial means some chapters could not be checked or imported (see failed); do not treat the book as up to date.',
      wfUpdate3:
        "include_updated applies text changes to chapters already imported and clears the translations of revised paragraphs. Get the user's consent before using it.",
      wfUpdate4: 'After importing, handle the new chapters as described in "Translate a chapter".',
      wfWorldTitle: 'Maintain terms, characters and memories',
      wfWorld1:
        'Before translating a book, check the existing renderings with list_terms and list_characters. When get_app_context shows local_embedding_enabled: false, memories match by keyword only, so also skim every summary with list_memories for book-wide conventions.',
      wfWorld2:
        'When you meet a new term or character specific to the work, record it with upsert_terms and upsert_characters so the whole book uses it. Do not create terms for ordinary vocabulary; personal names go in the character list, not the term list; before creating a character, make sure it is not an alias of an existing one.',
      wfWorld3:
        'Record reusable translation decisions (how a form of address is rendered, the fixed rendering of a word, style preferences, fixed phrases) with upsert_memory; they are brought back automatically by relevance when you fetch a translation chunk. Do not store plot, background or world-building in memories. Use search_memories to look things up; results are ranked by relevance and carry a score.',
      wfWorld4:
        'When the user has a standing requirement about style or forms of address, write it as a book-level or chapter-level special instruction with update_special_instructions: special instructions come with every translation chunk.',
      wfWorld5:
        'list_memories pages through every memory. Remove outdated or duplicate entries with delete_terms, delete_characters and delete_memories, and confirm with the user before deleting.',
      wfRenameTitle: 'Rename a term everywhere',
      wfRename1:
        'Update the rendering with upsert_terms or upsert_characters first, so later translations use the new name.',
      wfRename2:
        'Use count_occurrences to see how many places still use the old rendering: put it in keywords and set search_in to "translation".',
      wfRename3:
        'Call replace_in_translations with dry_run set to true to preview: find is the old rendering, replace_with the new one, and original_contains the name in the original text, so unrelated words spelled the same are left alone. Check the returned samples.',
      wfRename4:
        'When the preview looks right, call it again without dry_run. While has_more is true, call again with cursor set to the returned next_cursor (all other arguments unchanged) until it is false; without cursor the call starts over, which replaces the same text twice when the replacement contains the search text. By default each changed paragraph gets a new version and the old one is kept.',
      wfRename5:
        'Finally run count_occurrences again to confirm nothing is left, and tell the user how many places changed.',
      translationRulesTitle: 'Translation rules',
      translationRulesNote:
        'The rules below are the same ones the built-in Tsukuyomi translator uses (they are written in Chinese). Follow them when translating, polishing and proofreading.',
      rulesTitle: 'Rules',
      ruleWriteBack:
        'Write all translations and settings back to the app through the tools; do not only paste them in the conversation.',
      ruleConfirm:
        "include_updated on apply_book_updates, delete_book, and delete_terms, delete_characters and delete_memories destroy user data. Get the user's consent before using them.",
      ruleAsk:
        'Ask the user when it is unclear which book or chapters to work on, and report progress after each chapter.',
      errorsTitle: 'When something fails',
      errPermission:
        'PERMISSION_DENIED: the current permission mode does not allow this operation. Tell the user to adjust the permission on the External Agent page; do not try to work around it.',
      errNotReady:
        'NOT_READY: the app has just started and the library is still loading. Wait a moment and try again.',
      errBookRequired:
        'BOOK_ID_REQUIRED: the user has no book open. Find the target with list_books and pass book_id explicitly.',
      errNotFound:
        'BOOK_NOT_FOUND, CHAPTER_NOT_FOUND: the identifier does not exist or was deleted. Fetch it again with list_books and get_book.',
      errSource:
        'UPDATE_SOURCE_MISSING, UPDATE_SOURCE_INVALID: the book has no usable update source. Ask the user to set it up or repair it in the app.',
      errOther:
        'Other errors: tell the user the error message exactly as the tool returned it; do not guess the cause and retry repeatedly.',
      errRelay:
        'No Tsukuyomi tools are visible, or webmcp_list_sources returns 0 sources: a page needs about 20 seconds to connect after the relay starts, so retry once first; then ask the user to look at the relay status in step 1 of the Tsukuyomi "External Agent" page. If the page is closed or WebMCP is off, ask them to turn it on. "A relay is running on this computer, but this page is not connected to it" means the relay\'s --widget-origin does not match the page address: update the MCP configuration with the address shown on the page and restart the client. "No local relay found yet" means the relay is not running or its port is taken.',
      title: 'Tsukuyomi quick start guide',
      setupTitle: 'First-time setup (once only)',
      setupIntro:
        'The user handed you this guide so that you set things up for them. Complete the four steps below in order. If this guide already exists in the current folder and you can see the tools mentioned later, setup is already done: skip this section.',
      setupFolder:
        '**Create a project folder.** Ask the user where they want the translation project. If they have no preference, create a `tsukuyomi-translation` folder in their home directory. Do everything else inside this folder.',
      setupMcp:
        '**Configure the MCP in this folder.** If you are Claude Code, run this inside the folder:',
      setupMcpOtherDesktop:
        'Other clients: add an HTTP server to the project-level MCP configuration with the address {url} and the header Authorization: Bearer {token}.',
      setupMcpOtherRelay:
        'Other clients: write the following into the project-level MCP configuration:',
      setupSave:
        "**Save this guide as AGENTS.md in that folder.** The first-time setup section is needed only once, so leave it out; save everything else (the title, the introduction and version at the top, and every section from the data model on) unchanged. If you are Claude Code, also create a CLAUDE.md containing the single line `{'@'}AGENTS.md`. If the file already exists, append this guide as its own section and do not overwrite what is there; when you receive a newer version, replace only this section.",
      setupFinish:
        '**Tell the user what to do next.** Say where the project folder is, and ask them to restart or reload you inside that folder so the MCP takes effect. From then on, starting you in that folder is enough and the guide does not need to be pasted again.',
      setupPrereqDesktop:
        'Prerequisite: the user has turned on the local MCP server on the External Agent page of the Tsukuyomi desktop app. If you cannot connect, ask the user to confirm this first.',
      setupPrereqWeb:
        'Prerequisite: the user has Tsukuyomi open in a browser with WebMCP turned on (on the External Agent page), and keeps any Tsukuyomi page open afterwards; it need not be the External Agent page. Running the relay requires Node.js 22 or later. If you cannot connect, ask the user to confirm these points first.',
      setupTokenWarning:
        'Note: the command above and the MCP configuration it writes contain an access token. Do not commit this folder to a public repository.',
      overviewRelay:
        'Call webmcp_list_sources first to confirm the Tsukuyomi page is connected. Some clients load MCP tools on demand: if no webmcp_ tools are listed, look them up the way your client does before concluding nothing is connected. If the tools mentioned below are missing from your tool list, list them with webmcp_list_tools and call them by name with webmcp_call_tool. Tool names with a suffix such as `_a1b2` mean the user has several Tsukuyomi pages open: ask them to keep only one, or call the tools by their full suffixed names.',
    },
    activity: {
      title: 'Call activity',
      hint: 'Kept across page reloads and cleared when the tab is closed; up to 200 entries.',
      clear: 'Clear',
      empty:
        'No calls yet. Once the agent starts working, every tool call appears here in real time.',
      statusSuccess: 'Success',
      statusError: 'Failed',
      statusDenied: 'Denied',
      argsLabel: 'Arguments',
      resultLabel: 'Result',
      noArgs: 'No arguments',
    },
    permission: {
      title: 'Permissions',
      readOnly: 'Read only',
      readOnlyDesc:
        'Can query the library and read source text and translation context. Cannot write anything.',
      translateEdit: 'Translate and edit',
      translateEditDesc:
        'Can create books, add chapters, import, write and batch-replace translations, and add, edit and delete terms, characters and memories. Cannot delete books.',
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
        'Read which page the user is on, the open book and chapter, the selected paragraph with its text and translation, highlighted text, plus UI locale and runtime environment.',
      get_quick_start_guide:
        'Returns the quick start guide for the current version, to replace an outdated copy the agent saved.',
      navigate_to:
        'Navigate the UI to home, library, a book, a chapter, or scroll directly to a paragraph.',
      get_workflow_guide:
        'Retrieve workflow instructions for translate-chapter, polish-chapter, or import-and-translate.',
      search_help_docs:
        'Search the built-in user guide by title, description and content, or list every guide when no query is given.',
      get_help_doc: 'Read one built-in user guide in full.',
      list_books:
        'List all books in the local library with metadata, volume/chapter counts, and target language.',
      get_book: 'Get full volumes, chapters, and per-chapter translation progress for a book.',
      create_book: 'Create a new book in the local library with optional initial chapters.',
      add_chapters: 'Batch-add chapters from plain text or paragraph arrays to a volume.',
      update_book: "Edit a book's author, description, tags and alternate titles.",
      move_chapters:
        'Reorder chapters within a volume or move them to another volume (optionally a new one).',
      import_book_from_url:
        'Fetch and import or incrementally update a book and its chapter contents from a supported URL.',
      check_book_updates:
        "Checks a book's source site for new chapters, optionally comparing the text of imported chapters for changes.",
      apply_book_updates:
        'Imports updates from the source site: new chapters by default, optionally text changes to chapters already imported.',
      search_chapters:
        'Find the chapters most relevant to a description of their content (needs local embedding).',
      delete_book: 'Permanently delete a book and its chapters (full permission mode only).',
      get_translation_chunk:
        'Bundle the next paragraph chunk with preceding context, matched terms, characters, memories, and instructions.',
      submit_translations:
        'Validate and persist batch paragraph translations and optional chapter title translation with live UI refresh.',
      get_chapter_paragraphs:
        'Read chapter paragraphs by index range or keyword filter with optional translation history.',
      update_chapter_title: 'Update the translated chapter title in the book target language.',
      search_paragraphs:
        'Search original text and translations across the whole book or one chapter by keyword or regular expression, returning each match with its chapter.',
      count_occurrences:
        'Count how often keywords appear in the original text or translations, with paragraph counts and per-chapter distribution.',
      replace_in_translations:
        'Find and replace text in the selected translations across the whole book or one chapter, with an optional preview.',
      list_terms: 'List all terminology entries for a book.',
      upsert_terms: 'Batch create or update terminology translations and descriptions.',
      list_characters: 'List all character settings, aliases, and speaking styles for a book.',
      upsert_characters: 'Batch create or update character settings and alias translations.',
      search_memories:
        "Search a book's memories (reusable translation decisions) via hybrid semantic + keyword retrieval, ranked by relevance; lists recent memories when no query is given.",
      upsert_memory:
        'Create or update a memory: reusable translation decisions only (forms of address, term renderings, style), not story notes.',
      list_memories: "List all of a book's memories page by page, optionally with full content.",
      delete_terms: 'Delete terms by ID.',
      delete_characters: 'Delete character settings by ID.',
      delete_memories: 'Delete memories by ID.',
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
