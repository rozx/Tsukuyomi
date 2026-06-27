import OpenAI from 'openai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
  TextGenerationChunk,
  ModelInfo,
} from 'src/services/ai/types/ai-service';
import type { ParsedResponse } from 'src/services/ai/types/interfaces';
import { BaseAIService, AIEmptyResponseError } from '../core';
import { DEFAULT_TEMPERATURE, OPENAI_MAX_TOKENS_LIMIT } from 'src/constants/ai';
import { ProxyService } from 'src/services/proxy-service';
import { isElectron } from 'src/utils/platform';
import { TOOL_CALL_PLACEHOLDER } from 'src/services/ai/tasks/utils/stream-handler';

/**
 * OpenAI AI 服务实现
 * 使用 OpenAI API
 */
export class OpenAIService extends BaseAIService {
  /**
   * 规范化 baseURL，确保 OpenAI 兼容 API 包含 /v1 路径
   * 对于像 Moonshot AI 这样的 API，需要在 baseURL 末尾添加 /v1
   */
  private normalizeBaseUrl(baseUrl: string): string {
    try {
      const url = new URL(baseUrl);
      // 规范化路径：移除尾随斜杠
      const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

      // 如果 URL 没有路径或路径仅为根路径，添加 /v1
      if (normalizedPath === '/') {
        url.pathname = '/v1';
        return url.toString();
      }

      // 如果已有路径，保持原样（允许用户自定义路径）
      // 但确保路径没有尾随斜杠（除非是根路径）
      url.pathname = normalizedPath;
      return url.toString();
    } catch {
      // 如果不是有效的 URL，返回原值（可能是相对路径或其他格式）
      return baseUrl;
    }
  }

  /**
   * 获取代理后的 baseURL
   * 在浏览器模式下，使用 CORS 代理来绕过 CORS 限制
   */
  private getProxiedBaseUrl(baseUrl?: string): string {
    // 验证 baseUrl 是否有效
    if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
      // 默认使用 OpenAI API
      baseUrl = 'https://api.openai.com/v1';
    }

    const trimmedBaseUrl = baseUrl.trim();

    // 如果 baseUrl 已经是代理路径（相对路径），转换为完整 URL
    if (trimmedBaseUrl.startsWith('/api/ai/')) {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9000';
      return `${origin}${trimmedBaseUrl}`;
    }

    // 规范化 baseURL，确保包含 /v1（对于 OpenAI 兼容 API）
    const normalizedUrl = this.normalizeBaseUrl(trimmedBaseUrl);

    // 在浏览器模式下，直接返回规范化后的 baseUrl
    // 实际的代理会在自定义 fetch 函数中处理
    return normalizedUrl;
  }

  /**
   * 创建自定义 fetch 函数，用于在浏览器模式下代理请求
   */
  private createProxiedFetch(
    useCorsProxy?: boolean,
  ): ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined {
    // 仅在浏览器模式下使用自定义 fetch
    if (!isElectron() && typeof fetch !== 'undefined') {
      return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // 将 input 转换为 URL 字符串
        let url: string;
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else {
          url = input.url;
        }

        // 使用 CORS 代理包装 URL（尊重模型级别的 useCorsProxy 配置）
        const proxiedUrl = ProxyService.getProxiedUrlForAI(url, useCorsProxy);

        // 使用代理后的 URL 进行请求
        return fetch(proxiedUrl, init);
      };
    }

    // Electron 模式下使用默认 fetch
    return undefined;
  }

  /**
   * 创建 OpenAI 客户端
   * 确保所有通信都使用 JSON 格式
   * 注意：在浏览器环境中需要设置 dangerouslyAllowBrowser: true
   */
  private createClient(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
  ): OpenAI {
    const proxiedBaseUrl = this.getProxiedBaseUrl(config.baseUrl);
    const customFetch = this.createProxiedFetch(config.useCorsProxy);

    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: proxiedBaseUrl,
      dangerouslyAllowBrowser: true, // 允许在浏览器环境中使用（用户已了解风险）
      ...(customFetch && { fetch: customFetch }), // 在浏览器模式下使用自定义 fetch
      defaultHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.customHeaders || {}),
      },
    });
  }

  /**
   * 发送配置请求到 OpenAI API 并解析响应
   * 通过提示词要求 AI 返回 JSON 格式，不依赖 response_format 参数（某些模型不支持）
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: this.getConfigPrompt() }],
        // 不设置 max_tokens，让 API 使用默认值（通常是无限制或模型的最大值）
        temperature: config.temperature ?? DEFAULT_TEMPERATURE,
        // 不使用 response_format，通过提示词要求返回 JSON
      });

      const content = completion.choices[0]?.message?.content || null;
      const modelId = completion.model || config.model;

      return {
        content,
        modelId,
      };
    } catch (error) {
      // 将官方 SDK 的错误转换为标准错误格式
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OpenAI API 请求失败');
    }
  }

  /**
   * 发送文本生成请求到 OpenAI API（流式模式）
   */
  protected async makeTextGenerationRequest(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ): Promise<TextGenerationResult> {
    try {
      const client = this.createClient(config);
      const messages = prepareOpenAIMessages(request);
      const requestParams = buildOpenAIRequestParams(config, request, messages);

      // 使用流式 API
      const stream = await client.chat.completions.create(requestParams);
      const streamResult = await consumeOpenAIStream(stream, config, onChunk);

      const finalToolCallsNormalized = finalizeOpenAIToolCalls(
        streamResult.toolCallsMap,
        streamResult.legacyFunctionCall,
      );

      const text = streamResult.fullText.trim();
      if (!text && finalToolCallsNormalized.length === 0) {
        throw new AIEmptyResponseError();
      }

      if (onChunk) {
        await onChunk({
          text: '',
          done: true,
          model: streamResult.modelId,
          ...(finalToolCallsNormalized.length > 0
            ? { toolCalls: finalToolCallsNormalized }
            : {}),
        });
      }

      return {
        text,
        model: streamResult.modelId,
        ...(finalToolCallsNormalized.length > 0
          ? { toolCalls: finalToolCallsNormalized }
          : {}),
        ...(streamResult.reasoningContent
          ? { reasoningContent: streamResult.reasoningContent.trim() }
          : {}),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OpenAI 文本生成请求失败');
    }
  }

  /**
   * 获取可用的模型列表
   * 使用 OpenAI API 的 models.list() 方法
   */
  protected async makeAvailableModelsRequest(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
  ): Promise<ModelInfo[]> {
    try {
      const client = this.createClient(config);
      const response = await client.models.list();

      const models: ModelInfo[] = [];
      for await (const model of response) {
        models.push({
          id: model.id,
          name: model.id,
          displayName: model.id,
          ownedBy: model.owned_by,
        });
      }

      return models;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('获取 OpenAI 模型列表失败');
    }
  }
}

// ============ 模块级辅助函数：消息 / 参数 / 流处理 ============

/**
 * 将上层的 tool 消息转换为 OpenAI SDK 要求的格式（兼容空 content）
 */
function toOpenAIToolMessage(msg: {
  content?: string | null;
  tool_call_id?: string;
  name?: string;
}): OpenAI.Chat.Completions.ChatCompletionToolMessageParam {
  const toolMsg = {
    role: 'tool',
    // [兼容] 避免部分 OpenAI 兼容服务拒绝空 content
    content: msg.content && msg.content.trim() ? msg.content : '（工具返回为空）',
    tool_call_id: msg.tool_call_id!,
  } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  // [兼容] 部分 OpenAI 兼容服务（如部分 Moonshot/Kimi 配置）可能需要 name 字段
  // OpenAI 官方规范中 tool 消息不需要 name，但添加不会影响大多数兼容实现
  if (msg.name) {
    (toolMsg as any).name = msg.name;
  }
  return toolMsg;
}

/**
 * 将 assistant 消息（含 tool_calls）转换为 OpenAI SDK 要求的格式
 */
function toOpenAIAssistantWithToolCalls(msg: {
  content?: string | null | undefined;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
  reasoning_content?: string | null | undefined;
}): OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam {
  // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
  const safeAssistantContent =
    typeof msg.content === 'string' && msg.content.trim() ? msg.content : TOOL_CALL_PLACEHOLDER;
  const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
    role: 'assistant',
    content: safeAssistantContent,
    tool_calls: msg.tool_calls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: tc.function,
    })),
  };
  // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
  if (msg.reasoning_content !== undefined) {
    (assistantMsg as any).reasoning_content = msg.reasoning_content;
  } else {
    (assistantMsg as any).reasoning_content = null;
  }
  return assistantMsg;
}

/**
 * 准备 OpenAI 格式的消息列表；适配 tool / assistant+tool_calls / 普通角色，并清理空内容
 */
function prepareOpenAIMessages(
  request: TextGenerationRequest,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (!request.messages || request.messages.length === 0) {
    return [{ role: 'user', content: request.prompt || '' }];
  }

  const mapped = request.messages.map((msg) => {
    if (msg.role === 'tool') {
      return toOpenAIToolMessage(msg);
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      return toOpenAIAssistantWithToolCalls({
        content: msg.content,
        tool_calls: msg.tool_calls,
        reasoning_content: msg.reasoning_content,
      });
    }
    return {
      role: msg.role,
      content: msg.content || '',
      name: msg.name,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  });

  // [兼容] 清理空消息：部分 OpenAI 兼容服务会拒绝空 content（尤其是 assistant/user/system）
  // - 保留 tool 消息（已兜底 content）
  // - 保留包含 tool_calls 的 assistant 消息（已兜底 content）
  return mapped.filter((m) => {
    if (m.role === 'tool') return true;
    if (m.role === 'assistant' && (m as any).tool_calls) return true;
    const content = (m as any).content;
    return typeof content === 'string' ? content.trim().length > 0 : Boolean(content);
  });
}

/**
 * 构造 OpenAI 流式请求参数（含 tools / signal / temperature / max_tokens）
 */
function buildOpenAIRequestParams(
  config: AIServiceConfig,
  request: TextGenerationRequest,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: config.model,
    messages,
    stream: true,
  };

  if (request.tools && request.tools.length > 0) {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = request.tools.map((tool) => ({
      type: 'function',
      function: tool.function,
    }));
    requestParams.tools = tools;
    // [重要] 一些 OpenAI 兼容服务在未显式指定 tool_choice 时不会触发工具调用（尤其是"thinking/推理"模式）
    // 统一设置为 auto，让模型可以自由决定是否调用工具
    (requestParams as any).tool_choice = 'auto';
  }

  if (config.signal) {
    // @ts-expect-error OpenAI 类型定义可能不完全匹配 AbortSignal，但实际支持
    requestParams.signal = config.signal;
  }

  const temperature = request.temperature ?? config.temperature;
  if (temperature !== undefined) {
    requestParams.temperature = temperature;
  }

  const maxOutputTokens = request.maxOutputTokens ?? config.maxOutputTokens;
  // 只有当 maxOutputTokens 明确设置且大于 0 时才设置 max_tokens
  // 如果 maxOutputTokens 是 0 或未定义，不设置 max_tokens，让 API 使用默认值（无限制）
  if (maxOutputTokens !== undefined && maxOutputTokens > 0) {
    // API 限制 max_tokens 有效范围为 [1, 65536]，超过此范围会被拒绝；确保至少为 1
    requestParams.max_tokens = Math.max(1, Math.min(maxOutputTokens, OPENAI_MAX_TOKENS_LIMIT));
  }

  return requestParams;
}

interface LegacyFunctionCall {
  id: string;
  name: string;
  arguments: string;
}

interface StreamConsumeResult {
  fullText: string;
  reasoningContent: string;
  modelId: string;
  toolCallsMap: Map<number, { id: string; name: string; arguments: string }>;
  legacyFunctionCall: LegacyFunctionCall;
}

interface ThinkTagState {
  isThinking: boolean;
}

/**
 * 用状态机在流式 content 中过滤 <think>…</think> 包裹的思考内容
 * 返回正文 / 思考内容的增量
 */
function extractThinkTagContent(
  rawContent: string,
  state: ThinkTagState,
): { chunkText: string; reasoningDelta: string } {
  let chunkText = '';
  let reasoningDelta = '';
  let processingContent = rawContent;

  while (processingContent.length > 0) {
    if (state.isThinking) {
      const endTagIndex = processingContent.indexOf('</think>');
      if (endTagIndex !== -1) {
        reasoningDelta += processingContent.substring(0, endTagIndex);
        state.isThinking = false;
        processingContent = processingContent.substring(endTagIndex + 8); // 8 is length of </think>
      } else {
        reasoningDelta += processingContent;
        processingContent = '';
      }
    } else {
      const startTagIndex = processingContent.indexOf('<think>');
      if (startTagIndex !== -1) {
        chunkText += processingContent.substring(0, startTagIndex);
        state.isThinking = true;
        processingContent = processingContent.substring(startTagIndex + 7); // 7 is length of <think>
      } else {
        chunkText += processingContent;
        processingContent = '';
      }
    }
  }

  return { chunkText, reasoningDelta };
}

/**
 * 从 delta 中提取思考内容（支持 DeepSeek 的 reasoning_content / Kimi 的 reasoning / reasoning_details）
 */
function extractDeltaReasoning(delta: any): string {
  const direct = delta.reasoning_content || '';
  if (direct) return direct;
  const reasoningDetails = delta.reasoning_details as { text?: string }[] | undefined;
  if (reasoningDetails?.length) {
    return reasoningDetails.map((d) => d.text || '').join('');
  }
  if (delta.reasoning) return delta.reasoning;
  return '';
}

/**
 * 将 delta.tool_calls 增量累积到 toolCallsMap
 */
function accumulateDeltaToolCalls(
  deltaToolCalls: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[],
  toolCallsMap: Map<number, { id: string; name: string; arguments: string }>,
): void {
  for (const toolCall of deltaToolCalls) {
    const index = toolCall.index;
    if (!toolCallsMap.has(index)) {
      toolCallsMap.set(index, { id: '', name: '', arguments: '' });
    }
    const current = toolCallsMap.get(index)!;
    if (toolCall.id) current.id = toolCall.id;
    if (toolCall.function?.name) current.name = toolCall.function.name;
    if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
  }
}

interface StreamAccumulators {
  fullText: string;
  reasoningContent: string;
  modelId: string;
  thinkTagState: ThinkTagState;
  toolCallsMap: Map<number, { id: string; name: string; arguments: string }>;
  legacyFunctionCall: LegacyFunctionCall;
}

/**
 * 将 delta.function_call 增量累积到 legacyFunctionCall
 */
function accumulateLegacyFunctionCall(
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
  legacyFunctionCall: LegacyFunctionCall,
): void {
  const deltaFunctionCall = (delta as any).function_call as
    | { name?: string; arguments?: string }
    | undefined;
  if (!deltaFunctionCall) return;
  if (deltaFunctionCall.name) legacyFunctionCall.name = deltaFunctionCall.name;
  if (deltaFunctionCall.arguments) legacyFunctionCall.arguments += deltaFunctionCall.arguments;
}

/**
 * 从 delta 提取正文增量与思考内容增量（含 <think> 标签过滤）
 */
function extractChunkTextAndReasoning(
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
  acc: StreamAccumulators,
): { chunkText: string; chunkReasoningContent: string } {
  const chunkReasoningContent = extractDeltaReasoning(delta);
  const rawContent = delta.content || '';
  if (!rawContent) {
    return { chunkText: '', chunkReasoningContent };
  }
  const { chunkText, reasoningDelta } = extractThinkTagContent(rawContent, acc.thinkTagState);
  return { chunkText, chunkReasoningContent: chunkReasoningContent + reasoningDelta };
}

/**
 * 在存在正文或思考内容增量时转发 onChunk 回调
 */
async function emitOpenAIChunk(
  onChunk: TextGenerationStreamCallback | undefined,
  chunkText: string,
  chunkReasoningContent: string,
  model: string | undefined,
  fallbackModelId: string,
): Promise<void> {
  if (!onChunk || (!chunkText && !chunkReasoningContent)) return;
  const chunkData: TextGenerationChunk = {
    text: chunkText,
    done: false,
    model: model || fallbackModelId,
    ...(chunkReasoningContent ? { reasoningContent: chunkReasoningContent } : {}),
  };
  await onChunk(chunkData);
}

/**
 * 处理单个流式 chunk：累积工具调用、文本、思考内容并触发 onChunk 回调
 */
async function processOpenAIStreamChunk(
  chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  acc: StreamAccumulators,
  onChunk: TextGenerationStreamCallback | undefined,
): Promise<void> {
  const delta = chunk.choices[0]?.delta;
  if (!delta) return;

  if (delta.tool_calls) accumulateDeltaToolCalls(delta.tool_calls, acc.toolCallsMap);
  // [兼容] 旧式 function_call（非 tool_calls）
  accumulateLegacyFunctionCall(delta, acc.legacyFunctionCall);

  const { chunkText, chunkReasoningContent } = extractChunkTextAndReasoning(delta, acc);

  if (chunkText) acc.fullText += chunkText;
  if (chunkReasoningContent) acc.reasoningContent += chunkReasoningContent;

  await emitOpenAIChunk(onChunk, chunkText, chunkReasoningContent, chunk.model, acc.modelId);

  if (chunk.model) acc.modelId = chunk.model;
}

/**
 * 消费流式响应，处理工具调用、思考内容、<think> 标签及 onChunk 回调
 */
async function consumeOpenAIStream(
  stream: unknown,
  config: AIServiceConfig,
  onChunk: TextGenerationStreamCallback | undefined,
): Promise<StreamConsumeResult> {
  const acc: StreamAccumulators = {
    fullText: '',
    reasoningContent: '',
    modelId: config.model,
    thinkTagState: { isThinking: false },
    toolCallsMap: new Map(),
    // 用于兼容旧式 function_call（部分 OpenAI 兼容实现仍会返回 function_call 而非 tool_calls）
    legacyFunctionCall: { id: 'legacy_function_call', name: '', arguments: '' },
  };

  if (!(Symbol.asyncIterator in (stream as object))) {
    console.error('OpenAI: 流式响应格式错误，stream 不是异步迭代器');
    throw new Error('流式响应格式错误');
  }

  for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
    if (config.signal?.aborted) throw new Error('请求已取消');
    await processOpenAIStreamChunk(chunk, acc, onChunk);
  }

  return {
    fullText: acc.fullText,
    reasoningContent: acc.reasoningContent,
    modelId: acc.modelId,
    toolCallsMap: acc.toolCallsMap,
    legacyFunctionCall: acc.legacyFunctionCall,
  };
}

/**
 * 从累积的 toolCallsMap / 兼容旧式 function_call 中构造最终的 toolCalls 列表
 */
function finalizeOpenAIToolCalls(
  toolCallsMap: Map<number, { id: string; name: string; arguments: string }>,
  legacyFunctionCall: LegacyFunctionCall,
): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> {
  const finalToolCalls = Array.from(toolCallsMap.values())
    .filter((tc) => tc.name && tc.name.trim().length > 0)
    .map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));

  // 如果没有 tool_calls，但收到了旧式 function_call，则也视为一个工具调用
  if (finalToolCalls.length === 0 && legacyFunctionCall.name.trim()) {
    finalToolCalls.push({
      id: legacyFunctionCall.id,
      type: 'function' as const,
      function: {
        name: legacyFunctionCall.name,
        arguments: legacyFunctionCall.arguments,
      },
    });
  }

  // 某些兼容服务可能不返回 id，这里补一个稳定 id（用于 tool_call_id 对齐）
  return finalToolCalls.map((tc, idx) => ({
    id: tc.id && tc.id.trim() ? tc.id : `tool_call_${idx}`,
    type: tc.type,
    function: tc.function,
  }));
}
