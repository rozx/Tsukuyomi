import type { TextGenerationChunk } from 'src/services/ai/types/ai-service';
import { AIServiceFactory } from '../index';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import {
  initializeTask,
  completeTask,
  handleTaskError,
  createUnifiedAbortController,
  getAIModelForTask,
  type AIProcessingStore,
} from './utils/ai-task-helper';
import { ChapterService } from 'src/services/chapter-service';
import { BookService } from 'src/services/book-service';
import { useBooksStore } from 'src/stores/books';
import type { Volume } from 'src/models/novel';
import { findUniqueTermsInText, findUniqueCharactersInText } from 'src/utils/text-matcher';
import type { ChatMessage } from 'src/services/ai/types/ai-service';

export interface ChapterSummaryServiceOptions {
  bookId: string;
  chapterTitle?: string;
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
  onSuccess?: (summary: string) => void;
  onError?: (error: unknown) => void;
  force?: boolean;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal | undefined;
}

export class ChapterSummaryService {
  /**
   * 生成章节摘要
   * @param chapterId 章节 ID
   * @param content 章节原始内容
   * @param options 选项
   */
  static async generateSummary(
    chapterId: string,
    content: string,
    options: ChapterSummaryServiceOptions,
  ): Promise<string> {
    const { bookId, chapterTitle, aiProcessingStore, onSuccess, onError, force } = options;

    if (!content || !content.trim()) {
      throw new Error('章节内容不能为空');
    }

    // 0. 检查摘要是否已存在
    // 优先从 store 获取最新的书籍状态，避免在批量处理中覆盖其他章节的更新
    const booksStoreForCheck = useBooksStore();
    let novel = booksStoreForCheck.books.find((b) => b.id === bookId);
    if (!novel) {
      novel = await BookService.getBookById(bookId, false);
    }

    if (!novel) {
      throw new Error(`找不到 ID 为 ${bookId} 的书籍`);
    }

    const chapter = ChapterService.findChapterById(novel, chapterId);
    if (chapter?.chapter.summary && !force) {
      // 摘要已存在且未强制刷新，跳过生成
      console.log(`[ChapterSummaryService] 章节 ${chapterId} 已有摘要，跳过生成`);
      return chapter.chapter.summary;
    }

    // 2. 确定使用的模型（使用术语翻译模型用于摘要生成）
    const model = await getAIModelForTask(bookId, 'termsTranslation');

    // 初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'chapter_summary',
      model.name,
      {
        bookId,
        chapterId,
        ...(chapterTitle ? { chapterTitle } : {}),
      },
    );

    // 创建统一的 AbortController
    const { controller: finalController, cleanup: cleanupAbort } = createUnifiedAbortController(
      options.signal,
      abortController,
    );

    try {
      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在生成章节摘要...' });
      }

      const service = AIServiceFactory.getService(model.provider);

      // 构建提示词
      const systemPrompt = `你是一位专业的轻小说编辑。请阅读以下章节内容（可能是日语原文），并用简体中文生成一个简洁的章节摘要。
要求：
1. 概括主要剧情发展。
2. 提及登场的关键角色。
3. 语言通顺流畅，字数控制在 200 字以内。
4.【重要】相关角色以及术语已提供。
5.【重要】最终只返回摘要内容，不要包含任何其他解释或前言。
`;

      // 查找相关术语和角色
      const foundTerms = findUniqueTermsInText(content, novel.terminologies || []);
      const foundCharacters = findUniqueCharactersInText(content, novel.characterSettings || []);

      let contextInfo = '';
      if (foundTerms.length > 0 || foundCharacters.length > 0) {
        contextInfo += '\n\n相关背景信息：\n';
        if (foundCharacters.length > 0) {
          const characterDetails = foundCharacters.map((c) => {
            const parts: string[] = [];
            parts.push(`${c.name} → ${c.translation.translation}`);

            if (c.sex) {
              const sexLabels: Record<string, string> = {
                male: '男',
                female: '女',
                other: '其他',
              };
              parts.push(`性别：${sexLabels[c.sex] || c.sex}`);
            }

            if (c.description) {
              parts.push(`描述：${c.description}`);
            }

            if (c.speakingStyle) {
              parts.push(`说话风格：${c.speakingStyle}`);
            }

            if (c.aliases && c.aliases.length > 0) {
              const aliasList = c.aliases
                .map((a) => `${a.name} → ${a.translation.translation}`)
                .join('、');
              parts.push(`别名：${aliasList}`);
            }

            return parts.join(' | ');
          });

          contextInfo += '登场角色：\n' + characterDetails.map((d) => `- ${d}`).join('\n') + '\n';
        }
        if (foundTerms.length > 0) {
          contextInfo +=
            '相关术语：\n' +
            foundTerms
              .map(
                (t) => `- ${t.name} -> ${t.translation.translation}: ${t.description || '无描述'}`,
              )
              .join('\n') +
            '\n';
        }
      }

      const userPrompt = `章节标题：${chapterTitle || '未知'}${contextInfo}\n\n内容：\n${content}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendThinkingMessage(taskId, '正在阅读并分析章节内容...');
      }

      // 调用 AI 生成摘要
      const response = await service.generateText(
        {
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          model: model.model,
          temperature: 0.3,
          signal: finalController.signal,
        },
        {
          messages,
        },
        (chunk: TextGenerationChunk) => {
          // 流式输出处理（可选）
        },
      );

      const summary = response.text.trim();

      if (aiProcessingStore && taskId && summary) {
        await aiProcessingStore.appendOutputContent(taskId, summary);
      }

      if (!summary) {
        throw new Error('AI 未返回有效的摘要内容');
      }

      // 保存摘要到章节
      // 使用 booksStore.updateBook 确保同时更新持久化存储和内存状态
      const booksStore = useBooksStore();

      // 重要：在保存前重新获取最新的小说状态，因为在批量生成过程中，novel 变量可能已过时
      const latestNovel = booksStore.books.find((b) => b.id === bookId) || novel;

      // 构建更新后的卷列表
      const updatedVolumes = latestNovel.volumes?.map((v: Volume) => {
        const chapterIndex = v.chapters?.findIndex((c) => c.id === chapterId);
        if (chapterIndex !== undefined && chapterIndex !== -1 && v.chapters) {
          const newChapters = [...v.chapters];
          const targetChapter = newChapters[chapterIndex];
          if (targetChapter) {
            newChapters[chapterIndex] = { ...targetChapter, summary };
          }
          return { ...v, chapters: newChapters };
        }
        return v;
      });

      if (updatedVolumes) {
        await booksStore.updateBook(bookId, { volumes: updatedVolumes });
      }

      // 触发成功回调
      if (onSuccess) {
        onSuccess(summary);
      }

      // 完成任务
      try {
        await completeTask(
          taskId,
          aiProcessingStore as AIProcessingStore | undefined,
          'chapter_summary',
        );
      } catch (error) {
        console.error('[ChapterSummaryService] 完成任务时出错:', error);
      }

      return summary;
    } catch (error) {
      if (onError) {
        onError(error);
      }
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'chapter_summary',
      );
      throw error;
    } finally {
      cleanupAbort();
    }
  }
}
