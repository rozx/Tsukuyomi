import { getDB } from 'src/utils/indexed-db';
import { deleteCacheEntry, setCacheEntry } from 'src/utils/chapter-content-loader';
import type { Paragraph } from 'src/models/novel';

/** 提交后按当前数据库重建派生数据；重复执行不会把旧正文放回缓存。 */
export async function maintainChapterContent(bookId: string, chapterIds: string[]): Promise<void> {
  const ids = [...new Set(chapterIds)];
  for (const id of ids) deleteCacheEntry(id);
  const db = await getDB();
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
      if (current) {
        setCacheEntry(id, {
          parsed: JSON.parse(current.content) as Paragraph[],
          serialized: current.content,
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
