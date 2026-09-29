import type { Paragraph, Translation } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import type { LocalizedMap } from 'src/models/localized-data';
import { assertNewRevision } from './revision';
import { normalizeNameTranslations, normalizeParagraphLanguages } from './normalize';
import { canonicalStringify } from 'src/utils/canonical-json';

export function getLanguageTranslation(
  paragraph: Paragraph,
  locale: AppLocale,
): Translation | undefined {
  const id =
    paragraph.selectedTranslations !== undefined
      ? paragraph.selectedTranslations[locale]?.value
      : locale === 'zh-CN'
        ? paragraph.selectedTranslationId
        : undefined;
  return paragraph.translations.find(
    (value) =>
      value.id === id && (value.language ?? 'zh-CN') === locale && value.translation.trim(),
  );
}

function withSelection(
  paragraph: Paragraph,
  locale: AppLocale,
  id: string | null,
  revision: SyncRevision,
  updatedAt: number,
): Paragraph {
  const previous = paragraph.selectedTranslations?.[locale];
  if (previous?.value === id) return paragraph;
  assertNewRevision(revision, previous?.revision);
  const selectedTranslations = {
    ...paragraph.selectedTranslations,
    [locale]: { value: id, revision: { ...revision }, updatedAt },
  };
  return {
    ...paragraph,
    selectedTranslations,
    selectedTranslationId: selectedTranslations['zh-CN']?.value ?? '',
  };
}

export function appendLanguageTranslation(
  paragraph: Paragraph,
  locale: AppLocale,
  value: Translation,
  revision: SyncRevision,
  updatedAt: number,
): Paragraph {
  const normalized = normalizeParagraphLanguages(paragraph);
  if (value.language !== undefined && value.language !== locale)
    throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  const sameId = normalized.translations.find((entry) => entry.id === value.id);
  if (sameId && (sameId.language !== locale || sameId.translation !== value.translation))
    throw new Error('TRANSLATION_ID_CONFLICT');
  const existing = normalized.translations.find(
    (entry) => entry.language === locale && entry.translation === value.translation,
  );
  const translations = existing
    ? normalized.translations
    : [...normalized.translations, { ...value, language: locale }];
  return withSelection(
    { ...normalized, translations },
    locale,
    existing?.id ?? value.id,
    revision,
    updatedAt,
  );
}

function targetVersion(paragraph: Paragraph, locale: AppLocale, id: string): Translation {
  const value = paragraph.translations.find((entry) => entry.id === id);
  if (!value) throw new Error('TRANSLATION_NOT_FOUND');
  if ((value.language ?? 'zh-CN') !== locale) throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  return value;
}

export function selectLanguageTranslation(
  paragraph: Paragraph,
  locale: AppLocale,
  id: string | null,
  revision: SyncRevision,
  updatedAt: number,
): Paragraph {
  const normalized = normalizeParagraphLanguages(paragraph);
  if (id !== null) targetVersion(normalized, locale, id);
  return withSelection(normalized, locale, id, revision, updatedAt);
}

export function removeLanguageTranslation(
  paragraph: Paragraph,
  locale: AppLocale,
  id: string,
  revision: SyncRevision,
  updatedAt: number,
): Paragraph {
  const normalized = normalizeParagraphLanguages(paragraph);
  targetVersion(normalized, locale, id);
  const translations = normalized.translations.filter((value) => value.id !== id);
  const remaining = { ...normalized, translations };
  if (normalized.selectedTranslations?.[locale]?.value !== id) return remaining;
  const next = [...translations].reverse().find((value) => value.language === locale);
  return withSelection(remaining, locale, next?.id ?? null, revision, updatedAt);
}

export function updateLanguageTranslation(
  paragraph: Paragraph,
  locale: AppLocale,
  id: string,
  text: string,
): Paragraph {
  const normalized = normalizeParagraphLanguages(paragraph);
  targetVersion(normalized, locale, id);
  return {
    ...normalized,
    translations: normalized.translations.map((value) =>
      value.id === id ? { ...value, translation: text } : value,
    ),
  };
}

type NameOwner = { translation: Translation; translationsByLanguage?: LocalizedMap<Translation> };

export function getNameTranslation(owner: NameOwner, locale: AppLocale): Translation | undefined {
  const value =
    owner.translationsByLanguage !== undefined
      ? owner.translationsByLanguage[locale]?.value
      : locale === 'zh-CN'
        ? owner.translation
        : undefined;
  return value?.translation.trim() ? value : undefined;
}

export function setNameTranslation<T extends NameOwner>(
  owner: T,
  locale: AppLocale,
  value: Translation | null,
  revision: SyncRevision,
  updatedAt: number,
): T {
  if (value?.language !== undefined && value.language !== locale)
    throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  const normalized = normalizeNameTranslations(owner, 0);
  const translated = value?.translation.trim() ? { ...value, language: locale } : null;
  const previous = normalized.translationsByLanguage?.[locale];
  if (previous && canonicalStringify(previous.value) === canonicalStringify(translated))
    return normalized;
  assertNewRevision(revision, previous?.revision);
  const translationsByLanguage = {
    ...normalized.translationsByLanguage,
    [locale]: { value: translated, revision: { ...revision }, updatedAt },
  };
  return {
    ...normalized,
    translationsByLanguage,
    translation: translationsByLanguage['zh-CN']?.value ?? {
      ...normalized.translation,
      translation: '',
      language: 'zh-CN',
    },
  };
}
