import type { Paragraph, Translation } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { SyncRevision } from 'src/models/localized-data';
import {
  appendLanguageTranslation,
  removeLanguageTranslation,
  reviseLanguageTranslation,
  selectLanguageTranslation,
} from './selection';
import { normalizeParagraphLanguages } from './normalize';
import { assertNewRevision } from './revision';

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
  // 恢复的是旧文本但沿用原 ID：内容与当前版本不同时盖上本次 revision，否则合并时
  // 另一设备上修改过的同 ID 副本会以较新的 revision 把撤销结果改回去
  const current = new Map(paragraph.translations.map((value) => [value.id, value]));
  const restored = edit.translations.map((value) =>
    current.has(value.id) && current.get(value.id)!.translation !== value.translation
      ? { ...value, revision: { ...revision } }
      : value,
  );
  // 与其他选用写入路径一致：版本号必须单调递增，避免重放旧编辑让选用版本倒退
  assertNewRevision(revision, paragraph.selectedTranslations?.[language]?.revision);
  const selectedTranslations = {
    ...paragraph.selectedTranslations,
    [language]: { value: edit.selectedTranslationId, revision: { ...revision }, updatedAt },
  };
  return normalizeParagraphLanguages({
    ...paragraph,
    translations: [
      ...paragraph.translations.filter((value) => (value.language ?? 'zh-CN') !== language),
      ...restored,
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
              ? reviseLanguageTranslation(
                  paragraph,
                  language,
                  edit.translationId,
                  edit.text,
                  revision,
                )
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
