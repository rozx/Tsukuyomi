import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  TextGenerationStreamCallback,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { Paragraph, ScoreBreakdown } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { AIProcessingStore } from './utils/task-types';
import { getLastScoreBreakdowns } from 'src/services/ai/tasks/utils/context-builder';
import {
  pickTextTaskOptions,
  processTextTask,
  type ParagraphExtractCallbackParams,
  type TitleExtractCallbackParams,
} from './utils/text-task-processor';
import { buildTranslationSystemPrompt } from './prompts/translation';

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
    translations: {
      id: string;
      translation: string;
      referencedMemories?: string[];
      memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
    }[],
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
  aiProcessingStore?: AIProcessingStore;
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
          const referencedMemoryIds = collectChunkReferencedMemoryIds(
            actions.slice(actionStartIndex),
          );
          const memoryScoreBreakdown = resolveChunkMemoryBreakdowns(
            options.bookId,
            referencedMemoryIds,
          );
          const referencedMemories = Array.from(referencedMemoryIds);
          const enrichedParagraphs = enrichParagraphsWithMemory(
            paragraphs,
            referencedMemories,
            memoryScoreBreakdown,
          );

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
      enableOriginalTextValidation: boolean;
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
        enableOriginalTextValidation: params.enableOriginalTextValidation,
      });
    };

    return processTextTask(
      content,
      model,
      pickTextTaskOptions(options),
      {
        taskType: 'translation',
        logLabel: 'TranslationService',
        temperature: model.isDefault.translation?.temperature ?? 0.7,
        requiresTranslation: false,
        onlyChangedParagraphs: false,
        buildSystemPrompt,
        onParagraphsExtracted,
        onTitleExtracted,
        enablePreviousChapter: true,
        enableBriefPlanning: true,
      },
    );
  }
}

/**
 * 从本 chunk 的 actions 中收集引用到的记忆 ID（memory 实体）
 */
function collectChunkReferencedMemoryIds(chunkActions: ActionInfo[]): Set<string> {
  const ids = new Set<string>();
  for (const action of chunkActions) {
    if (action.entity !== 'memory') continue;
    const data = action.data as {
      memory_id?: string;
      id?: string;
      found_memory_ids?: string[];
    };
    if (data.memory_id) ids.add(data.memory_id);
    if (data.id) ids.add(data.id);
    if (Array.isArray(data.found_memory_ids)) {
      for (const id of data.found_memory_ids) ids.add(id);
    }
  }
  return ids;
}

/**
 * 合并上下文注入的记忆 ID（来自三信号打分管线），并返回非空的 breakdowns
 * 会将 breakdowns 的 key 并入 referencedMemoryIds
 */
function resolveChunkMemoryBreakdowns(
  bookId: string | undefined,
  referencedMemoryIds: Set<string>,
): Record<string, ScoreBreakdown> | undefined {
  if (!bookId) return undefined;
  const breakdowns = getLastScoreBreakdowns(bookId);
  if (!breakdowns) return undefined;
  for (const memId of Object.keys(breakdowns)) {
    referencedMemoryIds.add(memId);
  }
  return Object.keys(breakdowns).length > 0 ? breakdowns : undefined;
}

/**
 * 为段落附加引用记忆 / 评分明细（仅在存在时附加，保持可选属性语义）
 */
function enrichParagraphsWithMemory(
  paragraphs: { id: string; translation: string }[],
  referencedMemories: string[],
  memoryScoreBreakdown: Record<string, ScoreBreakdown> | undefined,
): Array<{ id: string; translation: string; referencedMemories?: string[]; memoryScoreBreakdown?: Record<string, ScoreBreakdown> }> {
  return paragraphs.map((p) => ({
    ...p,
    ...(referencedMemories.length > 0 ? { referencedMemories } : {}),
    ...(memoryScoreBreakdown ? { memoryScoreBreakdown } : {}),
  }));
}
