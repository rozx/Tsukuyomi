# 🏠 Library and Home {#library-guide-section-1}

Home (`/`) is Tsukuyomi's workspace overview, with project statistics and shortcuts to common workflows. Data is stored in the browser's **IndexedDB**, with optional GitHub Gist sync.

The initial interface language follows the system. Change and sync it under **Settings → General**. A new book gets the interface language as its target when actually created; existing targets remain independent in each book's translation settings.

> Since v0.12.1, desktop Home uses a Continue Reading hero, compact metrics, and quick actions. Tablet uses hero cards, five statistics, and recently edited books. Mobile uses a single-column layout. The sections below describe each variant.

---

## 🖥️ Desktop {#library-guide-section-2}

Four main areas:

```
+--------------------------------------------------------+
|  DesktopWorkbenchHeader (title + metrics)              |
+--------------------------------------------------------+
|  Continue Reading hero (most recent book)              |
+--------------------------------------------------------+
|  Quick actions (4 cards)                               |
+--------------------------------------------------------+
|  Recently edited (6 cards)                             |
+--------------------------------------------------------+
```

### 1) Workspace header and metrics {#library-guide-section-3}

`DesktopWorkbenchHeader` matches the headers on Books, AI models, and Settings:

- Title: **Welcome back** when idle; **Workspace running** while AI tasks are active.
- Subtitle: the last book, if any, and current task status.
- `DesktopWorkbenchMetrics` displays five figures:

| Metric        | Meaning                                                |
| :------------ | :----------------------------------------------------- |
| 📚 Books      | Total books                                            |
| 📑 Chapters   | Chapters across all books                              |
| 📝 Word count | Total chapter content count, calculated asynchronously |
| 🏷️ Terms      | Terminology entries                                    |
| ⭐ Favorites  | Favorited books                                        |

### 2) Continue Reading hero {#library-guide-section-4}

The most recently used book appears as a large cover card:

- **Eyebrow**: Continue Reading.
- **Status**: Translating with animated dots, or Updated on a date when idle.
- **Title and author**.
- **Stats**: chapters, word count (a skeleton while loading), and favorite marker.
- **Primary action**: open book details to continue translating or view progress.
- **Secondary action**: Open library (`/books`).

If there are no books, the hero is omitted; metrics and quick actions remain.

### 3) Quick actions {#library-guide-section-5}

Four cards in a responsive grid:

| Card                       | Action                                                                                                                                                                                                            |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ➕ **Add book**            | Open the manual book form: title, author, description, tags, cover, alternate titles, Web URL, and book instructions                                                                                              |
| 🌐 **Import from website** | Open the sync workspace. Built-in sites include `ncode.syosetu.com`, `novel18.syosetu.com`, `kakuyomu.jp`, and `syosetu.org`; other sites can use AI import. Select/skip chapters and choose a destination volume |
| 📚 **Open library**        | Go to `/books`                                                                                                                                                                                                    |
| 🤖 **AI settings**         | Go to `/ai` to configure models and task routing                                                                                                                                                                  |

### 4) Recently edited {#library-guide-section-6}

The latest **six books**, ordered by descending `lastEdited`:

- Cover, title, author, chapters, and word count.
- Click a card to open details.
- Writes such as chapter editing, translation, or term changes update `lastEdited` and move the book up the list.

---

## 📱 Tablet {#library-guide-section-7}

Tablet Home uses cards for the hero, metrics, actions, and recent books.

### Two hero cards {#library-guide-section-8}

- **Continue Reading** shows the last book's title, author, chapters, update time, and Continue translating action.
- During an AI task, a **Translating** card shows a spinner and View progress action.
- The hero area is omitted if there are no books.

### Five statistics {#library-guide-section-9}

The same data as desktop metrics, displayed as compact cards with larger icons:

- 📚 Books · 📑 Chapters · 📝 Word count · 🏷️ Terms · ⭐ Favorites

### Recently edited {#library-guide-section-10}

The same six-book selection as desktop, with tablet card sizing.

### Quick actions {#library-guide-section-11}

Add book, Import from website, Open library, and AI settings appear as a compact row below the cards.

---

## 📲 Mobile {#library-guide-section-12}

Single-column cards for narrow screens:

```
+----------------------+
|  Stat grid (2x2)     |
|  Books / Chapters    |
|  Words / Starred     |
+----------------------+
|  Recently edited     |
|  (single-column)     |
+----------------------+
|  Quick actions       |
|  + Add book          |
|  + Import from URL   |
+----------------------+
```

### Four statistics {#library-guide-section-13}

The terms metric is omitted to save space:

- 📚 Books · 📑 Chapters · 📝 Word count · ⭐ Favorites

### Recently edited {#library-guide-section-14}

The latest six books in one column, with cover thumbnails, titles, and authors. Typically two or three cards fit on a screen.

### Quick actions {#library-guide-section-15}

Two main actions:

- ➕ **Add book** (primary)
- 🌐 **Import from website** (outlined)

Use the system bar navigation or main menu drawer to reach Books, AI settings, or Settings.

> Physical mobile devices disable local embeddings to avoid WASM memory crashes. Translation, terms, characters, and memories remain available. Semantic memory selection falls back to keywords and recency; `query_chapter` is unavailable.

---

## 🔄 Backup and sync {#library-guide-section-16}

Home does not manage sync directly:

- **Manual backup**: **Settings → Import/export → Export data** produces `tsukuyomi-settings-YYYY-MM-DD.json`.
- **Gist sync**: configure the token and Gist ID under **Settings → Sync**. The system bar shows sync status; see [System bar and navigation](/help/toolbar-guide).

---

## 📚 Routes {#library-guide-section-17}

| Path                                              | Purpose                                     |
| :------------------------------------------------ | :------------------------------------------ |
| `/`                                               | Home (this guide)                           |
| `/books`                                          | Book library                                |
| `/books/:id`                                      | Book details, initially in translation mode |
| `/books/:id/settings/(terms\|characters\|memory)` | Corresponding book settings panel           |
| `/ai`                                             | AI models                                   |
| `/settings`                                       | Application settings                        |
| `/help/:docId?`                                   | Help                                        |

> Routes are shared by all devices; the dispatcher selects the desktop, tablet, or mobile template.

---

## ❓ Frequently asked questions {#library-guide-section-18}

**Q: What should I do if website import fails?**
A: Check the URL and network connection. On Web, configure **Settings → Proxies**. Open message history 🔔 to read the error details.

**Q: Can I export everything?**
A: Yes. **Settings → Import/export → Export data** includes AI models, books with chapter content, cover history, memories, sync configuration, and app settings.

**Q: Why hasn't the word count updated?**
A: It is calculated in the background. Wait for the progress bar after a large import.

**Q: Why is the desktop hero missing?**
A: There are no books yet. It appears after you add the first book.

**Q: Why do the metrics differ across layouts?**
A: All variants use the same stores and update timing. A difference usually indicates stale display data; navigate away and return.

---

## 📚 Related guides {#library-guide-section-19}

- [Book library](/help/books-page-guide)
- [Book details](/help/book-details-overview)
- [System bar](/help/toolbar-guide)
- [Settings](/help/settings-guide)
- [Local embeddings](/help/local-embedding)
