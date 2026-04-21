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
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { AIProcessingStore, TaskType } from './task-types';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { AIServiceFactory } from '../../ai-service-factory';
import { AIEmptyResponseError } from '../../core';
import { ToolRegistry } from '../../tools/tool-registry';
import {
  createTaskChunkForwarder,
  createUnifiedAbortController,
  handleTaskError,
} from './stream-handler';
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
interface TaskRegistration {
  taskId: string | undefined;
  abortController: AbortController | undefined;
}

async function registerSingleParagraphTask(
  aiProcessingStore: SingleParagraphOptions['aiProcessingStore'],
  model: AIModel,
  taskType: TaskType,
  taskLabel: string,
  bookId?: string,
  chapterId?: string,
  chapterTitle?: string,
): Promise<TaskRegistration> {
  if (!aiProcessingStore) {
    return { taskId: undefined, abortController: undefined };
  }
  const taskId = await aiProcessingStore.addTask({
    type: taskType,
    modelName: model.name,
    status: 'thinking',
    workflowStatus: 'working',
    message: `正在${taskLabel}段落...`,
    thinkingMessage: '',
    isSingleParagraph: true,
    ...(bookId ? { bookId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(chapterTitle ? { chapterTitle } : {}),
  });
  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  return { taskId, abortController: task?.abortController };
}

async function forwardAddTranslationBatchResult(
  toolResultContent: string,
  logLabel: string,
  onParagraphResult: SingleParagraphOptions['onParagraphResult'],
): Promise<void> {
  if (!onParagraphResult) return;
  let parsed;
  try {
    parsed = JSON.parse(toolResultContent);
  } catch {
    console.warn(`[${logLabel}] 解析 add_translation_batch 结果失败:`, toolResultContent);
    return;
  }
  if (!parsed?.success || !parsed.accepted_paragraphs) return;
  const translations = (
    parsed.accepted_paragraphs as Array<{ paragraph_id: string; translated_text: string }>
  ).map((p) => ({ id: p.paragraph_id, translation: p.translated_text }));
  if (translations.length > 0) {
    await onParagraphResult(translations);
  }
}

interface SingleParagraphRoundContext {
  service: ReturnType<typeof AIServiceFactory.getService>;
  aiConfig: AIServiceConfig;
  history: ChatMessage[];
  tools: AITool[];
  finalSignal: AbortSignal;
  aiProcessingStore: SingleParagraphOptions['aiProcessingStore'];
  taskId: string | undefined;
  taskLabel: string;
  logLabel: string;
  onChunk: SingleParagraphOptions['onChunk'];
  onAction: SingleParagraphOptions['onAction'];
  onToast: SingleParagraphOptions['onToast'];
  onParagraphResult: SingleParagraphOptions['onParagraphResult'];
  paragraphId: string;
  bookId: string | undefined;
  model: AIModel;
}

async function runSingleParagraphRound(
  ctx: SingleParagraphRoundContext,
): Promise<{ text: string; done: boolean }> {
  if (ctx.finalSignal.aborted) throw new Error('请求已取消');

  if (ctx.aiProcessingStore && ctx.taskId) {
    void ctx.aiProcessingStore.updateTask(ctx.taskId, {
      status: 'processing',
      message: `正在${ctx.taskLabel}中...`,
    });
  }

  const request: TextGenerationRequest = {
    messages: ctx.history,
    ...(ctx.tools.length > 0 ? { tools: ctx.tools } : {}),
  };

  let result;
  try {
    result = await ctx.service.generateText(
      ctx.aiConfig,
      request,
      createTaskChunkForwarder({
        aiProcessingStore: ctx.aiProcessingStore,
        taskId: ctx.taskId,
        finalSignal: ctx.finalSignal,
        processingMessage: `正在${ctx.taskLabel}中...`,
        ...(ctx.onChunk ? { onChunk: ctx.onChunk } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof AIEmptyResponseError) {
      console.log(`[${ctx.logLabel}] AI 返回空响应（预期行为：无文本输出）`);
      return { text: '', done: true };
    }
    throw error;
  }

  if (result.reasoningContent && ctx.aiProcessingStore && ctx.taskId) {
    void ctx.aiProcessingStore.appendThinkingMessage(ctx.taskId, result.reasoningContent);
  }

  const text = result.text || '';

  if (!result.toolCalls || result.toolCalls.length === 0) {
    return { text, done: true };
  }

  await runToolCallsForSingleParagraph(
    result,
    ctx.history,
    ctx.paragraphId,
    ctx.bookId,
    ctx.taskId,
    ctx.model,
    ctx.logLabel,
    ctx.aiProcessingStore,
    ctx.onAction,
    ctx.onToast,
    ctx.onParagraphResult,
  );

  return { text, done: false };
}

async function runToolCallsForSingleParagraph(
  result: { text?: string; toolCalls?: AIToolCall[]; reasoningContent?: string | null },
  history: ChatMessage[],
  paragraphId: string,
  bookId: string | undefined,
  taskId: string | undefined,
  model: AIModel,
  logLabel: string,
  aiProcessingStore: SingleParagraphOptions['aiProcessingStore'],
  onAction: SingleParagraphOptions['onAction'],
  onToast: SingleParagraphOptions['onToast'],
  onParagraphResult: SingleParagraphOptions['onParagraphResult'],
): Promise<void> {
  if (!result.toolCalls || result.toolCalls.length === 0) return;

  history.push({
    role: 'assistant',
    content: result.text || '（调用工具）',
    tool_calls: result.toolCalls,
    reasoning_content: result.reasoningContent || null,
  });

  for (const toolCall of result.toolCalls) {
    console.log(`[${logLabel}] 处理工具调用: ${toolCall.function.name}`);

    const toolResult = await ToolRegistry.handleToolCall(
      toolCall,
      bookId || '',
      onAction,
      onToast,
      taskId,
      undefined,
      [paragraphId],
      aiProcessingStore,
      model.id,
    );

    if (toolCall.function.name === 'add_translation_batch') {
      await forwardAddTranslationBatchResult(toolResult.content, logLabel, onParagraphResult);
    }

    history.push({
      role: 'tool',
      content: toolResult.content,
      tool_call_id: toolResult.tool_call_id,
    });
  }
}

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
  const { taskId, abortController: taskAbortController } = await registerSingleParagraphTask(
    aiProcessingStore,
    model,
    taskType,
    taskLabel,
    bookId,
    chapterId,
    chapterTitle,
  );

  const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
    signal,
    taskAbortController,
  );
  const finalSignal = internalController.signal;

  try {
    const service = AIServiceFactory.getService(model.provider);

    const bookContextSection = bookId ? await buildBookContextSection(bookId) : '';
    const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);
    const specialInstructions = bookId
      ? getSpecialInstructions(bookId, chapterId, taskType)
      : undefined;
    const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);

    const tools = ToolRegistry.getSingleParagraphPolishTools(bookId);

    const systemPrompt = buildSystemPrompt({
      bookContextSection,
      chapterContextSection,
      specialInstructionsSection,
      tools,
    });

    const defaultContext = await buildSingleParagraphDefaultContext({
      currentParagraphId: paragraph.id,
      allChapterParagraphs,
      ...(bookId ? { bookId } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(chapterTitle ? { chapterTitle } : {}),
    });

    const currentTranslation = getSelectedTranslation(paragraph);
    const userPrompt = buildUserPrompt({
      paragraphId: paragraph.id,
      originalText: paragraph.text,
      currentTranslation,
      defaultContext,
    });

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

    const roundCtx: SingleParagraphRoundContext = {
      service,
      aiConfig,
      history,
      tools,
      finalSignal,
      aiProcessingStore,
      taskId,
      taskLabel,
      logLabel,
      onChunk,
      onAction,
      onToast,
      onParagraphResult,
      paragraphId: paragraph.id,
      bookId,
      model,
    };

    let finalText = '';
    for (let roundCount = 0; roundCount < MAX_TOOL_CALL_ROUNDS; roundCount++) {
      const round = await runSingleParagraphRound(roundCtx);
      finalText = round.text || finalText;
      if (round.done) break;
    }

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

    if (error instanceof Error) throw error;
    throw new Error(`${taskLabel}时发生未知错误`);
  } finally {
    cleanupAbort();
  }
}
