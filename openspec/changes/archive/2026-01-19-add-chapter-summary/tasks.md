# Tasks

1.  [x] **Model Update**:
    - Update `Chapter` interface in `src/models/novel.ts` to include `summary: string | undefined`. `// turbo`
    - Update `AIProcessingTask` type in `src/stores/ai-processing.ts` to include `'chapter_summary'`.
    - Update `TASK_TYPE_LABELS` in `src/constants/ai.ts` to include label for `'chapter_summary'`.
2.  [x] **Service Creation**: Create `ChapterSummaryService` in `src/services/ai/tasks/chapter-summary-service.ts`.
    - Ensure it uses the `termsTranslation` model from `Novel` config or global settings.
3.  [x] **Service Integration**: Integrate `ChapterSummaryService` into `TranslationService` (or workflow) to trigger on initiation (parallel start).
4.  [x] **Tool Update**:
    - Update `list_chapters` to include `summary` in the output.
    - Ensure `get_chapter_content` (or similar full-content tools) does **not** duplicate the summary.
5.  [x] **UI Update**:
    - Modify `src/components/novel/ChapterContentPanel.vue` to:
      - Display the summary (read-only).
      - Add a "Re-summarize" button that calls `ChapterSummaryService`.
    - Modify `src/components/dialogs/AIModelDialog.vue` (and `src/models/novel.ts` types/labels if needed) to rename "Term Translation Model" to "Term Translation & Summary Model" (or add explanatory text).
6.  [x] **Verification**: Verify that summary is generated after translation and visible in UI.
