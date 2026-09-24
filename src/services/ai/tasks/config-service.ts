import { buildModelServiceConfig } from '../core/model-config';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult } from 'src/services/ai/types/ai-service';
import { AIServiceFactory } from '../ai-service-factory';
import { lookupModelLimits } from '../model-limits/resolve';
import { getErrorMessage } from 'src/utils/error-message';
import { createUnifiedAbortController } from './utils/stream-handler';

export interface ModelAvailabilityResult {
  success: boolean;
  message: string;
  durationMs: number;
}

/** 目录资料与真实连通性测试分离，二者都不保存模型配置。 */
export class ConfigService {
  static async getConfig(model: AIModel): Promise<AIConfigResult> {
    if (!model.model.trim()) return { success: false, message: '请先填写模型标识' };
    const catalog = await lookupModelLimits(model);
    return catalog
      ? {
          success: true,
          message: '已从 models.dev 模型目录获取上限',
          limitsSource: 'catalog',
          maxInputTokens: catalog.contextWindow,
          maxOutputTokens: catalog.maxOutput ?? 0,
        }
      : {
          success: false,
          message: 'models.dev 暂未收录此模型，已保留现有数值，请手动填写模型上限。',
        };
  }

  static async testAvailability(
    model: AIModel,
    options: { signal?: AbortSignal } = {},
  ): Promise<ModelAvailabilityResult> {
    const start = Date.now();
    const { controller, cleanup } = createUnifiedAbortController(options.signal);
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (!model.apiKey?.trim()) throw new Error('API Key 不能为空');
      if (!model.model?.trim()) throw new Error('模型标识不能为空');
      if (model.provider !== 'gemini' && !model.baseUrl?.trim())
        throw new Error('基础地址不能为空');
      const maxOutputTokens =
        model.maxOutputTokens > 0 ? Math.min(model.maxOutputTokens, 2048) : 2048;
      const config = buildModelServiceConfig(model, { maxOutputTokens, signal });
      await AIServiceFactory.getService(model.provider).generateText(config, {
        prompt: '请只回复 OK。',
        maxOutputTokens,
      });
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      return {
        success: true,
        message: '模型已成功响应，当前配置可用。',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const message = options.signal?.aborted
        ? '测试已取消'
        : controller.signal.aborted
          ? '模型可用性测试超时（30 秒），请稍后重试。'
          : getErrorMessage(error, '模型测试失败');
      return {
        success: false,
        message: model.apiKey ? message.replaceAll(model.apiKey, '[已隐藏凭据]') : message,
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timeout);
      cleanup();
    }
  }
}
