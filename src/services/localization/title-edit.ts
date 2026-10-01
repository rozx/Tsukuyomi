import type { Chapter, Novel, Translation } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import type { LocalizedMap } from 'src/models/localized-data';
import { replaceLanguageSlots } from './versioned-values';
import { getNameTranslation, setNameTranslation } from './selection';
import { normalizeNameTranslations } from './normalize';
import { generateShortId } from 'src/utils/id-generator';

export interface TitleEdit {
  kind: 'volume' | 'chapter';
  id: string;
  expectedOriginal: string;
  original?: string;
  translation?: string;
  aiModelId?: string;
  restoreTranslations?: LocalizedMap<Translation>;
  targetVolumeId?: string;
  updates?: Pick<
    Partial<Chapter>,
    'translationInstructions' | 'polishInstructions' | 'proofreadingInstructions' | 'webUrl'
  >;
}

export function titleOriginal(title: Chapter['title']): string {
  return typeof title === 'string' ? title : title.original;
}

function editTitleValue(
  title: Chapter['title'],
  language: AppLocale,
  edit: TitleEdit,
  revision: SyncRevision,
  now: number,
): Chapter['title'] {
  if (titleOriginal(title) !== edit.expectedOriginal) throw new Error('TITLE_SOURCE_CHANGED');
  const blank: Translation = { id: '', translation: '', aiModelId: '', language: 'zh-CN' };
  let owner = normalizeNameTranslations(
    typeof title === 'string' ? { original: title, translation: blank } : title,
    0,
  );
  if (edit.original !== undefined && edit.original !== owner.original) {
    owner = { original: edit.original, translation: blank, translationsByLanguage: {} };
  }
  if (edit.restoreTranslations !== undefined) {
    const restored = normalizeNameTranslations(
      { translation: blank, translationsByLanguage: edit.restoreTranslations },
      0,
    );
    owner = normalizeNameTranslations(
      {
        ...owner,
        translationsByLanguage: replaceLanguageSlots(
          restored.translationsByLanguage,
          owner.translationsByLanguage,
          revision,
          now,
        ),
      },
      0,
    );
  }
  if (edit.translation === undefined) return owner;
  const previous = getNameTranslation(owner, language);
  return setNameTranslation(
    owner,
    language,
    {
      ...(previous ?? { id: generateShortId(), aiModelId: '' }),
      translation: edit.translation,
      aiModelId: edit.aiModelId ?? previous?.aiModelId ?? '',
      language,
    },
    revision,
    now,
  );
}

/** 基于最新元数据修改一个标题，章节移动和设置共享同一写入。 */
export function applyTitleEdit(
  book: Novel,
  language: AppLocale,
  edit: TitleEdit,
  revision: SyncRevision,
  now: number,
): Novel {
  const volumes = book.volumes ?? [];
  if (edit.kind === 'volume') {
    const current = volumes.find((volume) => volume.id === edit.id);
    if (!current) throw new Error('VOLUME_MISSING');
    const title = editTitleValue(current.title, language, edit, revision, now);
    return {
      ...book,
      lastEdited: new Date(now),
      volumes: volumes.map((volume) => (volume.id === edit.id ? { ...volume, title } : volume)),
    };
  }
  const source = volumes.find((volume) =>
    volume.chapters?.some((chapter) => chapter.id === edit.id),
  );
  const current = source?.chapters?.find((chapter) => chapter.id === edit.id);
  if (!source || !current) throw new Error('CHAPTER_MISSING');
  const destinationId = edit.targetVolumeId ?? source.id;
  if (!volumes.some((volume) => volume.id === destinationId)) throw new Error('VOLUME_MISSING');
  const updated: Chapter = {
    ...current,
    ...edit.updates,
    title: editTitleValue(current.title, language, edit, revision, now),
    lastEdited: new Date(now),
  };
  return {
    ...book,
    lastEdited: new Date(now),
    volumes: volumes.map((volume) => {
      if (source.id === destinationId)
        return volume.id === source.id
          ? {
              ...volume,
              chapters: volume.chapters?.map((chapter) =>
                chapter.id === edit.id ? updated : chapter,
              ),
            }
          : volume;
      if (volume.id === source.id)
        return {
          ...volume,
          chapters: volume.chapters?.filter((chapter) => chapter.id !== edit.id),
        };
      if (volume.id === destinationId)
        return { ...volume, chapters: [...(volume.chapters ?? []), updated] };
      return volume;
    }),
  };
}
