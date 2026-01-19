# Design: Chapter Summary System

## Architecture

### Data Model

Modify `Chapter` interface in `src/models/novel.ts`:

```typescript
interface Chapter {
  // ... existing fields
  summary?: string; // Auto-generated summary of the chapter
}
```

### New Agent & Task Type

Define a new task type for the Chapter Summary Agent to ensure it operates independently and can be tracked separately in the UI.

- **Update `AIProcessingTask`** (in `src/stores/ai-processing.ts`):
  - Add `'chapter_summary'` to the `type` union.
- **Update UI**:
  - Add icon and label for `'chapter_summary'` in `TASK_TYPE_LABELS` (src/constants/ai.ts).

### AI Service

Create a new service `ChapterSummaryService` (`src/services/ai/tasks/chapter-summary-service.ts`) responsible for:

1.  **Model Selection**: It MUST use the `termsTranslation` model configured for the novel (or system default if novel specific is missing). This is distinct from the main translation model.
2.  **Agent Role**: Use a dedicated system prompt focused on summarization (e.g., "You are an expert editor...").
3.  **Execution**:
    - **Input**: Use the **Original (Source) Content** of the chapter (since translation is just starting).
    - **Output**: Generate a summary in the target language (Chinese).
    - **Save**: Save summary to `Chapter.summary`.

### Workflow Integration

1.  **Automated Trigger**:
    - Hook into `TranslationService` (start) or the UI method calling it.
    - **Timing**: Trigger **immediately when the translation task is initiated**.
    - **Condition**: Specifically when the user chooses to translate the chapter (likely focusing on the first-time translation flow, avoiding auto-updates on every minor re-run unless requested).
2.  **Manual Trigger**:
    - Expose a method `generateSummary(chapterId)` that can be called from the UI.

### UI Implementation

- **Component**: `src/components/novel/ChapterContentPanel.vue` (and potentially `EditChapterDialog.vue` if needed).
- **Display**: Show `summary` in a collapsible or dedicated section.
- **Interactions**:
  - **Read-only Text**: The summary text itself is not directly editable by the user.
  - **Action**: Add a "Re-summarize" button (icon: magic wand/sparkles) next to the summary section. This invokes the manual trigger.
- **Settings UI**:
  - Update `src/components/dialogs/AIModelDialog.vue` (or relevant settings component).
  - Change the label/tooltip for "Term Translation Model" to indicate it is also used for **Chapter Summaries**. Example: "Term Translation & Summary Model".

### Context Injection

- **Update `list_chapters`**: Include the `summary` field in the output for each chapter. This provides high-level context to the AI ("what happened previously") without needing to read the full text of every chapter.
- **Update `get_chapter_info`**: If this tool exists and returns metadata, include `summary`.
- **Exclude from `get_chapter_content`**: Tools that return the full chapter text (`get_chapter`, `get_chapter_content`) should **not** redundantly include the summary, as the model can read the content directly and we want to save context window.

## Considerations

- **Model Selection**: Use the `assistant` model for summarization as it's better at reasoning than the `translation` model? Or use `translation` model? Usually `assistant` (e.g. GPT-4) is better for summary.
- **Timing**: Trigger immediately after translation.
- **Failures**: If summary generation fails, log it but don't revert the translation.

## Alternatives Considered

- **Editable Summary**: Rejected based on user requirement ("uneditable").
- **Separate Entity**: Storing summaries in a separate store. Rejected for simplicity; it belongs to the `Chapter`.
