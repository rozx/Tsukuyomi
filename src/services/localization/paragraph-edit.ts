import type { Paragraph, Translation } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import { selectLanguageTranslation, updateLanguageTranslation } from './selection';
import { normalizeParagraphLanguages } from './normalize';

export type ParagraphTranslationEdit = {
  paragraphId: string;
  originalText: string;
} & (
  | { type: 'update'; translationId: string; text: string }
  | { type: 'select'; translationId: string | null }
  | { type: 'restore-language'; translations: Translation[]; selectedTranslationId: string | null }
);

function restoreLanguageHistory(
  paragraph: Paragraph,
  language: AppLocale,
  edit: Extract<ParagraphTranslationEdit, { type: 'restore-language' }>,
  revision: SyncRevision,
  updatedAt: number,
): Paragraph {
  if (edit.translations.some((value) => (value.language ?? 'zh-CN') !== language))
    throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  const selectedTranslations = {
    ...paragraph.selectedTranslations,
    [language]: { value: edit.selectedTranslationId, revision: { ...revision }, updatedAt },
  };
  return normalizeParagraphLanguages({
    ...paragraph,
    translations: [
      ...paragraph.translations.filter((value) => (value.language ?? 'zh-CN') !== language),
      ...edit.translations,
    ],
    selectedTranslations,
    selectedTranslationId: selectedTranslations['zh-CN']?.value ?? '',
  });
}

/** 在最新正文上逐项应用编辑，同原文验证与语言归属由宿主控制。 */
export function applyParagraphTranslationEdits(
  content: Paragraph[],
  language: AppLocale,
  edits: readonly ParagraphTranslationEdit[],
  revision: SyncRevision,
  updatedAt: number,
): Paragraph[] {
  const values = new Map(content.map((paragraph) => [paragraph.id, paragraph]));
  for (const edit of edits) {
    const paragraph = values.get(edit.paragraphId);
    if (!paragraph) throw new Error('PARAGRAPH_NOT_FOUND');
    if (paragraph.text !== edit.originalText) throw new Error('PARAGRAPH_SOURCE_CHANGED');
    values.set(
      edit.paragraphId,
      edit.type === 'restore-language'
        ? restoreLanguageHistory(paragraph, language, edit, revision, updatedAt)
        : edit.type === 'update'
          ? updateLanguageTranslation(paragraph, language, edit.translationId, edit.text)
          : selectLanguageTranslation(paragraph, language, edit.translationId, revision, updatedAt),
    );
  }
  return content.map((paragraph) => values.get(paragraph.id)!);
}
