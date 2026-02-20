## 1. Fix concurrent save in useChapterTranslation

- [x] 1.1 In `src/composables/book-details/useChapterTranslation.ts`, update the `batchSaveChapter` function so that it directly calls `await ChapterService.saveChapterContent(chapterToSave)` instead of relying strictly on `booksStore.updateBook` for content saves.
- [x] 1.2 After saving chapter content, call `await booksStore.updateBook(book.value.id, { lastEdited: new Date() })` — omitting `volumes` entirely so that the existing `isOnlyMetadataUpdate` logic kicks in automatically (no need to pass `saveChapterContent: false`).

## 2. Verify behavior

- [x] 2.1 Double-check that `booksStore.updateBook` in `src/stores/books.ts` skips saving contents when `volumes` is not provided (verified it relies on `isOnlyMetadataUpdate` and handles this efficiently).
- [x] 2.2 Confirm that `book.value` (the Ref passed into the composable) shares the same reactive object reference as `this.books[index]` in the Pinia store, so that in-memory `volumes` mutations from `updateParagraphsAndSave` are visible to `updateBook` without explicitly passing `volumes`.
- [x] 2.3 Re-test translating multiple chapters concurrently to verify that chunks are no longer lost.
