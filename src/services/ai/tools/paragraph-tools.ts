import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { ToolDefinition } from './types';

export const paragraphTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_paragraph_info',
        description:
          '获取段落的详细信息，包括原文、所有翻译版本、选中的翻译等。当需要了解当前段落的完整信息时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 查找段落
      const location = ChapterService.findParagraphLocation(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph, chapter, volume } = location;
      const chapterTitle = getChapterDisplayTitle(chapter);

      // 构建翻译信息
      const translations =
        paragraph.translations?.map((t) => ({
          id: t.id,
          translation: t.translation,
          isSelected: t.id === paragraph.selectedTranslationId,
        })) || [];

      return JSON.stringify({
        success: true,
        paragraph: {
          id: paragraph.id,
          text: paragraph.text,
          selectedTranslationId: paragraph.selectedTranslationId || '',
          translations,
          chapter: {
            id: chapter.id,
            title: chapterTitle,
            title_original:
              typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
            title_translation:
              typeof chapter.title === 'string' ? '' : chapter.title.translation?.translation || '',
          },
          volume: volume
            ? {
                id: volume.id,
                title:
                  typeof volume.title === 'string' ? volume.title : volume.title.original || '',
                title_translation:
                  typeof volume.title === 'string'
                    ? ''
                    : volume.title.translation?.translation || '',
              }
            : null,
          paragraphIndex: location.paragraphIndex,
          chapterIndex: location.chapterIndex,
          volumeIndex: location.volumeIndex,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_previous_paragraphs',
        description:
          '获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID（当前段落的 ID）',
            },
            count: {
              type: 'number',
              description: '要获取的段落数量（默认 3）',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, count = 3 } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const results = ChapterService.getPreviousParagraphs(book, paragraph_id, count);

      return JSON.stringify({
        success: true,
        paragraphs: results.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: results.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_next_paragraphs',
        description:
          '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID（当前段落的 ID）',
            },
            count: {
              type: 'number',
              description: '要获取的段落数量（默认 3）',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, count = 3 } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const results = ChapterService.getNextParagraphs(book, paragraph_id, count);

      return JSON.stringify({
        success: true,
        paragraphs: results.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: results.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'find_paragraph_by_keyword',
        description:
          '根据关键词查找包含该关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '搜索关键词',
            },
            chapter_id: {
              type: 'string',
              description:
                '可选的章节 ID，如果提供则从该章节向前搜索（包括该章节及之前的所有章节）',
            },
            max_paragraphs: {
              type: 'number',
              description: '可选的最大返回段落数量（默认 1）',
            },
            only_with_translation: {
              type: 'boolean',
              description:
                '是否只返回有翻译的段落（默认 false）。当设置为 true 时，只返回已翻译的段落，用于查看之前如何翻译某个关键词，确保翻译一致性。',
            },
          },
          required: ['keyword'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { keyword, chapter_id, max_paragraphs = 1, only_with_translation = false } = args;
      if (!keyword) {
        throw new Error('关键词不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const results = ChapterService.searchParagraphsByKeyword(
        book,
        keyword,
        chapter_id,
        max_paragraphs,
        only_with_translation,
      );

      return JSON.stringify({
        success: true,
        paragraphs: results.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: results.length,
      });
    },
  },
];
