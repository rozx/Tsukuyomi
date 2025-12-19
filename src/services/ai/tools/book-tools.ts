import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';
import { getChapterDisplayTitle, getChapterContentText } from 'src/utils/novel-utils';
import type { ToolDefinition, ToolContext } from './types';
import type { Chapter, Novel } from 'src/models/novel';
import { searchRelatedMemories } from './memory-helper';

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
          properties: {
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
          },
          required: [],
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

        // 搜索相关记忆（使用书籍标题和作者作为关键词）
        const { include_memory = true } = args;
        let relatedMemories: Array<{ id: string; summary: string }> = [];
        if (include_memory && bookId) {
          const keywords: string[] = [];
          if (book.title) keywords.push(book.title);
          if (book.author) keywords.push(book.author);
          if (keywords.length > 0) {
            relatedMemories = await searchRelatedMemories(bookId, keywords, 5);
          }
        }

        return JSON.stringify({
          success: true,
          book: info,
          ...(include_memory && relatedMemories.length > 0
            ? { related_memories: relatedMemories }
            : {}),
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
          '获取书籍的所有章节列表，包括每个章节的 ID、原文标题和翻译标题。当需要查看所有可用章节并选择参考章节时使用此工具。',
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
          title_original: string;
          title_translation: string;
        }> = [];

        if (book.volumes) {
          let chaptersProcessed = 0;
          const maxChaptersToLoad = limit && limit > 0 ? limit : undefined;

          for (let volumeIndex = 0; volumeIndex < book.volumes.length; volumeIndex++) {
            const volume = book.volumes[volumeIndex];
            if (!volume || !volume.chapters) continue;

            for (let chapterIndex = 0; chapterIndex < volume.chapters.length; chapterIndex++) {
              const chapter = volume.chapters[chapterIndex];
              if (!chapter) continue;

              // 如果已达到限制，停止处理
              if (maxChaptersToLoad && chaptersProcessed >= maxChaptersToLoad) {
                break;
              }

              const titleOriginal =
                typeof chapter.title === 'string' ? chapter.title : chapter.title.original || '';
              const titleTranslation =
                typeof chapter.title === 'string'
                  ? ''
                  : chapter.title.translation?.translation || '';

              allChapters.push({
                id: chapter.id,
                title_original: titleOriginal,
                title_translation: titleTranslation,
              });

              chaptersProcessed++;
            }

            // 如果已达到限制，停止处理卷
            if (maxChaptersToLoad && chaptersProcessed >= maxChaptersToLoad) {
              break;
            }
          }
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
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { chapter_id, include_memory = true } = args;
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

        // 搜索相关记忆（使用章节标题作为关键词）
        let relatedMemories: Array<{ id: string; summary: string }> = [];
        if (include_memory && bookId) {
          const titleOriginal =
            typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
          if (titleOriginal) {
            relatedMemories = await searchRelatedMemories(bookId, [titleOriginal], 5);
          }
        }

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
          ...(include_memory && relatedMemories.length > 0
            ? { related_memories: relatedMemories }
            : {}),
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取章节信息失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_previous_chapter',
        description:
          '获取指定章节的前一个章节信息。用于查看前一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '当前章节 ID',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { chapter_id, include_memory = true } = args;
      if (!chapter_id) {
        return JSON.stringify({ success: false, error: '章节 ID 不能为空' });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({ success: false, error: `书籍不存在: ${bookId}` });
        }

        const previousChapterInfo = ChapterService.getPreviousChapter(book, chapter_id);
        if (!previousChapterInfo) {
          return JSON.stringify({
            success: false,
            error: '没有前一个章节（当前章节是第一个章节）',
          });
        }

        const { chapter, volume } = previousChapterInfo;
        const chapterTitle = getChapterDisplayTitle(chapter);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              chapter_id: chapter.id,
              chapter_title: chapterTitle,
              tool_name: 'get_previous_chapter',
            },
          });
        }

        // 如果章节内容未加载，从 IndexedDB 加载
        let chapterContent = '';
        if (chapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(chapter.id);
          if (content) {
            chapter.content = content;
            chapter.contentLoaded = true;
          }
        }
        chapterContent = getChapterContentText(chapter);

        const paragraphCount = chapter.content?.length || 0;
        const translatedCount =
          chapter.content?.filter(
            (p) => p.selectedTranslationId && p.translations && p.translations.length > 0,
          ).length || 0;

        // 搜索相关记忆（使用章节标题作为关键词）
        let relatedMemories: Array<{ id: string; summary: string }> = [];
        if (include_memory && bookId) {
          const titleOriginal =
            typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
          if (titleOriginal) {
            relatedMemories = await searchRelatedMemories(bookId, [titleOriginal], 5);
          }
        }

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
          ...(include_memory && relatedMemories.length > 0
            ? { related_memories: relatedMemories }
            : {}),
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取前一个章节失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_next_chapter',
        description:
          '获取指定章节的下一个章节信息。用于查看下一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '当前章节 ID',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { chapter_id, include_memory = true } = args;
      if (!chapter_id) {
        return JSON.stringify({ success: false, error: '章节 ID 不能为空' });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({ success: false, error: `书籍不存在: ${bookId}` });
        }

        const nextChapterInfo = ChapterService.getNextChapter(book, chapter_id);
        if (!nextChapterInfo) {
          return JSON.stringify({
            success: false,
            error: '没有下一个章节（当前章节是最后一个章节）',
          });
        }

        const { chapter, volume } = nextChapterInfo;
        const chapterTitle = getChapterDisplayTitle(chapter);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              chapter_id: chapter.id,
              chapter_title: chapterTitle,
              tool_name: 'get_next_chapter',
            },
          });
        }

        // 如果章节内容未加载，从 IndexedDB 加载
        let chapterContent = '';
        if (chapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(chapter.id);
          if (content) {
            chapter.content = content;
            chapter.contentLoaded = true;
          }
        }
        chapterContent = getChapterContentText(chapter);

        const paragraphCount = chapter.content?.length || 0;
        const translatedCount =
          chapter.content?.filter(
            (p) => p.selectedTranslationId && p.translations && p.translations.length > 0,
          ).length || 0;

        // 搜索相关记忆（使用章节标题作为关键词）
        let relatedMemories: Array<{ id: string; summary: string }> = [];
        if (include_memory && bookId) {
          const titleOriginal =
            typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
          if (titleOriginal) {
            relatedMemories = await searchRelatedMemories(bookId, [titleOriginal], 5);
          }
        }

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
          ...(include_memory && relatedMemories.length > 0
            ? { related_memories: relatedMemories }
            : {}),
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取下一个章节失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_chapter_title',
        description:
          '更新章节的标题。可以更新原文标题（title_original）或翻译标题（title_translation）。用于修正章节标题翻译或更新原文标题。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '章节 ID',
            },
            title_original: {
              type: 'string',
              description: '新的原文标题（可选，如果提供则更新原文标题）',
            },
            title_translation: {
              type: 'string',
              description: '新的翻译标题（可选，如果提供则更新翻译标题）',
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
      const { chapter_id, title_original, title_translation } = args;
      if (!chapter_id) {
        return JSON.stringify({ success: false, error: '章节 ID 不能为空' });
      }

      if (!title_original && !title_translation) {
        return JSON.stringify({
          success: false,
          error: '必须提供 title_original 或 title_translation 至少一个参数',
        });
      }

      try {
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({ success: false, error: `书籍不存在: ${bookId}` });
        }

        // 查找章节
        const chapterInfo = ChapterService.findChapterById(book, chapter_id);
        if (!chapterInfo) {
          return JSON.stringify({
            success: false,
            error: `章节不存在: ${chapter_id}`,
          });
        }

        const { chapter: existingChapter } = chapterInfo;
        const oldTitle = getChapterDisplayTitle(existingChapter);
        const oldOriginal =
          typeof existingChapter.title === 'string'
            ? existingChapter.title
            : existingChapter.title.original;
        const oldTranslation =
          typeof existingChapter.title === 'string'
            ? ''
            : existingChapter.title.translation?.translation || '';

        // 构建更新数据
        let updatedTitle: Chapter['title'];
        if (typeof existingChapter.title === 'string') {
          // 旧数据格式，转换为新格式
          if (title_original && title_translation) {
            updatedTitle = {
              original: title_original.trim(),
              translation: {
                id: generateShortId(),
                translation: title_translation.trim(),
                aiModelId: '',
              },
            };
          } else if (title_original) {
            updatedTitle = {
              original: title_original.trim(),
              translation: {
                id: generateShortId(),
                translation: '',
                aiModelId: '',
              },
            };
          } else {
            // 只更新翻译
            updatedTitle = {
              original: existingChapter.title,
              translation: {
                id: generateShortId(),
                translation: title_translation.trim(),
                aiModelId: '',
              },
            };
          }
        } else {
          // 新数据格式
          if (title_original && title_translation) {
            updatedTitle = {
              original: title_original.trim(),
              translation: existingChapter.title.translation
                ? {
                    ...existingChapter.title.translation,
                    translation: title_translation.trim(),
                  }
                : {
                    id: generateShortId(),
                    translation: title_translation.trim(),
                    aiModelId: '',
                  },
            };
          } else if (title_original) {
            updatedTitle = {
              original: title_original.trim(),
              translation: existingChapter.title.translation,
            };
          } else {
            // 只更新翻译
            updatedTitle = {
              original: existingChapter.title.original,
              translation: existingChapter.title.translation
                ? {
                    ...existingChapter.title.translation,
                    translation: title_translation.trim(),
                  }
                : {
                    id: generateShortId(),
                    translation: title_translation.trim(),
                    aiModelId: '',
                  },
            };
          }
        }

        // 使用 ChapterService 更新章节
        const updatedVolumes = ChapterService.updateChapter(book, chapter_id, {
          title: updatedTitle,
        });

        // 保存更改
        const booksStore = useBooksStore();
        await booksStore.updateBook(bookId, { volumes: updatedVolumes });

        // 获取更新后的章节信息
        const updatedBook = await BookService.getBookById(bookId);
        const updatedChapterInfo = updatedBook
          ? ChapterService.findChapterById(updatedBook, chapter_id)
          : null;
        const newTitle = updatedChapterInfo
          ? getChapterDisplayTitle(updatedChapterInfo.chapter)
          : oldTitle;

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'chapter',
            data: {
              chapter_id,
              chapter_title: newTitle,
              old_title: oldTitle,
              new_title: newTitle,
              tool_name: 'update_chapter_title',
            },
            previousData: {
              title_original: oldOriginal,
              title_translation: oldTranslation,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: '章节标题已更新',
          chapter_id,
          old_title: oldTitle,
          new_title: newTitle,
          old_title_original: oldOriginal,
          new_title_original:
            typeof updatedTitle === 'string' ? updatedTitle : updatedTitle.original,
          old_title_translation: oldTranslation,
          new_title_translation:
            typeof updatedTitle === 'string' ? '' : updatedTitle.translation?.translation || '',
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '更新章节标题失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_book_info',
        description:
          '更新书籍的基本信息，包括描述、标签、作者、别名等。可以同时更新多个字段，也可以只更新单个字段。用于完善书籍元数据、修正错误信息或根据用户需求调整书籍信息。',
        parameters: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: '书籍描述（可选，如果提供则更新描述，如果为空字符串则清除描述）',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '书籍标签数组（可选，如果提供则更新标签）',
            },
            author: {
              type: 'string',
              description: '作者名称（可选，如果提供则更新作者，如果为空字符串则清除作者）',
            },
            alternate_titles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '别名数组（可选，如果提供则更新别名）',
            },
          },
          required: [],
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

      const { description, tags, author, alternate_titles } = args;

      // 检查是否至少提供了一个要更新的字段
      if (
        description === undefined &&
        tags === undefined &&
        author === undefined &&
        alternate_titles === undefined
      ) {
        return JSON.stringify({
          success: false,
          error: '必须至少提供一个要更新的字段（description、tags、author 或 alternate_titles）',
        });
      }

      try {
        // 获取当前书籍信息
        const book = await BookService.getBookById(bookId);
        if (!book) {
          return JSON.stringify({
            success: false,
            error: `书籍不存在: ${bookId}`,
          });
        }

        // 保存原始数据用于撤销
        const previousData = {
          description: book.description,
          tags: book.tags ? [...book.tags] : undefined,
          author: book.author,
          alternateTitles: book.alternateTitles ? [...book.alternateTitles] : undefined,
        };

        // 构建更新数据
        const updates: Partial<Novel> = {};

        if (description !== undefined) {
          updates.description = description.trim() || undefined;
        }

        if (tags !== undefined) {
          updates.tags = tags.length > 0 ? tags : undefined;
        }

        if (author !== undefined) {
          updates.author = author.trim() || undefined;
        }

        if (alternate_titles !== undefined) {
          updates.alternateTitles = alternate_titles.length > 0 ? alternate_titles : undefined;
        }

        // 更新书籍
        const booksStore = useBooksStore();
        await booksStore.updateBook(bookId, updates);

        // 获取更新后的书籍信息
        const updatedBook = await BookService.getBookById(bookId);

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'book',
            data: {
              book_id: bookId,
              tool_name: 'update_book_info',
              ...(description !== undefined ? { description: updates.description } : {}),
              ...(tags !== undefined ? { tags: updates.tags } : {}),
              ...(author !== undefined ? { author: updates.author } : {}),
              ...(alternate_titles !== undefined
                ? { alternate_titles: updates.alternateTitles }
                : {}),
            },
            previousData,
          });
        }

        // 构建返回信息
        const updatedFields: string[] = [];
        if (description !== undefined) updatedFields.push('描述');
        if (tags !== undefined) updatedFields.push('标签');
        if (author !== undefined) updatedFields.push('作者');
        if (alternate_titles !== undefined) updatedFields.push('别名');

        return JSON.stringify({
          success: true,
          message: `书籍信息已更新：${updatedFields.join('、')}`,
          book_id: bookId,
          book_title: updatedBook?.title || book.title,
          updated_fields: {
            ...(description !== undefined
              ? {
                  description: {
                    old: previousData.description || '无',
                    new: updates.description || '无',
                  },
                }
              : {}),
            ...(tags !== undefined
              ? {
                  tags: {
                    old: previousData.tags || [],
                    new: updates.tags || [],
                  },
                }
              : {}),
            ...(author !== undefined
              ? {
                  author: {
                    old: previousData.author || '无',
                    new: updates.author || '无',
                  },
                }
              : {}),
            ...(alternate_titles !== undefined
              ? {
                  alternate_titles: {
                    old: previousData.alternateTitles || [],
                    new: updates.alternateTitles || [],
                  },
                }
              : {}),
          },
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '更新书籍信息失败',
        });
      }
    },
  },
];
