# Add Chapter Summary

## Metadata

- **Type**: Feature
- **Change ID**: add-chapter-summary
- **Author**: Antigravity
- **Status**: Proposed

## Problem Statement

Currently, the AI lacks overarching context about the chapter's valid events when performing translations or other tasks. A chapter summary would provide this high-level view. Additionally, users want to see this summary in the UI to understand the chapter quickly.

## Proposed Solution

1.  **Data Model**: Add a `summary` field to the `Chapter` entity.
2.  **Workflow**:
    - **Automated**: Automatically trigger summary generation **only when a chapter translation is initiated**.
    - **Manual**: Provide a "Re-summarize" button in the UI for on-demand updates.
3.  **Dedicated Agent**: Create a new **Chapter Summary Agent** (with its own Task Type `chapter_summary`) that runs independently.
    - **Model**: Uses the **Term Translation Model** configuration.
4.  **UI**:
    - Display the summary in the chapter editor (read-only view).
    - Add a button to manually trigger summarization.
    - **Settings UI**: Update the "Term Translation Model" setting label/description to explicitly state usage for "Terms & Chapter Summary".
5.  **AI Context**: Provide the chapter summary to AI tools that list or describe chapters (e.g., `list_chapters`) to provide high-level context without loading full content. Note: Tools that already return full chapter content do not need to include the summary to save tokens.

## Impact

- **Modules**: `src/models`, `src/services/ai/tasks`, `src/components/novel`, `src/services/chapter-service`.
- **User Experience**: Users see a summary in the editor. AI generates better translations due to better context.
- **Performance**: Minimal impact. Summary generation is an additional AI call but happens asynchronously or at the end of a long task.

## Risks

- **Cost**: Additional tokens for summary generation.
- **Quality**: Poor summaries might mislead the AI in subsequent tasks.
