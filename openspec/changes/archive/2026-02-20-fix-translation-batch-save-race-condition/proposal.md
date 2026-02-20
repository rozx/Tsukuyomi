## Why

During multi-chapter concurrent translation, a critical async race condition occurs. `useChapterTranslation.ts` incrementally maintains the translated chunks in memory via `updateParagraphsAndSave(..., { skipSave: true })`, which is fine. However, when a chapter finishes translating and calls `batchSaveChapter`, it attempts to pass the **entire `book.value.volumes` snapshot** to `booksStore.updateBook`. Inside `updateBook`, an `await ChapterContentService.loadChapterContentsBatch(...)` call suspends execution. During this suspension, AI may return a translation chunk for _another_ concurrently translating chapter, adding it to the live `volumes` object in memory. When the `await` finishes, the older snapshot (without the new chunk) overwrites the database and the live memory, silently wiping out the newly received translation.

This fix is necessary immediately to ensure multi-chapter concurrent translations are reliable and do not suffer from silent data loss.

## What Changes

- Modify `batchSaveChapter` in `useChapterTranslation.ts` to _only_ save the actual translated `chapterToSave` directly to `ChapterService` without replacing `volumes`.
- In `batchSaveChapter`, merely ping the store to update the `lastEdited` timestamp.
- Ensure that the store's `updateBook` does not have to rebuild or merge `volumes` when a translation finishes, effectively avoiding the `await` execution gap.
- This isolates each chapter's save operation to its own `ChapterContentService` state, ensuring concurrent chunks do not overwrite each other at the `volumes` level.

## Capabilities

### New Capabilities

<!-- No new capabilities. -->

### Modified Capabilities

<!-- No specs are modified, this is strictly a bugfix to the implementation structure. -->

## Impact

- `src/composables/book-details/useChapterTranslation.ts` (`batchSaveChapter`)
- `src/stores/books.ts` (if any adjustments are needed to allow updating only the timestamp without passing the entire `volumes`)
