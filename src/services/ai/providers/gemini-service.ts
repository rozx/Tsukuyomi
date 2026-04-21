import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
  ModelInfo,
} from 'src/services/ai/types/ai-service';
import type { ParsedResponse } from 'src/services/ai/types/interfaces';
import { BaseAIService, AIEmptyResponseError } from '../core';
import { DEFAULT_TEMPERATURE } from 'src/constants/ai';
import { ProxyService } from 'src/services/proxy-service';

/**
 * Gemini AI 服务实现
 * 使用 Google Generative AI API
 */
export class GeminiService extends BaseAIService {
  /**
   * 创建 Gemini 客户端
   * 注意：GoogleGenerativeAI 构造函数只接受 apiKey
   * 如果需要自定义 baseUrl，需要通过环境变量或其他方式配置
   */
  private createClient(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders'>,
  ): GoogleGenerativeAI {
    return new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * 提取 requestOptions
   */
  private getRequestOptions(
    config: Pick<AIServiceConfig, 'customHeaders'>,
  ): Record<string, unknown> {
    const requestOptions: Record<string, unknown> = {};
    if (config.customHeaders && Object.keys(config.customHeaders).length > 0) {
      requestOptions.customHeaders = config.customHeaders;
    }
    return requestOptions;
  }

  /**
   * 规范化模型名称（移除 models/ 前缀）
   */
  private normalizeModelName(model: string): string {
    return model.includes('/') ? model.replace('models/', '') : model;
  }

  /**
   * 发送配置请求到 Gemini API 并解析响应
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const modelName = this.normalizeModelName(config.model);
      const model = client.getGenerativeModel(
        {
          model: modelName,
          generationConfig: {
            temperature: config.temperature ?? DEFAULT_TEMPERATURE,
            // 不设置 maxOutputTokens，让 API 使用默认值（无限制）
            responseMimeType: 'application/json',
          },
        },
        this.getRequestOptions(config),
      );

      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: this.getConfigPrompt() }],
            },
          ],
        },
        {
          signal: config.signal ?? AbortSignal.timeout(100000),
        },
      );

      const response = result.response;
      const text = response.text();

      return {
        content: text || null,
        modelId: config.model,
      };
    } catch (error) {
      // 将官方 SDK 的错误转换为标准错误格式
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini API 请求失败');
    }
  }

  /**
   * 发送文本生成请求到 Gemini API（流式模式）
   */
  protected async makeTextGenerationRequest(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ): Promise<TextGenerationResult> {
    try {
      const client = this.createClient(config);
      const modelName = this.normalizeModelName(config.model);

      const generationConfig = buildGeminiGenerationConfig(config, request, modelName);
      const { systemInstruction, contents } = buildGeminiContents(request);
      const tools = buildGeminiTools(request);

      const model = client.getGenerativeModel(
        {
          model: modelName,
          ...(systemInstruction && { systemInstruction }),
          ...(tools && { tools }),
          ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
        },
        this.getRequestOptions(config),
      );

      // 使用流式 API
      const result = await model.generateContentStream(
        { contents },
        { signal: config.signal ?? AbortSignal.timeout(100000) },
      );

      const isThinkingEnabled = !!generationConfig.thinkingConfig?.includeThoughts;
      const streamResult = await consumeGeminiStream(
        result.stream,
        config,
        isThinkingEnabled,
        onChunk,
      );

      const text = streamResult.fullText.trim();
      // 允许空文本，如果有工具调用
      if (!text && streamResult.toolCalls.length === 0) {
        throw new AIEmptyResponseError();
      }

      // 转换工具调用格式
      const finalToolCalls = streamResult.toolCalls.map((tc: any) => ({
        id: `call_${Math.random().toString(36).substr(2, 9)}`, // Gemini 不返回 ID，生成一个
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      }));

      if (onChunk) {
        await onChunk({
          text: '',
          done: true,
          model: config.model,
          ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
          ...(streamResult.fullReasoningContent
            ? { reasoningContent: streamResult.fullReasoningContent }
            : {}),
        });
      }

      return {
        text,
        model: config.model,
        ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
        ...(streamResult.fullReasoningContent
          ? { reasoningContent: streamResult.fullReasoningContent }
          : {}),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini 文本生成请求失败');
    }
  }

  /**
   * 获取可用的模型列表
   * 使用 Google Generative AI API 的 REST 端点获取模型列表
   */
  protected async makeAvailableModelsRequest(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
  ): Promise<ModelInfo[]> {
    try {
      if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        throw new Error('API Key 不能为空');
      }

      // 使用 Google Generative AI API 的 REST 端点
      // 文档：https://ai.google.dev/api/rest
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
      const apiUrl = `${baseUrl}/v1beta/models?key=${encodeURIComponent(config.apiKey)}`;

      // 在浏览器模式下，使用 CORS 代理
      const proxiedUrl = ProxyService.getProxiedUrlForAI(apiUrl, config.useCorsProxy);

      const response = await fetch(proxiedUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(config.customHeaders || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `获取模型列表失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
      }

      const data = await response.json();

      // 解析响应数据
      // 响应格式：{ models: [{ name: "models/gemini-pro", displayName: "Gemini Pro", ... }, ...] }
      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      // 过滤出可用的生成模型（排除 embedding 等模型）
      const generationModels = data.models.filter(
        (model: { supportedGenerationMethods?: string[] }) => {
          return (
            model.supportedGenerationMethods &&
            model.supportedGenerationMethods.includes('generateContent')
          );
        },
      );

      // 转换为 ModelInfo 格式
      return generationModels.map(
        (model: { name: string; displayName?: string; description?: string }) => {
          // 移除 "models/" 前缀
          const modelId = model.name.replace(/^models\//, '');
          return {
            id: modelId,
            name: modelId,
            displayName: model.displayName || modelId,
            ownedBy: 'Google',
          };
        },
      );
    } catch (error) {
      // 如果 API 调用失败，返回空列表而不是抛出错误
      // 这样用户仍然可以手动输入模型名称
      console.warn('获取 Gemini 模型列表失败:', error);
      return [];
    }
  }

}

// ============ 模块级辅助函数：请求参数 / 消息转换 / 流处理 ============

interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: {
    includeThoughts?: boolean;
  };
}

/**
 * 构造 Gemini 的 generationConfig（含 temperature / maxOutputTokens / thinkingConfig）
 */
function buildGeminiGenerationConfig(
  config: AIServiceConfig,
  request: TextGenerationRequest,
  modelName: string,
): GeminiGenerationConfig {
  const generationConfig: GeminiGenerationConfig = {};

  const temperature = request.temperature ?? config.temperature;
  if (temperature !== undefined) {
    generationConfig.temperature = temperature;
  }

  const maxOutputTokens = request.maxOutputTokens ?? config.maxOutputTokens;
  // 只有当 maxOutputTokens 明确设置且大于 0 时才设置 maxOutputTokens
  if (maxOutputTokens !== undefined && maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = maxOutputTokens;
  }

  // 为 Gemini 3 Pro 等支持思考的模型启用思考内容
  const modelNameLower = modelName.toLowerCase();
  if (modelNameLower.includes('gemini-3') || modelNameLower.includes('gemini-2')) {
    generationConfig.thinkingConfig = { includeThoughts: true };
  }

  return generationConfig;
}

/**
 * 将 JSON 解析错误安全地转换为可打印字符串（避免 no-base-to-string lint 告警）
 */
function formatJSONParseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown parse error';
  }
}

/**
 * 安全地将 JSON 字符串转为对象；失败时调用 onError 并返回兜底值
 */
function safeJSONParse(input: string | undefined | null, onError: (err: unknown) => void): unknown {
  try {
    return JSON.parse(input || '{}');
  } catch (err) {
    onError(err);
    return undefined;
  }
}

/**
 * 将 assistant 的 tool_calls 转换为 Gemini functionCall parts 数组
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToolCallsToGeminiParts(
  toolCalls: Array<{ function: { name: string; arguments: string } } & Record<string, unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  toolCalls.forEach((tc, idx) => {
    // 传递 Gemini 返回的签名；若缺失，在当前回合需要首个函数调用提供占位签名
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigFromModel = (tc as any)?.extra_content?.google?.thought_signature as
      | string
      | undefined;

    const args = safeJSONParse(tc.function.arguments, (parseError) => {
      const errMsg = formatJSONParseError(parseError);
      console.warn(`[GeminiService] ⚠️ 工具参数 JSON 解析失败: ${errMsg}`, {
        toolName: tc.function.name,
        argumentsPreview: tc.function.arguments?.slice(0, 100),
      });
    });
    // 如果解析失败，使用空对象作为后备
    const safeArgs = args === undefined ? {} : args;

    const basePart = {
      functionCall: {
        name: tc.function.name,
        args: safeArgs,
      },
    } as Record<string, unknown>;
    // 将签名置于 part 层级（与 functionCall 同级），符合文档示例
    if (sigFromModel) {
      basePart.thought_signature = sigFromModel;
    } else if (idx === 0) {
      // 首个并行/顺序函数调用缺签名时，使用 FAQ 的占位值
      basePart.thought_signature = 'skip_thought_signature_validator';
    }
    parts.push(basePart);
  });
  return parts;
}

/**
 * 将 tool 消息转换为 Gemini 的 functionResponse 消息
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildGeminiToolMessage(msg: { content?: string; name?: string }): any {
  const content = msg.content;
  let capturedError: unknown;
  let response: unknown = safeJSONParse(content, (parseError) => {
    capturedError = parseError;
    const errMsg = formatJSONParseError(parseError);
    console.warn(`[GeminiService] ⚠️ 工具返回内容 JSON 解析失败，使用字符串格式: ${errMsg}`, {
      toolName: msg.name,
      contentPreview: content?.slice(0, 100),
    });
  });
  if (response === undefined) {
    // 将非 JSON 内容包装为对象，确保 Gemini 可以处理
    response = {
      content: content || '',
      _parseError: true,
      _originalError: formatJSONParseError(capturedError),
    };
  }
  return {
    role: 'function',
    parts: [
      {
        functionResponse: {
          name: msg.name, // 必须匹配函数调用名称
          response,
        },
      },
    ],
  };
}

/**
 * 准备 Gemini 的 contents 列表与 systemInstruction
 */
function buildGeminiContents(request: TextGenerationRequest): {
  systemInstruction: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: any[];
} {
  if (!request.messages || request.messages.length === 0) {
    return {
      systemInstruction: undefined,
      contents: [{ role: 'user', parts: [{ text: request.prompt || '' }] }],
    };
  }

  const systemMsg = request.messages.find((m) => m.role === 'system');
  const systemInstruction = systemMsg?.content || undefined;

  const contents = request.messages
    .filter((m) => m.role !== 'system')
    .map((msg) => {
      if (msg.role === 'user') {
        return { role: 'user', parts: [{ text: msg.content || '' }] };
      }
      if (msg.role === 'assistant') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.tool_calls) {
          parts.push(...mapToolCallsToGeminiParts(msg.tool_calls as never[]));
        }
        return { role: 'model', parts };
      }
      if (msg.role === 'tool') {
        return buildGeminiToolMessage(msg);
      }
      return null;
    })
    .filter(Boolean);

  return { systemInstruction, contents };
}

/**
 * 构造 Gemini 的 tools 声明
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildGeminiTools(request: TextGenerationRequest): any[] | undefined {
  if (!request.tools || request.tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

/**
 * 从单个 chunk 中提取文本 / 思考内容。优先解析 candidates[0].content.parts
 */
function extractGeminiChunkContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunk: any,
  isThinkingEnabled: boolean,
): { chunkText: string; chunkReasoningContent: string } {
  let chunkText = '';
  let chunkReasoningContent = '';
  try {
    // Gemini SDK 的 chunk 对象可能包含 parts 属性，但类型定义可能不完整
    const parts = chunk.candidates?.[0]?.content?.parts || chunk.parts || [];

    if (parts && parts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const part of parts as any[]) {
        if (!part.text) continue;
        // 检查是否有 thought 属性（Gemini 2/3 Flash Thinking 的思考内容）
        // 只有当明确启用了思考模式时，才检查 thought 属性
        if (isThinkingEnabled && part.thought === true) {
          chunkReasoningContent += part.text;
        } else {
          // 如果未启用思考模式，或者 part.thought 不为 true，则视为普通文本
          chunkText += part.text;
        }
      }
    } else if (!isThinkingEnabled) {
      // 只有在未启用思考模式时，才回退到使用 chunk.text()
      // 因为如果启用了思考模式，chunk.text() 会包含混杂的思考内容，导致泄露
      const fallbackText = chunk.text?.();
      if (fallbackText) {
        chunkText = fallbackText;
      }
    }
  } catch (error) {
    console.debug('chunk 解析出错:', error);
    // 出错时，仅在未启用思考模式时回退
    if (!isThinkingEnabled) {
      try {
        const fallbackText = chunk.text?.();
        if (fallbackText) {
          chunkText = fallbackText;
        }
      } catch {
        // ignore
      }
    } else {
      console.warn('[GeminiService] 启用思考模式时解析出错，跳过 fallback 以防泄露', error);
    }
  }
  return { chunkText, chunkReasoningContent };
}

interface GeminiStreamResult {
  fullText: string;
  fullReasoningContent: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCalls: any[];
}

/**
 * 消费 Gemini 流式响应，处理文本 / 思考内容 / 工具调用并转发到 onChunk 回调
 */
async function consumeGeminiStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: AsyncIterable<any>,
  config: AIServiceConfig,
  isThinkingEnabled: boolean,
  onChunk: TextGenerationStreamCallback | undefined,
): Promise<GeminiStreamResult> {
  let fullText = '';
  let fullReasoningContent = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCalls: any[] = [];

  for await (const chunk of stream) {
    if (config.signal?.aborted) throw new Error('请求已取消');

    const chunkFunctionCalls = chunk.functionCalls?.();
    const { chunkText, chunkReasoningContent } = extractGeminiChunkContent(
      chunk,
      isThinkingEnabled,
    );

    if (chunkFunctionCalls) {
      toolCalls.push(...chunkFunctionCalls);
    }

    if (chunkText) {
      fullText += chunkText;
      if (onChunk) {
        await onChunk({ text: chunkText, done: false, model: config.model });
      }
    }

    // 思考内容应该单独传递，不包含在实际响应中
    if (chunkReasoningContent) {
      fullReasoningContent += chunkReasoningContent;
      if (onChunk) {
        await onChunk({
          text: '', // 思考内容不显示在聊天中
          done: false,
          model: config.model,
          reasoningContent: chunkReasoningContent,
        });
      }
    }
  }

  return { fullText, fullReasoningContent, toolCalls };
}
