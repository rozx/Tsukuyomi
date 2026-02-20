## Context

In Luna AI Translator, multi-chapter simultaneous translation causes a silent data drop when translations are added to `volumes`. `useChapterTranslation.ts` incrementally updates memory arrays without merging issues at the component level. However, after a chapter translates completely, it passes `book.value.volumes` to `booksStore.updateBook`. Inside `updateBook`, `ChapterContentService.loadChapterContentsBatch` causes an `await` suspension.
During the suspension, if a concurrent translation yields a new chunk, it's added to `book.value.volumes` in memory.
When the `await` finishes, the older `updatedBook` snapshot overwrites `this.books[index] = updatedBook` and causes the concurrent chapter's translations to be lost without any error logs.

## Goals / Non-Goals

**Goals:**

- Eliminate the `await` gap causing race conditions during batch save.
- Decouple chapter content saving from full book `volumes` snapshot replacement.
- Ensure safe concurrent text translations across multiple chapters out of the box.

**Non-Goals:**

- Completely rewriting how books/chapters are generally updated elsewhere.
- Changing how individual paragraphs are updated locally in memory within the `useChapterTranslation` module.

## Decisions

**1. Directly save chapter content to IndexedDB using ChapterService in `batchSaveChapter`**
Instead of sending the whole `book.value.volumes` into `booksStore.updateBook` and triggering a potentially slow operation that reconstructs `volumes`, we directly use `ChapterService.saveChapterContent(chapterToSave)` inside `batchSaveChapter`. `booksStore.updateBook` will then only receive a `lastEdited` update (to notify the UI that the book was changed), passing `saveChapterContent: false` if needed to skip redundant saves if the `updateBook` action happens to trigger one.

_Rationale_: This guarantees that the persistence of translations directly writes to the chapter's separate DB table and does not rely on taking a snapshot of `volumes` which could be staled by `await` operations.

**2. Optimizing `booksStore.updateBook`**
We notice that `updateBook` will load missing chapter contents. We will make sure that if only metadata like `lastEdited` is sent, it skips redefining `volumes`, drastically reducing exposure to `await` based race conditions. Actually, in `booksStore.updateBook`, if `updates.volumes` is omitted, it sets `isOnlyMetadataUpdate`. We will capitalize on this. `batchSaveChapter` simply won't pass `volumes`.

_Implementation note_: When calling `updateBook` with only `{ lastEdited: new Date() }` (no `volumes`), the existing `isOnlyMetadataUpdate` logic (`const isOnlyMetadataUpdate = !updates.volumes`) automatically sets `saveChapterContent = false`. There is **no need** to explicitly pass `{ saveChapterContent: false }` — it would be redundant but harmless. Prefer the simpler call signature.

_Alternative considered_: Doing deep merge inside `booksStore.updateBook`. This is way too complex and heavy for a frequent translation update stream.

## Risks / Trade-offs

- [Risk] Memory `book.value.volumes` falls out of sync with DB if something crashes during the dual save procedure.
  → Mitigation: `useChapterTranslation.ts` already accurately manages memory arrays for the live chapter. We are just ensuring it saves safely.

- [Note] `book.value` (the `Ref<Novel>` passed into the composable) and `this.books[index]` in the Pinia store are expected to be the same reactive object reference. Therefore, `book.value.volumes = updatedVolumes` (line 159 of `updateParagraphsAndSave`) already updates the store's in-memory state. When `updateBook` is later called with only `lastEdited`, `updatedBook = { ...existingBook, ...{ lastEdited } }` correctly preserves the already-mutated `existingBook.volumes`. Verify this assumption during implementation by confirming no intermediate cloning breaks the reference chain.

- [Note] `BookService.saveBook` uses `skipIfUnchanged: true` when saving chapter content. After the fix, `ChapterService.saveChapterContent` in `batchSaveChapter` writes the content first. If any other code path later triggers `BookService.saveBook` with `saveChapterContent: true`, the `skipIfUnchanged` check will correctly skip the redundant write. This is expected and correct behavior.
