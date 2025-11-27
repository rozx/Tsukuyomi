import OpenAI from 'openai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
  ModelInfo,
} from 'src/services/ai/types/ai-service';
import type { ParsedResponse } from 'src/services/ai/types/interfaces';
import { BaseAIService } from '../core';
import { DEFAULT_TEMPERATURE } from 'src/constants/ai';
import { ProxyService } from 'src/services/proxy-service';

/**
 * OpenAI AI 服务实现
 * 使用 OpenAI API
 */
export class OpenAIService extends BaseAIService {
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

    // 在浏览器模式下，直接返回原始 baseUrl
    // 实际的代理会在自定义 fetch 函数中处理
    return trimmedBaseUrl;
  }

  /**
   * 创建自定义 fetch 函数，用于在浏览器模式下代理请求
   */
  private createProxiedFetch(): typeof fetch | undefined {
    // 检测是否为 Electron 环境
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

    // 仅在浏览器模式下使用自定义 fetch
    if (!isElectron && typeof fetch !== 'undefined') {
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

        // 使用 CORS 代理包装 URL
        const proxiedUrl = ProxyService.getProxiedUrlForAI(url);

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
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): OpenAI {
    const proxiedBaseUrl = this.getProxiedBaseUrl(config.baseUrl);
    const customFetch = this.createProxiedFetch();

    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: proxiedBaseUrl,
      dangerouslyAllowBrowser: true, // 允许在浏览器环境中使用（用户已了解风险）
      ...(customFetch && { fetch: customFetch }), // 在浏览器模式下使用自定义 fetch
      defaultHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * 发送配置请求到 OpenAI API 并解析响应
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: this.CONFIG_PROMPT }],
        // 不设置 max_tokens，让 API 使用默认值（通常是无限制或模型的最大值）
        temperature: DEFAULT_TEMPERATURE,
        response_format: { type: 'json_object' }, // 要求 JSON 格式响应
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

      // 准备消息列表
      let messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [];
      if (request.messages && request.messages.length > 0) {
        messages = request.messages.map((msg) => {
          if (msg.role === 'tool') {
            return {
              role: 'tool',
              content: msg.content || '',
              tool_call_id: msg.tool_call_id!,
            } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
          }
          if (msg.role === 'assistant' && msg.tool_calls) {
            return {
              role: 'assistant',
              content: msg.content,
              tool_calls: msg.tool_calls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: tc.function,
              })),
            } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
          }
          return {
            role: msg.role,
            content: msg.content || '',
            name: msg.name,
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        });
      } else {
        messages = [{ role: 'user', content: request.prompt || '' }];
      }

      // 准备工具列表
      let tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined;
      if (request.tools && request.tools.length > 0) {
        tools = request.tools.map((tool) => ({
          type: 'function',
          function: tool.function,
        }));
      }

      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: config.model,
        messages,
        stream: true, // 启用流式模式
      };

      // 如果提供了工具，添加到请求参数中
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
      }

      // 如果提供了 signal，添加到请求参数中
      if (config.signal) {
        // @ts-expect-error OpenAI 类型定义可能不完全匹配 AbortSignal，但实际支持
        requestParams.signal = config.signal;
      }

      const temperature = request.temperature ?? config.temperature;
      if (temperature !== undefined) {
        requestParams.temperature = temperature;
      }

      const maxTokens = request.maxTokens ?? config.maxTokens;
      // 只有当 maxTokens 明确设置且大于 0 时才设置 max_tokens
      // 如果 maxTokens 是 0 或未定义，不设置 max_tokens，让 API 使用默认值（无限制）
      if (maxTokens !== undefined && maxTokens > 0) {
        requestParams.max_tokens = maxTokens;
      }

      // 使用流式 API
      const stream = await client.chat.completions.create(requestParams);
      let fullText = '';
      let modelId = config.model;
      
      // 用于收集工具调用的片段
      const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

      // 处理流式响应
      // 当 stream: true 时，返回的是 Stream<ChatCompletionChunk>
      // 需要将其转换为异步迭代器
      if (Symbol.asyncIterator in stream) {
        for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
          // 检查是否已取消
          if (config.signal?.aborted) {
            throw new Error('请求已取消');
          }

          const delta = chunk.choices[0]?.delta;
          if (!delta) {
            continue;
          }
          
          // 处理工具调用
          if (delta.tool_calls) {
            for (const toolCall of delta.tool_calls) {
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

          // 获取思考内容（reasoning_content）- 用于显示思考过程
          const reasoningContent = (delta as any).reasoning_content || '';
          
          // 获取实际内容（content）- 用于最终输出
          const content = delta.content || '';
          
          // 优先使用 reasoning_content 作为思考消息，如果没有则使用 content
          const textToSend = reasoningContent || content;
          
          // 如果有内容（思考内容或实际内容），累积到 fullText 并调用回调
          if (textToSend) {
            // 只有实际内容（非思考内容）才累积到 fullText
            if (content) {
              fullText += content;
            }

            // 如果提供了回调函数，调用它
            // 传递思考内容或实际内容，让上层决定如何处理
            if (onChunk) {
              const chunkData: any = {
                text: textToSend, // 传递思考内容或实际内容
                done: false,
                model: chunk.model || modelId,
              };
              
              // 如果正在收集工具调用，也可以通知回调（虽然通常工具调用只在最后处理）
              // 这里暂不传递部分工具调用，以免复杂化
              
              await onChunk(chunkData);
            }
          }

          // 更新模型 ID（可能在第一个块中）
          if (chunk.model) {
            modelId = chunk.model;
          }
        }
      } else {
        // 如果不是流式响应（不应该发生，因为 stream: true），回退到非流式处理
        console.error('OpenAI: 流式响应格式错误，stream 不是异步迭代器');
        throw new Error('流式响应格式错误');
      }

      // 构建工具调用结果
      const finalToolCalls = Array.from(toolCallsMap.values()).map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments
        }
      }));

      const text = fullText.trim();
      // 如果没有文本也没有工具调用，且不是空响应（虽然通常不应该发生），则报错
      if (!text && finalToolCalls.length === 0) {
        throw new Error('AI 返回的文本为空');
      }

      // 发送完成回调
      if (onChunk) {
        await onChunk({
          text: '',
          done: true,
          model: modelId,
          ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {})
        });
      }

      return {
        text,
        model: modelId,
        ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {})
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
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
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
