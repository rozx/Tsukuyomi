import type { AIModel } from 'src/services/ai/types/ai-model';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import {
  AssistantService,
  type AssistantServiceOptions,
  type AssistantResult,
} from './assistant-service';
import type { ActionInfo } from '../tools/types';
import type { ToastCallback } from '../tools/toast-helper';
import { MemoryService } from 'src/services/memory-service';
import { useContextStore } from 'src/stores/context';

/**
 * 解释服务选项
 */
export interface ExplainServiceOptions {
  /**
   * 流式数据回调函数，用于接收解释过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
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
  /**
   * 对话历史（可选），如果提供，将作为初始对话历史，实现连续对话
   */
  messageHistory?: AssistantServiceOptions['messageHistory'];
  /**
   * 会话总结（可选），如果提供，将添加到系统提示词中
   */
  sessionSummary?: string;
}

/**
 * 解释结果
 */
export interface ExplainResult {
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
  /**
   * 更新后的对话历史（包含本次对话的所有消息）
   */
  messageHistory?: AssistantResult['messageHistory'];
  /**
   * 是否需要重置会话（当达到 token 限制或发生错误时）
   */
  needsReset?: boolean;
  /**
   * 会话总结（当需要重置时提供）
   */
  summary?: string;
}

/**
 * 解释服务
 * 使用 AI 助手服务解释日文文本的含义、语法和文化背景
 */
export class ExplainService {
  private static buildExplainMemorySummary(selectedText: string): string {
    const trimmed = selectedText.trim().replace(/\s+/g, ' ');
    const preview = trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed;
    return `文本解释：${preview}`;
  }

  private static buildExplainMemoryContent(selectedText: string, explanation: string): string {
    const original = selectedText.trim();
    const explanationTrimmed = explanation.trim();
    const originalShort = original.length > 200 ? `${original.slice(0, 200)}...` : original;
    const explanationShort =
      explanationTrimmed.length > 600
        ? `${explanationTrimmed.slice(0, 600)}...`
        : explanationTrimmed;

    return `原文（节选）：\n${originalShort}\n\n解释要点（节选）：\n${explanationShort}`;
  }

  /**
   * 准备文本发送到助手输入框
   * @param text 要发送的文本
   * @returns 处理后的文本（去除首尾空白）
   */
  static prepareTextForAssistant(text: string): string {
    return text.trim();
  }

  /**
   * 生成解释提示词
   * @param selectedText 选中的日文文本
   * @returns 解释提示词
   */
  static generatePrompt(selectedText: string): string {
    return `请简短精要地解释以下日文文本的含义、语法和文化背景，和这本书的关联或者意义：\n\n${selectedText}`;
  }

  /**
   * 构建 AssistantService 选项，只包含已定义的属性
   * @param options 解释服务选项
   * @returns AssistantService 选项
   */
  private static buildAssistantOptions(options: ExplainServiceOptions): AssistantServiceOptions {
    const assistantOptions: AssistantServiceOptions = {};
    if (options.onChunk) {
      assistantOptions.onChunk = options.onChunk;
    }
    if (options.onAction) {
      assistantOptions.onAction = options.onAction;
    }
    if (options.onToast) {
      assistantOptions.onToast = options.onToast;
    }
    if (options.signal) {
      assistantOptions.signal = options.signal;
    }
    if (options.aiProcessingStore) {
      assistantOptions.aiProcessingStore = options.aiProcessingStore;
    }
    if (options.messageHistory) {
      assistantOptions.messageHistory = options.messageHistory;
    }
    if (options.sessionSummary) {
      assistantOptions.sessionSummary = options.sessionSummary;
    }
    return assistantOptions;
  }

  /**
   * 构建解释结果，只包含已定义的属性
   * @param result AssistantService 结果
   * @returns 解释结果
   */
  private static buildExplainResult(result: AssistantResult): ExplainResult {
    const explainResult: ExplainResult = {
      text: result.text,
    };
    if (result.taskId) {
      explainResult.taskId = result.taskId;
    }
    if (result.actions) {
      explainResult.actions = result.actions;
    }
    if (result.messageHistory) {
      explainResult.messageHistory = result.messageHistory;
    }
    if (result.needsReset !== undefined) {
      explainResult.needsReset = result.needsReset;
    }
    if (result.summary) {
      explainResult.summary = result.summary;
    }
    return explainResult;
  }

  /**
   * 解释选中的日文文本
   * @param model AI 模型配置
   * @param selectedText 选中的日文文本
   * @param options 解释选项（可选）
   * @returns 解释结果
   */
  static async explain(
    model: AIModel,
    selectedText: string,
    options: ExplainServiceOptions = {},
  ): Promise<ExplainResult> {
    // 构建解释提示词
    const explainPrompt = this.generatePrompt(selectedText);

    // 构建 AssistantService 选项
    const assistantOptions = this.buildAssistantOptions(options);

    // 使用 AssistantService 处理解释请求
    const result = await AssistantService.chat(model, explainPrompt, assistantOptions);

    // 解释类记忆：保持“短且可复用”，优先合并更新而不是重复创建
    if (result.text && selectedText) {
      const contextStore = useContextStore();
      const context = contextStore.getContext;
      if (context.currentBookId) {
        try {
          const memorySummary = this.buildExplainMemorySummary(selectedText);
          const memoryContent = this.buildExplainMemoryContent(selectedText, result.text);

          // 先尝试找到并更新已有“文本解释”记忆（避免重复创建）
          const candidates = await MemoryService.searchMemoriesByKeywords(context.currentBookId, [
            '文本解释',
          ]);

          const trimmedSelectedText = selectedText.trim();
          const existing = candidates.find((m) => {
            if (!m.summary.startsWith('文本解释：')) return false;
            // 优先按内容命中（最稳定）
            if (trimmedSelectedText && m.content.includes(trimmedSelectedText)) return true;
            // 次选：按摘要预览命中
            const preview = trimmedSelectedText.replace(/\s+/g, ' ').slice(0, 20);
            return preview.length > 0 && m.summary.includes(preview);
          });

          if (existing) {
            await MemoryService.updateMemory(
              context.currentBookId,
              existing.id,
              memoryContent,
              memorySummary,
            );
          } else {
            await MemoryService.createMemory(context.currentBookId, memoryContent, memorySummary);
          }
        } catch (error) {
          console.error('Failed to create memory for explanation:', error);
          // 不抛出错误，记忆创建失败不应该影响解释流程
        }
      }
    }

    // 构建并返回解释结果
    return this.buildExplainResult(result);
  }
}
