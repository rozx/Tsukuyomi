# 🧬 Local Embeddings {#local-embedding-section-1}

Local embeddings are Tsukuyomi's **offline semantic retrieval engine**. A browser model turns memories and chapters into vectors so AI can find context by meaning. Vector computation stays on the device and consumes no AI API usage. With Gist sync enabled, memory records and vectors are uploaded; context selected for AI still goes to the configured model provider.

> For controls, see [Settings → Local embeddings](/help/settings-guide#settings-guide-section-30). For memory workflows, see [Memories](/help/book-details-memory).

---

## 1. Capabilities {#local-embedding-section-2}

When enabled, background indexing covers:

- **Memories**: summary and content are split at paragraph/sentence boundaries into segments of at most 1200 characters and robustly aggregated, avoiding truncation of long memories. Semantic similarity supplies the 0.85-weight component of relevance scoring. `search_memories` accepts natural-language queries.
- **Chapters**: paragraphs form chunks targeting 100 characters; title plus first paragraph has its own chunk. `query_chapter` retrieves relevant passages without pre-generated summaries.

Chapter vectors, title chunks, and full-text indexes validate the target language and actual input signature. They include source and selected translations for that target. A target change invalidates caches for background rebuild; old computations cannot overwrite the new cache. Retrieval may report rebuilding. Name expansion uses originals and current-target term/character/alias translations, never another language. Shared memories and memory vectors are retained across target changes.

When disabled:

- Relevance falls back to keyword/recency weights of 0.75/0.25. Similar meaning expressed differently may be missed.
- `query_chapter` and its prompt guidance are removed.
- Batch indexing shows Disabled and locks writes.

---

## 2. Model and execution {#local-embedding-section-3}

### Default model {#local-embedding-section-4}

- **Model**: `onnx-community/gte-multilingual-base`, an ONNX version of GTE-Multilingual-Base.
- **Architecture**: 305M BERT encoder with 70+ languages, including Chinese, Japanese, and English.
- **Dimensions**: full **768**, L2-normalized.
- **Pooling**: final-layer CLS token, following the model example. Query and document share the same path, without asymmetric prefixes.
- **Encoding**: raw query/document text uses the same encoder; no user configuration is needed.
- **Version**: `gte-multilingual-base@768@cls@raw`. A change to model ID, dimensions, pooling, or input scheme bumps the version and makes old vectors stale.

### Backends {#local-embedding-section-5}

Automatic priority:

| Backend    | Quantization                           | Size    | Speed/compatibility  | Use                                         |
| :--------- | :------------------------------------- | :------ | :------------------- | :------------------------------------------ |
| **WebGPU** | q4f16: 4-bit weights, fp16 activations | ~465 MB | 5–10× faster         | Recent desktop Chrome/Edge with GPU support |
| **WASM**   | int8                                   | ~340 MB | Widest compatibility | No WebGPU or failed initialization          |

> One WebGPU initialization failure selects WASM for the rest of the session. Reload clears this exclusion so you can retry after driver/browser changes.

### Mobile restriction {#local-embedding-section-6}

Physical mobile platform detection locks the switch off. Browser WASM memory limits, typically around 2 GB, make a 300 MB+ model with several inference chunks prone to crashes. Keyword and recency retrieval remain available.

---

## 3. Enable embeddings {#local-embedding-section-7}

1. Open **Settings → Local embeddings** on a supported device.
2. Enable the main switch.
3. The first model download starts. Keep a stable connection and the window in the foreground; size depends on the backend.
4. Browser Cache Storage retains the model for later warmup without downloading again.
5. Wait for the banner to disappear and status to become `ready`.
6. Open a book and choose the right-rail batch/vector index entry to build chapter and memory vectors. This entry moved from the top bar in v0.12.1.

---

## 4. Batch embedding panel {#local-embedding-section-8}

The entry appears in book details and opens a drawer for inspecting and controlling the queue.

### Status and counts {#local-embedding-section-9}

- Service: `idle` / `loading` / `ready` / `failed`, with `webgpu` or `wasm`.
- Book chapters: embedded / total / stale.
- Book memories: embedded / total / stale.

> Nonzero stale counts often follow a model upgrade. Old vectors enter the recomputation queue; embedded totals may temporarily decrease.

### Actions {#local-embedding-section-10}

- **Re-embed book chapters/memories**: queue missing or stale records.
- **Batch recompute** in settings: stale records across books.
- **Test query**: enter natural language and inspect top chapter/memory results and similarity scores.
- **Pause/Resume**: manually suspend the queue. Sync adds its own temporary suspension and resumes afterward, as described below.

### Progress {#local-embedding-section-11}

The active queue shows:

- Completed/total, separately for memories and chapters
- ETA based on the latest five batch durations
- Current book ID, even while viewing another book

Memory batches use `BATCH_SIZE = 8`. Each chapter is processed separately, with its chunks in one inference batch, to control memory peaks.

---

## 5. Versions and stale vectors {#local-embedding-section-12}

Model ID, dimensions, pooling, and input scheme define the embedding space. Changing any of them makes old/new cosine scores unreliable and requires recomputation.

`MODEL_VERSION` is stored on each memory/chunk. Shared stale checks classify:

- **Current**: eligible for semantic retrieval and counted as embedded.
- **Stale**: semantic scoring is skipped, keyword/recency remain, and backlog scanning queues a rebuild.

A model upgrade does not delete source data. Retrieval temporarily falls back until rebuilding finishes.

Startup also removes old model caches, such as `embeddinggemma` and `qwen3-embedding`, to reclaim disk space.

---

## 6. Sync suspension {#local-embedding-section-13}

Sync and revision restoration temporarily suspend the queue:

- Either `isSyncing` or `isRestoringSyncSnapshot` closes the gate.
- Reopening resumes only work suspended by the gate, preserving a manual Pause.
- This avoids vector writes racing snapshot replacement or indexing partially restored data.

The panel shows a sync suspension banner until the gate opens.

---

## 7. Troubleshooting {#local-embedding-section-14}

### Download stays at 0% {#local-embedding-section-15}

- Check Hugging Face CDN connectivity. Automatic retries wait 3, 8, and 20 seconds, up to three attempts. Inspect browser Network requests for details.
- Corporate networks/VPNs may block the CDN. Check proxy/network allowlists.
- Browser Cache Storage usually needs more than 500 MB free; insufficient disk can interrupt download.

### Status remains `failed` {#local-embedding-section-16}

- Read console errors prefixed `[EmbeddingService]`.
  - WebGPU driver incompatibility falls back to WASM; if WASM fails too, memory may be insufficient.
  - A long background-tab pause during first loading may time out. Reopen the app; cached startup is faster.
- Reload in the batch panel clears WebGPU exclusion and initializes again.

### Poor retrieval {#local-embedding-section-17}

- Test the query directly and inspect top results.
- Check missing memories/chapters for stale status; re-embed and test again.
- Mixed-language queries are supported. Enter plain text without a prefix; query prefixes were removed in v0.14.3.

### Queue still active after disabling {#local-embedding-section-18}

A running batch finishes before the queue stops. Forced interruption would discard that batch. The banner should disappear shortly.

---

## 8. Privacy and offline use {#local-embedding-section-19}

- Inference runs in the browser without an external embedding API.
- Model weights download once into Cache Storage and can load offline.
- Enabled Gist sync uploads memory vectors as part of memory records to your secret Gist. Tsukuyomi has no intermediary sync server. See [Sync settings](/help/settings-guide#settings-guide-section-19).

---

## Related guides {#local-embedding-section-20}

- [Settings](/help/settings-guide)
- [Memories](/help/book-details-memory)
- [AI translation](/help/book-details-translation)
- [System bar](/help/toolbar-guide)
