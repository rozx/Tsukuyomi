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

      const generationConfig: {
        temperature?: number;
        maxOutputTokens?: number;
        thinkingConfig?: {
          includeThoughts?: boolean;
        };
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

      // 为 Gemini 3 Pro 等支持思考的模型启用思考内容
      // 检查模型名称是否包含 "gemini-3" 或 "gemini-2"
      const modelNameLower = modelName.toLowerCase();
      if (modelNameLower.includes('gemini-3') || modelNameLower.includes('gemini-2')) {
        generationConfig.thinkingConfig = {
          includeThoughts: true,
        };
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
                msg.tool_calls.forEach((tc, idx) => {
                  // 传递 Gemini 返回的签名；若缺失，在当前回合需要首个函数调用提供占位签名
                  // OpenAI 兼容格式中，签名位于 tc.extra_content.google.thought_signature
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sigFromModel = (tc as any)?.extra_content?.google?.thought_signature as
                    | string
                    | undefined;

                  // 安全解析工具参数，处理可能的 JSON 解析错误
                  let args: unknown;
                  try {
                    args = JSON.parse(tc.function.arguments);
                  } catch (parseError) {
                    console.warn(
                      `[GeminiService] ⚠️ 工具参数 JSON 解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                      {
                        toolName: tc.function.name,
                        argumentsPreview: tc.function.arguments?.slice(0, 100),
                      },
                    );
                    // 如果解析失败，使用空对象作为后备
                    args = {};
                  }

                  const basePart = {
                    functionCall: {
                      name: tc.function.name,
                      args,
                    },
                  } as Record<string, unknown>;
                  // 将签名置于 part 层级（与 functionCall 同级），符合文档示例
                  if (sigFromModel) {
                    (basePart as { [key: string]: unknown }).thought_signature = sigFromModel;
                  } else if (idx === 0) {
                    // 首个并行/顺序函数调用缺签名时，使用 FAQ 的占位值
                    (basePart as { [key: string]: unknown }).thought_signature =
                      'skip_thought_signature_validator';
                  }
                  parts.push(basePart);
                });
              }
              return { role: 'model', parts };
            }
            if (msg.role === 'tool') {
              // Gemini 期望 functionResponse
              // 安全解析工具返回内容，处理可能的 JSON 解析错误
              let response: unknown;
              try {
                // 尝试解析为 JSON
                response = JSON.parse(msg.content || '{}');
              } catch (parseError) {
                // 如果解析失败，将内容作为字符串包装在对象中
                console.warn(
                  `[GeminiService] ⚠️ 工具返回内容 JSON 解析失败，使用字符串格式: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                  { toolName: msg.name, contentPreview: msg.content?.slice(0, 100) },
                );
                // 将非 JSON 内容包装为对象，确保 Gemini 可以处理
                response = {
                  content: msg.content || '',
                  _parseError: true,
                  _originalError:
                    parseError instanceof Error ? parseError.message : String(parseError),
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
      let fullReasoningContent = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls: any[] = [];

      // 处理流式响应
      for await (const chunk of result.stream) {
        // 检查是否已取消
        if (config.signal?.aborted) {
          throw new Error('请求已取消');
        }

        const chunkFunctionCalls = chunk.functionCalls();

        // 优先从 parts 提取，因为 .text() 可能合并了思考过程
        const isThinkingEnabled = !!generationConfig.thinkingConfig?.includeThoughts;
        let chunkText = '';
        let chunkReasoningContent = '';

        try {
          // 尝试从 chunk 的 parts 中提取内容
          // Gemini SDK 的 chunk 对象可能包含 parts 属性，但类型定义可能不完整
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chunkAny = chunk as any;
          // 尝试从 candidates 中获取 parts，或者直接从 chunk 获取（如果 SDK 结构不同）
          const parts = chunkAny.candidates?.[0]?.content?.parts || chunkAny.parts || [];

          if (parts && parts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const part of parts as any[]) {
              if (part.text) {
                // 检查是否有 thought 属性（Gemini 2/3 Flash Thinking 的思考内容）
                // 只有当明确启用了思考模式时，才检查 thought 属性
                if (isThinkingEnabled && part.thought === true) {
                  chunkReasoningContent += part.text;
                } else {
                  // 如果未启用思考模式，或者 part.thought 不为 true，则视为普通文本
                  chunkText += part.text;
                }
              }
            }
          } else if (!isThinkingEnabled) {
            // 只有在未启用思考模式时，才回退到使用 chunk.text()
            // 因为如果启用了思考模式，chunk.text() 会包含混杂的思考内容，导致泄露
            // 如果 parts 为空且启用了思考模式，可能是纯工具调用 chunk，或者是解析问题
            // 但为了安全起见，我们不使用 chunk.text()
            const fallbackText = chunk.text();
            if (fallbackText) {
              chunkText = fallbackText;
            }
          }
        } catch (error) {
          console.debug('chunk 解析出错:', error);
          // 出错时，仅在未启用思考模式时回退
          if (!isThinkingEnabled) {
            try {
              const fallbackText = chunk.text();
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

        if (chunkFunctionCalls) {
          toolCalls.push(...chunkFunctionCalls);
        }

        // 处理实际响应文本（非思考内容）
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

        // 处理思考内容
        // 思考内容应该单独传递，不包含在实际响应中
        if (chunkReasoningContent) {
          fullReasoningContent += chunkReasoningContent;

          // 如果提供了回调函数，通过 reasoningContent 传递思考内容
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
          ...(fullReasoningContent ? { reasoningContent: fullReasoningContent } : {}),
        });
      }

      return {
        text,
        model: config.model,
        ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
        ...(fullReasoningContent ? { reasoningContent: fullReasoningContent } : {}),
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

      // 在浏览器模式下，使用 CORS 代理
      const proxiedUrl = ProxyService.getProxiedUrlForAI(apiUrl);

      const response = await fetch(proxiedUrl, {
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
