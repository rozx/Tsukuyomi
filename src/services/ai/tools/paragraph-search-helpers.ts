import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService, type ParagraphSearchResult } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import type { Novel, Chapter, Volume } from 'src/models/novel';

export interface ChapterLocation {
  chapter: Chapter;
  chapterIndex: number;
  volume: Volume;
  volumeIndex: number;
}

/**
 * 工具前置流程：校验 bookId / paragraph_id → 查找书籍 → 异步定位目标段落。
 * 硬错误（bookId / paragraph_id 为空、书不存在）通过 throw 抛出；
 * 段落不存在以 { ok: false, response } 返回，response 已 JSON.stringify 好，
 * 供工具直接 return 给 AI。
 */
export async function resolveBookAndParagraphLocation(
  bookId: string | undefined,
  paragraph_id: string | undefined,
): Promise<
  | {
      ok: true;
      bookId: string;
      book: Novel;
      booksStore: ReturnType<typeof useBooksStore>;
      location: ParagraphSearchResult;
    }
  | { ok: false; response: string }
> {
  if (!bookId) {
    throw new Error('书籍 ID 不能为空');
  }
  if (!paragraph_id) {
    throw new Error('段落 ID 不能为空');
  }

  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  if (!book) {
    throw new Error(`书籍不存在: ${bookId}`);
  }

  const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
  if (!location) {
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: `段落不存在: ${paragraph_id}`,
      }),
    };
  }

  return { ok: true, bookId, book, booksStore, location };
}

/**
 * 过滤空白关键词并返回非空数组。若 source 不是数组则返回空数组。
 */
export function filterValidKeywords(source: unknown): string[] {
  if (!Array.isArray(source)) return [];
  return source.filter((k): k is string => typeof k === 'string' && k.trim().length > 0);
}

/**
 * 在书籍 volumes 树中定位 chapterId 所在位置。
 * 找不到返回 null。
 */
function findChapterPosition(
  book: Novel,
  chapterId: string,
): { volumeIndex: number; chapterIndex: number } | null {
  if (!book.volumes) return null;
  for (let vIndex = 0; vIndex < book.volumes.length; vIndex++) {
    const volume = book.volumes[vIndex];
    if (!volume?.chapters) continue;
    const cIndex = volume.chapters.findIndex((c) => c.id === chapterId);
    if (cIndex !== -1) {
      return { volumeIndex: vIndex, chapterIndex: cIndex };
    }
  }
  return null;
}

/**
 * 计算搜索时的 volume / chapter 下标范围。
 * 传入 chapterId 时限定到该章节；否则覆盖整本书。
 */
export function resolveSearchRange(
  book: Novel,
  chapterId: string | undefined,
): {
  startVolumeIndex: number;
  endVolumeIndex: number;
  targetVolumeIndex: number | null;
  targetChapterIndex: number | null;
} | null {
  if (!book.volumes || book.volumes.length === 0) return null;

  if (chapterId) {
    const pos = findChapterPosition(book, chapterId);
    if (!pos) return null;
    return {
      startVolumeIndex: pos.volumeIndex,
      endVolumeIndex: pos.volumeIndex,
      targetVolumeIndex: pos.volumeIndex,
      targetChapterIndex: pos.chapterIndex,
    };
  }

  return {
    startVolumeIndex: 0,
    endVolumeIndex: book.volumes.length - 1,
    targetVolumeIndex: null,
    targetChapterIndex: null,
  };
}

function resolveChapterRange(
  volumeChaptersLength: number,
  targetChapterIndex: number | null,
): { startChapterIndex: number; endChapterIndex: number } {
  if (targetChapterIndex !== null) {
    return { startChapterIndex: targetChapterIndex, endChapterIndex: targetChapterIndex };
  }
  return { startChapterIndex: 0, endChapterIndex: volumeChaptersLength - 1 };
}

/**
 * 批量确保章节内容已加载。
 * 对 content === undefined 的章节调用 ChapterContentService.loadChapterContentsBatch。
 * 返回实际加载的章节数量。
 */
export async function ensureChaptersLoaded(chapters: Chapter[]): Promise<number> {
  const toLoad = chapters.filter((c) => c.content === undefined);
  if (toLoad.length === 0) return 0;

  const contentsMap = await ChapterContentService.loadChapterContentsBatch(
    toLoad.map((c) => c.id),
  );
  for (const chapter of toLoad) {
    chapter.content = contentsMap.get(chapter.id) || [];
    chapter.contentLoaded = true;
  }
  return toLoad.length;
}

/**
 * 遍历 [startVolumeIndex..endVolumeIndex] × [targetChapterIndex | 全部] 范围内的所有章节，
 * 连同 volume/chapter 的索引一起返回，供需要构造 ParagraphSearchResult 的搜索循环使用。
 */
export function collectChapterLocationsInRange(
  book: Novel,
  range: {
    startVolumeIndex: number;
    endVolumeIndex: number;
    targetVolumeIndex: number | null;
    targetChapterIndex: number | null;
  },
): ChapterLocation[] {
  if (!book.volumes) return [];
  const locations: ChapterLocation[] = [];

  for (let vIndex = range.startVolumeIndex; vIndex <= range.endVolumeIndex; vIndex++) {
    const volume = book.volumes[vIndex];
    if (!volume?.chapters) continue;

    if (range.targetVolumeIndex !== null && vIndex !== range.targetVolumeIndex) continue;

    const { startChapterIndex, endChapterIndex } = resolveChapterRange(
      volume.chapters.length,
      range.targetChapterIndex,
    );
    for (let cIndex = startChapterIndex; cIndex <= endChapterIndex; cIndex++) {
      const chapter = volume.chapters[cIndex];
      if (chapter) {
        locations.push({ chapter, chapterIndex: cIndex, volume, volumeIndex: vIndex });
      }
    }
  }

  return locations;
}
