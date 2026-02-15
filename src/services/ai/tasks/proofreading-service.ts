import type { AIModel } from 'src/services/ai/types/ai-model';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { processTextTask, type ParagraphExtractCallbackParams } from './utils/text-task-processor';
import { buildProofreadingSystemPrompt } from './prompts';

/**
 * 校对服务选项
 */
export interface ProofreadingServiceOptions {
  /**
   * 流式数据回调函数，用于接收校对过程中的数据块
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
   * 段落校对回调函数
   */
  onParagraphProofreading?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID
   */
  bookId?: string;
  /**
   * 当前段落 ID（可选，用于单段落校对时提供上下文）
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
  /**
   * 章节全量段落（包含空段落），用于构建正确的原始索引映射
   */
  allChapterParagraphs?: Paragraph[];
}

/**
 * 校对结果
 */
export interface ProofreadingResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 校对服务
 * 使用 AI 服务进行文本校对，检查并修正文字、内容和格式层面的错误
 */
export class ProofreadingService {
  static readonly CHUNK_SIZE = 8000;

  /**
   * 校对文本
   * @param content 要校对的段落列表（必须包含翻译）
   * @param model AI 模型配置
   * @param options 校对选项（可选）
   * @returns 校对后的文本和任务 ID（如果使用了任务管理）
   */
  static async proofread(
    content: Paragraph[],
    model: AIModel,
    options?: ProofreadingServiceOptions,
  ): Promise<ProofreadingResult> {
    // 构建段落提取回调
    const onParagraphsExtracted = options?.onParagraphProofreading
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
              await Promise.resolve(options.onParagraphProofreading!(changedParagraphs));
            } catch (error) {
              console.error('[ProofreadingService] ⚠️ 段落校对回调失败:', error);
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
        allChapterParagraphs: options?.allChapterParagraphs,
        aiProcessingStore: options?.aiProcessingStore,
      },
      {
        taskType: 'proofreading',
        logLabel: 'ProofreadingService',
        temperature: model.isDefault.proofreading?.temperature ?? 0.3,
        requiresTranslation: true,
        onlyChangedParagraphs: true,
        buildSystemPrompt: (params) =>
          buildProofreadingSystemPrompt({
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
