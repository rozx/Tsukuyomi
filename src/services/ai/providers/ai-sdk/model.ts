import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware } from 'ai';
import type { AIProvider } from 'src/services/ai/types/ai-model';
import type { AIServiceConfig, TextGenerationRequest } from 'src/services/ai/types/ai-service';
import { normalizeBaseUrl } from 'src/services/ai/providers/ai-sdk/messages';
import { createProxyFetch, transformOpenAIRequest } from 'src/services/ai/providers/ai-sdk/request';
import { normalizeCompatibleStream } from 'src/services/ai/providers/ai-sdk/compatible-stream';

export function createModel(
  provider: AIProvider,
  config: AIServiceConfig,
  request: TextGenerationRequest,
) {
  const responseMetadata = { modelId: config.model, toolCallOrder: [] as string[] };
  const fetch = createProxyFetch(
    config.useCorsProxy,
    provider === 'openai'
      ? (response) => normalizeCompatibleStream(response, responseMetadata.toolCallOrder)
      : undefined,
  );
  const observeMetadata: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (part.type === 'response-metadata' && part.modelId)
                responseMetadata.modelId = part.modelId;
              controller.enqueue(part);
            },
          }),
        ),
      };
    },
  };
  if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({
      baseURL: `${(config.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')}/v1beta`,
      apiKey: config.apiKey,
      headers: config.customHeaders ?? {},
      fetch,
    });
    const modelName = config.model.replace(/^models\//, '');
    return {
      model: wrapLanguageModel({ model: google(modelName), middleware: observeMetadata }),
      responseMetadata,
      abortSignal: config.signal ?? AbortSignal.timeout(100_000),
      providerOptions: {
        google: {
          ...(/gemini-[23]/i.test(modelName) ? { thinkingConfig: { includeThoughts: true } } : {}),
        },
      },
    };
  }
  const compatible = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: normalizeBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    headers: config.customHeaders ?? {},
    fetch,
    includeUsage: true,
    transformRequestBody: transformOpenAIRequest(request),
  });
  return {
    model: wrapLanguageModel({
      model: compatible(config.model),
      middleware: [observeMetadata, extractReasoningMiddleware({ tagName: 'think' })],
    }),
    responseMetadata,
    ...(config.signal ? { abortSignal: config.signal } : {}),
  };
}
