import OpenAI from 'openai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
  ModelInfo,
} from 'src/types/ai/ai-service';
import type { ParsedResponse } from 'src/types/ai/interfaces';
import { BaseAIService } from '../core';
import { DEFAULT_TEMPERATURE } from 'src/constants/ai';

/**
 * OpenAI AI 服务实现
 * 使用 OpenAI API
 */
export class OpenAIService extends BaseAIService {
  /**
   * 获取代理后的 baseURL（仅在开发环境且需要时）
   * 在开发环境中，如果 baseUrl 指向外部 API，使用代理以避免 CORS 问题
   */
  private getProxiedBaseUrl(baseUrl?: string): string {
    // 检查是否为开发环境（通过检查 hostname）
    // 在开发环境中，通常运行在 localhost
    const isDev =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    // 验证 baseUrl 是否有效
    if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
      // 默认使用 OpenAI API
      // 在开发环境中，始终使用代理（无论是否在 Electron 中）
      // 在生产环境中，直接使用原始 URL
      if (isDev) {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9000';
        return `${origin}/api/ai/api.openai.com/v1`;
      }
      return 'https://api.openai.com/v1';
    }

    const trimmedBaseUrl = baseUrl.trim();

    // 如果 baseUrl 已经是代理路径（相对路径），转换为完整 URL
    if (trimmedBaseUrl.startsWith('/api/ai/')) {
      if (isDev) {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9000';
        return `${origin}${trimmedBaseUrl}`;
      }
      return trimmedBaseUrl;
    }

    // 如果 baseUrl 是外部 API，在开发环境中使用代理
    // 在开发环境中，始终使用代理以确保 CORS 问题得到解决
    if (isDev) {
      try {
        // 确保 baseUrl 包含协议
        let urlToParse = trimmedBaseUrl;
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
          urlToParse = `https://${urlToParse}`;
        }

        // 验证 URL 格式（基本检查）
        if (
          !urlToParse.includes('.') &&
          !urlToParse.startsWith('http://localhost') &&
          !urlToParse.startsWith('http://127.0.0.1')
        ) {
          throw new Error('Invalid URL format: missing hostname');
        }

        // 解析 URL 获取 hostname 和 pathname
        const url = new URL(urlToParse);
        const hostname = url.hostname;

        // 验证 hostname 不为空
        if (!hostname || hostname.trim() === '') {
          throw new Error('Invalid URL: empty hostname');
        }

        // 处理 pathname：确保格式正确
        // 如果 pathname 是 '/' 或空，则不添加到路径中（让 OpenAI SDK 追加路径）
        // 否则确保 pathname 以 / 开头且不以 / 结尾
        let pathname = url.pathname || '';
        if (pathname === '/' || pathname === '') {
          pathname = ''; // 根路径，不添加到代理路径中
        } else {
          // 确保 pathname 以 / 开头
          if (!pathname.startsWith('/')) {
            pathname = `/${pathname}`;
          }
          // 移除尾部斜杠（除非是根路径）
          if (pathname !== '/' && pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
          }
        }

        // 构建完整的代理 URL（包含协议和主机名）
        // OpenAI SDK 需要完整的 URL，不能使用相对路径
        // 注意：OpenAI SDK 会自动在 baseURL 后添加 /v1，所以如果 pathname 为空，
        // 我们需要确保代理路径不包含 /v1，让 SDK 自动添加
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9000';
        // 如果 pathname 为空，只使用 hostname（OpenAI SDK 会追加 /v1/...）
        // 如果 pathname 不为空，使用 pathname（可能已经包含 /v1）
        const proxiedPath = pathname ? `/api/ai/${hostname}${pathname}` : `/api/ai/${hostname}`;
        return `${origin}${proxiedPath}`;
      } catch {
        // 如果 URL 解析失败，返回原始 baseUrl（trim 后）
        return trimmedBaseUrl;
      }
    }

    return trimmedBaseUrl;
  }

  /**
   * 创建 OpenAI 客户端
   * 确保所有通信都使用 JSON 格式
   * 注意：在浏览器环境中需要设置 dangerouslyAllowBrowser: true
   */
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): OpenAI {
    const proxiedBaseUrl = this.getProxiedBaseUrl(config.baseUrl);

    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: proxiedBaseUrl,
      dangerouslyAllowBrowser: true, // 允许在浏览器环境中使用（用户已了解风险）
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

      const requestParams: {
        model: string;
        messages: Array<{ role: 'user'; content: string }>;
        temperature?: number;
        max_tokens?: number;
        stream: boolean;
        signal?: AbortSignal;
      } = {
        model: config.model,
        messages: [{ role: 'user', content: request.prompt }],
        stream: true, // 启用流式模式
      };

      // 如果提供了 signal，添加到请求参数中
      if (config.signal) {
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
              const chunkData = {
                text: textToSend, // 传递思考内容或实际内容
                done: false,
                model: chunk.model || modelId,
              };
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

      const text = fullText.trim();
      if (!text) {
        throw new Error('AI 返回的文本为空');
      }

      // 发送完成回调
      if (onChunk) {
        await onChunk({
          text: '',
          done: true,
          model: modelId,
        });
      }

      return {
        text,
        model: modelId,
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
