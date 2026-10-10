# 🛠️ System Bar and Navigation {#toolbar-guide-section-1}

Tsukuyomi adapts its system bar to each device while keeping the same core functions: **navigation, AI thinking, sync, notifications, right panels, and the vector index**.

> Since v0.12.1, desktop uses a workspace with icon rails and separate chat/progress panels. Tablet/mobile retain compact status chips. The Vector index entry is available in all three layouts: the desktop right rail, the tablet book-details side rail, and the mobile top system bar.

---

## 🖥️ Desktop layout {#toolbar-guide-section-2}

Web desktop and Electron's forced desktop layout have four areas:

```
+------------------------------------------------------------+
|  Sysbar (AppHeader): brand | AI | Sync | Notifications     |
+--------+------------------------------------------+--------+
|        |                                          |        |
| Left   |          Workspace (route content)       | Right  |
| rail   |                                          | rail   |
|        |                                          |        |
+--------+------------------------------------------+--------+
|  Footer (AppFooter): version | repo link                   |
+------------------------------------------------------------+
```

### 1) Top system bar (`AppHeader`) {#toolbar-guide-section-3}

From left to right:

- **Menu (`☰`)**: expand/collapse the left rail.
- **Brand**: logo, name, and Moonlit Translator subtitle.
- **AI thinking**:
  - ✨ with "AI thinking" when idle.
  - A status pill with "AI Thinking" or "AI Processing" and a pulsing dot while a task runs.
  - Opens the thinking panel: active model/type/status/time, reasoning messages, ten recently completed tasks, stop, and clear.
- **Sync status**:

| State    | Display                 | Meaning                                                              |
| :------- | :---------------------- | :------------------------------------------------------------------- |
| Disabled | Cloud / Sync            | No Gist configuration or automatic sync disabled                     |
| Unsynced | Cloud / Not synced      | Local and remote state have not aligned                              |
| Synced   | Cloud check / countdown | Time until the next sync                                             |
| Pending  | Up arrow / N changes    | Books, models, covers, settings, memories, or deletions await upload |
| Syncing  | Spinner / Syncing       | Upload, download, or merge in progress                               |

Click to open the "Sync status" panel: "Last synced", "Next sync", the "Pending changes" list, and "Remote data" counts (books / AI models). While syncing, it shows an "Overall progress" percentage and bar; the percentage never goes backwards. The current stage appears under the bar: "Preparing local data" / "Downloading" / "Uploading" / "Applying" / "Merging" / "Saving sync state". The bottom of the panel has a "Sync" button; turning on "Force push local data to remote (replace remote)" changes it to "Force push to remote". The button is unavailable when Gist sync is disabled, a sync is running, or deleted items are being restored.

- **Message history**: 🔔 opens previous notifications. Unread counts above 99 show `99+`. Filter by error/warning/success/info, delete one or all messages, and undo supported actions.

> Batch chapter summaries were removed in v0.12. `query_chapter` now retrieves source text when needed.

### 2) Left rail (`AppSideMenu`) {#toolbar-guide-section-4}

The narrow rail displays icons; choose `☰` to expand it into a full menu that also shows the "Navigation" group and the "Favorite books" list.

Main navigation:

- 🏠 **Home** — `/`
- 📚 **Books** — `/books`
- 📥 **AI import** — `/import`
- ✨ **AI models** — `/ai`

Bottom navigation:

- ⚙️ **Settings** — `/settings`
- ❓ **Help** — `/help`

### 3) Right rail (`AppRightPanelDesktop`) {#toolbar-guide-section-5}

When collapsed, the right side is an icon rail. Selecting an entry expands its panel (drag to resize); the panel's close button folds it back into the rail. Rail entries:

- 💬 **Tsukuyomi**: chat sessions, messages, input, book/chapter/paragraph context, todos, and context usage.
- 📊 **Translation progress**: translation/polishing/proofreading progress. A badge counts active tasks; a new task activates its panel and can be canceled there.
- ⚡ **Vector index**, only in book details when local embeddings are actually available: opens the "Local vector index" panel. See [Local embedding access](/help/toolbar-guide#toolbar-guide-section-10) below.

> Selecting an entry activates that panel. Inactive panels do not mount their watchers. On the AI import page (`/import`), the right side always shows the import assistant chat.

### 4) Footer (`AppFooter`) {#toolbar-guide-section-6}

Shows the version and GitHub link, including in Electron.

Since v0.16.1, packaged desktop releases also show an update badge:

- `latest` with a check: a completed check confirmed the latest version. Hidden before checking completes.
- `vX.X.X · NN%`: a new version is downloading.
- `vX.X.X available`: downloaded; click, confirm, and restart to update. Active work or incomplete saves can prevent restart.
- `updating…`: work/save checks and restart preparation.

See [Settings → About](/help/settings-guide).

---

## 📱 Tablet layout {#toolbar-guide-section-7}

A compact system bar plus a left navigation rail; the Books and book-details pages also have a vertical tool rail on the right:

```
+--------------------------------------------------------+
|  TabletSysBar: brand | version | AI | Sync | Notify    |
+------+------------------------------------------+------+
| Nav  |                                          | Side |
| rail |        Workspace (route content)         | rail |
|      |                                          |      |
+------+------------------------------------------+------+
```

### System bar {#toolbar-guide-section-8}

- **Left**: brand and current version.
- **Right**: AI thinking, sync, and notification chips, with the same behavior as desktop in a more compact form: "AI thinking" when idle, "AI is thinking" during a task; the sync chip shows "Sync", "Syncing", "N changes", or "Synced".

### Navigation and right panel {#toolbar-guide-section-9}

- **Left navigation rail** (`TabletNavRail`): the logo returns home; main entries are Home / Library / AI import / AI models, with Help / Settings pinned at the bottom.
- **Right tool rail** (`TabletSideRail`, on Books and book details): list/contents toggle, Tsukuyomi, and Translation progress (with a task badge). Book details also shows the Vector index button when local embeddings are available.
- Tsukuyomi and Translation progress slide in from the right as overlay panels; tap the mask to close. Behavior matches desktop.

### Local embedding access {#toolbar-guide-section-10}

The Vector index button exists in all three layouts and appears only on **book details** (`/books/:id` and subroutes) when local embeddings are **actually available**:

- Desktop: the right icon rail (⚡).
- Tablet: the book-details right tool rail.
- Mobile: the leftmost chip in the top system bar.

It opens the "Local vector index" panel. The panel is mounted once in the main layout: a right drawer on desktop and tablet, a bottom sheet on mobile. It stays open across breakpoint changes and closes automatically when you switch to another book or local embeddings become unavailable. Panel contents:

- Status: "Ready" / "Loading model" / "Could not load" / "Not ready" / "Disabled".
- "Chapter vectors": "Embedded X / Y", pending count, and progress bar, with "Fill missing" and "Rebuild all".
- "Memory vectors": the same progress display, with "Fill missing".
- When old vectors are detected, an "Embedding space upgraded" banner offers "Rebuild now".
- "Test vector search": search this book's chapters or memories in natural language.
- The footer shows the model, backend, and queue status, with "Pause" / "Resume" for the embedding queue.

Availability is decided by the **device user agent** (`isMobileDevice()`), not window width: phones, tablets, and other mobile devices always have it disabled; a desktop browser narrowed to tablet or phone width can still use it after turning it on under **Settings → Local embeddings**. See [Local embeddings](/help/local-embedding).

---

## 📲 Mobile layout {#toolbar-guide-section-11}

A minimal system bar, full-width content, and a bottom tab bar:

```
+----------------------------------------+
|  MobileSysBar:                         |
|  logo | Vectors | AI | Sync | 🔔 | Help |
+----------------------------------------+
|                                        |
|      Route content (full width)        |
|                                        |
+----------------------------------------+
|  MobileTabBar: Home | Library | Chat   |
|                AI | Settings           |
+----------------------------------------+
```

### System bar {#toolbar-guide-section-12}

- **Left**: logo, name, and version.
- **Right**:
  - **Vector index** (⚡, only on book details when local embeddings are available; opens a bottom sheet)
  - AI thinking ("AI is thinking" during a task)
  - Sync ("Syncing", "N changes", or "Synced" when applicable)
  - Notifications
  - **Help**, a mobile-specific chip opening `/help`

> The main mobile navigation is the bottom tab bar: Home / Library / Tsukuyomi / AI models / Settings. Tsukuyomi and Translation progress open as bottom sheets; there is no left rail. Local embeddings (including semantic search in `query_chapter`) are gated by the device user agent and disabled on phones and other mobile devices to avoid WASM memory failures; a desktop browser narrowed to phone width is not affected.

---

## 🔁 Shared state across devices {#toolbar-guide-section-13}

All variants use the same `useSystemBar()` state:

- Pending books/models/covers/settings/memory/deletion changes
- Countdown until automatic sync
- Current AI task state
- Unread notifications

Sync configuration, manual sync, queue pause, and message clearing update the system bars immediately.

---

## ❓ Frequently asked questions {#toolbar-guide-section-14}

**Q: Where is Batch summaries?**
A: Removed in v0.12. AI uses `query_chapter` for source retrieval without pre-generated summaries.

**Q: Where is Vector index?**
A: It appears only on `/books/:id` and subroutes when local embeddings are actually available: in the desktop right rail, the tablet book-details tool rail, or the mobile top system bar. Enable it under **Settings → Local embeddings** first; it cannot be enabled on mobile devices. See [Local embeddings](/help/local-embedding).

**Q: Why does Syncing stay visible?**
A: Check the Gist configuration, network, and token permissions. Open message history for the error.

**Q: Why is the AI thinking panel empty?**
A: There may be no records, or they were cleared. Translation, polishing, and proofreading create records.

**Q: Why are embeddings disabled after enlarging a tablet window?**
A: Physical mobile platform detection does not change with window width. The restriction avoids WASM memory crashes.

---

## 📚 Related guides {#toolbar-guide-section-15}

- [Home](/help/library-guide)
- [Settings](/help/settings-guide)
- [Book details](/help/book-details-overview)
- [Local embeddings](/help/local-embedding)
- [Chat assistant](/help/chat-assistant-guide)
