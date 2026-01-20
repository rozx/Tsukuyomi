import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { AIServiceFactory } from '../index';
import {
  buildChapterContextSection,
  buildBookContextSection,
  getSpecialInstructions,
  buildSpecialInstructionsSection,
} from './utils';
import { createUnifiedAbortController } from './utils';
import { BookService } from 'src/services/book-service';
import { useBooksStore } from 'src/stores/books';
import { findUniqueCharactersInText, findUniqueTermsInText } from 'src/utils/text-matcher';

/**
 * 术语翻译服务选项
 */
export interface TermTranslationServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收翻译过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 任务类型，默认为 'translation'，也可以是 'termsTranslation'
   */
  taskType?: 'translation' | 'termsTranslation';
  /**
   * 书籍 ID（用于获取上下文信息）
   */
  bookId?: string;
  /**
   * 章节 ID（用于获取上下文信息）
   */
  chapterId?: string;
  /**
   * 章节标题（可选），用于在上下文中提供给 AI
   */
  chapterTitle?: string;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
}

/**
 * 术语翻译服务
 * 使用 AI 服务进行文本翻译
 */
export class TermTranslationService {
  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    text: string,
    model: AIModel,
    options?: TermTranslationServiceOptions,
  ): Promise<{ text: string; taskId?: string }> {
    const {
      prompt,
      onChunk,
      signal,
      taskType = 'translation',
      bookId,
      chapterId,
      chapterTitle,
      onAction: _onAction,
      onToast: _onToast,
      aiProcessingStore,
    } = options || {};

    if (!text?.trim()) {
      throw new Error('要翻译的文本不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 根据任务类型检查模型支持
    if (taskType === 'termsTranslation') {
      if (!model.isDefault.termsTranslation?.enabled) {
        throw new Error('所选模型不支持术语翻译任务');
      }
    } else {
      if (!model.isDefault.translation?.enabled) {
        throw new Error('所选模型不支持翻译任务');
      }
    }

    // 如果提供了 aiProcessingStore，自动创建和管理任务
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: taskType,
        modelName: model.name,
        status: 'thinking',
        message: '正在分析文本...',
        thinkingMessage: '',
      });

      // 获取任务的 abortController
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      abortController = task?.abortController;
    }

    const trimmedText = text.trim();

    // 根据任务类型获取温度设置
    const temperature =
      taskType === 'termsTranslation'
        ? (model.isDefault.termsTranslation?.temperature ?? 0.7)
        : (model.isDefault.translation?.temperature ?? 0.7);

    // 使用共享工具创建统一的 AbortController
    const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
      signal,
      abortController,
    );
    const finalSignal = internalController.signal;

    try {
      const service = AIServiceFactory.getService(model.provider);

      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature,
        signal: finalSignal,
      };

      // 构建系统提示词
      let systemPrompt = '你是专业的日轻小说翻译助手，将日语术语翻译为自然流畅的简体中文。\n\n';

      // 如果有 bookId 和 chapterId，添加上下文信息（禁止工具调用）
      if (bookId) {
        // 获取特殊指令
        const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'translation');
        const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);
        const bookContextSection = await buildBookContextSection(bookId);
        const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

        systemPrompt += `${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **术语一致**: 使用术语表和角色表确保翻译一致
2. **自然流畅**: 符合轻小说风格，保持术语的准确性
3. **上下文理解**: 根据当前书籍、章节的上下文来理解术语含义
4. **完整翻译**: [警告] 必须翻译所有单词和短语，禁止在翻译结果中保留未翻译的日语原文（如日文假名、汉字等）

**输出格式**：[警告] **必须只返回 JSON 格式**（使用简化键名 t=translation）
示例：{"t":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

`;
      }

      // 构建“相关术语/角色”上下文（仅提供与当前待翻译文本匹配的项）
      let relatedContextInfo = '';
      if (bookId) {
        const booksStore = useBooksStore();
        const novel =
          booksStore.books.find((b) => b.id === bookId) ||
          (await BookService.getBookById(bookId, false));
        if (novel) {
          const foundTerms = findUniqueTermsInText(trimmedText, novel.terminologies || []);
          const foundCharacters = findUniqueCharactersInText(
            trimmedText,
            novel.characterSettings || [],
          );

          if (foundTerms.length > 0 || foundCharacters.length > 0) {
            relatedContextInfo += '\n\n相关背景信息（从当前书籍中匹配到）：\n';
            if (foundCharacters.length > 0) {
              const characterDetails = foundCharacters
                .map((c) => {
                  const parts: string[] = [];
                  const sexLabels: Record<string, string> = {
                    male: '男',
                    female: '女',
                    other: '其他',
                  };

                  parts.push(`ID：${c.id}`);
                  parts.push(`${c.name} → ${c.translation.translation}`);

                  parts.push(`性别：${c.sex ? sexLabels[c.sex] || c.sex : '未设置'}`);
                  parts.push(`描述：${c.description || '无'}`);
                  parts.push(`说话风格：${c.speakingStyle || '无'}`);

                  if (c.aliases && c.aliases.length > 0) {
                    const aliasList = c.aliases
                      .map((a) => `${a.name} → ${a.translation.translation}`)
                      .join('、');
                    parts.push(`别名：${aliasList}`);
                  } else {
                    parts.push('别名：无');
                  }
                  return parts.join(' | ');
                })
                .join('\n');

              relatedContextInfo += `登场角色：\n${characterDetails}\n`;
            }

            if (foundTerms.length > 0) {
              relatedContextInfo +=
                '相关术语：\n' +
                foundTerms
                  .map(
                    (t) =>
                      `- ${t.name} → ${t.translation.translation}${t.description ? `: ${t.description}` : ''}`,
                  )
                  .join('\n') +
                '\n';
            }

            console.log('术语翻译 - 相关上下文信息：', relatedContextInfo);
          }
        }
      }

      // 构建用户提示词
      const userPrompt =
        prompt ||
        `请将以下日文术语翻译为简体中文，保持原文的格式和结构。[警告] **必须只返回 JSON 格式**（使用简化键名 t=translation）：
示例：{"t":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

待翻译术语：\n\n${trimmedText}${relatedContextInfo}`;

      // 创建消息历史
      const history: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const MAX_JSON_RETRIES = 3;
      let jsonRetryCount = 0;
      let finalText = '';

      while (jsonRetryCount <= MAX_JSON_RETRIES) {
        if (finalSignal.aborted) {
          throw new Error('翻译已取消');
        }

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'processing',
            message: jsonRetryCount > 0 ? '正在重试获取规范 JSON 输出...' : '正在生成翻译...',
          });
        }

        const request: TextGenerationRequest = {
          messages: history,
        };

        let firstChunkReceived = false;
        const wrappedOnChunk: TextGenerationStreamCallback = async (chunk) => {
          if (finalSignal?.aborted) {
            throw new Error('翻译已取消');
          }

          if (aiProcessingStore && taskId) {
            if (!firstChunkReceived) {
              void aiProcessingStore.updateTask(taskId, {
                status: 'processing',
                message: '正在生成翻译...',
              });
              firstChunkReceived = true;
            }

            if (chunk.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
            }

            if (chunk.text) {
              void aiProcessingStore.appendOutputContent(taskId, chunk.text);
            }
          }

          if (onChunk) {
            await onChunk(chunk);
          }
        };

        const result = await service.generateText(config, request, wrappedOnChunk);

        if (aiProcessingStore && taskId && result.reasoningContent) {
          void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
        }

        const responseText = result.text || '';

        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('未找到有效的 JSON 格式');
          }

          const parsed = JSON.parse(jsonMatch[0]);
          // 支持简化格式 "t" 和完整格式 "translation"
          const translation = parsed.t ?? parsed.translation;
          if (!parsed || typeof translation !== 'string') {
            throw new Error('JSON 中缺少 t/translation 字段');
          }

          finalText = translation;
          break;
        } catch (parseError) {
          if (jsonRetryCount >= MAX_JSON_RETRIES) {
            const errorMessage =
              parseError instanceof Error ? parseError.message : String(parseError);
            throw new Error(
              `AI 响应格式错误：${errorMessage}。已达到最大重试次数，无法获取有效翻译。`,
            );
          }

          jsonRetryCount++;
          history.push({ role: 'assistant', content: responseText });
          history.push({
            role: 'user',
            content:
              '响应格式错误：[警告] **必须只返回 JSON 格式**：\n```json\n{\n  "t": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。',
          });
        }
      }

      // 更新任务状态为完成（只在真正完成时更新）
      if (aiProcessingStore && taskId && finalText) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'end',
          message: '翻译完成',
        });
      }

      return { text: finalText, ...(taskId ? { taskId } : {}) };
    } catch (error) {
      // 如果使用了任务管理，更新任务状态为错误
      if (aiProcessingStore && taskId) {
        const isCancelled = error instanceof Error && error.message === '翻译已取消';
        if (isCancelled) {
          const currentTask = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
          if (currentTask && currentTask.status !== 'cancelled') {
            void aiProcessingStore.updateTask(taskId, {
              status: 'cancelled',
              message: '已取消',
            });
          }
        } else {
          void aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '翻译时发生未知错误',
          });
        }
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻译时发生未知错误');
    } finally {
      // 清理事件监听器
      cleanupAbort();
    }
  }
}
