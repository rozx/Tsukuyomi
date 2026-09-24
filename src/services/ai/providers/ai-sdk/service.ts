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

function validateConfig(config: AIServiceConfig) {
  if (!config.apiKey?.trim()) throw new Error('API Key 不能为空');
  if (!config.model?.trim()) throw new Error('模型名称不能为空');
}

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
      throw new Error('提示词或消息列表不能为空');
    const model = createModel(this.provider, config, request);
    const messages = toModelMessages(request, this.provider);
    const limit = request.maxOutputTokens ?? config.maxOutputTokens;
    const temperature = request.temperature ?? config.temperature;
    const result = streamText({
      ...model,
      instructions: messages.filter((message) => message.role === 'system'),
      messages: messages.filter((message) => message.role !== 'system'),
      tools: Object.fromEntries(
        (request.tools ?? []).map(({ function: fn }) => [
          fn.name,
          tool({
            description: fn.description,
            inputSchema: jsonSchema(fn.parameters as Parameters<typeof jsonSchema>[0]),
          }),
        ]),
      ),
      toolChoice: 'auto',
      maxRetries: 2,
      ...(config.thinkingLevel && config.thinkingLevel !== 'provider-default'
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
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
  ) {
    try {
      if (!config.apiKey?.trim()) throw new Error('API Key 不能为空');
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
