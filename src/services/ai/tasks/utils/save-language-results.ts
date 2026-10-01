import type { Paragraph, ScoreBreakdown } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import type { ParagraphTranslationEdit } from 'src/services/localization/paragraph-edit';
import { BookService } from 'src/services/book-service';
import { generateShortId } from 'src/utils/id-generator';

export interface LanguageParagraphResult {
  id: string;
  translation: string;
  referencedMemories?: string[];
  memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
}

/** 原文与语言来自执行快照，业务写入在最新正文上提交。 */
export async function saveLanguageParagraphResults(
  bookId: string,
  chapterId: string,
  language: AppLocale,
  aiModelId: string,
  sourceParagraphs: readonly Paragraph[],
  results: readonly LanguageParagraphResult[],
): Promise<Paragraph[]> {
  const originals = new Map(sourceParagraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  const edits: ParagraphTranslationEdit[] = results.map((result) => {
    const originalText = originals.get(result.id);
    if (originalText === undefined) throw new Error('PARAGRAPH_OUTSIDE_EXECUTION');
    return {
      type: 'append',
      paragraphId: result.id,
      originalText,
      translation: {
        id: generateShortId(),
        translation: result.translation,
        language,
        aiModelId,
        ...(result.referencedMemories ? { referencedMemories: result.referencedMemories } : {}),
        ...(result.memoryScoreBreakdown
          ? { memoryScoreBreakdown: result.memoryScoreBreakdown }
          : {}),
      },
    };
  });
  return (await BookService.editParagraphTranslations(bookId, chapterId, language, edits)).content;
}
