# 🛠️ System Bar and Navigation {#toolbar-guide-section-1}

Tsukuyomi adapts its system bar to each device while keeping the same core functions: **navigation, task center, sync, the Tsukuyomi assistant, and notifications**.

> Since v0.12.1, desktop uses a workspace with a left icon rail. Tablet/mobile retain compact status chips. Chapter task progress is shown in the "Tasks" task center in the top bar; the former right-panel "Translation progress" entry and the "AI thinking" entry are merged into it. The desktop right icon rail and the right-side rails on the tablet Books and book-details pages have been removed: the Tsukuyomi assistant opens from the top system bar, and embedding progress and actions are now in the task center's "Background · Embeddings" section.

---

## 🖥️ Desktop layout {#toolbar-guide-section-2}

Web desktop and Electron's forced desktop layout have four areas:

```
+------------------------------------------------------------------+
|  Sysbar (AppHeader): brand | Tasks | Sync || Tsukuyomi | Notify  |
+--------+------------------------------------------+--------------+
|        |                                          |              |
| Left   |          Workspace (route content)       | Tsukuyomi    |
| rail   |                                          | (when open)  |
|        |                                          |              |
+--------+------------------------------------------+--------------+
|  Footer (AppFooter): version | repo link                         |
+------------------------------------------------------------------+
```

The Tsukuyomi assistant panel on the right appears only while it is open; when it is closed, the workspace extends to the right edge of the window.

### 1) Top system bar (`AppHeader`) {#toolbar-guide-section-3}

From left to right:

- **Menu (`☰`)**: expand/collapse the left rail.
- **Brand**: logo, name, and Moonlit Translator subtitle.
- **Task center**:
  - A quiet "Tasks" icon when idle.
  - While chapter tasks run, it shows the running count and an overall progress bar. When items are also queued, it shows running and queued counts with a segmented bar (done / running / not started).
  - When only other AI activity, such as an assistant chat, is running, it shows "AI working" with a pulsing dot. While the queue is paused it shows "Paused · N queued". After a batch ends, it shows done and failed counts until you open the task center or clear finished items.
  - When a new task starts, the chip only flashes; the task center does not open by itself.
  - When only background embeddings are running, it also shows a pulsing dot; they do not count toward the running count or the progress bar. Nothing is shown while embeddings are paused or suspended for sync.
  - Click to open the task center. Chapter tasks are grouped into "Running" / "Queued" / "Finished". Click a task to see its details (thinking, tool calls, and output); stop, retry, drag to reorder, or pause and resume the queue. When local embeddings are enabled, a "Background · Embeddings" section comes next (see [Background embeddings](/help/toolbar-guide#toolbar-guide-section-10) below), and "Other AI activity" below it lists assistant chats, single-paragraph tasks, and similar items. The task center can be pinned as a floating panel that you can move and resize, or collapsed into a mini progress bar. See [Task queue and task center](/help/book-details-translation#book-details-translation-section-9).
- **Sync status**:

| State    | Display                 | Meaning                                                              |
| :------- | :---------------------- | :------------------------------------------------------------------- |
| Disabled | Cloud / Sync            | No Gist configuration or automatic sync disabled                     |
| Unsynced | Cloud / Not synced      | Local and remote state have not aligned                              |
| Synced   | Cloud check / countdown | Time until the next sync                                             |
| Pending  | Up arrow / N changes    | Books, models, covers, settings, memories, or deletions await upload |
| Syncing  | Spinner / Syncing       | Upload, download, or merge in progress                               |

Click to open the "Sync status" panel: "Last synced", "Next sync", the "Pending changes" list, and "Remote data" counts (books / AI models). While syncing, it shows an "Overall progress" percentage and bar; the percentage never goes backwards. The current stage appears under the bar: "Preparing local data" / "Downloading" / "Uploading" / "Applying" / "Merging" / "Saving sync state". The bottom of the panel has a "Sync" button; turning on "Force push local data to remote (replace remote)" changes it to "Force push to remote". The button is unavailable when Gist sync is disabled, a sync is running, or deleted items are being restored.

- **Tsukuyomi**: 💬, after the divider. Click to open or close the Tsukuyomi assistant panel on the right; the button is highlighted while the panel is open. On the AI import page, the import assistant chat is always shown, so the button stays highlighted and clicking it does not close the chat.
- **Message history**: 🔔 opens previous notifications. Unread counts above 99 show `99+`. Filter by error/warning/success/info, delete one or all messages, and undo supported actions.

When the window is narrow (Electron has no minimum window width), the system bar drops text in order: first the brand subtitle, then the sync countdown, and finally the button labels, leaving only icons (the task center shows just the running / queued counts). It never overflows horizontally.

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

### 3) Right assistant panel (`AppRightPanelDesktop`) {#toolbar-guide-section-5}

There is no longer a permanent icon rail on the right. Click the "Tsukuyomi" button in the top system bar to open the assistant panel: it docks on the right and narrows the workspace instead of covering content, and you can drag its left edge to resize it. The panel's close button, or clicking "Tsukuyomi" again, closes it; once closed, it takes up no width on the right.

- 💬 **Tsukuyomi**: chat sessions, messages, input, book/chapter/paragraph context, todos, and context usage.
- While the panel is closed, using "Copy source to assistant" or "Explain selected text" on a paragraph in the reader opens the panel automatically and fills in the input box.

> On the AI import page (`/import`), the right side always shows the import assistant chat and cannot be closed.

### 4) Footer (`AppFooter`) {#toolbar-guide-section-6}

Shows the version and GitHub link, including in Electron.

Since v0.16.1, packaged desktop releases also show an update badge:

- `latest` with a check: a completed check confirmed the latest version. Hidden before checking completes.
- `vX.X.X · NN%`: a new version is downloading.
- `vX.X.X available`: downloaded; click, confirm, and restart to update. Active work or incomplete saves can prevent restart.
- `updating…`: work/save checks and restart preparation.

See [Settings → About](/help/settings-guide).

### 5) Tsukuyomi desk companion {#toolbar-guide-desk-pet}

Desktop only (including Electron): a desk companion sits in the bottom-right corner of the page, shown with the existing Tsukuyomi avatar. While the task center or the assistant panel is closed, a speech bubble above the avatar shows the progress of translation, polishing, and proofreading tasks and of assistant replies. Everything comes from the tasks' own records, with no extra AI calls. Tablet and phone layouts don't show it.

- **Avatar states**: while tasks run, the ring turns light blue, breathes with a soft glow, and has a spinning arc; the avatar sways as it works, and the badge shows how many tasks are running. After a task ends and its summary hasn't been seen, the ring turns green, it hops every few seconds, and the badge shows ✓. If something failed, the ring turns red, it shakes its head, and the badge shows the failure count. When idle, it shrinks, dims, nods off, and lets out a "zzz"; hover over it to wake it up. With "reduce motion" turned on in your system, all animation stops and only the colors and badge remain.
- **Click the avatar**: in any state, clicking the avatar opens the assistant panel on the right so you can talk to Tsukuyomi.
- **Bubble content**: a title line with the chapter title and paragraph progress (or "Assistant"), then the latest activity, labeled "Thinking" (the end of the reasoning text), "Tool" (a short line, with the tool name and status in small text), or "Output" (the end of the translation or reply).
- **Collapse and expand**: click the arrow at the top-right of the bubble. Collapsed shows only the latest activity; expanded shows a log of the last 8 entries, with "Open task center" at the bottom and ‹ › to switch when several tasks are running. Your choice is remembered.
- **Which task it follows**: the assistant (while its panel is closed) comes first, then the chapter you're reading, then other chapters. It switches only when the current task ends; a task you pick stays selected until it ends.
- **Making way**: while the task center is open (or the pinned panel is expanded), chapter tasks aren't narrated. When Tsukuyomi is already on the right (the assistant panel is open, or you're on the import page), the companion hides, and comes back when you close the panel or leave the import page.
- **Summaries**: when a chapter task ends, the bubble shows `"Chapter N" translated` or the done and failed counts; when an assistant reply finishes, it shows "Reply ready" and the start of the reply. Click the summary to open the task center (or the assistant panel), or "Dismiss" to close it. Dismissing a chapter summary also clears the task center chip's done notice, and opening the task center counts as seeing it.
- **Idle**: with nothing running, it dozes in the corner; click it to open the assistant panel.

You can turn it off in **Settings → General → Desk companion**.

---

## 📱 Tablet layout {#toolbar-guide-section-7}

A compact system bar plus a left navigation rail. There is no vertical tool rail on the right; content extends to the right edge of the window:

```
+------------------------------------------------------------------+
|  TabletSysBar: [list] brand | Tasks | Sync || Tsukuyomi | Notify |
+------+-----------------------------------------------------------+
| Nav  |                                                           |
| rail |                 Workspace (route content)                 |
|      |                                                           |
+------+-----------------------------------------------------------+
```

### System bar {#toolbar-guide-section-8}

- **Left**: the book list toggle on the Books page or the contents toggle on book details (shown only on these two pages and taking no space elsewhere), followed by the brand and current version. In portrait, when space is tight, the brand text is truncated with an ellipsis.
- **Right**: task center and sync chips, then, after a divider, Tsukuyomi and notifications, with the same behavior as desktop in a more compact form; Tsukuyomi shows only its icon. The sync chip shows "Sync", "Syncing", "N changes", or "Synced". The task center can also be pinned as a floating panel.

### Navigation and assistant {#toolbar-guide-section-9}

- **Left navigation rail** (`TabletNavRail`): the logo returns home; main entries are Home / Library / AI import / AI models, with Help / Settings pinned at the bottom.
- **List / contents toggle** ("Collapse book list" / "Expand book list", "Collapse contents" / "Expand contents"): at the far left of the top system bar. In portrait, the list or contents opens as an overlay; tap outside to close it, and the button switches back to its collapsed state. In landscape, opening it narrows the content area.
- **Tsukuyomi**: available on every tablet page from the "Tsukuyomi" button in the top system bar. The panel slides in from the right; tap the mask or the button again to close it (the mask does not cover the top system bar). On the AI import page in landscape, the import assistant stays docked, so the button stays highlighted and does nothing; in portrait, the button opens and closes the import assistant, which slides in from the right.

### Background embeddings (task center) {#toolbar-guide-section-10}

Embeddings no longer have a separate button or drawer. When local embeddings are actually available, the task center shows a "Background · Embeddings" section above "Other AI activity", with the same content in all three layouts (the desktop/tablet popover and pinned panel, and the mobile bottom sheet). When local embeddings are off, the section does not appear.

- **Section header**: the total pending count and a "Pause embeddings" / "Resume embeddings" button. Click the title to collapse or expand the section (collapsed by default; the state is remembered). During cloud sync it shows "Syncing, will resume after", and the queue continues automatically when sync finishes; if you paused during sync, it stays paused afterward.
- **Queue line**: the kind and count being processed ("This book · Chapter ×N", or "Another book · …" with that book's title when another book is being processed) and the time left. When idle it shows "Queue idle" or "N pending".
- **Outdated vectors**: when a model version upgrade leaves old vectors, it shows "Outdated vectors: N chapters / N memories"; click "Rebuild" to queue them.
- **Book details**: the current book title, a "Backfill missing" button, and "Embedded X / Y" progress for "Chapter vectors" and "Memory vectors". The "⋯" menu has "Rebuild this book's chapter embeddings", "Test vector search", and "Embedding settings".
- **Other pages**: only the global queue status, with the hint "Open a book to backfill or rebuild its embeddings".

The model backend (WebGPU / WASM) and model version are shown in the "Embedding model" group under **Settings → Local embeddings**.

Availability is decided by the **device user agent** (`isMobileDevice()`), not window width: phones, tablets, and other mobile devices always have it disabled; a desktop browser narrowed to tablet or phone width can still use it after turning it on under **Settings → Local embeddings**. See [Local embeddings](/help/local-embedding).

---

## 📲 Mobile layout {#toolbar-guide-section-11}

A minimal system bar, full-width content, and a bottom tab bar:

```
+----------------------------------------+
|  MobileSysBar:                         |
|  logo | Tasks | Sync | 🔔 | Help       |
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
  - Task center (shows running and queued counts during tasks; opens as a bottom sheet, and tapping a task row opens full-screen details; it cannot be pinned or collapsed on mobile)
  - Sync ("Syncing", "N changes", or "Synced" when applicable)
  - Notifications
  - **Help**, a mobile-specific chip opening `/help`

> The main mobile navigation is the bottom tab bar: Home / Library / Tsukuyomi / AI models / Settings. Tsukuyomi opens as a bottom sheet; there is no left rail. Local embeddings (including semantic search in `query_chapter`) are gated by the device user agent and disabled on phones and other mobile devices to avoid WASM memory failures; a desktop browser narrowed to phone width is not affected.

---

## 🔁 Shared state across devices {#toolbar-guide-section-13}

All variants use the same `useSystemBar()` state:

- Pending books/models/covers/settings/memory/deletion changes
- Countdown until automatic sync
- Task center state (running/queued counts, overall progress, paused state)
- Unread notifications

Sync configuration, manual sync, queue pause, and message clearing update the system bars immediately.

---

## ❓ Frequently asked questions {#toolbar-guide-section-14}

**Q: Where is Batch summaries?**
A: Removed in v0.12. AI uses `query_chapter` for source retrieval without pre-generated summaries.

**Q: Where is Vector index?**
A: Embedding progress and actions are now in the "Background · Embeddings" section of the task center ("Tasks") in the top bar, which you can view from any page; backfilling, rebuilding, and test searches require opening the book first. Enable local embeddings under **Settings → Local embeddings** first; they cannot be enabled on mobile devices. See [Local embeddings](/help/local-embedding).

**Q: Where did the right icon rail go?**
A: It was removed. The Tsukuyomi assistant now opens from the "Tsukuyomi" button in the top system bar. On tablet, the book list toggle on the Books page and the contents toggle on book details moved to the far left of the top system bar.

**Q: Why does Syncing stay visible?**
A: Check the Gist configuration, network, and token permissions. Open message history for the error.

**Q: Where did the old "AI thinking" and "Translation progress" entries go?**
A: Both are merged into the task center ("Tasks") in the top bar. Click a chapter task there to see its progress, thinking, and output. Assistant chats, single-paragraph tasks, and similar items are under "Other AI activity" at the bottom of the task center.

**Q: Why is the task center empty?**
A: There may be no task records, or they were cleared. Any translation, polishing, or proofreading task appears here.

**Q: Why are embeddings disabled after enlarging a tablet window?**
A: Physical mobile platform detection does not change with window width. The restriction avoids WASM memory crashes.

---

## 📚 Related guides {#toolbar-guide-section-15}

- [Home](/help/library-guide)
- [Settings](/help/settings-guide)
- [Book details](/help/book-details-overview)
- [Local embeddings](/help/local-embedding)
- [Chat assistant](/help/chat-assistant-guide)
