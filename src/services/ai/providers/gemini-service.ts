import { GoogleGenerativeAI } from '@google/generative-ai';
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
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): GoogleGenerativeAI {
    return new GoogleGenerativeAI(config.apiKey);
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
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: DEFAULT_TEMPERATURE,
          // 不设置 maxOutputTokens，让 API 使用默认值（无限制）
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: this.CONFIG_PROMPT }],
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

      const generationConfig: {
        temperature?: number;
        maxOutputTokens?: number;
      } = {};

      const temperature = request.temperature ?? config.temperature;
      if (temperature !== undefined) {
        generationConfig.temperature = temperature;
      }

      const maxTokens = request.maxTokens ?? config.maxTokens;
      // 只有当 maxTokens 明确设置且大于 0 时才设置 maxOutputTokens
      // 如果 maxTokens 是 0 或未定义，不设置 maxOutputTokens，让 API 使用默认值（无限制）
      if (maxTokens !== undefined && maxTokens > 0) {
        generationConfig.maxOutputTokens = maxTokens;
      }

      // 准备系统指令和消息内容
      let systemInstruction: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let contents: any[] = [];

      if (request.messages && request.messages.length > 0) {
        // 处理系统消息
        const systemMsg = request.messages.find((m) => m.role === 'system');
        if (systemMsg) {
          systemInstruction = systemMsg.content || undefined;
        }

        // 映射其他消息
        contents = request.messages
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
                msg.tool_calls.forEach((tc) => {
                  parts.push({
                    functionCall: {
                      name: tc.function.name,
                      args: JSON.parse(tc.function.arguments),
                    },
                  });
                });
              }
              return { role: 'model', parts };
            }
            if (msg.role === 'tool') {
              // Gemini 期望 functionResponse
              return {
                role: 'function',
                parts: [
                  {
                    functionResponse: {
                      name: msg.name, // 必须匹配函数调用名称
                      response: JSON.parse(msg.content || '{}'),
                    },
                  },
                ],
              };
            }
            return null;
          })
          .filter(Boolean);
      } else {
        contents = [{ role: 'user', parts: [{ text: request.prompt || '' }] }];
      }

      // 准备工具
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tools: any[] | undefined;
      if (request.tools && request.tools.length > 0) {
        tools = [
          {
            functionDeclarations: request.tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            })),
          },
        ];
      }

      const model = client.getGenerativeModel({
        model: modelName,
        ...(systemInstruction && { systemInstruction }),
        ...(tools && { tools }),
        ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
      });

      // 使用流式 API
      const result = await model.generateContentStream(
        {
          contents,
        },
        {
          signal: config.signal ?? AbortSignal.timeout(100000),
        },
      );

      let fullText = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls: any[] = [];

      // 处理流式响应
      for await (const chunk of result.stream) {
        // 检查是否已取消
        if (config.signal?.aborted) {
          throw new Error('请求已取消');
        }

        const chunkText = chunk.text();
        const chunkFunctionCalls = chunk.functionCalls();

        if (chunkFunctionCalls) {
          toolCalls.push(...chunkFunctionCalls);
        }

        if (chunkText) {
          fullText += chunkText;

          // 如果提供了回调函数，调用它
          if (onChunk) {
            await onChunk({
              text: chunkText,
              done: false,
              model: config.model,
            });
          }
        }
      }

      const text = fullText.trim();
      // 允许空文本，如果有工具调用
      if (!text && toolCalls.length === 0) {
        throw new Error('AI 返回的文本为空');
      }

      // 转换工具调用格式
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalToolCalls = toolCalls.map((tc: any) => ({
        id: `call_${Math.random().toString(36).substr(2, 9)}`, // Gemini 不返回 ID，生成一个
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      }));

      // 发送完成回调
      if (onChunk) {
        await onChunk({
          text: '',
          done: true,
          model: config.model,
          ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
        });
      }

      return {
        text,
        model: config.model,
        ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
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
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
  ): Promise<ModelInfo[]> {
    try {
      if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        throw new Error('API Key 不能为空');
      }

      // 使用 Google Generative AI API 的 REST 端点
      // 文档：https://ai.google.dev/api/rest
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
      const apiUrl = `${baseUrl}/v1beta/models?key=${encodeURIComponent(config.apiKey)}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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
