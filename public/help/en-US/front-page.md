# Tsukuyomi Translator User Guide {#front-page-section-1}

Welcome to **Tsukuyomi**. This guide introduces the main features and workflows in the current version.

---

## 🌐 Interface and book languages {#front-page-languages}

- On first use, the interface follows your system language. Choose Simplified Chinese, Traditional Chinese, or English under **Settings → General → Interface language**. This preference is included in settings sync.
- Manual creation, website import, and AI import set a new book's target to the interface language when the book is actually created. The language at the start of an AI import or during preview does not determine the new book's target.
- Switching the interface language leaves existing book targets in place. Change a book's target under **Book details → Settings → Translation settings**. Older books and translations without a language label are treated as Simplified Chinese.
- Source text can use any language, including several languages in one book. AI determines the language of each paragraph. A paragraph already in the target language can be saved unchanged and counts as processed; Simplified and Traditional Chinese still require conversion to the chosen target.
- Each target retains its own paragraph versions and selections, volume/chapter titles, terms, character names, and aliases. Missing paragraph or title translations display the source; missing term, character, or alias translations stay blank.

## 🚀 Quick start {#front-page-section-2}

### 1) Configure an AI model {#front-page-section-3}

1. Open **AI models** from the navigation.
2. Add a model and enter its connection details:
   - Supported providers are **OpenAI** and **Gemini**.
   - Enter an API key.
   - OpenAI requires a Base URL; Gemini can use its default endpoint.
3. Use **Get model information** to read context and output limits from the bundled models.dev catalog. Use **Test connection** to check the connection, then save.

> 💡 See [AI model configuration](/help/ai-models-guide).

### 2) Create and import books {#front-page-section-4}

1. Open **Books** from the navigation.
2. Choose **New book** and enter the basic information.
3. For supported novel sites, use **Import from website** to check and select chapters. For TXT, Markdown, HTML, EPUB, or other websites, open **AI import**. Tsukuyomi organizes a draft; review the plan before applying it.

> 💡 See [Book library](/help/books-page-guide) and [AI import workspace](/help/import-guide).

### 3) Start translating {#front-page-section-5}

1. Open a book's details.
2. Add or fetch chapters in the chapter panel.
3. Select a chapter and use the toolbar to start translation, polishing, or proofreading.

> 💡 See [Book details overview](/help/book-details-overview) and [AI translation](/help/book-details-translation).

---

## ✨ Main features {#front-page-section-6}

### 📖 Translation and editing {#front-page-section-7}

- Paragraph translations with multiple versions and version selection.
- Translation, source editing, and translation preview modes.
- Search/replace and undo/redo.
- Keyboard shortcuts for common editing operations.

> 💡 See [Content editing](/help/book-details-editing).

### 🧩 Terms, characters, and memories {#front-page-section-8}

- **Terms**: maintain names and their translations.
- **Characters**: maintain character details, aliases, and speech styles.
- **Memories**: maintain plot and background information, with filtering by type.
- AI may create or update these records during translation. Review its changes.

> 💡 See [Terminology](/help/book-details-terminology), [Characters](/help/book-details-characters), and [Memories](/help/book-details-memory).

### 🤖 Task types {#front-page-section-9}

- Translation
- Polishing
- Proofreading

> Chapter summaries were removed in v0.12. [Local embeddings](/help/local-embedding) and the `query_chapter` tool now retrieve source passages when needed.

### 💬 Tsukuyomi chat assistant {#front-page-section-10}

The built-in assistant is named **Tsukuyomi (月詠)**, the application's moonlit scholar.

- Ask questions about the current book.
- Look up and manage terms, characters, memories, and other data.
- Read help documents and navigate to a help page when needed.
- Simplified and Traditional Chinese conversations use Tsukuyomi's scholar persona; English uses neutral professional language. Saved translations always use the book's target language without the assistant's voice.

> 💡 See [Chat assistant](/help/chat-assistant-guide).

### 🛠️ System bar and right panels {#front-page-section-11}

- **AI thinking**: task status and reasoning messages.
- **Sync**: Gist sync status and controls.
- **Message history**: previous notifications.
- **Tsukuyomi / Translation progress**: right rail entries for chat and task progress.
- **Vector index**: inspect or rebuild chapter and memory vectors, available in book details when local embeddings are enabled.

> 💡 See [System bar and navigation](/help/toolbar-guide) and [Local embeddings](/help/local-embedding).

### 💾 Data and sync {#front-page-section-12}

- Data is stored locally in IndexedDB.
- Optional GitHub Gist sync.
- Import/export for backup and migration.

> 💡 See [Settings](/help/settings-guide).

---

## ✅ Suggested workflow {#front-page-section-13}

1. Configure default models before starting a large translation batch.
2. Finish the chapter structure, then translate and review in batches.
3. Check automatic term, character, and memory changes after translation.
4. Export regularly and keep several backups for important projects.

---

## ❓ Frequently asked questions {#front-page-section-14}

**Q: What should I do if a translation task stops?**

A: Check the API key, model availability, and network connection, then retry.

**Q: Can different tasks use different models?**

A: Yes. In the default AI model settings, choose separate models for translation, proofreading/polishing, terminology translation, and the assistant.

**Q: Does importing a backup affect existing data?**

A: Yes. Import replaces the relevant current data. Export a local backup first.

---

## 📚 Related guides {#front-page-section-15}

- [Quick start](/help/front-page) (this guide)
- [Home](/help/library-guide)
- [Book library](/help/books-page-guide)
- [AI import workspace](/help/import-guide)
- [AI model configuration](/help/ai-models-guide)
- [Chat assistant](/help/chat-assistant-guide)
- [System bar](/help/toolbar-guide)
- [Settings](/help/settings-guide)
- [Book details overview](/help/book-details-overview)
- [Chapter management](/help/book-details-chapters)
- [Content editing](/help/book-details-editing)
- [AI translation](/help/book-details-translation)
- [Terminology](/help/book-details-terminology)
- [Characters](/help/book-details-characters)
- [Memories](/help/book-details-memory)
