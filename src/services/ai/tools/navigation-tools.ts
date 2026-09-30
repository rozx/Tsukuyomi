import { toolErrorJson, caughtToolErrorJson, checkedToolBookContext } from './tool-feedback';
import { toolDefinition } from './tool-localization';
import { translateText } from 'src/i18n/translate';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { describeTool } from './tool-localization';
import { ChapterService } from 'src/services/chapter-service';
import { BookService } from 'src/services/book-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { ToolDefinition, ToolContext } from './types';
import type { Chapter, Novel } from 'src/models/novel';

/**
 * 在书籍卷章结构中查找指定章节，返回章节对象与展示标题
 */
function findChapterInBook(
  book: Novel,
  chapterId: string,
): { chapter: Chapter; title: string } | null {
  if (!book.volumes) return null;
  for (const volume of book.volumes) {
    if (!volume.chapters) continue;
    const found = volume.chapters.find((ch) => ch.id === chapterId);
    if (found) {
      return { chapter: found, title: getChapterDisplayTitle(found) };
    }
  }
  return null;
}

export const navigationTools: ToolDefinition[] = [
  {
    definition: toolDefinition('navigate_to_chapter', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('navigate_to_chapter.parameters.properties.chapter_id'),
        },
      },
      required: ['chapter_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const checked = checkedToolBookContext(context);
      if ('error' in checked) return checked.error;
      const { bookId, onAction, feedbackLocale } = checked;

      const { chapter_id } = args as {
        chapter_id: string;
      };
      if (!chapter_id) {
        return toolErrorJson('CHAPTER_ID_REQUIRED', 'aiEntityFeedback.chapterRequired');
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', {
            id: bookId,
          });
        }

        // 查找章节
        const foundChapter = findChapterInBook(book, chapter_id);
        if (!foundChapter) {
          return toolErrorJson('CHAPTER_NOT_FOUND', 'aiEntityFeedback.chapterMissing', {
            id: chapter_id,
          });
        }
        const chapterTitle = foundChapter.title;

        // 触发导航操作
        if (onAction) {
          onAction({
            type: 'navigate',
            entity: 'chapter',
            data: {
              book_id: bookId,
              chapter_id,
              chapter_title: chapterTitle,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: translateText(feedbackLocale, 'aiEntityFeedback.navigatedChapter', {
            title: chapterTitle,
          }),
          book_id: bookId,
          chapter_id,
          chapter_title: chapterTitle,
        });
      } catch (error) {
        return caughtToolErrorJson(error, 'NAVIGATION_FAILED', 'aiEntityFeedback.navigationFailed');
      }
    },
  },
  {
    definition: toolDefinition('navigate_to_paragraph', {
      type: 'object',
      properties: {
        paragraph_id: {
          type: 'string',
          description: describeTool('navigate_to_paragraph.parameters.properties.paragraph_id'),
        },
      },
      required: ['paragraph_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const checked = checkedToolBookContext(context);
      if ('error' in checked) return checked.error;
      const { bookId, onAction, feedbackLocale } = checked;

      const { paragraph_id } = args as {
        paragraph_id: string;
      };
      if (!paragraph_id) {
        return toolErrorJson('PARAGRAPH_ID_REQUIRED', 'aiEntityFeedback.paragraphRequired');
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', {
            id: bookId,
          });
        }

        // 查找段落位置
        const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
        if (!location) {
          return toolErrorJson('PARAGRAPH_NOT_FOUND', 'aiEntityFeedback.paragraphMissing', {
            id: paragraph_id,
          });
        }

        const { chapter } = location;
        const chapterTitle = getChapterDisplayTitle(chapter);

        // 触发导航操作
        if (onAction) {
          onAction({
            type: 'navigate',
            entity: 'paragraph',
            data: {
              book_id: bookId,
              chapter_id: chapter.id,
              chapter_title: chapterTitle,
              paragraph_id,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: translateText(feedbackLocale, 'aiEntityFeedback.navigatedParagraph', {
            title: chapterTitle,
          }),
          book_id: bookId,
          chapter_id: chapter.id,
          chapter_title: chapterTitle,
          paragraph_id,
        });
      } catch (error) {
        return caughtToolErrorJson(error, 'NAVIGATION_FAILED', 'aiEntityFeedback.navigationFailed');
      }
    },
  },
];
