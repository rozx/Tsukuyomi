import type { Novel } from 'src/models/novel';
import type { SyncRevision } from 'src/models/localized-data';
import { replaceLanguageSlots } from './versioned-values';

/** 对明确覆盖范围内的标题和段落选用分配新版本。 */
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
      for (const paragraph of chapter.content ?? []) {
        const prior = other?.content?.find(
          (item) => item.id === paragraph.id && item.text === paragraph.text,
        );
        paragraph.selectedTranslations = replaceLanguageSlots(
          paragraph.selectedTranslations,
          prior?.selectedTranslations,
          revision,
          now,
        );
        paragraph.selectedTranslationId = paragraph.selectedTranslations['zh-CN']?.value ?? '';
      }
    }
  }
}
