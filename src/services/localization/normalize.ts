import type {
  Alias,
  Chapter,
  CharacterSetting,
  Novel,
  Paragraph,
  Terminology,
  Translation,
} from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale } from 'src/models/locale';
import type {
  EntityField,
  FieldRevisions,
  LocalizedMap,
  LocalizedSlot,
} from 'src/models/localized-data';
import { assertRevision, legacyAliasId, legacyRevision, legacySlot } from './revision';
import { normalizeTombstones } from './entity-identity';
import { mergeLanguageSlots } from './versioned-values';
import { canonicalStringify } from 'src/utils/canonical-json';

function translation(value: Translation, language: AppLocale = 'zh-CN'): Translation {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.translation !== 'string' ||
    typeof value.aiModelId !== 'string'
  )
    throw new Error('INVALID_TRANSLATION');
  const actual = value.language ?? language;
  if (!isAppLocale(actual)) throw new Error('INVALID_LOCALE');
  if (actual !== language) throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  return { ...value, language: actual };
}

function slots<T>(
  value: LocalizedMap<T>,
  decode: (value: T, locale: AppLocale) => T,
): LocalizedMap<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_LANGUAGE_SLOTS');
  const result: LocalizedMap<T> = {};
  for (const [locale, entry] of Object.entries(value)) {
    if (!isAppLocale(locale)) throw new Error('INVALID_LOCALE');
    const slot = entry as LocalizedSlot<T>;
    if (!slot || !Number.isFinite(slot.updatedAt) || slot.updatedAt < 0)
      throw new Error('INVALID_LANGUAGE_SLOT');
    assertRevision(slot.revision);
    result[locale] = {
      ...slot,
      revision: { ...slot.revision },
      value: slot.value === null ? null : decode(slot.value, locale),
    };
  }
  return result;
}

type TranslatedName = {
  translation: Translation;
  translationsByLanguage?: LocalizedMap<Translation>;
};

export function normalizeNameTranslations<T extends TranslatedName>(value: T, edited: number): T {
  const existing = value.translationsByLanguage;
  const normalized: LocalizedMap<Translation> =
    existing !== undefined
      ? slots(existing, translation)
      : value.translation.translation
        ? { 'zh-CN': legacySlot(translation(value.translation), edited) }
        : {};
  return {
    ...value,
    translationsByLanguage: normalized,
    translation: normalized['zh-CN']?.value ?? {
      ...value.translation,
      translation: '',
      language: 'zh-CN',
    },
  };
}

export function normalizeParagraphLanguages(paragraph: Paragraph, edited = 0): Paragraph {
  if (
    !paragraph ||
    typeof paragraph.id !== 'string' ||
    !paragraph.id ||
    typeof paragraph.text !== 'string' ||
    typeof paragraph.selectedTranslationId !== 'string' ||
    !Array.isArray(paragraph.translations)
  )
    throw new Error('INVALID_PARAGRAPH');
  const translations = paragraph.translations.map((value) =>
    translation(value, value.language ?? 'zh-CN'),
  );
  if (new Set(translations.map((value) => value.id)).size !== translations.length)
    throw new Error('DUPLICATE_TRANSLATION_ID');
  const legacySelection = translations.find(
    (value) => value.id === paragraph.selectedTranslationId && value.language === 'zh-CN',
  );
  // 旧格式缺少有效选用是“没有该语言数据”，不伪造一次显式清空操作。
  const selectedTranslations = slots(
    paragraph.selectedTranslations ??
      (legacySelection
        ? {
            'zh-CN': legacySlot(legacySelection.id, edited),
          }
        : {}),
    (id, locale) => {
      if (
        typeof id !== 'string' ||
        !translations.some((entry) => entry.id === id && entry.language === locale)
      ) {
        throw new Error('INVALID_LANGUAGE_SELECTION');
      }
      return id;
    },
  );
  return {
    ...paragraph,
    translations,
    selectedTranslations,
    selectedTranslationId: selectedTranslations['zh-CN']?.value ?? '',
  };
}

function title(value: Chapter['title'], edited: number): Chapter['title'] {
  return typeof value === 'string' ? value : normalizeNameTranslations(value, edited);
}

export function normalizeChapterLanguages(content: unknown): Paragraph[] {
  if (!Array.isArray(content)) throw new Error('INVALID_CHAPTER_CONTENT');
  const paragraphs = content.map((paragraph: Paragraph) => normalizeParagraphLanguages(paragraph));
  if (new Set(paragraphs.map((paragraph) => paragraph.id)).size !== paragraphs.length)
    throw new Error('DUPLICATE_PARAGRAPH_ID');
  return paragraphs;
}

function fields(value: Terminology | CharacterSetting | Alias): FieldRevisions {
  const revisions = { ...value.fieldRevisions };
  for (const revision of Object.values(revisions)) assertRevision(revision);
  for (const key of ['name', 'description', 'sex', 'speakingStyle'] as EntityField[]) {
    if ((value as unknown as Record<string, unknown>)[key] !== undefined && !revisions[key]) {
      revisions[key] = legacyRevision((value as unknown as Record<string, unknown>)[key]);
    }
  }
  return revisions;
}

function normalizeAliases(bookId: string, character: CharacterSetting): Alias[] {
  const result = new Map<string, Alias>();
  const explicit = new Set<string>();
  for (const alias of character.aliases) {
    const id = alias.id ?? legacyAliasId(bookId, character.id, alias.name);
    const value: Alias = {
      ...normalizeNameTranslations(alias, 0),
      id,
      fieldRevisions: fields(alias),
    };
    const previous = result.get(id);
    if (previous) {
      if (alias.id !== undefined || explicit.has(id)) throw new Error('DUPLICATE_ALIAS_ID');
      const translationsByLanguage = mergeLanguageSlots(
        previous.translationsByLanguage,
        value.translationsByLanguage,
      );
      const legacyConflict =
        previous.legacyConflict === true ||
        canonicalStringify(previous.translationsByLanguage) !==
          canonicalStringify(value.translationsByLanguage);
      result.set(id, {
        ...previous,
        translationsByLanguage,
        translation: translationsByLanguage['zh-CN']?.value ?? previous.translation,
        ...(legacyConflict ? { legacyConflict: true } : {}),
      });
    } else result.set(id, value);
    if (alias.id !== undefined) explicit.add(id);
  }
  return [...result.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, alias]) => alias);
}

export function normalizeBookEntities(
  book: Novel,
): Pick<Novel, 'entitySyncVersion' | 'entityTombstones' | 'terminologies' | 'characterSettings'> {
  if (book.entitySyncVersion !== undefined && book.entitySyncVersion !== 1)
    throw new Error('UNSUPPORTED_ENTITY_SYNC_VERSION');
  // 旧格式没有字段级修改时间；统一 epoch 保证各读取入口产生相同迁移结果。
  const edited = 0;
  return {
    entitySyncVersion: 1,
    entityTombstones: normalizeTombstones(book.entityTombstones),
    terminologies: (book.terminologies ?? []).map((term) => ({
      ...normalizeNameTranslations(term, edited),
      fieldRevisions: fields(term),
    })),
    characterSettings: (book.characterSettings ?? []).map((character) => ({
      ...normalizeNameTranslations(character, edited),
      fieldRevisions: fields(character),
      aliases: normalizeAliases(book.id, character),
    })),
  };
}

export function normalizeBookLanguages(book: Novel): Novel {
  if (book.targetLanguage !== undefined && !isAppLocale(book.targetLanguage))
    throw new Error('INVALID_LOCALE');
  const edited = 0;
  return {
    ...book,
    targetLanguage: book.targetLanguage ?? 'zh-CN',
    ...normalizeBookEntities(book),
    ...(book.volumes
      ? {
          volumes: book.volumes.map((volume) => ({
            ...volume,
            title: title(volume.title, edited),
            ...(volume.chapters
              ? {
                  chapters: volume.chapters.map((chapter) => ({
                    ...chapter,
                    title: title(chapter.title, 0),
                    ...(chapter.content
                      ? {
                          content: chapter.content.map((paragraph) =>
                            normalizeParagraphLanguages(paragraph, 0),
                          ),
                        }
                      : {}),
                  })),
                }
              : {}),
          })),
        }
      : {}),
  };
}
