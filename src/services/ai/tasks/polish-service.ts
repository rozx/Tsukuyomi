import type { AIModel } from 'src/services/ai/types/ai-model';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import {
  processTextTask,
  type TextTaskOptions,
  type ParagraphExtractCallbackParams,
} from './utils/text-task-processor';
import { buildPolishSystemPrompt } from './prompts';

/**
 * 润色服务选项
 */
export interface PolishServiceOptions {
  /**
   * 流式数据回调函数，用于接收润色过程中的数据块
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
   * 段落润色回调函数
   */
  onParagraphPolish?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID
   */
  bookId?: string;
  /**
   * 当前段落 ID（可选，用于单段落润色时提供上下文）
   */
  currentParagraphId?: string;
  /**
   * 章节 ID
   */
  chapterId?: string;
  /**
   * 章节标题
   */
  chapterTitle?: string;
  /**
   * 分块大小
   */
  chunkSize?: number;
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
}

/**
 * 润色结果
 */
export interface PolishResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 润色服务
 * 使用 AI 服务进行文本润色，支持术语 CRUD 工具和翻译历史参考
 */
export class PolishService {
  static readonly CHUNK_SIZE = 8000;

  /**
   * 润色文本
   * @param content 要润色的段落列表（必须包含翻译历史）
   * @param model AI 模型配置
   * @param options 润色选项（可选）
   * @returns 润色后的文本和任务 ID（如果使用了任务管理）
   */
  static async polish(
    content: Paragraph[],
    model: AIModel,
    options?: PolishServiceOptions,
  ): Promise<PolishResult> {
    // 构建段落提取回调
    const onParagraphsExtracted = options?.onParagraphPolish
      ? async (params: ParagraphExtractCallbackParams) => {
          const { paragraphs, originalTranslations } = params;
          // 过滤出有变化的段落
          const changedParagraphs: { id: string; translation: string }[] = [];
          for (const para of paragraphs) {
            if (para.id && para.translation) {
              const original = originalTranslations.get(para.id);
              if (original !== para.translation) {
                changedParagraphs.push(para);
              }
            }
          }
          if (changedParagraphs.length > 0) {
            try {
              await Promise.resolve(options.onParagraphPolish!(changedParagraphs));
            } catch (error) {
              console.error('[PolishService] ⚠️ 段落润色回调失败:', error);
            }
          }
        }
      : undefined;

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
        aiProcessingStore: options?.aiProcessingStore,
      },
      {
        taskType: 'polish',
        logLabel: 'PolishService',
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        requiresTranslation: true,
        onlyChangedParagraphs: true,
        buildSystemPrompt: (params) =>
          buildPolishSystemPrompt({
            todosPrompt: params.todosPrompt,
            bookContextSection: params.bookContextSection,
            chapterContextSection: params.chapterContextSection,
            specialInstructionsSection: params.specialInstructionsSection,
            tools: params.tools,
            skipAskUser: params.skipAskUser,
          }),
        onParagraphsExtracted,
      },
    );
  }
}
