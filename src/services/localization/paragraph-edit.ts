import type { Paragraph, Translation } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import {
  appendLanguageTranslation,
  removeLanguageTranslation,
  selectLanguageTranslation,
  updateLanguageTranslation,
} from './selection';
import { normalizeParagraphLanguages } from './normalize';

export type ParagraphTranslationEdit = {
  paragraphId: string;
  originalText: string;
  expectedSelectedTranslationId?: string | null;
} & (
  | { type: 'update'; translationId: string; text: string }
  | { type: 'select'; translationId: string | null }
  | { type: 'append'; translation: Translation; selectNew?: boolean }
  | { type: 'remove'; translationId: string }
  | { type: 'restore-language'; translations: Translation[]; selectedTranslationId: string | null }
);

export interface ChapterTranslationEditGroup {
  chapterId: string;
  edits: readonly ParagraphTranslationEdit[];
}

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
    if (edit.expectedSelectedTranslationId !== undefined) {
      const selected =
        normalizeParagraphLanguages(paragraph).selectedTranslations?.[language]?.value ?? null;
      if (selected !== edit.expectedSelectedTranslationId)
        throw new Error('PARAGRAPH_SELECTION_CHANGED');
    }
    if (paragraph.text !== edit.originalText) throw new Error('PARAGRAPH_SOURCE_CHANGED');
    values.set(
      edit.paragraphId,
      edit.type === 'append'
        ? appendLanguageTranslation(
            paragraph,
            language,
            edit.translation,
            revision,
            updatedAt,
            edit.selectNew,
          )
        : edit.type === 'remove'
          ? removeLanguageTranslation(paragraph, language, edit.translationId, revision, updatedAt)
          : edit.type === 'restore-language'
            ? restoreLanguageHistory(paragraph, language, edit, revision, updatedAt)
            : edit.type === 'update'
              ? updateLanguageTranslation(paragraph, language, edit.translationId, edit.text)
              : selectLanguageTranslation(
                  paragraph,
                  language,
                  edit.translationId,
                  revision,
                  updatedAt,
                ),
    );
  }
  return content.map((paragraph) => values.get(paragraph.id)!);
}
