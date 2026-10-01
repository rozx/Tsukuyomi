import type { Novel } from 'src/models/novel';
import type { SyncRevision } from 'src/models/localized-data';
import { replaceLanguageSlots } from './versioned-values';
import { assertNewRevision } from './revision';
import { replaceTranslationDeletions } from './translation-deletions';
import { createParagraphMatcher } from './paragraph-pairing';

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
  for (const volume of local.volumes ?? []) {
    volume.title = forceTitle(
      volume.title,
      remote.volumes?.find((item) => item.id === volume.id)?.title ?? '',
    );
    for (const chapter of volume.chapters ?? []) {
      const other = chapters.get(chapter.id);
      chapter.title = forceTitle(chapter.title, other?.title ?? '');
      // 与同步合并相同的配对（id 优先、按原文回退），否则重新抓取导致段落 ID 不同时，
      // 另一侧的版本既不会被盖戳也不会写入删除记录，之后又被同步合并回来
      const { match } = createParagraphMatcher(other?.content ?? []);
      for (const paragraph of chapter.content ?? []) {
        const paired = match(paragraph);
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
        if (replaced.deletedTranslations)
          paragraph.deletedTranslations = replaced.deletedTranslations;
        else delete paragraph.deletedTranslations;
      }
    }
  }
}
