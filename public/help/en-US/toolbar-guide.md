# 🛠️ System Bar and Navigation {#toolbar-guide-section-1}

Tsukuyomi adapts its system bar to each device while keeping the same core functions: **navigation, AI thinking, sync, notifications, and right panels**.

> Since v0.12.1, desktop uses a workspace with icon rails and separate chat/progress panels. Batch embeddings moved from the top bar to the right rail. Tablet/mobile retain compact status chips.

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
  - ✨ when idle.
  - A status pill and animated dots while thinking or processing.
  - Opens the thinking panel: active model/type/status/time, reasoning messages, ten recently completed tasks, stop, and clear.
- **Sync status**:

| State    | Display                 | Meaning                                                              |
| :------- | :---------------------- | :------------------------------------------------------------------- |
| Disabled | Cloud / Sync            | No Gist configuration or automatic sync disabled                     |
| Unsynced | Cloud / Unsynced        | Local and remote state have not aligned                              |
| Synced   | Cloud check / countdown | Time until the next sync                                             |
| Pending  | Up arrow / N changes    | Books, models, covers, settings, memories, or deletions await upload |
| Syncing  | Spinner                 | Upload, download, or merge in progress                               |

Open the sync panel for upload/download/details, last and next sync times, remote statistics, and stage progress. Download is unavailable when disabled, already syncing, or missing a Gist ID.

- **Message history**: 🔔 opens previous notifications. Unread counts above 99 show `99+`. Filter by error/warning/success/info, delete one or all messages, and undo supported actions.

> Batch chapter summaries were removed in v0.12. `query_chapter` now retrieves source text when needed.

### 2) Left rail (`AppSideMenu`) {#toolbar-guide-section-4}

The narrow rail displays icons; hover or choose `☰` to expand.

Main navigation:

- 🏠 **Home** — `/`
- 📚 **Books** — `/books`
- ✨ **AI models** — `/ai`

Bottom navigation:

- ⚙️ **Settings** — `/settings`
- ❓ **Help** — `/help`

### 3) Right rail (`AppRightPanelDesktop`) {#toolbar-guide-section-5}

A resizable panel with rail entries:

- 💬 **Tsukuyomi**: chat sessions, messages, input, book/chapter/paragraph context, todos, and context usage.
- 📊 **Translation progress**: translation/polishing/proofreading progress. A badge counts active tasks; a new task activates its panel and can be canceled there.
- 🧬 **Vector index**, only in book details: chapter/memory counts, stale entries, batch rebuild, test query, pause/resume. Requires local embeddings; see [Local embeddings](/help/local-embedding).

> Selecting an entry activates that panel. Inactive panels do not mount their watchers.

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

A compact system bar:

```
+--------------------------------------------------------+
|  TabletSysBar: brand | version | AI | Sync | Notify    |
+--------------------------------------------------------+
|                                                        |
|              Workspace (route content)                 |
|                                                        |
+--------------------------------------------------------+
```

### System bar {#toolbar-guide-section-8}

- **Left**: brand and version.
- **Right**: AI thinking, sync, and message history chips, with shorter labels and the same behavior as desktop.

### Navigation and right panel {#toolbar-guide-section-9}

- The menu icon opens a Quasar drawer with Home, Books, AI, Settings, and Help.
- Separate chat/progress controls open the right panel as needed. Behavior matches desktop without an icon rail.

### Local embedding access {#toolbar-guide-section-10}

Tablet has no dedicated Vector index button. A physical mobile device disables embeddings by platform detection. A desktop browser resized to tablet width can enable them under Settings, but the batch drawer renders only in desktop layout.

---

## 📲 Mobile layout {#toolbar-guide-section-11}

A minimal system bar and full-width content:

```
+----------------------------------+
|  MobileSysBar:                   |
|  logo | AI | Sync | Help         |
+----------------------------------+
|                                  |
|     Route content (full width)   |
|                                  |
+----------------------------------+
```

### System bar {#toolbar-guide-section-12}

- **Left**: logo, name, and version.
- **Right**:
  - AI thinking
  - Sync
  - Message history
  - **Help**, a mobile-specific chip opening `/help`

> Mobile navigation uses Home shortcuts, drawers, and routes, without a left rail. Local embeddings and `query_chapter` are unavailable on mobile devices to avoid WASM memory failures.

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
A: It appears only on `/books/:id` and subroutes when local embeddings are enabled. See [Local embeddings](/help/local-embedding).

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
