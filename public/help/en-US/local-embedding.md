# 🧬 Local Embeddings {#local-embedding-section-1}

Local embeddings are Tsukuyomi's **offline semantic retrieval engine**. A browser model turns memories and chapters into vectors so AI can find context by meaning rather than keywords. Vector computation stays on the device and consumes no AI API usage. Vectors are **local device state**: Gist sync uploads memory content but not vectors, so each device builds its own. Context selected for AI still goes to the configured model provider; see the privacy notes below.

> This guide is for users who want to understand or troubleshoot local embeddings. For controls, see [Settings → Local embeddings](/help/settings-guide#settings-guide-section-30). For memory workflows, see [Story memories](/help/book-details-memory).

---

## 1. Capabilities {#local-embedding-section-2}

When enabled, background indexing covers:

- **Memories**: summary and content are split at paragraph/sentence boundaries into segments of at most 1200 characters and robustly aggregated, avoiding semantic drift from truncating long memories. Semantic similarity supplies the 0.85-weight component of relevance scoring during translation. AI can also call `search_memories` with natural-language queries.
- **Chapters**: paragraphs form chunks targeting 100 characters; title plus first paragraph has its own chunk. `query_chapter` retrieves relevant passages in natural language without pre-generated summaries.

Chapter semantic vectors consistently encode the source text so translated and untranslated chapters remain comparable; the target translation is used only when source text is missing. Keyword search, previews, and full-text indexes retain the source and the selected translation for the current target. Caches validate the target language and actual input signature, including translation changes that affect keywords and previews. A target change invalidates caches for background rebuild; old computations cannot overwrite the new cache. Retrieval may report rebuilding. Name expansion uses originals and current-target term/character/alias translations, never another language. Shared memories and memory vectors are retained across target changes.

For vague plot queries, a small set of candidates is reranked using source paragraphs so surrounding text does not obscure the relevant event. Queries with a clear match retain the full chunk context, and repeated queries reuse cached vectors. If reranking fails, the original ranking is retained. All computation stays in the browser and adds no AI API requests.

When disabled:

- Relevance falls back to keyword/recency weights of 0.75/0.25. Similar meaning expressed differently may be missed.
- `query_chapter` and its prompt guidance are removed.
- The "Vector index" entry is hidden and any open panel closes.

---

## 2. Model and execution {#local-embedding-section-3}

### Default model {#local-embedding-section-4}

- **Model**: `hotchpotch/bekko-embedding-v1-a25m`, the Bekko a25m multilingual encoder.
- **Architecture**: about 123M total parameters and 25M active parameters, supporting 100+ languages including Chinese, Japanese, and English.
- **Dimensions**: full **384**, L2-normalized.
- **Pooling**: mean pooling over valid tokens. Query and document use the same encoding path without task prefixes.
- **Default artifact**: official `onnx/model.onnx`, about **190 MiB**. The static vocabulary table is int8-compressed while Transformer computation remains fp32. `dtype: fp32` selects this compact artifact, not a full fp32 vocabulary table.
- **Version**: `bekko-embedding-v1-a25m@384@mean@raw`. Changes to model ID, dimensions, pooling, or input scheme update the version; old memory and chapter vectors become stale and must be recomputed (see section 5).

> **Upgrading from GTE**: users who previously used the GTE model must download the Bekko model, and all existing vectors must be rebuilt. Until the model finishes downloading, memory scoring uses keywords and time decay. Once the model is ready, an old memory whose vector has not been rebuilt switches to keyword + time-decay scoring on its own when its raw keyword confidence is at least 0.8, so it can still be auto-injected or found by `search_memories`; partial matches are not recalled. Chapter semantic search is unavailable until rebuilt. Opening a book's details page rebuilds that book's vectors automatically, so rebuild soon after upgrading.

### Backends {#local-embedding-section-5}

Model loading, tokenization, and inference run in a dedicated browser Web Worker, off the page's main thread, so the interface does not freeze during download or inference. Everything still runs locally without a server. WASM uses one thread inside the Worker and does not require cross-origin isolation. The Worker first checks for an available WebGPU adapter and device. If none is available, it loads WASM directly; if WebGPU initialization fails, it also falls back to WASM automatically. Both backends use the same default artifact.

| Backend    | Artifact and computation                         | Size     | Use                                                    |
| :--------- | :----------------------------------------------- | :------- | :----------------------------------------------------- |
| **WebGPU** | Default ONNX; int8 vocabulary / fp32 Transformer | ~190 MiB | Desktop browsers with WebGPU support                   |
| **WASM**   | The same default ONNX artifact                   | ~190 MiB | Browsers without an available WebGPU adapter or device |

> An unavailable adapter selects WASM for the session. Clicking "Reload" in settings checks WebGPU again. Actual inference speed depends on hardware, input length, and backend.

### Mobile restriction {#local-embedding-section-6}

When Quasar detects a physical mobile device, the "Enable local embeddings" switch is **locked** off. The "Local embeddings" settings tab is still visible, but the switch is grayed out and the reason is shown. Browser WASM memory limits, typically around 2 GB, make loading the model and running several inference chunks prone to crashes. Keyword and recency retrieval remain available. Because vectors are not synced, vectors built on a desktop do not appear on a phone.

This check uses the device type, not the window width: narrowing a desktop browser window does not count as a mobile device.

---

## 3. Enable embeddings {#local-embedding-section-7}

1. Open **Settings → Local embeddings**.
2. Turn on "Enable local embeddings". If the browser has not cached the model yet, the download **starts immediately** (about 190 MiB, the same for WebGPU and WASM) with no confirmation popup. If the status later shows "Not loaded", you can also click "Download model" to start manually. **Keep a stable connection and the window in the foreground.**
3. During the download, the settings card shows "Model loading progress" with a percentage, followed by the current phase: "Preparing model files…" → "Downloading model files…" → "Initializing model…".
4. Browser Cache Storage retains the model, so **later launches warm it up automatically without downloading again**.
5. Once the status shows "Ready", continue to the next step.
6. Open any book and click the "Vector index" entry (see section 4) to inspect or build that book's chapter and memory vectors.

About the progress display:

- The percentage counts only bytes of `.onnx` weight files, so finishing config or tokenizer files does not inflate it.
- While the total weight size is unknown, the bar is indeterminate (animated); it switches to a percentage once the size is known.
- The download phase tops out at 95%, leaving the rest for model initialization. When initialization finishes, the progress block collapses and the status becomes "Ready".
- Progress never goes backwards: automatic retries and the WebGPU → WASM fallback keep the value already shown.
- Leaving and reopening the settings page restores the current loading progress.

---

## 4. Vector index panel {#local-embedding-section-8}

The "Vector index" entry appears only on **book details pages** while local embeddings are effectively enabled; it is hidden when local embeddings are off or on a physical mobile device. Its position follows the layout:

- Desktop layout: the right tool rail.
- Tablet layout: the right side rail.
- Narrow layouts: the top system bar.

Availability follows the effective local embeddings setting, independently of layout breakpoints, so narrowing a desktop browser keeps it usable. Desktop and tablet layouts open a right-side drawer; the mobile layout opens the same bottom sheet as the assistant and translation progress. An open panel stays open when the layout changes and closes when you switch to another book.

The panel is titled "Local vector index" with the subtitle "Runs locally in your browser", followed by the current book title and chapter count.

### Status and counts {#local-embedding-section-9}

- **Status pill**: at the right of the title bar, showing Ready / Loading model / Could not load / Not ready / Disabled.
- **"Chapter vectors"**: shows "Embedded X / Y" (X counts chapters embedded with the current model version), a progress bar, and "Pending: N" (chapters waiting in the embedding queue; the queue is shared across books, so this can include other books' tasks).
- **"Memory vectors"**: likewise shows "Embedded X / Y", a progress bar, and "Pending: N".
- **Bottom status block**: model version, backend (WebGPU or "WASM (slow)"), and current status.

When stale (version-mismatched) vectors exist, an "Embedding space upgraded" banner appears at the top of the panel, listing the outdated chapter and memory counts, with a "Rebuild now" button. Stale vectors are not counted as embedded, so totals may drop noticeably after an upgrade.

> Stale records are **not** recomputed automatically for every book. Missing and stale chapters and memories are queued automatically only for a book whose details page is opened while the model is ready (or when the model finishes loading while that page is open). For other books, open them to trigger this, or click "Rebuild now" / "Fill missing" in the panel.

### Actions {#local-embedding-section-10}

- **Chapters**: "Fill missing" queues this book's unembedded or stale chapters; "Rebuild all" queues every chapter in the book for recomputation.
- **Memories**: "Fill missing" queues this book's unembedded or stale memories.
- **"Rebuild now"**: appears only in the stale banner and queues this book's stale chapters and memories at once.
- These buttons are available only while the model is "Ready" and the queue is idle, avoiding conflicts with a running rebuild.
- **"Test vector search"**: opens the query dialog (see below).
- **"Pause" / "Resume"**: appear in the bottom status block only while the queue is running or paused, to suspend or continue it manually.

**Test vector search dialog**: the intro reads "Describe a scene, character relationship, or keyword to search this book’s chapters and memories." Enter a query, then click "Query chapters" or "Query memories" (Enter runs a chapter query; memory queries match current-model vectors, and memories without a usable vector can also appear on a strong keyword match).

- Before a search, the dialog shows a "Find scenes and memories" prompt.
- While a search runs, a loading state appears.
- Results are ranked by relevance, each with its rank number and score (hover tooltip "Relevance"). Select a chapter result to open the chapter, or a memory result to view its details.
- This helps tune settings or investigate why a memory was not injected.

### Progress and current task {#local-embedding-section-11}

While the queue runs, progress appears inside each section; there is no separate banner at the top of the panel:

- "Chapter vectors" and "Memory vectors" each show "Pending: N", plus an ETA (based on the latest five batch durations) while items are pending.
- The current task card shows what the queue is processing: "This book · {kind} ×{count}" for this book, or, highlighted, "Another book · {kind} ×{count}" with that book's **title**, so you can see where the queue is busy even from another book's panel.

Background memory and chapter inference uses groups of at most four inputs, split by length to reduce padding overhead. Interactive queries and paragraph reranking use groups of at most eight and take priority over waiting background jobs. Pauses between background batches reduce sustained CPU / GPU use, so whole-book rebuilds may take longer. Chapters can pause between batches; unfinished chapters remain queued and restart on resume, with results saved only after the whole chapter finishes. Panel statistics are read while the drawer is open, with updates from the same batch combined.

---

## 5. Versions and stale vectors {#local-embedding-section-12}

`MODEL_ID + dimensions + pooling + input scheme` together define the embedding space. Changing any of them puts old and new vectors in different spaces, makes cosine scores meaningless, and requires recomputation.

`MODEL_VERSION` records the current space and is stored on each embedded memory/chunk. Shared `isMemoryEmbeddingStale` / `isChapterChunkStale` checks classify:

- **Current**: eligible for semantic retrieval and counted as embedded.
- **Stale**: semantic scoring is skipped, and backfill scanning queues a rebuild. While the model is ready, other memories are still scored in semantic mode. A stale record (or a new memory not yet embedded) switches to keyword 0.75 + time decay 0.25 when its raw keyword confidence is at least 0.8; otherwise it keeps only the small semantic-mode weights and misses the injection threshold.

**A model upgrade does not lose data**: old records and memory content are kept, and until rebuilt only memories with strong keyword matches are retrieved or injected; after rebuilding, full capability returns.

While local embeddings are enabled, startup removes **old model caches** such as `embeddinggemma` and `qwen3-embedding` from browser Cache Storage to reclaim disk space. The old GTE model cache (about 340–465 MB) is **intentionally kept** for now and not deleted automatically; to reclaim that space, clear this site's data in the browser (the current model then needs to be downloaded again).

---

## 6. Sync suspension {#local-embedding-section-13}

Cloud sync and revision restoration temporarily suspend the queue through a **dedicated gate**:

- Either `isSyncing` or `isRestoringSyncSnapshot` closes the gate.
- Reopening resumes **only** work suspended by the gate, preserving a manual "Pause".
- A batch still running inference when the gate closes is not written: memory and chapter work goes back to the queue and is recomputed from the synced content once the gate opens.
- This avoids vector writes racing `overwriteFromSnapshot` or indexing partially restored data.

In the UI: the panel has no dedicated sync message. During sync the queue is paused, so the bottom status block shows "Resume", but the button is disabled so vectors are not written mid-sync. When sync finishes, the queue continues automatically without a click; if you clicked "Pause" during sync, the queue stays paused afterwards.

---

## 7. Troubleshooting {#local-embedding-section-14}

### Download stays at 0% {#local-embedding-section-15}

- **Check the network**: the model is hosted on the Hugging Face CDN. Automatic retries wait 3, 8, and 20 seconds, up to three attempts. Inspect requests in the browser's Network panel for details.
- **Proxies**: corporate networks/VPNs may block the CDN. Try "Proxies" settings (web only) or allowlist the CDN in the browser.
- **Disk space**: the model is about 190 MiB. Keep at least about 250 MB free for browser Cache Storage (config files and vector data add a little more); insufficient disk can interrupt the download.

### Status remains "Load failed" {#local-embedding-section-16}

- Read console errors prefixed `[EmbeddingService]`. Common causes:
  - WebGPU driver incompatibility falls back to WASM; if WASM fails too, browser memory may be insufficient.
  - Switching away from the tab for a long time during the first load may time out. Reopen the app; cached startup is faster.
- In **Settings → Local embeddings**, click "Retry" when loading has failed or "Reload" when the model is ready; both release the old model and check WebGPU again. The vector index panel has no reload button. After a Worker crash or request timeout, unfinished jobs remain queued and resume when the model recovers. Incomplete chapters never replace a saved chapter cache.

### Poor retrieval {#local-embedding-section-17}

- Use the "Test vector search" dialog to run the query directly and inspect the results.
- If a memory/chapter that should match is missing, check whether it is stale (the "Embedding space upgraded" banner appears at the top of the panel). Click "Rebuild now" or "Fill missing", then test again.
- Mixed-language queries are supported natively. Enter plain text without a prefix; query prefixes were removed in v0.14.3.

### Queue still active after disabling {#local-embedding-section-18}

This usually means a batch was running when you turned the switch off. The current batch finishes before the queue stops; forced interruption would discard that batch. The "Vector index" entry is hidden immediately; unprocessed items stay queued and continue automatically when you re-enable local embeddings.

---

## 8. Privacy and offline use {#local-embedding-section-19}

- Inference runs in a browser Worker without an external embedding API.
- Model weights download once into Cache Storage and can load offline.
- Gist sync uploads memory content, but **memory vectors and their model version tag are stripped before upload** (see [Sync settings](/help/settings-guide#settings-guide-section-19)). Vectors stay only in local IndexedDB, and each device with local embeddings enabled builds its own. **Tsukuyomi has no intermediary sync server.**

---

## Related guides {#local-embedding-section-20}

- [Settings → Local embeddings](/help/settings-guide#settings-guide-section-30)
- [Story memories](/help/book-details-memory)
- [Translation workflow](/help/book-details-translation)
- [System bar and navigation](/help/toolbar-guide)
