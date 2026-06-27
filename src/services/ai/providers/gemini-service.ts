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
        buildGenerativeModelParams(modelName, systemInstruction, tools, generationConfig),
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

      // 转换工具调用格式（Gemini 不返回 ID，生成一个）
      const finalToolCalls = buildGeminiFinalToolCalls(streamResult.toolCalls);

      const text = streamResult.fullText.trim();
      // 允许空文本，如果有工具调用
      if (!text && finalToolCalls.length === 0) {
        throw new AIEmptyResponseError();
      }

      await emitGeminiFinalChunk(onChunk, config.model, streamResult, finalToolCalls);

      return buildGeminiTextResult(text, streamResult, finalToolCalls, config.model);
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
      if (!isGeminiApiKeyValid(config.apiKey)) {
        throw new Error('API Key 不能为空');
      }

      // 使用 Google Generative AI API 的 REST 端点
      // 文档：https://ai.google.dev/api/rest
      const apiUrl = buildGeminiModelsApiUrl(config);
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
      // 解析响应数据（响应格式：{ models: [{ name: "models/gemini-pro", ... }] }）
      return parseGeminiModelsResponse(data);
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
function buildGeminiToolMessage(msg: { content?: string | null; name?: string }): any {
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
 * 构造 getGenerativeModel 的首参（按需附加 systemInstruction / tools / generationConfig）
 */
function buildGenerativeModelParams(
  modelName: string,
  systemInstruction: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[] | undefined,
  generationConfig: GeminiGenerationConfig,
): {
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemInstruction?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any;
  generationConfig?: GeminiGenerationConfig;
} {
  return {
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(tools ? { tools } : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}

/**
 * 校验 Gemini API Key 是否有效（非空字符串）
 */
function isGeminiApiKeyValid(apiKey: unknown): boolean {
  return typeof apiKey === 'string' && apiKey.trim() !== '';
}

/**
 * 构造获取模型列表的 REST URL
 */
function buildGeminiModelsApiUrl(
  config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
): string {
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
  return `${baseUrl}/v1beta/models?key=${encodeURIComponent(config.apiKey)}`;
}

/**
 * 过滤出支持 generateContent 的生成模型（排除 embedding 等模型）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterGeminiGenerationModels(models: any[]): any[] {
  return models.filter((model) => {
    return (
      model.supportedGenerationMethods &&
      model.supportedGenerationMethods.includes('generateContent')
    );
  });
}

/**
 * 将 Gemini 模型对象转换为 ModelInfo 格式（移除 "models/" 前缀）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGeminiModels(models: any[]): ModelInfo[] {
  return models.map((model: { name: string; displayName?: string }) => {
    const modelId = model.name.replace(/^models\//, '');
    return {
      id: modelId,
      name: modelId,
      displayName: model.displayName || modelId,
      ownedBy: 'Google',
    };
  });
}

/**
 * 解析模型列表响应：非法结构时返回空数组
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGeminiModelsResponse(data: any): ModelInfo[] {
  if (!data.models || !Array.isArray(data.models)) {
    return [];
  }
  return mapGeminiModels(filterGeminiGenerationModels(data.models));
}

/**
 * 从单个 chunk 中安全读取候选 parts 列表
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGeminiChunkParts(chunk: any): any[] {
  return chunk.candidates?.[0]?.content?.parts || chunk.parts || [];
}

/**
 * 遍历 parts 累积正文 / 思考内容
 */
function collectGeminiPartsText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts: any[],
  isThinkingEnabled: boolean,
): { chunkText: string; chunkReasoningContent: string } {
  let chunkText = '';
  let chunkReasoningContent = '';
  for (const part of parts) {
    if (!part.text) continue;
    // 仅当明确启用思考模式时，才把带 thought 标记的片段视为思考内容
    if (isThinkingEnabled && part.thought === true) {
      chunkReasoningContent += part.text;
    } else {
      chunkText += part.text;
    }
  }
  return { chunkText, chunkReasoningContent };
}

/**
 * 安全读取 chunk.text()，出错时返回空字符串
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readGeminiFallbackText(chunk: any): string {
  try {
    return chunk.text?.() || '';
  } catch {
    return '';
  }
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
    const parts = getGeminiChunkParts(chunk);
    if (parts && parts.length > 0) {
      ({ chunkText, chunkReasoningContent } = collectGeminiPartsText(parts, isThinkingEnabled));
    } else if (!isThinkingEnabled) {
      // 只有未启用思考模式时，才回退到 chunk.text()
      chunkText = readGeminiFallbackText(chunk);
    }
  } catch (error) {
    console.debug('chunk 解析出错:', error);
    // 出错时，仅在未启用思考模式时回退
    if (!isThinkingEnabled) {
      chunkText = readGeminiFallbackText(chunk);
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

interface GeminiStreamAccumulators {
  fullText: string;
  fullReasoningContent: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCalls: any[];
}

/**
 * 处理单个 Gemini stream chunk：累积文本 / 思考 / 工具调用并转发 onChunk
 */
async function processGeminiStreamChunk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunk: any,
  acc: GeminiStreamAccumulators,
  config: AIServiceConfig,
  isThinkingEnabled: boolean,
  onChunk: TextGenerationStreamCallback | undefined,
): Promise<void> {
  const chunkFunctionCalls = chunk.functionCalls?.();
  const { chunkText, chunkReasoningContent } = extractGeminiChunkContent(
    chunk,
    isThinkingEnabled,
  );

  if (chunkFunctionCalls) {
    acc.toolCalls.push(...chunkFunctionCalls);
  }

  if (chunkText) {
    acc.fullText += chunkText;
    if (onChunk) {
      await onChunk({ text: chunkText, done: false, model: config.model });
    }
  }

  // 思考内容应该单独传递，不包含在实际响应中
  if (chunkReasoningContent) {
    acc.fullReasoningContent += chunkReasoningContent;
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
  const acc: GeminiStreamAccumulators = {
    fullText: '',
    fullReasoningContent: '',
    toolCalls: [],
  };

  for await (const chunk of stream) {
    if (config.signal?.aborted) throw new Error('请求已取消');
    await processGeminiStreamChunk(chunk, acc, config, isThinkingEnabled, onChunk);
  }

  return {
    fullText: acc.fullText,
    fullReasoningContent: acc.fullReasoningContent,
    toolCalls: acc.toolCalls,
  };
}

/**
 * 将 Gemini 的 functionCall 列表转换为统一的 toolCalls 结构（Gemini 不返回 ID，生成一个）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildGeminiFinalToolCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCalls: any[],
): Array<{
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}> {
  return toolCalls.map((tc: any) => ({
    id: `call_${Math.random().toString(36).substr(2, 9)}`,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.args),
    },
  }));
}

/**
 * 流结束时发送 done chunk（包含最终工具调用 / 思考内容）
 */
async function emitGeminiFinalChunk(
  onChunk: TextGenerationStreamCallback | undefined,
  model: string,
  streamResult: GeminiStreamResult,
  finalToolCalls: ReturnType<typeof buildGeminiFinalToolCalls>,
): Promise<void> {
  if (!onChunk) return;
  await onChunk({
    text: '',
    done: true,
    model,
    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
    ...(streamResult.fullReasoningContent
      ? { reasoningContent: streamResult.fullReasoningContent }
      : {}),
  });
}

/**
 * 构造最终的文本生成结果（含可选工具调用 / 思考内容）
 */
function buildGeminiTextResult(
  text: string,
  streamResult: GeminiStreamResult,
  finalToolCalls: ReturnType<typeof buildGeminiFinalToolCalls>,
  model: string,
): TextGenerationResult {
  return {
    text,
    model,
    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
    ...(streamResult.fullReasoningContent
      ? { reasoningContent: streamResult.fullReasoningContent }
      : {}),
  };
}
