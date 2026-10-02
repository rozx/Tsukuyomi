# 🤖 Chapter Translation and Paragraph Tasks {#book-details-translation-section-1}

This guide covers translation, polishing, proofreading, progress, and settings.

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

- Shows loading and disables the button.
- Cancel from the progress panel.

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

## 📊 Progress panel {#book-details-translation-section-9}

### Open automatically or manually {#book-details-translation-section-10}

- Starting a chapter task switches the right panel to Translation progress.
- Open the panel and select that tab manually if needed.
- Progress remains accessible on other pages, including AI settings and Help.

### Top controls {#book-details-translation-section-11}

- **Chapter filter**: show only the selected chapter's tasks; its icon highlights when active.
- **Clear**: remove completed, failed, and canceled tasks; appears when such records exist.

### Task history {#book-details-translation-section-12}

Recent task cards show:

- Running/completed/error/canceled status
- Model, task type, and elapsed time
- Chapter
- Inline chunk progress, `current / total`
- Collapsible content:
  - Thinking and output in one chronological timeline since v0.14.3, with transition labels and tool status icons
  - Todos, when present
- Stop for active tasks
- Auto-scroll and auto-tab-switch options

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

The gear opens Global settings and Chapter settings. Global settings uses the same book form as desktop/tablet.

### Book settings {#book-details-translation-section-17}

- Target language: Simplified Chinese, Traditional Chinese, or English. Initial target comes from the interface at actual creation; legacy books use Simplified Chinese.
- Filter leading indentation
- Normalize displayed symbols
- Normalize displayed titles
- Source integrity validation for AI paragraph labels
- Skip AI questions (`ask_user`)
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
- Batch completion checks todos and displays incomplete items. Only the newest global list is retained each round to bound long-chapter context.
- Since v0.15.0, completing an item or having no active item advances the next todo automatically; restoration also advances eligible todo state.
- Local embeddings build paragraph and title/first-paragraph chunks. `query_chapter` uses semantic confidence, RRF ranking, and keyword fallback, weighted 0.85/0.15. See [Local embeddings](/help/local-embedding).
- `search_memories` retrieves shared memories with natural language.
- Disabling embeddings removes `query_chapter` and its prompt guidance; memory scoring falls back to keywords and recency.
