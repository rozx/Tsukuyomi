import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { scanChapters } from 'src/services/library-query/paragraph-scan';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';

/**
 * 章节翻译进度：get_book 的卷概览与 check_book_updates 的本地进度共用。
 * 没有正文的章节不计入任何一类。
 */

export interface ChapterStat {
  paragraph_count: number;
  translated_count: number;
}

export type ChapterStats = Map<string, ChapterStat>;

/** 各章的段落数与已译段落数（空段落不计）；正文不在内存里的章节分批读取 */
export async function countChapterStats(
  chapters: readonly Chapter[],
  language: AppLocale,
): Promise<ChapterStats> {
  const stats: ChapterStats = new Map();
  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    const nonEmpty = paragraphs.filter((p) => p.text.trim().length > 0);
    stats.set(chapter.id, {
      paragraph_count: nonEmpty.length,
      translated_count: nonEmpty.filter((p) =>
        Boolean(getLanguageTranslation(p, language)?.translation.trim()),
      ).length,
    });
  }
  return stats;
}

/** 有正文且还没译完 */
export function isUnfinishedChapter(stat: ChapterStat | undefined): boolean {
  return Boolean(stat && stat.paragraph_count > 0 && stat.translated_count < stat.paragraph_count);
}

interface ChapterRef {
  chapter: Chapter;
  volumeId: string;
}

const chapterRefs = (volumes: readonly Volume[]): ChapterRef[] =>
  volumes.flatMap((volume) =>
    (volume.chapters ?? []).map((chapter) => ({ chapter, volumeId: volume.id })),
  );

/** 已译完、译了一部分、还没开始的章节数，以及按顺序第一个没译完的章节 */
function summarize(refs: readonly ChapterRef[], stats: ChapterStats) {
  let translated = 0;
  let inProgress = 0;
  let untranslated = 0;
  let first: ChapterRef | null = null;
  for (const ref of refs) {
    const stat = stats.get(ref.chapter.id);
    if (!stat || stat.paragraph_count === 0) continue;
    if (!isUnfinishedChapter(stat)) {
      translated += 1;
      continue;
    }
    if (stat.translated_count > 0) inProgress += 1;
    else untranslated += 1;
    first ??= ref;
  }
  return {
    counts: {
      translated_chapter_count: translated,
      in_progress_chapter_count: inProgress,
      untranslated_chapter_count: untranslated,
    },
    first,
  };
}

/** 一卷的翻译进度（get_book 的卷概览） */
export function summarizeVolumeProgress(volume: Volume, stats: ChapterStats) {
  const { counts, first } = summarize(chapterRefs([volume]), stats);
  return {
    ...counts,
    first_untranslated_chapter: first
      ? { chapter_id: first.chapter.id, title_original: titleOriginal(first.chapter.title) }
      : null,
  };
}

/** 本地最新几章（有正文的）各译了多少 */
const LATEST_CHAPTER_COUNT = 2;

/**
 * 整本书的翻译进度，附带最新几章的已译段落数：检查来源站点更新时一并给出，
 * 手动导入后还没译的章节不会因为站点上没有新章节而被漏掉。
 */
export async function summarizeBookProgress(book: Novel, language: AppLocale) {
  const refs = chapterRefs(book.volumes ?? []);
  const stats = await countChapterStats(
    refs.map((ref) => ref.chapter),
    language,
  );
  const { counts, first } = summarize(refs, stats);
  const latest = refs
    .filter((ref) => (stats.get(ref.chapter.id)?.paragraph_count ?? 0) > 0)
    .slice(-LATEST_CHAPTER_COUNT);
  return {
    ...counts,
    first_untranslated_chapter: first
      ? {
          chapter_id: first.chapter.id,
          volume_id: first.volumeId,
          title_original: titleOriginal(first.chapter.title),
        }
      : null,
    latest_chapters: latest.map((ref) => ({
      chapter_id: ref.chapter.id,
      title_original: titleOriginal(ref.chapter.title),
      ...stats.get(ref.chapter.id)!,
    })),
  };
}
