import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { getChapterDisplayTitle, getChapterContentText, getVolumeDisplayTitle } from 'src/utils/novel-utils';
import type { ToolDefinition } from './types';

export const paragraphTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_book_info',
        description:
          '获取书籍的详细信息，包括标题、作者、描述、标签、术语列表、角色设定列表等。当需要了解当前书籍的完整信息时使用此工具。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      return JSON.stringify({
        success: true,
        book: {
          id: book.id,
          title: book.title,
          author: book.author || '',
          description: book.description || '',
          tags: book.tags || [],
          alternateTitles: book.alternateTitles || [],
          terminologies:
            book.terminologies?.map((t) => ({
              id: t.id,
              name: t.name,
              translation: t.translation.translation,
              description: t.description || '',
            })) || [],
          characterSettings:
            book.characterSettings?.map((c) => ({
              id: c.id,
              name: c.name,
              translation: c.translation.translation,
              sex: c.sex || '',
              description: c.description || '',
              aliases:
                c.aliases?.map((a) => ({
                  name: a.name,
                  translation: a.translation.translation,
                })) || [],
            })) || [],
          volumeCount: book.volumes?.length || 0,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_chapters',
        description:
          '获取书籍的所有章节列表，包括每个章节的 ID、标题、翻译进度等。当需要查看所有可用章节并选择参考章节时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '可选，限制返回的章节数量（默认返回所有章节）',
            },
          },
          required: [],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { limit } = args;
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 收集所有章节
      const allChapters: Array<{
        id: string;
        title: string;
        title_original: string;
        title_translation: string;
        volumeIndex: number;
        chapterIndex: number;
        volumeId: string;
        volumeTitle: string;
        paragraphCount: number;
        translatedCount: number;
        translationProgress: number;
      }> = [];

      if (book.volumes) {
        book.volumes.forEach((volume, volumeIndex) => {
          if (volume.chapters) {
            volume.chapters.forEach((chapter, chapterIndex) => {
              const chapterTitle = getChapterDisplayTitle(chapter);
              const titleOriginal =
                typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
              const titleTranslation =
                typeof chapter.title === 'string'
                  ? ''
                  : chapter.title.translation?.translation || '';
              const paragraphCount = chapter.content?.length || 0;
              const translatedCount =
                chapter.content?.filter(
                  (p) => p.selectedTranslationId && p.translations && p.translations.length > 0,
                ).length || 0;
              const translationProgress =
                paragraphCount > 0 ? (translatedCount / paragraphCount) * 100 : 0;

              allChapters.push({
                id: chapter.id,
                title: chapterTitle,
                title_original: titleOriginal,
                title_translation: titleTranslation,
                volumeIndex,
                chapterIndex,
                volumeId: volume.id,
                volumeTitle: getVolumeDisplayTitle(volume),
                paragraphCount,
                translatedCount,
                translationProgress: Math.round(translationProgress * 100) / 100,
              });
            });
          }
        });
      }

      // 应用限制
      const chapters = limit && limit > 0 ? allChapters.slice(0, limit) : allChapters;

      return JSON.stringify({
        success: true,
        chapters,
        totalCount: allChapters.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_chapter_info',
        description:
          '获取章节的详细信息，包括标题、原文内容、段落列表、翻译进度等。当需要了解当前章节的完整信息时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '章节 ID',
            },
          },
          required: ['chapter_id'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { chapter_id } = args;
      if (!chapter_id) {
        throw new Error('章节 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 查找章节
      let chapter = null;
      let volume = null;
      if (book.volumes) {
        for (const vol of book.volumes) {
          if (vol.chapters) {
            const found = vol.chapters.find((ch) => ch.id === chapter_id);
            if (found) {
              chapter = found;
              volume = vol;
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

      const chapterTitle = getChapterDisplayTitle(chapter);
      const chapterContent = getChapterContentText(chapter);
      const paragraphCount = chapter.content?.length || 0;
      const translatedCount =
        chapter.content?.filter(
          (p) => p.selectedTranslationId && p.translations && p.translations.length > 0,
        ).length || 0;

      // 构建段落信息
      const paragraphs =
        chapter.content?.map((para) => {
          const selectedTranslation = para.translations?.find(
            (t) => t.id === para.selectedTranslationId,
          );
          return {
            id: para.id,
            text: para.text,
            translation: selectedTranslation?.translation || '',
            hasTranslation: !!selectedTranslation,
            translationCount: para.translations?.length || 0,
          };
        }) || [];

      return JSON.stringify({
        success: true,
        chapter: {
          id: chapter.id,
          title: chapterTitle,
          title_original:
            typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
          title_translation:
            typeof chapter.title === 'string' ? '' : chapter.title.translation?.translation || '',
          content: chapterContent,
          paragraphCount,
          translatedCount,
          paragraphs,
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
        },
      });
    },
  },
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
