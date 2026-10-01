import type { Novel, Paragraph } from 'src/models/novel';
import type { SyncRevision } from 'src/models/localized-data';
import { replaceLanguageSlots } from './versioned-values';
import { assertNewRevision } from './revision';
import { replaceTranslationDeletions } from './translation-deletions';
import { chapterPairKey, pairByIdThenKey, paragraphPairKey, volumePairKey } from './sync-pairing';

/** 对明确覆盖范围内的标题、段落选用以及与另一侧不同的同 ID 译文版本分配新版本。 */
export function replaceBookLanguageSlots(
  local: Novel,
  remote: Novel,
  revision: SyncRevision,
  now: number,
) {
  type Title = NonNullable<Novel['volumes']>[number]['title'];
  function forceTitle(value: Title, old: Title): Title {
    const original = typeof value === 'string' ? value : value.original;
    const other =
      typeof old === 'object' && old.original === original ? old.translationsByLanguage : {};
    const owner =
      typeof value === 'string'
        ? { original, translation: { id: '', translation: '', aiModelId: '' } }
        : value;
    const translationsByLanguage = replaceLanguageSlots(
      owner.translationsByLanguage,
      other,
      revision,
      now,
    );
    if (!Object.keys(translationsByLanguage).length) return value;
    return {
      ...owner,
      translationsByLanguage,
      translation: translationsByLanguage['zh-CN']?.value ?? {
        id: '',
        translation: '',
        aiModelId: '',
        language: 'zh-CN',
      },
    };
  }
  const chapters = new Map(
    (remote.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).map((chapter) => [chapter.id, chapter] as const),
    ),
  );
  // 卷、章节、段落按与同步合并相同的规则配对（id 优先，再按原文标题 / webUrl / 原文回退），
  // 否则重新抓取导致 ID 不同时，另一侧的版本既不会被盖戳也不会写入删除记录，之后又被同步合并回来。
  // 跨卷移动的同 ID 章节沿用按 ID 查找。
  const localVolumes = local.volumes ?? [];
  const volumePairs = pairByIdThenKey(localVolumes, remote.volumes ?? [], volumePairKey).pairs;
  localVolumes.forEach((volume, volumeIndex) => {
    const otherVolume = volumePairs[volumeIndex];
    volume.title = forceTitle(volume.title, otherVolume?.title ?? '');
    const localChapters = volume.chapters ?? [];
    const chapterPairs = pairByIdThenKey(
      localChapters,
      otherVolume?.chapters ?? [],
      chapterPairKey,
    ).pairs;
    localChapters.forEach((chapter, chapterIndex) => {
      const other = chapterPairs[chapterIndex] ?? chapters.get(chapter.id);
      chapter.title = forceTitle(chapter.title, other?.title ?? '');
      forceParagraphs(chapter.content ?? [], other?.content ?? [], revision, now);
    });
  });
}

function forceParagraphs(
  content: Paragraph[],
  otherContent: Paragraph[],
  revision: SyncRevision,
  now: number,
) {
  const pairs = pairByIdThenKey(content, otherContent, paragraphPairKey).pairs;
  content.forEach((paragraph, index) => {
    const paired = pairs[index];
    const prior = paired?.text === paragraph.text ? paired : undefined;
    // 保留的同 ID 版本若与另一侧文本不同，必须带上本次 revision，
    // 否则另一侧较新的副本会在之后的合并中把覆盖结果改回去
    const others = new Map((prior?.translations ?? []).map((value) => [value.id, value]));
    paragraph.translations = paragraph.translations.map((value) => {
      const other = others.get(value.id);
      if (!other || other.translation === value.translation) return value;
      assertNewRevision(revision, other.revision);
      return { ...value, revision: { ...revision } };
    });
    paragraph.selectedTranslations = replaceLanguageSlots(
      paragraph.selectedTranslations,
      prior?.selectedTranslations,
      revision,
      now,
    );
    paragraph.selectedTranslationId = paragraph.selectedTranslations['zh-CN']?.value ?? '';
    const replaced = replaceTranslationDeletions(paragraph, prior, revision, now);
    paragraph.translations = replaced.translations;
    if (replaced.deletedTranslations) paragraph.deletedTranslations = replaced.deletedTranslations;
    else delete paragraph.deletedTranslations;
  });
}
