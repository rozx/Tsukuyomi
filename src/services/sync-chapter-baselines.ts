import type { Novel } from 'src/models/novel';
import { chapterStructureHash } from 'src/utils/chapter-structure-hash';
import { getDB } from 'src/utils/indexed-db';

/**
 * 同步章节结构基准（本地存储，不上传）。
 *
 * 记录本设备上次确认的远端章节段落结构指纹，用于合并时判断哪一方改过结构。
 * 只在确认远端已处于该状态后写入：下载应用成功、上传成功、或本地与远端逐字一致时补写。
 * 删除书籍 / 章节、清空书库时由 LibraryPersistence 在同一事务内清理。
 */

export interface ChapterBaselineInput {
  chapterId: string;
  bookId: string;
  hash: string;
}

/** 读取指定章节的基准指纹；没有基准的章节不出现在结果中 */
export async function getChapterBaselines(
  chapterIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set(chapterIds)];
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const db = await getDB();
  const tx = db.transaction('sync-chapter-baselines', 'readonly');
  const records = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  for (const record of records) {
    if (record) result.set(record.chapterId, record.hash);
  }
  return result;
}

/** 批量写入基准（覆盖同一章节的旧值） */
export async function putChapterBaselines(entries: readonly ChapterBaselineInput[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDB();
  const tx = db.transaction('sync-chapter-baselines', 'readwrite');
  const recordedAt = Date.now();
  await Promise.all(entries.map((entry) => tx.store.put({ ...entry, recordedAt })));
  await tx.done;
}

/**
 * 以书籍内联正文计算各章结构指纹并写入基准，只写还没有基准或基准不同的章节。
 * 没有内联正文（或正文为空）的章节不写：无法确认其结构，下次按没有基准处理。
 * 写入失败只记录日志，不影响同步。
 */
export async function recordStructureBaselines(novels: readonly Novel[]): Promise<void> {
  try {
    const entries: ChapterBaselineInput[] = [];
    for (const novel of novels) {
      for (const volume of novel.volumes ?? []) {
        for (const chapter of volume.chapters ?? []) {
          if (!Array.isArray(chapter.content) || chapter.content.length === 0) continue;
          entries.push({
            chapterId: chapter.id,
            bookId: novel.id,
            hash: await chapterStructureHash(chapter.content),
          });
        }
      }
    }
    const existing = await getChapterBaselines(entries.map((entry) => entry.chapterId));
    await putChapterBaselines(
      entries.filter((entry) => existing.get(entry.chapterId) !== entry.hash),
    );
  } catch (error) {
    console.warn('[sync-chapter-baselines] 写入章节结构基准失败，下次同步按没有基准处理:', error);
  }
}
