import { jsonSchema, streamText, tool } from 'ai';
import type { AIProvider } from 'src/services/ai/types/ai-model';
import type {
  AIService,
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
} from 'src/services/ai/types/ai-service';
import { getErrorMessage } from 'src/utils/error-message';
import { createModel } from 'src/services/ai/providers/ai-sdk/model';
import { toModelMessages } from 'src/services/ai/providers/ai-sdk/messages';
import { collectStream } from 'src/services/ai/providers/ai-sdk/stream';
import { listModels } from 'src/services/ai/providers/ai-sdk/models';
import { providerError } from 'src/services/ai/providers/ai-sdk/errors';
import { ANTHROPIC_CACHE_BREAKPOINT } from 'src/services/ai/providers/ai-sdk/anthropic';
import { modelRejectsTemperature } from 'src/services/ai/core/temperature-support';
import { LocalizedError } from 'src/utils/localized-error';

function validateConfig(config: AIServiceConfig) {
  if (!config.apiKey?.trim()) throw apiKeyRequired();
  if (!config.model?.trim())
    throw new LocalizedError('AI_MODEL_REQUIRED', 'settingsUi.models.errors.modelRequired');
}

/** 自有校验错误带错误码；说明默认简中，界面显示处按界面语言重新渲染 */
const apiKeyRequired = () =>
  new LocalizedError('AI_API_KEY_REQUIRED', 'settingsUi.models.errors.apiKeyRequired');

/** 单次请求适配；工具仍由应用已有的循环执行。 */
export class AiSdkAIService implements AIService {
  constructor(private readonly provider: AIProvider) {}

  async generateText(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ) {
    validateConfig(config);
    if (!request.prompt?.trim() && !request.messages?.length)
      throw new LocalizedError('AI_PROMPT_REQUIRED', 'settingsUi.models.errors.promptRequired');
    const model = createModel(this.provider, config, request);
    const messages = toModelMessages(request, this.provider);
    const limit = request.maxOutputTokens ?? config.maxOutputTokens;
    const anthropic = this.provider === 'anthropic';
    // 原生接口上 SDK 只认识已收录的型号，未收录的新 Claude 仍按标识判断，避免 400
    const temperature =
      config.temperatureEnabled === false || (anthropic && modelRejectsTemperature(config.model))
        ? undefined
        : (request.temperature ?? config.temperature);
    const instructions = messages.filter((message) => message.role === 'system');
    const tools = request.tools ?? [];
    const result = streamText({
      ...model,
      // 稳定前缀（工具定义 → system）各放一个缓存断点，变化的 system 不拖累工具缓存
      instructions: instructions.map((message, index) =>
        anthropic && index === instructions.length - 1
          ? { ...message, providerOptions: ANTHROPIC_CACHE_BREAKPOINT }
          : message,
      ),
      messages: messages.filter((message) => message.role !== 'system'),
      tools: Object.fromEntries(
        tools.map(({ function: fn }, index) => [
          fn.name,
          tool({
            description: fn.description,
            inputSchema: jsonSchema(fn.parameters as Parameters<typeof jsonSchema>[0]),
            ...(anthropic && index === tools.length - 1
              ? { providerOptions: ANTHROPIC_CACHE_BREAKPOINT }
              : {}),
          }),
        ]),
      ),
      toolChoice: 'auto',
      maxRetries: 2,
      // Anthropic 的思考配置已在 providerOptions 中按型号映射，避免 SDK 再按等级改写
      ...(!anthropic && config.thinkingLevel && config.thinkingLevel !== 'provider-default'
        ? { reasoning: config.thinkingLevel }
        : {}),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(limit && limit > 0
        ? {
            maxOutputTokens:
              this.provider === 'openai' ? Math.max(1, Math.min(limit, 65536)) : limit,
          }
        : {}),
      onError: () => {}, // 错误从 fullStream 交给调用方，避免 SDK 重复输出日志。
    });
    try {
      return await collectStream(
        result.fullStream,
        model.responseMetadata,
        onChunk,
        model.abortSignal,
      );
    } catch (error) {
      throw providerError(error);
    }
  }

  async getAvailableModels(
    config: Pick<
      AIServiceConfig,
      'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy' | 'signal'
    >,
  ) {
    try {
      if (!config.apiKey?.trim()) throw apiKeyRequired();
      return {
        success: true,
        message: '模型列表获取成功',
        models: await listModels(this.provider, config),
      };
    } catch (error) {
      return { success: false, message: getErrorMessage(error, '获取模型列表失败') };
    }
  }
}
