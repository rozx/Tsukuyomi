import type { Chapter, Novel } from 'src/models/novel';
import { mergeLanguageSlots } from './versioned-values';
import { normalizeNameTranslations } from './normalize';

/** 仅相同原文标题合并语言槽；结构裁决选中的新原文不能携带旧译名。 */
export function mergeTitlePreservingTranslation(
  winnerTitle: Chapter['title'],
  loserTitle: Chapter['title'],
): Chapter['title'] {
  const original = typeof winnerTitle === 'string' ? winnerTitle : winnerTitle?.original;
  const otherOriginal = typeof loserTitle === 'string' ? loserTitle : loserTitle?.original;
  // 空字符串原文（未命名卷章）同样是可合并的标题；只有原文不同或缺失标题时才不合并
  if (original !== otherOriginal || original === undefined) return winnerTitle;
  if (typeof winnerTitle === 'string')
    return typeof loserTitle === 'string' ? winnerTitle : normalizeNameTranslations(loserTitle, 0);
  if (typeof loserTitle === 'string') return normalizeNameTranslations(winnerTitle, 0);
  const left = normalizeNameTranslations(winnerTitle, 0);
  const right = normalizeNameTranslations(loserTitle, 0);
  // 简中投影交给规范化统一推导：槽为空时保留原有 id / aiModelId，与其他写入路径一致，
  // 避免合并结果与已存记录逐字不同而触发无意义的写入和修改序号递增
  return normalizeNameTranslations(
    {
      ...left,
      translationsByLanguage: mergeLanguageSlots(
        left.translationsByLanguage,
        right.translationsByLanguage,
      ),
    },
    0,
  );
}

/**
 * 整本保存时按 revision 合并已存储的卷章标题语言槽：调用方可能持有旧快照，
 * 不能让它覆盖其他标签页或后台任务刚写入的译名。结构（卷章增删、原文改名）以请求为准。
 */
export function preserveStoredTitleSlots<T extends Novel>(requested: T, stored: Novel): T {
  if (!requested.volumes) return requested;
  const storedVolumes = new Map((stored.volumes ?? []).map((volume) => [volume.id, volume]));
  const storedChapters = new Map(
    (stored.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).map((chapter) => [chapter.id, chapter] as const),
    ),
  );
  return {
    ...requested,
    volumes: requested.volumes.map((volume) => {
      const previous = storedVolumes.get(volume.id);
      return {
        ...volume,
        ...(previous
          ? { title: mergeTitlePreservingTranslation(volume.title, previous.title) }
          : {}),
        ...(volume.chapters
          ? {
              chapters: volume.chapters.map((chapter) => {
                const old = storedChapters.get(chapter.id);
                return old
                  ? { ...chapter, title: mergeTitlePreservingTranslation(chapter.title, old.title) }
                  : chapter;
              }),
            }
          : {}),
      };
    }),
  };
}
