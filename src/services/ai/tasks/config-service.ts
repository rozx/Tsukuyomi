import { buildModelServiceConfig } from '../core/model-config';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult } from 'src/services/ai/types/ai-service';
import { AIServiceFactory } from '../ai-service-factory';
import { lookupModelLimits } from '../model-limits/resolve';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { LocalizedError, localizedErrorMessage } from 'src/utils/localized-error';
import { createUnifiedAbortController } from './utils/stream-handler';

export interface ModelAvailabilityResult {
  success: boolean;
  message: string;
  durationMs: number;
  messageKey?: MessageKey;
  messageValues?: Record<string, string | number>;
}

/** 目录资料与真实连通性测试分离，二者都不保存模型配置。 */
export class ConfigService {
  static async getConfig(model: AIModel, locale: AppLocale = 'zh-CN'): Promise<AIConfigResult> {
    if (!model.model.trim())
      return { success: false, message: translateText(locale, 'aiUi.fillModelId') };
    const catalog = await lookupModelLimits(model);
    return catalog
      ? {
          success: true,
          message: translateText(locale, 'aiUi.catalogFound'),
          limitsSource: 'catalog',
          maxInputTokens: catalog.contextWindow,
          maxOutputTokens: catalog.maxOutput ?? 0,
        }
      : {
          success: false,
          message: translateText(locale, 'aiUi.catalogMissing'),
        };
  }

  private static availabilityFailure(
    error: unknown,
    model: AIModel,
    locale: AppLocale,
    externallyCancelled: boolean,
    timedOut: boolean,
    durationMs: number,
  ): ModelAvailabilityResult {
    const messageKey: MessageKey | undefined = externallyCancelled
      ? 'aiUi.testCancelled'
      : timedOut
        ? 'aiUi.testTimeout'
        : error instanceof LocalizedError
          ? error.messageKey
          : undefined;
    const messageValues = error instanceof LocalizedError ? { ...error.values } : {};
    // 本地化参数也必须脱敏，不能经显示层重新泄露凭据。
    for (const [key, value] of Object.entries(messageValues)) {
      if (model.apiKey && typeof value === 'string')
        messageValues[key] = value.replaceAll(
          model.apiKey,
          translateText(locale, 'aiUi.hiddenCredential'),
        );
    }
    const message = messageKey
      ? translateText(locale, messageKey, messageValues)
      : localizedErrorMessage(error, locale, 'aiUi.testFailed');
    return {
      success: false,
      ...(messageKey ? { messageKey, messageValues } : {}),
      message: model.apiKey
        ? message.replaceAll(model.apiKey, translateText(locale, 'aiUi.hiddenCredential'))
        : message,
      durationMs,
    };
  }

  static async testAvailability(
    model: AIModel,
    options: { signal?: AbortSignal; uiLocale?: AppLocale } = {},
  ): Promise<ModelAvailabilityResult> {
    const locale = options.uiLocale ?? 'zh-CN';
    const start = Date.now();
    const { controller, cleanup } = createUnifiedAbortController(options.signal);
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (!model.apiKey?.trim())
        throw new LocalizedError('API_KEY_REQUIRED', 'aiUi.apiKeyRequired', {}, locale);
      if (!model.model?.trim())
        throw new LocalizedError('MODEL_ID_REQUIRED', 'aiUi.identifierRequired', {}, locale);
      if (model.provider !== 'gemini' && !model.baseUrl?.trim())
        throw new LocalizedError('BASE_URL_REQUIRED', 'aiUi.urlRequired', {}, locale);
      const maxOutputTokens =
        model.maxOutputTokens > 0 ? Math.min(model.maxOutputTokens, 2048) : 2048;
      const config = buildModelServiceConfig(model, { maxOutputTokens, signal });
      await AIServiceFactory.getService(model.provider).generateText(config, {
        prompt: translateText(locale, 'aiUi.testPrompt'),
        maxOutputTokens,
      });
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      return {
        success: true,
        message: translateText(locale, 'aiUi.testSucceeded'),
        messageKey: 'aiUi.testSucceeded',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return this.availabilityFailure(
        error,
        model,
        locale,
        options.signal?.aborted === true,
        controller.signal.aborted,
        Date.now() - start,
      );
    } finally {
      clearTimeout(timeout);
      cleanup();
    }
  }
}
