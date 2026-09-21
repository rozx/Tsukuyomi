import { getDB } from 'src/utils/indexed-db';
import { deleteCacheEntry, setCacheEntry } from 'src/utils/chapter-content-loader';
import type { Paragraph } from 'src/models/novel';

/** 提交后按当前数据库重建派生数据；重复执行不会把旧正文放回缓存。 */
export async function maintainChapterContent(bookId: string, chapterIds: string[]): Promise<void> {
  const ids = [...new Set(chapterIds)];
  for (const id of ids) deleteCacheEntry(id);
  const db = await getDB();
  const book = await db.get('books', bookId);
  const embedded = new Map(
    (book?.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? [])
        .filter((chapter) => chapter.content !== undefined)
        .map((chapter) => [chapter.id, chapter.content] as const),
    ),
  );
  const [
    { markChapterDirty, cancelChapterDirty },
    { EmbeddingQueue },
    { ChapterEmbeddingService },
    { FullTextIndexService },
  ] = await Promise.all([
    import('src/utils/chapter-embedding-debouncer'),
    import('src/services/embedding-queue'),
    import('src/services/chapter-embedding-service'),
    import('src/services/full-text-index-service'),
  ]);
  try {
    for (const id of ids) {
      const current = await db.get('chapter-contents', id);
      const serialized = current?.content ?? JSON.stringify(embedded.get(id));
      if (serialized !== undefined) {
        setCacheEntry(id, {
          parsed: JSON.parse(serialized) as Paragraph[],
          serialized,
        });
        markChapterDirty(id);
      } else {
        cancelChapterDirty(id);
        EmbeddingQueue.cancelChapter(id);
        await ChapterEmbeddingService.deleteChunksForChapter(id);
      }
    }
  } finally {
    await FullTextIndexService.invalidateIndex(bookId);
  }
}

/** 普通保存的派生维护失败不改变已提交结果；导入直接调用上面的可重试入口。 */
export async function maintainLibraryChanges(changes: Map<string, string[]>): Promise<void> {
  for (const [bookId, ids] of changes) {
    try {
      await maintainChapterContent(bookId, ids);
    } catch (error) {
      console.warn('书籍已保存，但派生数据维护失败:', bookId, error);
    }
  }
}
