# ⚙️ Settings Guide {#settings-guide-section-1}

This guide describes the settings available in the current version, organized by tab.

> Since v0.10.1, settings use the `/settings` route. Desktop/tablet show a Back button; mobile integrates settings into its bottom tabs.

---

## 📌 Open and close {#settings-guide-section-2}

- Open **Settings** in navigation or visit `/settings`.
- Use the upper-left Back button to return.
- The last selected tab is remembered.

---

## 🧭 Tabs {#settings-guide-section-3}

0. General
1. AI models
2. Proxy (Web only)
3. Website mappings
4. API keys
5. Sync
6. Local embeddings
7. Scraper
8. Import/export
9. About (since v0.13.0)

> Electron omits Proxy because it connects directly. Physical mobile devices disable local embeddings and gray out the controls.

---

## 🌐 General {#settings-guide-general}

**Interface language** offers Simplified Chinese, Traditional Chinese, and English. Without a saved preference, system languages are matched in order: Traditional script and Taiwan/Hong Kong/Macau use Traditional Chinese; Simplified script, mainland China, and Singapore use Simplified Chinese; English regions use English. Other languages fall back to Simplified Chinese.

A manual choice persists across restarts and is included in settings sync. A synced preference updates the interface immediately. Switching languages does not translate previous messages, user instructions, character descriptions, memories, historical release notes, or novels.

A new book takes the interface language as its target when actually created. Change an existing target under **Book details → Settings → Translation settings**. Running AI tasks retain their startup languages; new executions use the changed settings.

## 1) 🤖 AI models {#settings-guide-section-4}

Configure default task models.

### Default tasks {#settings-guide-section-5}

- Translation
- Proofreading/polishing
- Terminology translation
- Assistant

### Selection rules {#settings-guide-section-6}

- Selectors show only enabled models marked eligible for that task.
- Each task can be **Not set**.
- A selection is cleared if its model is later disabled or made ineligible.

---

## 2) 🌐 Proxy (Web only) {#settings-guide-section-7}

Configure the CORS proxy used for Web page access.

### Enable proxy {#settings-guide-section-8}

- **Enable proxy** makes scrapers and network tools prefer proxy access.

> Automatic cycling through the proxy list was removed. Failed requests use Firecrawl fallback instead; see API keys and Website mappings.

### Default proxy and URL {#settings-guide-section-9}

- Select a proxy service; CORS Tsukuyomi is the default.
- URLs support an `...{url}` template.
- Selecting a listed service locks the URL field to its value.

### Manage proxies {#settings-guide-section-10}

- Add a name, URL, and optional description.
- Edit or delete a proxy.
- Test against `https://www.duckduckgo.com`.
- Drag to reorder.

Other listed proxies are used only when selected as the default or assigned to a website mapping.

### Notes {#settings-guide-section-11}

- This tab appears only outside Electron.
- Some built-in sites still use app `/api/...` routes when proxy is off.
- Web AI model requests have their own default CORS proxy behavior; this Proxy URL does not directly control them.

---

## 3) 🗺️ Website mappings {#settings-guide-section-12}

Assign ordered fetch methods to a website. Available on Web and desktop.

### Fetch order {#settings-guide-section-13}

1. If Firecrawl is first in the mapping and fallback is enabled, fetch with Firecrawl directly.
2. Otherwise try mapped CORS proxies in order, or the default proxy without a mapping. With proxy off, use `/api/...` or direct access. Desktop always connects directly. Network errors, timeouts, 429, and 5xx receive one delayed retry.
3. If access is still blocked by 403, 429, 5xx, network errors, or an anti-bot page such as Cloudflare, use Firecrawl when enabled. A missing page such as 404 does not trigger fallback.

### Automatic mapping {#settings-guide-section-14}

- **Automatically add mapping when only Firecrawl works** puts Firecrawl first after a successful fallback, so future requests skip proxy attempts.
- Requires the Firecrawl fallback switch under API keys.
- This happens without a notification. Remove/reorder Firecrawl if proxy access becomes usable again.

### Manage mappings {#settings-guide-section-15}

- Enter a domain or URL, choose a CORS proxy or Firecrawl, and add it.
- Up to **three** entries per website; reorder or enable/disable in the edit dialog.
- Desktop marks CORS entries inactive because it connects directly. Firecrawl entries still apply.

---

## 4) 🔑 API keys {#settings-guide-section-16}

### Tavily search key {#settings-guide-section-17}

- Used for AI search/page reading in chat, import metadata, and translation/polishing/proofreading.
- Save to local settings. Clear and save to remove it.

### Firecrawl {#settings-guide-section-18}

- **Enable Firecrawl fallback** is on by default. It fetches blocked pages and supplies chat/import search and page reading when Tavily is absent or fails. URLs and search text are sent to Firecrawl.
- **API key** is optional. Without one, keyless mode has daily per-IP limits and credits; exact values are not published.
- Saving checks credits first; an invalid key is not saved.
- **Check credits** shows remaining/plan credits and the billing-period end for a saved key.
- When credits run out, batch import/update checking stops but keeps fetched chapters. Continue later or after adding credits.

---

## 5) 🔄 GitHub Gist sync {#settings-guide-section-19}

Configure and run Gist sync.

### Configuration {#settings-guide-section-20}

- Enable Gist sync
- GitHub username
- GitHub Personal Access Token
- Gist ID (optional; upload can create one)

> ⚠️ **Sync includes API keys**: model, Tavily, and Firecrawl keys are uploaded in plaintext. Created Gists are secret, but anyone with their URL can read them. Do not share the link. The GitHub token is not uploaded. Leave sync off if keys must stay on this device.

### Actions {#settings-guide-section-21}

- **Validate token**
- **Upload to Gist**
- **Download from Gist** (requires a Gist ID)

### Automatic sync {#settings-guide-section-22}

- Enable automatic sync if desired.
- Interval: **1–1440 minutes**.
- Conditional requests check for remote changes first. An unchanged response does not consume GitHub API quota, allowing shorter intervals.

### Incremental sync and concurrent changes {#settings-guide-section-23}

Since v0.10.1, sync uses a **manifest**:

- **Changed uploads only**: editing one book uploads that book and the manifest; unchanged books, models, covers, and memories are not resent.
- **Selective download**: only changed entries are parsed and merged.
- **Concurrency protection**: before upload, remote state is checked again. Concurrent writes trigger pull/merge and up to three retries, then an error asks you to try later.
- **Cross-device matching**: chapters with different local IDs can match by source `webUrl`. Volumes can match by source title while preserving translations, reducing duplicates.
- **Snapshot boundary**: edits after local packaging remain pending for the next sync; they are not treated as uploaded or remotely deleted.
- **Failed-entry retry**: download, parse, or application failures do not mark the entry synced. It is fetched again next time.
- **Deletion propagation**: manifest tombstones prevent another device from pushing deleted entries back.
- **Pending changes**: the header counts books, models, covers, settings, memories, and deletion records. Open the sync popover to inspect individual changes; memory tracking was completed in v0.11.1.

> If Gist file counts exceed the API's response limit, sync stops safely and asks you to remove redundant files or use a new Gist. It does not merge or delete using an incomplete listing.

### Chapter source and translation merge {#settings-guide-section-24}

Since v0.16.0, successful sync records a local paragraph-structure baseline:

- **One side changed structure**: with a baseline, use that side's source/order. A newly translated paragraph on the other side does not resurrect a deleted paragraph.
- **Translation merge**: merge versions only when source text is identical. A matching paragraph ID with different source does not receive translations of the old source.
- **Language isolation**: versions and selections merge separately by language. Title, term, character, and alias translation slots remain separate too. Clearing one slot preserves others. Unlabeled legacy data is Simplified Chinese.
- **Both changed structure**: use the newer chapter as primary, append unique paragraphs from the other side, and report affected books/chapters for review.
- **No baseline yet**: use the legacy newer-chapter rule and append unique paragraphs. Baselines develop after successful sync and stay local.

### 🔐 Sync credentials {#settings-guide-section-25}

- The GitHub token stays on the device.
- Initial, incremental, and force uploads strip it from the package.
- If validation fails after Gist creation, the created ID is still saved; retries do not create orphan Gists.

### 🧹 Force push {#settings-guide-section-26}

For remote corruption or device migration, replace remote visible data with local data:

- Enable **Force push** in Sync; off by default.
- The next upload rewrites the Gist using local visible content. It still reads and validates remote protocol and entity deletion metadata; read failures or future protocols prevent upload.
- Back up the receiving device first and temporarily stop other devices' automatic sync.

> Upgrade all devices using the same Gist before syncing. Legacy-layout migration reads and merges old data, then rewrites the new layout. If it fails, local data remains unchanged and the next sync retries.

### Multilingual protocol and entity deletion {#settings-guide-language-sync}

- The new manifest is **v4**, with a corresponding book entity protocol. Export a backup on every participating device, upgrade all clients, then sync one device at a time.
- Protocols 1–3 upgrade after successful migration. Future protocols stop writes. Older clients' ordinary sync cannot process v4. New code cannot remotely fix already released older force-push implementations: disable their sync or upgrade first, and do not force-push to the shared Gist.
- Terms, characters, and aliases use stable identities and logical field revisions. Renaming an alias retains its identity. Different language changes merge separately; conflicts on one field use deterministic logical versions, independent of device wall clocks.
- Entity deletion wins over late offline edits. Deletion records for entities within a book are retained indefinitely, including beyond 90 days offline. Deleting a character also prevents its old aliases from returning. Clearing a language translation clears only that slot.
- Explicit undo, backup/revision replacement, and force-push restoration create new identities when required, retain known deletion records, and rebuild affected references. The visible snapshot is restored without letting deleted old identities replace restored entries later.
- Full backups retain targets, all language results, and deletion records. Device sync identity is not cloned onto another device.

### Revision history {#settings-guide-section-27}

With sync enabled and a Gist ID:

- Refresh revisions
- Expand a revision's file changes
- Restore a revision

> Since v0.11.1, restoration supports the manifest layout fully, including models, cover history, and memories. Older aggregate revisions use the legacy parser.

A local backup with chapter source and translations is created first. Failure to read any required entry aborts restoration and preserves current data. Application failure rolls back independently stored chapter content as well as metadata.

### Delete Gist {#settings-guide-section-28}

- **Delete current Gist** requires confirmation.

### Restore and replacement behavior {#settings-guide-section-29}

- **Revision restore**: clear local books, models, and covers, then apply the full remote snapshot.
- **Accidental local deletion**: with sync and cloud backup available, deleted-item handling may offer restoration before the next sync.
- **Prevent repeat deletion**: restored top-level entries refresh sync timestamps and clear their corresponding top-level tombstones. Book entity deletion records follow the new-identity rules above.
- The dialog handles books, model settings, covers, and memories, and can replace the current deletion decision to protect restored data.

---

## 6) 🧬 Local embeddings {#settings-guide-section-30}

Local vectors support semantic memory search and `query_chapter`. See [Local embeddings](/help/local-embedding) for operation and troubleshooting.

### Main switch {#settings-guide-section-31}

- **Enable local embeddings** is off by default. Enabling downloads the model as needed and builds vectors in the background.
- Disabling stops the queue, hides related UI, removes `query_chapter`, and removes its prompt guidance.
- Physical mobile devices lock the switch off to avoid WASM memory crashes.

### Model and backend {#settings-guide-section-32}

- Default: `onnx-community/gte-multilingual-base`, a 305M multilingual BERT encoder with full 768-dimensional L2-normalized vectors and CLS pooling. Browser Cache Storage retains downloaded weights for offline startup.
- Automatic backend order:
  - **WebGPU + q4f16**, about 465 MB and 5–10× faster on supporting desktop Chrome/Edge.
  - **WASM + int8**, about 340 MB, when WebGPU is unavailable or fails. WebGPU is not retried during the session.
- Version: `gte-multilingual-base@768@cls@raw` since v0.14.3. Model, dimensions, pooling, or input changes bump the version; stale vectors are recomputed.
- Automatic warmup requires embeddings enabled and an already cached model. The first download takes time.

### Memory injection {#settings-guide-section-33}

- Minimum relevance: default **0.30**; lower-scoring memories are omitted.
- Character budget: default **2000** per injection.
- Inspect score distributions and test retrieval in the panel.

### Local vector index dialog {#settings-guide-section-34}

- Chapter/memory counts per book: embedded, total, and stale.
- Batch recomputation, individual book rebuild, and test queries showing the most similar chapters.
- Queue progress with pause/resume. Sync temporarily suspends the queue and resumes afterward without overriding a user's manual pause.

---

## 7) 🕷️ Scraper {#settings-guide-section-35}

- **Concurrency limit: 1–10**.
- Recommended: **3**.
- Controls simultaneous scraper requests.

---

## 8) 💾 Import/export {#settings-guide-section-36}

### Export data {#settings-guide-section-37}

File: `tsukuyomi-settings-YYYY-MM-DD.json`.

Includes:

- AI models
- Books with chapter content
- Cover history
- Memories
- Sync configuration
- Application settings

### Import data {#settings-guide-section-38}

Accepts `.json` or `.txt` containing valid JSON.

Current behavior:

- Models, books, and covers: each collection is cleared before import when its data is present.
- Memories: created per book, without first clearing the entire memory store.
- Settings: processed by the settings importer.
- Sync configuration: replaces current configuration when present.

> Import does not provide fine-grained field selection. Export a backup first.

---

## 9) ℹ️ About {#settings-guide-section-39}

Shows:

- Logo and application subtitle
- Version including build number
- Author link (Rozx)
- GitHub repository

> This tab is for identifying the application/version and has no editable settings.

### Desktop updates (since v0.16.1) {#settings-guide-section-40}

Available in packaged desktop releases. Web and development mode omit updates or show that they are unavailable.

- **Automatic checks**: once 30 seconds after startup, then every six hours. New stable versions download in the background; About shows the version and progress.
- **Check for updates**: available while idle. Disabled during checking/downloading/restart preparation; after download it becomes Restart and update. Failed checks show a reason and allow retry.
- **Restart and update**: confirm to exit, install, and restart. Library/settings retain their data location.
- **View releases**: open GitHub for manual downloads.
- Leaving and returning shows current status rather than restarting the process.

Installation requires confirmation; ordinary closing or the next launch does not install automatically. Restart is refused, with the package retained, when:

- Translation, import, sync, or book operations are active.
- Saves are incomplete.
- New work starts during the save check; that work still completes and saves normally, while restart preparation fails.

> Desktop v0.16.0 and earlier require one manual download of v0.16.1. Windows uses a portable ZIP; retain the entire extracted folder. macOS is not Apple-notarized; if blocked on first launch, use System Settings → Privacy & Security → Open Anyway.

---

## ❓ Frequently asked questions {#settings-guide-section-41}

### Why is Proxy absent on desktop? {#settings-guide-section-42}

Desktop connects directly, with Firecrawl fallback for blocked pages. Website mappings remain available.

### What if a website repeatedly fails, for example with 403? {#settings-guide-section-43}

Enable Firecrawl fallback under API keys. Keyless mode has daily limits; for large imports configure a key and check credits.

### Why are OpenAI/Gemini keys absent here? {#settings-guide-section-44}

Set them in each model's edit dialog under AI models.

### What if imported data is unexpected? {#settings-guide-section-45}

Check the file structure and content. Always export current data first.

### Why is Download disabled while sync is available? {#settings-guide-section-46}

Usually the Gist ID is missing or sync is in progress.

---

## 📚 Related guides {#settings-guide-section-47}

- [AI models](/help/ai-models-guide)
- [Chat assistant](/help/chat-assistant-guide)
- [System bar](/help/toolbar-guide)
- [Book library](/help/books-page-guide)
