import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  TextGenerationStreamCallback,
  AIToolCall,
  AIToolCallResult,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import {
  processTextTask,
  type ParagraphExtractCallbackParams,
  type TitleExtractCallbackParams,
} from './utils/text-task-processor';
import { ToolRegistry } from 'src/services/ai/tools/index';
import { buildTranslationSystemPrompt } from './prompts';

/**
 * 翻译服务选项
 */
export interface TranslationServiceOptions {
  /**
   * 流式数据回调函数
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数
   */
  onProgress?: (progress: { total: number; current: number; currentParagraphs?: string[] }) => void;
  /**
   * AI 执行操作时的回调
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数
   */
  onToast?: ToastCallback;
  /**
   * 段落翻译回调函数
   */
  onParagraphTranslation?: (
    translations: { id: string; translation: string; referencedMemories?: string[] }[],
  ) => void | Promise<void>;
  /**
   * 标题翻译回调函数
   */
  onTitleTranslation?: (translation: string) => void | Promise<void>;
  /**
   * 取消信号
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID
   */
  bookId?: string;
  /**
   * 章节标题
   */
  chapterTitle?: string;
  /**
   * 章节 ID
   */
  chapterId?: string;
  /**
   * AI 处理 Store
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
  /**
   * 分块大小
   */
  chunkSize?: number;
  /**
   * 章节全量段落（包含空段落），用于构建正确的原始索引映射
   */
  allChapterParagraphs?: Paragraph[];
}

/**
 * 翻译结果
 */
export interface TranslationResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  titleTranslation?: string;
  referencedMemories?: string[];
  actions?: ActionInfo[];
}

/**
 * 翻译服务
 */
export class TranslationService {
  static readonly CHUNK_SIZE = 8000;

  /**
   * 处理工具调用
   */
  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
    taskId?: string,
  ): Promise<AIToolCallResult> {
    return ToolRegistry.handleToolCall(toolCall, bookId, onAction, onToast, taskId);
  }

  /**
   * 翻译文本
   */
  static async translate(
    content: Paragraph[],
    model: AIModel,
    options?: TranslationServiceOptions,
  ): Promise<TranslationResult> {
    // 构建段落提取回调
    const onParagraphsExtracted = options?.onParagraphTranslation
      ? async (params: ParagraphExtractCallbackParams) => {
          const { paragraphs, actions, actionStartIndex } = params;
          // 提取本 chunk 引用的记忆 ID
          const chunkActions = actions.slice(actionStartIndex);
          const referencedMemoryIds = new Set<string>();
          for (const action of chunkActions) {
            if (action.entity === 'memory') {
              const data = action.data as {
                memory_id?: string;
                id?: string;
                found_memory_ids?: string[];
              };
              if (data.memory_id) referencedMemoryIds.add(data.memory_id);
              if (data.id) referencedMemoryIds.add(data.id);
              if (data.found_memory_ids && Array.isArray(data.found_memory_ids)) {
                data.found_memory_ids.forEach((id) => referencedMemoryIds.add(id));
              }
            }
          }
          const referencedMemories = Array.from(referencedMemoryIds);

          // 构建带引用的段落对象
          const enrichedParagraphs = paragraphs.map((p) => ({
            ...p,
            ...(referencedMemories.length > 0 ? { referencedMemories } : {}),
          }));

          try {
            await Promise.resolve(options.onParagraphTranslation!(enrichedParagraphs));
          } catch (error) {
            console.error('[TranslationService] ⚠️ 段落翻译回调失败:', error);
          }
        }
      : undefined;

    // 构建标题提取回调
    const onTitleExtracted = options?.onTitleTranslation
      ? async (params: TitleExtractCallbackParams) => {
          try {
            await Promise.resolve(options.onTitleTranslation!(params.title));
          } catch (error) {
            console.error('[TranslationService] ⚠️ 标题回调失败:', error);
          }
        }
      : undefined;

    // 构建系统提示词函数（支持第一个/后续 chunk 不同提示词）
    const buildSystemPrompt = (params: {
      todosPrompt: string;
      bookContextSection: string;
      chapterContextSection: string;
      specialInstructionsSection: string;
      tools: AITool[];
      skipAskUser: boolean;
      isFirstChunk: boolean;
    }) => {
      return buildTranslationSystemPrompt({
        todosPrompt: params.todosPrompt,
        bookContextSection: params.bookContextSection,
        chapterContextSection: params.chapterContextSection,
        previousChapterSection: '', // 前一章节信息已在 processor 中添加到 chapterContextSection
        specialInstructionsSection: params.specialInstructionsSection,
        tools: params.tools,
        skipAskUser: params.skipAskUser,
        includeChapterTitle: params.isFirstChunk,
      });
    };

    return processTextTask(
      content,
      model,
      {
        onChunk: options?.onChunk,
        onProgress: options?.onProgress,
        onAction: options?.onAction,
        onToast: options?.onToast,
        signal: options?.signal,
        bookId: options?.bookId,
        chapterId: options?.chapterId,
        chapterTitle: options?.chapterTitle,
        chunkSize: options?.chunkSize,
        allChapterParagraphs: options?.allChapterParagraphs,
        aiProcessingStore: options?.aiProcessingStore,
      },
      {
        taskType: 'translation',
        logLabel: 'TranslationService',
        temperature: model.isDefault.translation?.temperature ?? 0.7,
        requiresTranslation: false,
        onlyChangedParagraphs: false,
        buildSystemPrompt,
        onParagraphsExtracted,
        onTitleExtracted,
        enableChapterSummary: true,
        enablePreviousChapter: true,
        enableBriefPlanning: true,
      },
    );
  }
}
