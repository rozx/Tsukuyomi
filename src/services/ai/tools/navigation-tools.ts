import { ChapterService } from 'src/services/chapter-service';
import { BookService } from 'src/services/book-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { ToolDefinition, ToolContext } from './types';

export const navigationTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'navigate_to_chapter',
        description:
          '导航到指定的章节。将用户界面跳转到书籍详情页面并选中指定的章节。当用户需要查看或编辑特定章节时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '要导航到的章节 ID',
            },
          },
          required: ['chapter_id'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
        });
      }

      const { chapter_id } = args as {
        chapter_id: string;
      };
      if (!chapter_id) {
        return JSON.stringify({
          success: false,
          error: '章节 ID 不能为空',
        });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({
            success: false,
            error: `书籍不存在: ${bookId}`,
          });
        }

        // 查找章节
        let chapter = null;
        let chapterTitle = '';
        if (book.volumes) {
          for (const volume of book.volumes) {
            if (volume.chapters) {
              const found = volume.chapters.find((ch) => ch.id === chapter_id);
              if (found) {
                chapter = found;
                chapterTitle = getChapterDisplayTitle(found);
                break;
              }
            }
          }
        }

        if (!chapter) {
          return JSON.stringify({
            success: false,
            error: `章节不存在: ${chapter_id}`,
          });
        }

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
          message: `已导航到章节: ${chapterTitle}`,
          book_id: bookId,
          chapter_id,
          chapter_title: chapterTitle,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '导航失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'navigate_to_paragraph',
        description:
          '导航到指定的段落。将用户界面跳转到书籍详情页面，选中包含该段落的章节，并滚动到该段落。当用户需要查看或编辑特定段落时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '要导航到的段落 ID',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
        });
      }

      const { paragraph_id } = args as {
        paragraph_id: string;
      };
      if (!paragraph_id) {
        return JSON.stringify({
          success: false,
          error: '段落 ID 不能为空',
        });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({
            success: false,
            error: `书籍不存在: ${bookId}`,
          });
        }

        // 查找段落位置
        const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
        if (!location) {
          return JSON.stringify({
            success: false,
            error: `段落不存在: ${paragraph_id}`,
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
          message: `已导航到段落 (章节: ${chapterTitle})`,
          book_id: bookId,
          chapter_id: chapter.id,
          chapter_title: chapterTitle,
          paragraph_id,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '导航失败',
        });
      }
    },
  },
];
