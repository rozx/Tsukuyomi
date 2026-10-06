# 📖 Book Details Overview {#book-details-overview-section-1}

Book details (`/books/:id`) is the workspace for translation, terms, characters, memories, export, and AI interaction.

Interface and book target are independent. Choose Simplified Chinese, Traditional Chinese, or English in book translation settings. Paragraph/title display follows the target with source fallback; missing term/character/alias translations stay blank. Legacy books/results are Simplified Chinese. Each language is retained separately, and target changes do not start translation. Source may contain any language.

> Since v0.12.1, desktop has a narrower sidebar and collapsible Settings group. Breadcrumbs replace redundant Back/Contents headings. Progress moved to the global right panel and is accessible across pages.
>
> Chapter summaries were removed in v0.12. `query_chapter` retrieves relevant source passages using [Local embeddings](/help/local-embedding).

---

## 🖥️ Desktop layout {#book-details-overview-section-2}

```
+------------------------------------------------+
|  Workspace header (title + breadcrumb)         |
+--------------+---------------------------------+
| Sidebar      | Workspace                       |
| Book card    | Chapter toolbar/search/content  |
| Cover/stats  | or book settings panel          |
| Settings     |                                 |
| Translation  |                                 |
| Terms/Chars  |                                 |
| Memory/Update|                                 |
| Contents     |                                 |
| Volumes      |                                 |
| Chapters     |                                 |
+--------------+---------------------------------+
```

### Sidebar {#book-details-overview-section-3}

Three areas:

#### 1) Book card {#book-details-overview-section-4}

Cover, title, and volume/chapter/word counts. Click to edit title, author, description, tags, cover, alternate titles, URLs, and book instructions.

#### 2) Collapsible Settings {#book-details-overview-section-5}

- **Expanded**: Settings heading and five labeled entries:
  - ⚙️ Translation settings: target, display, chunking, model overrides
  - 🔖 Terms
  - 👥 Characters
  - 🗄 Memories
  - ⬇ Check updates: replay source recipe and confirm chapter writes
- **Collapsed**, the default: five icon buttons and an expansion chevron.

`ui.bookSettingsMenuExpanded` persists this preference.

#### 3) Volumes and chapters {#book-details-overview-section-6}

- New volume/chapter buttons at the top.
- Arrows expand/collapse volumes.
- Drag chapters across volumes.
- Set chapter title translations independently.
- Maintain chapter instructions through the menu/edit dialog.

> Use the breadcrumb or Books navigation to return to the library; the old Back button below the book card was removed.

### Workspace {#book-details-overview-section-7}

| Selection            | Content                                         |
| :------------------- | :---------------------------------------------- |
| Chapter              | `ChapterContentPanel` in the selected edit mode |
| Translation settings | `BookTranslationSettingsPanel`                  |
| Terms                | `TerminologyPanel`                              |
| Characters           | `CharacterSettingPanel`                         |
| Memories             | `MemoryPanel`                                   |
| Check updates        | `BookUpdatePanel`                               |

Settings views show a context label with icon, name, and Translation/Terms/Characters/Memory/Update heading.

---

## 📱 Tablet {#book-details-overview-section-8}

Same sidebar/workspace structure, with:

- Collapsible sidebar, initially open, controlled by the upper-right toolbar button.
- Compact chapter toolbar with secondary actions in an overflow menu.
- Touch-friendly single-column contents cards.
- Settings expansion shared with desktop across breakpoint changes.

---

## 📲 Mobile {#book-details-overview-section-9}

Two full-screen views:

| Mode      | View                       |
| :-------- | :------------------------- |
| `catalog` | Book card and chapter list |
| `reader`  | Chapter content            |

- Entering the book opens catalog; selecting a chapter opens reader.
- Contents in the reader toolbar returns to catalog.

> Terms, characters, and memories use `/books/:id/settings/(terms|characters|memory)` instead of sidebar views.
>
> Translation settings are in the reader gear sheet's Global settings tab. Check updates opens `/books/:id/settings/update` full-screen from the book overview.
>
> Narrow layouts have no right rail. A desktop browser resized to this layout can open Vector index from the top bar when local embeddings are enabled. Physical mobile devices still disable embeddings; keyword/recency memory selection remains, while `query_chapter` is unavailable.

---

## ✨ Shared features {#book-details-overview-section-10}

### 1) Chapter structure {#book-details-overview-section-11}

- Create, edit, and delete volumes/chapters.
- Drag chapters, including between volumes.
- Maintain translated titles, chapter information, and instructions.

### 2) Edit modes {#book-details-overview-section-12}

Default: `translation`.

| Mode                            | Purpose                                                                                                                                          |
| :------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source (`original`)**         | Edit source in any language. Changed source invalidates all language versions/selections for that paragraph; unchanged paragraphs retain results |
| **Translation (`translation`)** | Paragraph source/translation operations                                                                                                          |
| **Preview (`preview`)**         | Read translations with untranslated markers                                                                                                      |

### 3) Paragraph/chapter tasks {#book-details-overview-section-13}

- Paragraph retranslation, polishing, proofreading, and version creation/selection.
- Full-chapter tasks or untranslated paragraphs only.
- Toolbar term/character/memory buttons with usage counts open chapter-related records.

### 4) Search and shortcuts {#book-details-overview-section-14}

| Shortcut            | Action                    |
| :------------------ | :------------------------ |
| `Ctrl+F`            | Toggle find               |
| `Ctrl+H`            | Toggle replace            |
| `F3` / `Shift+F3`   | Next/previous match       |
| `Esc`               | Close search              |
| `Ctrl+Z` / `Ctrl+Y` | Undo/redo                 |
| `Ctrl+Shift+C`      | Copy chapter translations |

Undo/redo controls describe the operation, such as translating paragraph 12.

### 5) Export {#book-details-overview-section-15}

The chapter Export menu supports:

- Source / translation / bilingual
- Clipboard / JSON / TXT

Export individual chapters or a whole book from the library.

Translation/bilingual export uses current-target selections with source fallback. English punctuation is not converted to Chinese; source fallback is not normalized as translation. Full backups retain every language.

### 6) AI retrieval {#book-details-overview-section-16}

- `search_memories`: natural-language memory lookup for context.
- `query_chapter`: natural-language chapter retrieval for titles, plot, or characters; requires local embeddings.

See [AI translation](/help/book-details-translation) and [Local embeddings](/help/local-embedding).

---

## 🚀 Workflow {#book-details-overview-section-17}

1. Open a book from Home or Books.
2. Choose a chapter or open settings for translation, terms, characters, memories, or updates.
3. Choose an edit mode, usually Translation.
4. Translate/revise paragraphs; use search/replace for batch corrections.
5. Review related terms/characters/memories through their count buttons.
6. Export the chapter or book.

---

## ℹ️ Global system bar {#book-details-overview-section-18}

- [System bar](/help/toolbar-guide) provides thinking, sync, and notification controls across pages.
- Translation progress in the right panel shows task progress and activates for a new task.
- Vector index appears only on book routes with embeddings enabled.

---

## 📚 Related guides {#book-details-overview-section-19}

- [Chapters](/help/book-details-chapters)
- [Editing](/help/book-details-editing)
- [AI translation](/help/book-details-translation)
- [Terminology](/help/book-details-terminology)
- [Characters](/help/book-details-characters)
- [Memories](/help/book-details-memory)
- [Local embeddings](/help/local-embedding)
- [System bar](/help/toolbar-guide)
