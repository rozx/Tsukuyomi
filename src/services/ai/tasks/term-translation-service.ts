import type { AIModel } from 'src/types/ai/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
} from 'src/types/ai/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { AIServiceFactory } from '../index';

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
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
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
    const { prompt, onChunk, signal, taskType = 'translation', aiProcessingStore } = options || {};

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

      // 如果没有提供 signal，使用任务的 abortController
      if (!signal && abortController) {
        // 注意：这里我们不能直接修改 signal 参数，但可以在内部使用 abortController
      }
    }

    const trimmedText = text.trim();
    // 根据任务类型使用不同的默认提示词
    const defaultPrompt =
      taskType === 'termsTranslation'
        ? `请将以下日文术语翻译为简体中文，保持原文的格式和结构，只返回翻译结果，不要包含任何其他内容：\n\n${trimmedText}`
        : `请将以下日文文本翻译为简体中文，保持原文的格式和结构，只返回翻译结果，不要包含任何其他内容：\n\n${trimmedText}`;
    const finalPrompt = prompt || defaultPrompt;

    // 根据任务类型获取温度设置
    const temperature =
      taskType === 'termsTranslation'
        ? (model.isDefault.termsTranslation?.temperature ?? 0.7)
        : (model.isDefault.translation?.temperature ?? 0.7);

    // 创建一个合并的 AbortSignal，同时监听 signal 和 task.abortController
    const internalController = new AbortController();
    const finalSignal = internalController.signal;

    // 监听信号并触发内部 controller
    const abortHandler = () => {
      internalController.abort();
    };

    if (signal) {
      if (signal.aborted) {
        internalController.abort();
      } else {
        signal.addEventListener('abort', abortHandler);
      }
    }

    if (abortController) {
      if (abortController.signal.aborted) {
        internalController.abort();
      } else {
        abortController.signal.addEventListener('abort', abortHandler);
      }
    }

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature,
      signal: finalSignal,
    };

    try {
      let firstChunkReceived = false;

      // 创建包装的 onChunk 回调，自动处理任务状态更新
      const wrappedOnChunk: TextGenerationStreamCallback = async (chunk) => {
        // 检查是否已取消
        if (finalSignal?.aborted) {
          throw new Error('翻译已取消');
        }

        // 如果使用了任务管理，自动更新任务状态
        if (aiProcessingStore && taskId) {
          if (!firstChunkReceived) {
            void aiProcessingStore.updateTask(taskId, {
              status: 'processing',
              message: '正在生成翻译...',
            });
            firstChunkReceived = true;
          }

          // 累积思考消息
          if (chunk.text) {
            void aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
          }

          if (chunk.done) {
            void aiProcessingStore.updateTask(taskId, {
              status: 'completed',
              message: '翻译完成',
            });
          }
        }

        // 调用用户提供的回调
        if (onChunk) {
          await onChunk(chunk);
        }
      };

      const service = AIServiceFactory.getService(model.provider);
      const request: TextGenerationRequest = {
        prompt: finalPrompt,
      };

      if (config.temperature !== undefined) {
        request.temperature = config.temperature;
      }

      const result = await service.generateText(config, request, wrappedOnChunk);

      // 不再自动删除任务，保留思考过程供用户查看

      return { text: result.text, ...(taskId ? { taskId } : {}) };
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
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}

