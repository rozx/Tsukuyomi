import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import {
  getChapterDisplayTitle,
  getChapterContentText,
  getVolumeDisplayTitle,
} from 'src/utils/novel-utils';
import type { ToolDefinition, ToolContext } from './types';
import type { Chapter } from 'src/models/novel';

export const bookTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_book_info',
        description:
          '获取当前书籍的详细信息，包括标题、作者、简介、标签、备注以及卷章结构摘要。当需要了解书籍背景、上下文或查看用户备注时使用此工具。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: async (_args, context: ToolContext) => {
      const { bookId, onAction } = context;

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
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

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'book',
            data: {
              book_id: bookId,
              tool_name: 'get_book_info',
            },
          });
        }

        // 构建返回给 AI 的信息
        const info = {
          id: book.id,
          title: book.title,
          author: book.author || '未知',
          description: book.description || '无',
          tags: book.tags || [],
          // 备注信息
          notes:
            book.notes?.map((n) => ({
              id: n.id,
              text: n.text,
              createdAt: n.createdAt,
            })) || [],
          // 结构摘要
          structure:
            book.volumes?.map((v) => ({
              title: v.title.original,
              translation: v.title.translation?.translation,
              chapter_count: v.chapters?.length || 0,
              chapters: v.chapters?.map((c) => ({
                title: c.title.original,
                translation: c.title.translation?.translation,
              })),
            })) || [],
          // 统计信息
          stats: {
            total_volumes: book.volumes?.length || 0,
            total_chapters:
              book.volumes?.reduce((acc, v) => acc + (v.chapters?.length || 0), 0) || 0,
            total_terms: book.terminologies?.length || 0,
            total_characters: book.characterSettings?.length || 0,
          },
        };

        return JSON.stringify({
          success: true,
          book: info,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取书籍信息失败',
        });
      }
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
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({ success: false, error: '书籍 ID 不能为空' });
      }
      const { limit } = args;

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({ success: false, error: `书籍不存在: ${bookId}` });
        }

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              book_id: bookId,
              tool_name: 'list_chapters',
            },
          });
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
          // 如果提供了 limit，只加载前 N 个章节的内容以提升性能
          // 否则加载所有章节内容（用于统计）
          const shouldLoadAll = !limit || limit <= 0;
          let chaptersProcessed = 0;
          const maxChaptersToLoad = limit && limit > 0 ? limit : undefined;

          for (const volume of book.volumes) {
            if (!volume.chapters) continue;

            for (const chapter of volume.chapters) {
              // 如果已达到限制，停止处理
              if (maxChaptersToLoad && chaptersProcessed >= maxChaptersToLoad) {
                break;
              }

              // 按需加载章节内容（用于统计）
              if (chapter.content === undefined) {
                const content = await ChapterContentService.loadChapterContent(chapter.id);
                chapter.content = content || [];
                chapter.contentLoaded = true;
              }

              const volumeIndex = book.volumes.indexOf(volume);
              const chapterIndex = volume.chapters.indexOf(chapter);
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

              chaptersProcessed++;
            }

            // 如果已达到限制，停止处理卷
            if (maxChaptersToLoad && chaptersProcessed >= maxChaptersToLoad) {
              break;
            }
          }

          // 如果没有限制，需要获取总章节数（可能未全部加载）
          // 这里我们只统计已处理的章节，因为未加载的章节无法统计
        }

        // 应用限制
        const chapters = limit && limit > 0 ? allChapters.slice(0, limit) : allChapters;

        return JSON.stringify({
          success: true,
          chapters,
          totalCount: allChapters.length,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取章节列表失败',
        });
      }
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
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({ success: false, error: '书籍 ID 不能为空' });
      }
      const { chapter_id } = args;
      if (!chapter_id) {
        return JSON.stringify({ success: false, error: '章节 ID 不能为空' });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({ success: false, error: `书籍不存在: ${bookId}` });
        }

        // 查找章节
        let chapter: Chapter | null = null;
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

        // 如果章节内容未加载，从 IndexedDB 加载
        if (chapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(chapter.id);
          if (content) {
            chapter = {
              ...chapter,
              content,
              contentLoaded: true,
            };
          } else {
            // 如果加载失败，设置为空数组
            chapter = {
              ...chapter,
              content: [],
              contentLoaded: true,
            };
          }
        }

        const chapterTitle = getChapterDisplayTitle(chapter);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              chapter_id,
              chapter_title: chapterTitle,
              tool_name: 'get_chapter_info',
            },
          });
        }
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
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取章节信息失败',
        });
      }
    },
  },
];
