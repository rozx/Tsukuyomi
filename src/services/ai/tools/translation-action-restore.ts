import type { ActionInfo } from './types';
import type { Translation } from 'src/models/novel';
import type {
  ChapterTranslationEditGroup,
  ParagraphTranslationEdit,
} from 'src/services/localization/paragraph-edit';
import { BookService } from 'src/services/book-service';
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';

interface RestoreRow {
  paragraphId: string;
  chapterId?: string | undefined;
  originalText?: string | undefined;
  translations: Translation[];
  selectedId?: string | undefined;
}
function rowsForAction(action: ActionInfo): RestoreRow[] {
  if ('tool_name' in action.data && action.data.tool_name === 'batch_replace_translations') {
    const previous = action.previousData as {
      replaced_paragraphs: Array<{
        paragraph_id: string;
        chapter_id: string;
        original_text?: string;
        old_selected_translation_id?: string;
        old_translations: Translation[];
      }>;
    };
    return previous.replaced_paragraphs.map((row) => ({
      paragraphId: row.paragraph_id,
      chapterId: row.chapter_id,
      originalText: row.original_text,
      translations: row.old_translations,
      selectedId: row.old_selected_translation_id,
    }));
  }
  const data = action.data as { paragraph_id: string; chapter_id?: string; original_text?: string };
  return [
    {
      paragraphId: data.paragraph_id,
      chapterId: data.chapter_id,
      originalText: data.original_text,
      translations: [action.previousData as Translation],
    },
  ];
}

/** 按原操作书籍与语言恢复修改的版本；其他语言、范围外正文与最新目标保持不动。 */
export async function restoreTranslationAction(
  action: ActionInfo,
  fallbackBookId: string,
): Promise<void> {
  const bookId = action.execution?.bookId ?? fallbackBookId;
  if (!bookId) return;
  const rows = rowsForAction(action);
  const language =
    action.execution?.languages.targetLanguage ?? rows[0]?.translations[0]?.language ?? 'zh-CN';
  const groups = new Map<string, ChapterTranslationEditGroup>();
  for (const row of rows) {
    if (!row.chapterId) {
      const book = await BookService.getBookById(bookId);
      if (!book) throw new Error('BOOK_MISSING');
      const location = await ChapterService.findParagraphLocationAsync(book, row.paragraphId);
      if (!location) throw new Error('PARAGRAPH_NOT_FOUND');
      row.chapterId = location.chapter.id;
      row.originalText ??= location.paragraph.text;
    }
    if (row.originalText === undefined) {
      const content = await ChapterContentService.loadChapterContent(row.chapterId);
      const paragraph = content?.find((value) => value.id === row.paragraphId);
      if (!paragraph) throw new Error('PARAGRAPH_NOT_FOUND');
      row.originalText = paragraph.text;
    }
    const edits: ParagraphTranslationEdit[] = row.translations.map((translation) => ({
      type: 'update',
      paragraphId: row.paragraphId,
      originalText: row.originalText!,
      translationId: translation.id,
      text: translation.translation,
    }));
    if (row.selectedId !== undefined)
      edits.push({
        type: 'select',
        paragraphId: row.paragraphId,
        originalText: row.originalText,
        translationId: row.selectedId || null,
      });
    const prior = groups.get(row.chapterId);
    groups.set(row.chapterId, {
      chapterId: row.chapterId,
      edits: [...(prior?.edits ?? []), ...edits],
    });
  }
  await BookService.editParagraphTranslationGroups(bookId, language, [...groups.values()]);
}
