# 🤖 Chapter Translation and Paragraph Tasks {#book-details-translation-section-1}

This guide covers translation, polishing, proofreading, the task queue, batch start, and settings.

Tasks use the book's independent target: Simplified Chinese, Traditional Chinese, or English. AI determines source language per paragraph; it is not limited to Japanese. Target-language source can be submitted unchanged and counts as processed. Mixed text converts only the necessary portions; Chinese script conversion still follows the target. Execution freezes interface/target languages, so later setting changes neither redirect late results into a new slot nor undo the user's new target.

## 🎯 Tasks {#book-details-translation-section-2}

- **Translate**: generate paragraph translations.
- **Polish**: improve existing translations.
- **Proofread**: check and correct existing translations.

> Polishing/proofreading require a selected translation in the current target. Other-language versions do not count and are not processed instead.

---

## 📖 Chapter toolbar {#book-details-translation-section-3}

The main button follows the chapter's translation state.

### 1) Nothing translated {#book-details-translation-section-4}

- **Translate chapter**.
- Processes all nonempty paragraphs.
- A normal button without a menu.

### 2) Partly translated {#book-details-translation-section-5}

- **Continue translation**.
- Processes untranslated paragraphs only.
- The menu offers Retranslate for the full chapter.

### 3) Fully translated {#book-details-translation-section-6}

- **Polish chapter**.
- Processes translated nonempty paragraphs.
- The menu offers Retranslate and Proofread chapter.

### 4) Running {#book-details-translation-section-7}

- Shows loading and disables the button. While the task waits in the queue, the button shows "Queued (#N)".
- To stop a running task or remove a queued one, use the task center in the top bar. See [Task queue and task center](#book-details-translation-section-9) below.

---

## 📝 Paragraph actions {#book-details-translation-section-8}

Each paragraph supports:

- Retranslate
- Polish paragraph
- Proofread paragraph

Also:

- Explain selected text
- Copy source to assistant
- Translation history (N)

Completed results are saved as paragraph versions and can be selected from history.

---

## 📊 Task queue and task center {#book-details-translation-section-9}

Whole-chapter translation, polishing, and proofreading go into a global task queue. The task center in the top system bar shows and manages it. Single-paragraph translation, polishing, and proofreading skip the queue and run directly.

### Queue and concurrency {#book-details-translation-section-10}

- **Settings → General → Task queue → Max concurrent tasks** limits how many chapter tasks run at once (1–5, default 2), shared across all books. Raising it starts queued tasks right away; lowering it does not interrupt running tasks.
- When you start a chapter task from the reader, it starts right away if a slot is free. Otherwise it waits at the front of the queue, and the toolbar button shows "Queued (#N)".
- A chapter runs one task at a time. A task of the same type for the same chapter is not queued again while one is queued or running.
- Tasks do not depend on the open chapter. The queue keeps running when you switch chapters, leave book details, or open other pages. When a task writes to the chapter you have open, new translations appear in the reader as they arrive.
- One failed item does not affect the others. Each batch of translations is saved as soon as it is written. After a stop, failure, or interruption, Retry continues from where it stopped and processes only the remaining paragraphs.
- After a page reload or app restart, the queue is kept and paused, with interrupted tasks at the front. Choose "Resume queue" to continue from where they stopped.
- While a book is importing or syncing, its tasks wait and retry automatically. Deleting a chapter or book removes its queued items.
- With several tabs open, only one tab runs the queue; the other tabs can view and manage it. If that tab closes, another tab takes over.
- The queue is stored on this device only and is not synced.

### Task center {#book-details-translation-section-11}

Click the "Tasks" chip in the top system bar to open the task center. The former "AI thinking" entry is merged into it. The chip shows running and queued counts with overall progress, and "Paused · N queued" while the queue is paused. When a new task starts, the chip only flashes: the task center does not open by itself, and the right panel does not switch.

The task center has two parts:

- **Chapter tasks**: grouped into "Running", "Queued", and "Finished". The header shows concurrency, such as "Concurrent 2/2", and offers "Pause queue" / "Resume queue" and "Stop all".
  - Running rows show the task type, book, chapter, a progress bar, and paragraph progress. They can be stopped.
  - Queued rows can be dragged to reorder or removed. The group offers "Remove all".
  - Failed or cancelled rows can be retried. The "Finished" group can be cleared.
- **Other AI activity**: assistant chats, single-paragraph tasks, term translation, and other tasks outside the queue. They do not use concurrency slots. You can stop running items or clear records.

On desktop and tablet you can **pin** the task center as a floating panel. A pinned panel stays open when you click outside, can be dragged, and keeps its position after a reload. It can also **collapse** into a mini bar that shows only running tasks and overall progress. On mobile, the task center opens as a bottom sheet; tap a task row for full-screen details.

### Task details {#book-details-translation-section-12}

Click a chapter task row to expand its details inline. Only one row is expanded at a time:

- Model name, elapsed time, and chunk progress (`current / total`)
- Todo list
- A timeline of thinking, tool calls, and output in the order they happened, labeled where it switches between thinking and output
- "Open chapter" goes to the book and chapter

A dot appears on a collapsed row when its task has new activity. Once a finished task's detailed log is cleared, only the result summary remains. In a tab that is not running the queue, an expanded running task shows only its progress, with a note that the details are in the other tab.

### Batch start {#book-details-translation-batch}

Choose "Select" in the chapter list to enter selection mode. On desktop and tablet it is next to the contents heading; on mobile it is at the top of the Chapters tab.

- A checkbox appears before each chapter and volume. Clicking a chapter row toggles it and does not open the chapter. A volume checkbox selects or clears the whole volume, and shows "−" when the volume is partly selected.
- Rows keep the same layout as normal mode, with the checkbox in place of the status icon. Each row still ends with its completion percentage for the book's target language; chapters already in the queue show "Queued" or "Running" instead.
- "Select untranslated" selects every chapter in the book that is below 100%.
- Drag ordering and inline edit/delete are hidden while selecting. Click ✕ or press Esc to exit.

Then choose "Polish", "Proofread", or "Translate N chapters" at the bottom. In the confirmation dialog, choose:

- Task: translation, polishing, or proofreading
- Scope (translation only): "Only untranslated paragraphs (continue translation)" or "Retranslate everything"
- Queue position: "In chapter order, after the current queue" or "At the front of the queue"

The dialog shows the model to be used, the current concurrency with running and queued counts, and how many items will be added. For polishing and proofreading, it also says how many chapters have no translation and will be skipped. After you choose "Add to queue", the chapters are queued in book order and a message reports the result, for example "Added 5 chapters; 2 chapters are already in the queue".

Batch tasks do not show a message for each chapter. AI action notices, such as new terms or characters, go only to message history. When the whole batch ends, one "Batch tasks finished" summary shows the done, failed, and cancelled counts.

### Tool visualization {#book-details-translation-section-13}

- Calls display the tool name and status: spinning gear, green check, warning, red cross, or canceled icon.
- Results classify success/warning/failure and can open the full JSON.

---

## ⚙️ Translation settings {#book-details-translation-section-14}

### Desktop/tablet: book and chapter settings {#book-details-translation-section-15}

- Book settings: sidebar **Settings → Translation settings**.
- Chapter toolbar gear: current chapter's translation/polishing/proofreading instructions only.

Saving either scope leaves the other scope in place.

### Mobile: two tabs in a bottom sheet {#book-details-translation-section-16}

The gear opens Book settings and Chapter settings. Book settings uses the same book form as desktop/tablet.

### Book settings {#book-details-translation-section-17}

- Target language: Simplified Chinese, Traditional Chinese, or English. Initial target comes from the interface at actual creation; legacy books use Simplified Chinese.
- Book instructions: three tabs, Translation instructions / Polishing instructions / Proofreading instructions. They apply to every chapter of the book and are added to the matching task's system prompt; chapter instructions of the same type override them. Since v0.19.0 they live here instead of the edit-book dialog; existing instructions are kept.
- Filter leading indentation
- Normalize displayed symbols
- Normalize displayed titles
- Skip AI questions (`ask_user`)
- Validate source alignment: the AI must attach the first few characters of the source with each translated paragraph, so Tsukuyomi can confirm the translation landed on the right paragraph. For short lines such as 「はい」 copying all of the words is enough; for a paragraph that opens with a short word, its first two characters are enough (in English, a whole word). Differences in full-width/half-width characters, ellipsis style, emoji variants, English letter case and whitespace do not count as a mismatch. Turning it off reduces token usage.
- Task chunk size in characters

Save writes to the book. Cancel or leaving discards unsaved edits.

Changing target selects another language for reading and new tasks, without deleting results or starting translation. Missing paragraphs/titles show source; missing term/character/alias names are blank. Returning to a target restores its selections. Search caches rebuild after a change; shared memories remain.

### Book model overrides {#book-details-translation-section-18}

- **Translation model**: chapter/paragraph translation and fallback for tool-added translations.
- **Proofreading / polishing model**: corresponding chapter/paragraph tasks.

Follow global default uses the task model configured on AI models. A disabled/deleted override falls back silently; settings retain an invalid-selection placeholder until changed and saved.

> Terminology, chat, and explanations continue to use their global defaults.

### Chapter settings {#book-details-translation-section-19}

- Translation instructions
- Polishing instructions
- Proofreading instructions

These are attached to the corresponding prompt for this chapter only.

> The chat assistant can also view and change book and chapter instructions for you. For example, after you point out a mistranslation, ask Tsukuyomi to write the correction into the instructions. See [Chat assistant](/help/chat-assistant-guide#chat-assistant-guide-section-9).

### Source quotation marks {#book-details-translation-section-22}

When the target language is Simplified or Traditional Chinese, the prompt asks the translation to keep the source's 「」 and 『』 exactly, rather than changing them to “” or ‘’. If the AI still rewrites them, they are restored according to the quote positions in the source before the translation is saved; when the quote counts or opening/closing pairs do not match and the restore cannot be done safely, the translation is left unchanged. This is not applied when the target language is English.

---

## 🔍 Related editing {#book-details-translation-section-20}

- Edit translations directly: Enter saves, Shift+Enter adds a line, Esc cancels.
- Search/replace makes batch changes to raw translation data.

---

## ⚠️ Execution details {#book-details-translation-section-21}

- Chapter tasks count/process nonempty paragraphs.
- Each completed chunk saves immediately; cancellation or reload retains saved paragraphs.
- A fully translated chapter defaults to polishing.
- AI phases are `planning → working → review → end`. Since v0.14.3, former preparation maintenance is the last planning item.
- After each translation batch, AI checks the todos; incomplete items appear in the task details in the task center. Only the newest global list is retained each round to bound long-chapter context.
- Since v0.15.0, completing an item or having no active item advances the next todo automatically; restoration also advances eligible todo state.
- Local embeddings build paragraph and title/first-paragraph chunks. `query_chapter` uses semantic confidence, RRF ranking, and keyword fallback, weighted 0.85/0.15. See [Local embeddings](/help/local-embedding).
- `search_memories` retrieves shared memories with natural language.
- Disabling embeddings removes `query_chapter` and its prompt guidance; memory scoring falls back to keywords and recency.
