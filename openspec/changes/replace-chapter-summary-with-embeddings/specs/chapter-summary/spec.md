## REMOVED Requirements

### Requirement: Chapter Summary Generation

**Reason**: AI-generated chapter summaries are replaced by chapter-level embedding search. Chapters no longer maintain a textual `summary` field; semantic understanding is provided by the new `query_chapter` AI tool backed by multi-vector chapter embeddings.

**Migration**: The `Chapter.summary` field and all generation code paths (`ChapterSummaryService`, the `chapter_summary` task type, auto-generation on translation initiation, manual "Re-summarize" button) are removed. Existing `summary` values in IndexedDB are ignored by all read paths and stripped from Gist sync / JSON export. No user-facing migration is provided — the loss of existing summary text is accepted.

### Requirement: Model Usage Visibility

**Reason**: Chapter summaries are no longer generated, so the "Term Translation Model" no longer needs to advertise its role in summary generation.

**Migration**: Remove the summary-related help text from the Term Translation Model selection UI. The term translation task itself keeps using this model.

### Requirement: Chapter Summary Visibility

**Reason**: Chapter summary display in the editor is removed together with the underlying field. The "Re-summarize" button is also removed.

**Migration**: Delete the summary display component and the "Re-summarize" button from `ChapterContentPanel` and any related UI. Users seeking chapter context should rely on the AI's `query_chapter` tool during translation / polish / proofread tasks.

### Requirement: Chapter Summary Context

**Reason**: The `get_chapter_info` AI tool no longer emits a `summary` field; the `search_chapter_summaries` tool is removed. Chapter semantics are now queried via `query_chapter`.

**Migration**: Remove `summary` from the `get_chapter_info` response and delete the `search_chapter_summaries` tool from the tool registry and whitelist. AI usage documentation is updated in the translation / polish / proofread system prompts to describe `query_chapter` as the replacement.
