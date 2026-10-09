# Memory Management {#book-details-memory-section-1}

Memories record important book information, plot, and settings to improve translation continuity.

Memory content/summaries are shared across book targets; switching interface/target does not translate them or clear their vectors. Query terms use originals and current-target term/character/alias names. Chapter preview and real injection use the same read-only selector, refreshed after target, source, title, or entity-name changes. Old results cannot replace the new preview.

## 🧠 What is a memory? {#book-details-memory-section-2}

A substantial context record for world rules, plot, relationship changes, or translation concerns:

- 🌍 World settings/rules
- 📖 Important plot developments
- 💡 Background
- ⚠️ Translation notes

## 📋 Fields {#book-details-memory-section-3}

Core:

- **Content**: detailed information, required
- **Summary**: a short retrieval description, which AI can generate

Metadata:

- Creation time
- Last access time for recency scoring. It is stored only on this device and never synced; Gist sync merges memories by content modification time, so reading, searching, or injecting a memory only updates the local access time and never triggers a sync or creates pending changes.
- Local semantic vectors, stored only on this device and never synced; each device with local embeddings generates its own.

## 🚪 Open the panel {#book-details-memory-section-4}

Open book details → Settings → Memories.

The panel contains:

- Add/search/filter unembedded/re-embed/import/export controls
- Queue progress with pause/resume
- Memory cards with vector status badges
- A detail/edit dialog

## Add memories {#book-details-memory-section-5}

### Manually {#book-details-memory-section-6}

Choose Add memory, enter a required summary and content, then Save.

Provide enough detail, keep one concept per record, and aim for roughly 200–500 characters where appropriate.

### Examples {#book-details-memory-section-7}

**World rules**:

```
Magic has five elements: fire, water, wind, earth, and lightning.
Each mage can master only one element.
Strength is proportional to the mage's mental power.
```

**Plot**:

```
In chapter 15, the protagonist learns that he is the missing prince.
Only the old steward knew the secret and has protected him in the shadows.
```

**Translation note**:

```
For this work, translate 夜明け with the chosen symbolic term rather than a generic synonym.
The author explains its special meaning in the afterword.
```

## Edit memories {#book-details-memory-section-8}

### Change content {#book-details-memory-section-9}

Open the card, edit, and save. Add useful details whenever needed.

### Keep it current {#book-details-memory-section-10}

Update after revelations, annotate resolved foreshadowing, and expand rules as the story develops.

## Import/export {#book-details-memory-section-11}

### Export {#book-details-memory-section-12}

Export the current memories as JSON.

### Import {#book-details-memory-section-13}

Choose a memory JSON file. Imported and existing records are merged.

## Delete memories {#book-details-memory-section-14}

Choose Delete on a card and confirm. Deletion has no immediate restore action; AI no longer references the record. Confirm it is no longer needed first.

## Three-signal retrieval {#book-details-memory-section-15}

Translation automatically selects relevant memories without manual chapter links.

### Scoring {#book-details-memory-section-16}

Scores range from 0 to 1.0.

With embeddings:

| Signal   | Weight | Meaning                                                                              |
| :------- | :----- | :----------------------------------------------------------------------------------- |
| Semantic | 0.85   | Cosine similarity calibrated with floor 0.30/full 0.65, batch contrast, and RRF rank |
| Keywords | 0.10   | Hits for current source/target term and character names                              |
| Recency  | 0.05   | Exponential decay with a 30-day half-life                                            |

Without embeddings:

| Signal   | Weight | Meaning               |
| :------- | :----- | :-------------------- |
| Keywords | 0.75   | Same keyword evidence |
| Recency  | 0.25   | Same recency evidence |

> Raw cosine below 0.30 provides no semantic evidence. With at least four candidates, medium similarities need to exceed the batch median by 0.08 for full contrast confidence, preventing an entirely irrelevant batch from gaining maximum relevance by rank alone.

### Character budget {#book-details-memory-section-17}

Memories are selected in score order within the character budget, default 2000 characters, including the memory heading, IDs, summaries, and line breaks. Records that exceed the remaining budget are skipped; error fallback obeys the same limit. Normal relevance selection omits memories below the configured minimum score (default 0.30).

### Semantic retrieval {#book-details-memory-section-18}

Turn on "Enable local embeddings" under **Settings → Local embeddings** to generate 384-dimensional vectors. See [Local embeddings](/help/local-embedding).

- Model: `hotchpotch/bekko-embedding-v1-a25m`, about 123M total / 25M active parameters, 100+ languages, full 384-dimensional L2-normalized vectors and mean pooling. Queries and documents both encode raw text.
- Long summary/content is split into segments up to 1200 characters and robustly aggregated.
- Download: both backends share the compact default ONNX artifact, about 190 MiB, cached in the browser after first use.
- Computation is local, without API usage; WebGPU is preferred with WASM fallback.
- Physical mobile devices (detected by user agent, regardless of window width) disable embeddings but retain keyword/recency selection.
- Disabled/unavailable embeddings automatically use fallback weights.

## Search and filters {#book-details-memory-section-19}

### Hybrid search {#book-details-memory-section-20}

Type a query to rank content and summaries by keywords and semantic similarity when available.

### Filters {#book-details-memory-section-21}

- Unembedded only helps inspect coverage.
- Clear filters resets the query and filters.

## Use in translation {#book-details-memory-section-22}

### Automatic injection {#book-details-memory-section-23}

1. Extract relevant terms/characters from the current passage.
2. Score semantic, keyword, and recency evidence.
3. Select within the character budget.
4. Add relevant memories to the translation prompt.

### Preview {#book-details-memory-section-24}

Reference memories in the book toolbar previews current-chapter choices and score components. It refreshes when the chapter changes.

Preview does not update access times, book revisions, or execution score records. On scoring failure, preview and injection both fall back to the latest 15 memories. Only real injection publishes execution scores, keeping previews from interfering with running tasks.

### AI search {#book-details-memory-section-25}

`search_memories` accepts natural-language queries and uses the same hybrid approach.

## Recommended practices {#book-details-memory-section-26}

### When to build memories {#book-details-memory-section-27}

1. Record basic world rules after chapter 1.
2. Summarize important events after each volume.
3. Refine key memories before translation.
4. Add important information as encountered.

### Granularity {#book-details-memory-section-28}

Avoid recording every detail or mixing many topics into one record. Use one complete setting/event/concept per memory, roughly 200–500 characters with necessary details and no unrelated information.

### Review and update {#book-details-memory-section-29}

After each volume, remove obsolete records, add new facts, merge duplicates, correct misunderstandings, and fill missing details.

### Coordinate with other records {#book-details-memory-section-30}

- Terms provide name translations and keyword evidence; memories explain meaning/background.
- Characters provide names/aliases and basic details; memories record important experiences.
- Basic data belongs in Terms/Characters, plot/background in Memories, and translation conventions in Terms/Memories.

## Frequently asked questions {#book-details-memory-section-31}

### Does a large memory library slow translation? {#book-details-memory-section-32}

Budgets and thresholds bound injected text. A book supports up to 500 memories. Full-memory reads have a 60-second cache, and vector generation runs asynchronously.

### How do I organize many records? {#book-details-memory-section-33}

Keep concepts separate, use hybrid search, review regularly, and inspect unembedded coverage.

### Memories versus chapter vectors? {#book-details-memory-section-34}

Chapter vectors automatically index paragraph/title passages for `query_chapter`. Memories record cross-chapter world rules, foreshadowing, and translation notes, selected automatically or through `search_memories`.

Use chapter retrieval for actual passages elsewhere in the book; use memories for long-lived summaries not readily recovered from one passage.

### What is worth recording? {#book-details-memory-section-35}

Ask:

1. Will later chapters refer to it?
2. Does it help translation?
3. Is it easy to forget but important?
4. Could AI misunderstand it?

A yes to any is a good reason to record it.
