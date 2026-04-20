import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';
import type { AssistantServiceOptions, AssistantResult } from './assistant-service';
import type { ActionInfo } from '../tools/types';
import type { ToastCallback } from '../tools/toast-helper';
import type { AIProcessingStore } from './utils/task-types';
import { buildExplainPrompt } from './prompts';

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
  aiProcessingStore?: AIProcessingStore;
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
    return buildExplainPrompt(selectedText);
  }
}
