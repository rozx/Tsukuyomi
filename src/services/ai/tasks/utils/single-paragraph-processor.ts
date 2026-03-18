/**
 * 单段落润色/校对处理器
 * 跳过状态机，直接构建 prompt 并调用 AI 模型，支持工具调用循环
 */

import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  TextGenerationRequest,
  ChatMessage,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { AIProcessingStore, TaskType } from './task-types';
import { TASK_TYPE_LABELS } from './task-types';
import { AIServiceFactory } from '../../index';
import { ToolRegistry } from '../../tools/index';
import { createUnifiedAbortController, handleTaskError } from './stream-handler';
import { getSelectedTranslation } from 'src/utils/text-utils';
import {
  buildBookContextSection,
  buildChapterContextSection,
  getSpecialInstructions,
  buildSpecialInstructionsSection,
  buildSingleParagraphDefaultContext,
} from './context-builder';

const MAX_TOOL_CALL_ROUNDS = 20;

export interface SingleParagraphOptions {
  signal?: AbortSignal;
  bookId?: string;
  chapterId?: string;
  chapterTitle?: string;
  allChapterParagraphs?: Paragraph[];
  onChunk?: TextGenerationStreamCallback;
  onAction?: (action: ActionInfo) => void;
  onToast?: ToastCallback;
  onParagraphResult?: (results: { id: string; translation: string }[]) => void | Promise<void>;
  aiProcessingStore?: AIProcessingStore;
}

export interface SingleParagraphResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
}

interface SingleParagraphProcessConfig {
  taskType: TaskType;
  logLabel: string;
  temperature: number;
  buildSystemPrompt: (params: {
    bookContextSection: string;
    chapterContextSection: string;
    specialInstructionsSection: string;
    tools: AITool[];
  }) => string;
  buildUserPrompt: (params: {
    paragraphId: string;
    originalText: string;
    currentTranslation: string;
    defaultContext: string;
  }) => string;
}

/**
 * 处理单段落润色/校对
 * 无状态机，直接构建 prompt + 工具调用循环
 */
export async function processSingleParagraph(
  paragraph: Paragraph,
  model: AIModel,
  options: SingleParagraphOptions,
  config: SingleParagraphProcessConfig,
): Promise<SingleParagraphResult> {
  const {
    signal,
    bookId,
    chapterId,
    chapterTitle,
    allChapterParagraphs = [],
    onChunk,
    onAction,
    onToast,
    onParagraphResult,
    aiProcessingStore,
  } = options;

  const { taskType, logLabel, temperature, buildSystemPrompt, buildUserPrompt } = config;
  const taskLabel = TASK_TYPE_LABELS[taskType];

  // 创建简化的任务记录
  // 直接设置 workflowStatus: 'working'（不走状态机转换），
  // 因为 add_translation_batch 工具要求任务处于 working 状态
  let taskId: string | undefined;
  let taskAbortController: AbortController | undefined;

  if (aiProcessingStore) {
    taskId = await aiProcessingStore.addTask({
      type: taskType,
      modelName: model.name,
      status: 'thinking',
      workflowStatus: 'working',
      message: `正在${taskLabel}段落...`,
      thinkingMessage: '',
      ...(bookId ? { bookId } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(chapterTitle ? { chapterTitle } : {}),
    });

    const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
    taskAbortController = task?.abortController;
  }

  // 统一取消控制器
  const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
    signal,
    taskAbortController,
  );
  const finalSignal = internalController.signal;

  try {
    const service = AIServiceFactory.getService(model.provider);

    // 构建上下文
    const bookContextSection = bookId ? await buildBookContextSection(bookId) : '';
    const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);
    const specialInstructions = bookId
      ? getSpecialInstructions(bookId, chapterId, taskType)
      : undefined;
    const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);

    // 获取工具
    const tools = ToolRegistry.getSingleParagraphPolishTools(bookId);

    // 构建系统提示词
    const systemPrompt = buildSystemPrompt({
      bookContextSection,
      chapterContextSection,
      specialInstructionsSection,
      tools,
    });

    // 构建默认上下文
    const defaultContext = await buildSingleParagraphDefaultContext({
      currentParagraphId: paragraph.id,
      allChapterParagraphs,
      ...(bookId ? { bookId } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(chapterTitle ? { chapterTitle } : {}),
    });

    // 构建用户提示词
    const currentTranslation = getSelectedTranslation(paragraph);
    const userPrompt = buildUserPrompt({
      paragraphId: paragraph.id,
      originalText: paragraph.text,
      currentTranslation,
      defaultContext,
    });

    // 创建消息历史
    const history: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const aiConfig: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature,
      signal: finalSignal,
      useCorsProxy: model.useCorsProxy,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    console.log(`[${logLabel}] 开始单段落${taskLabel}，段落ID: ${paragraph.id}`);

    // 工具调用循环
    let roundCount = 0;
    let finalText = '';

    while (roundCount < MAX_TOOL_CALL_ROUNDS) {
      if (finalSignal.aborted) {
        throw new Error('请求已取消');
      }

      roundCount++;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'processing',
          message: `正在${taskLabel}中...`,
        });
      }

      const request: TextGenerationRequest = {
        messages: history,
        ...(tools.length > 0 ? { tools } : {}),
      };

      let firstChunkReceived = false;
      const wrappedOnChunk: TextGenerationStreamCallback = async (chunk) => {
        if (finalSignal?.aborted) {
          throw new Error('请求已取消');
        }

        if (aiProcessingStore && taskId) {
          if (!firstChunkReceived) {
            void aiProcessingStore.updateTask(taskId, {
              status: 'processing',
              message: `正在${taskLabel}中...`,
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

      const result = await service.generateText(aiConfig, request, wrappedOnChunk);

      if (result.reasoningContent && aiProcessingStore && taskId) {
        void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
      }

      finalText = result.text || '';

      // 处理工具调用
      if (result.toolCalls && result.toolCalls.length > 0) {
        // 将 assistant 的回复（含工具调用）添加到历史
        // 必须包含 reasoning_content，否则 DeepSeek 等 thinking mode 模型会报错
        history.push({
          role: 'assistant',
          content: result.text || '（调用工具）',
          tool_calls: result.toolCalls,
          reasoning_content: result.reasoningContent || null,
        });

        // 执行工具调用
        for (const toolCall of result.toolCalls) {
          console.log(`[${logLabel}] 处理工具调用: ${toolCall.function.name}`);

          const toolResult = await ToolRegistry.handleToolCall(
            toolCall,
            bookId || '',
            onAction,
            onToast,
            taskId,
            undefined, // sessionId
            [paragraph.id], // paragraphIds
            aiProcessingStore,
            model.id,
          );

          // add_translation_batch 工具只负责验证，不直接写入翻译。
          // 需要从工具结果中提取已接受的段落，通过 onParagraphResult 回调完成实际写入。
          if (toolCall.function.name === 'add_translation_batch' && onParagraphResult) {
            try {
              const parsed = JSON.parse(toolResult.content);
              if (parsed.success && parsed.accepted_paragraphs) {
                const translations = (
                  parsed.accepted_paragraphs as Array<{
                    paragraph_id: string;
                    translated_text: string;
                  }>
                ).map((p) => ({
                  id: p.paragraph_id,
                  translation: p.translated_text,
                }));
                if (translations.length > 0) {
                  await onParagraphResult(translations);
                }
              }
            } catch {
              console.warn(`[${logLabel}] 解析 add_translation_batch 结果失败`);
            }
          }

          // 将工具结果添加到历史
          history.push({
            role: 'tool',
            content: toolResult.content,
            tool_call_id: toolResult.tool_call_id,
          });
        }

        // 继续循环，让 AI 处理工具结果
        continue;
      }

      // 没有工具调用，AI 已完成
      break;
    }

    // 任务完成
    if (aiProcessingStore && taskId) {
      void aiProcessingStore.updateTask(taskId, {
        status: 'end',
        workflowStatus: 'end',
        message: `${taskLabel}完成`,
      });
    }

    console.log(`[${logLabel}] 单段落${taskLabel}完成，段落ID: ${paragraph.id}`);

    return {
      text: finalText,
      ...(taskId ? { taskId } : {}),
    };
  } catch (error) {
    console.error(`[${logLabel}] 单段落${taskLabel}失败:`, error);
    await handleTaskError(error, taskId, aiProcessingStore, taskType);

    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`${taskLabel}时发生未知错误`);
  } finally {
    cleanupAbort();
  }
}
