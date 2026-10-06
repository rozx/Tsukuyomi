# 🧬 Local Embeddings {#local-embedding-section-1}

Local embeddings are Tsukuyomi's **offline semantic retrieval engine**. A browser model turns memories and chapters into vectors so AI can find context by meaning. Vector computation stays on the device and consumes no AI API usage. With Gist sync enabled, memory records and vectors are uploaded; context selected for AI still goes to the configured model provider.

> For controls, see [Settings → Local embeddings](/help/settings-guide#settings-guide-section-30). For memory workflows, see [Memories](/help/book-details-memory).

---

## 1. Capabilities {#local-embedding-section-2}

When enabled, background indexing covers:

- **Memories**: summary and content are split at paragraph/sentence boundaries into segments of at most 1200 characters and robustly aggregated, avoiding truncation of long memories. Semantic similarity supplies the 0.85-weight component of relevance scoring. `search_memories` accepts natural-language queries.
- **Chapters**: paragraphs form chunks targeting 100 characters; title plus first paragraph has its own chunk. `query_chapter` retrieves relevant passages without pre-generated summaries.

Chapter semantic vectors consistently encode the source text so translated and untranslated chapters remain comparable; the target translation is used only when source text is missing. Keyword search, previews, and full-text indexes retain the source and the selected translation for the current target. Caches validate the target language and actual input signature, including translation changes that affect keywords and previews. A target change invalidates caches for background rebuild; old computations cannot overwrite the new cache. Retrieval may report rebuilding. Name expansion uses originals and current-target term/character/alias translations, never another language. Shared memories and memory vectors are retained across target changes.

For vague plot queries, a small set of candidates is reranked using source paragraphs so surrounding text does not obscure the relevant event. Queries with a clear match retain the full chunk context, and repeated queries reuse cached vectors. If reranking fails, the original ranking is retained. All computation stays in the browser and adds no AI API requests.

When disabled:

- Relevance falls back to keyword/recency weights of 0.75/0.25. Similar meaning expressed differently may be missed.
- `query_chapter` and its prompt guidance are removed.
- Batch indexing shows Disabled and locks writes.

---

## 2. Model and execution {#local-embedding-section-3}

### Default model {#local-embedding-section-4}

- **Model**: `hotchpotch/bekko-embedding-v1-a25m`, the Bekko a25m multilingual encoder.
- **Architecture**: about 123M total parameters and 25M active parameters, supporting 100+ languages including Chinese, Japanese, and English.
- **Dimensions**: full **384**, L2-normalized.
- **Pooling**: mean pooling over valid tokens. Query and document use the same encoding path without task prefixes.
- **Default artifact**: official `onnx/model.onnx`, about **190 MiB**. The static vocabulary table is int8-compressed while Transformer computation remains fp32. `dtype: fp32` selects this compact artifact, not a full fp32 vocabulary table.
- **Version**: `bekko-embedding-v1-a25m@384@mean@raw`. Changes to model ID, dimensions, pooling, or input scheme update the version; old memory and chapter vectors become stale and are recomputed in the background.

### Backends {#local-embedding-section-5}

The app first checks for an available WebGPU adapter and device. If none is available, it loads WASM directly. Both backends use the same default artifact.

| Backend    | Artifact and computation                         | Size     | Use                                                    |
| :--------- | :----------------------------------------------- | :------- | :----------------------------------------------------- |
| **WebGPU** | Default ONNX; int8 vocabulary / fp32 Transformer | ~190 MiB | Desktop browsers with WebGPU support                   |
| **WASM**   | The same default ONNX artifact                   | ~190 MiB | Browsers without an available WebGPU adapter or device |

> An unavailable adapter selects WASM for the session. Reload checks WebGPU again. Actual inference speed depends on hardware, input length, and backend.

### Mobile restriction {#local-embedding-section-6}

Physical mobile platform detection locks the switch off. Browser WASM memory limits, typically around 2 GB, make a local model with several inference chunks prone to crashes. Keyword and recency retrieval remain available.

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

Memory and chapter vectors are computed in batches of at most eight inputs. Interactive queries take priority over waiting background batches. Chapters can pause between batches; unfinished chapters remain queued and restart on resume, with results saved only after the whole chapter finishes. Panel statistics are read while the drawer is open, with updates from the same batch combined.

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
