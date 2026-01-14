import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { AIServiceFactory } from '../index';
import { ToolRegistry } from '../tools/index';
import {
  buildChapterContextSection,
  buildBookContextSection,
  getSpecialInstructions,
  buildSpecialInstructionsSection,
} from './utils/ai-task-helper';
import { createUnifiedAbortController } from './utils/ai-task-helper';
import { getToolScopeRules } from './prompts';

/**
 * 术语翻译服务选项
 */
export interface TermTranslationServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收翻译过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 任务类型，默认为 'translation'，也可以是 'termsTranslation'
   */
  taskType?: 'translation' | 'termsTranslation';
  /**
   * 书籍 ID（用于获取上下文信息）
   */
  bookId?: string;
  /**
   * 章节 ID（用于获取上下文信息）
   */
  chapterId?: string;
  /**
   * 章节标题（可选），用于在上下文中提供给 AI
   */
  chapterTitle?: string;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
}

/**
 * 术语翻译服务
 * 使用 AI 服务进行文本翻译
 */
export class TermTranslationService {
  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    text: string,
    model: AIModel,
    options?: TermTranslationServiceOptions,
  ): Promise<{ text: string; taskId?: string }> {
    const {
      prompt,
      onChunk,
      signal,
      taskType = 'translation',
      bookId,
      chapterId,
      chapterTitle,
      onAction,
      onToast,
      aiProcessingStore,
    } = options || {};

    if (!text?.trim()) {
      throw new Error('要翻译的文本不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 根据任务类型检查模型支持
    if (taskType === 'termsTranslation') {
      if (!model.isDefault.termsTranslation?.enabled) {
        throw new Error('所选模型不支持术语翻译任务');
      }
    } else {
      if (!model.isDefault.translation?.enabled) {
        throw new Error('所选模型不支持翻译任务');
      }
    }

    // 如果提供了 aiProcessingStore，自动创建和管理任务
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: taskType,
        modelName: model.name,
        status: 'thinking',
        message: '正在分析文本...',
        thinkingMessage: '',
      });

      // 获取任务的 abortController
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      abortController = task?.abortController;
    }

    const trimmedText = text.trim();

    // 根据任务类型获取温度设置
    const temperature =
      taskType === 'termsTranslation'
        ? (model.isDefault.termsTranslation?.temperature ?? 0.7)
        : (model.isDefault.translation?.temperature ?? 0.7);

    // 使用共享工具创建统一的 AbortController
    const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
      signal,
      abortController,
    );
    const finalSignal = internalController.signal;

    try {
      const service = AIServiceFactory.getService(model.provider);

      // 获取工具（如果有 bookId，提供工具以获取上下文）
      // 术语翻译服务只能使用特定的工具：get_book_info, get/list/search terms/characters/memory
      const tools: AITool[] = bookId ? ToolRegistry.getTermTranslationTools(bookId) : [];
      const allowedToolNames = new Set(tools.map((t) => t.function.name));

      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature,
        signal: finalSignal,
      };

      // 构建系统提示词
      let systemPrompt = '你是专业的日轻小说翻译助手，将日语术语翻译为自然流畅的简体中文。\n\n';

      // 如果有 bookId 和 chapterId，添加上下文信息和工具使用说明
      if (bookId) {
        // 获取特殊指令
        const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'translation');
        const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);
        const bookContextSection = await buildBookContextSection(bookId);
        const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

        systemPrompt += `${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **术语一致**: 使用术语表和角色表确保翻译一致
2. **自然流畅**: 符合轻小说风格，保持术语的准确性
3. **上下文理解**: 根据当前书籍、章节的上下文来理解术语含义
4. **完整翻译**: [警告] 必须翻译所有单词和短语，禁止在翻译结果中保留未翻译的日语原文（如日文假名、汉字等）

${getToolScopeRules(tools)}

【工具使用建议】
- 本服务**只允许**使用 keyword 搜索类工具（\`search_*_by_keywords\`），用于快速检索术语/角色/记忆的相关上下文
- [禁止] 不要调用 get/list/find/regex 等其它工具（即使你觉得有用）；如果本次未提供所需工具，请说明限制并直接给出翻译

**输出格式**：[警告] **必须只返回 JSON 格式**
示例：{"translation":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

`;
      }

      // 构建用户提示词
      const userPrompt =
        prompt ||
        `请将以下日文术语翻译为简体中文，保持原文的格式和结构。[警告] **必须只返回 JSON 格式**：
示例：{"translation":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

待翻译术语：\n\n${trimmedText}`;

      // 创建消息历史
      const history: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      // 工具调用循环（最多 10 轮，避免无限循环）
      const MAX_TOOL_CALLS = 10;
      const MAX_JSON_RETRIES = 3; // JSON 格式重试最多 3 次
      let iterationCount = 0; // 循环迭代次数（包括工具调用和 JSON 重试）
      let jsonRetryCount = 0;
      let finalText = '';

      // 快速路径：对于简单翻译（无 bookId 或短文本），直接进行翻译，不进入工具调用循环
      const SIMPLE_TRANSLATION_THRESHOLD = 50; // 50 字符以下视为短文本
      const useFastPath = !bookId || trimmedText.length <= SIMPLE_TRANSLATION_THRESHOLD;

      // 如果使用快速路径且没有工具，直接进行单次翻译
      if (useFastPath && tools.length === 0) {
        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'processing',
            message: '正在生成翻译...',
          });
        }

        const request: TextGenerationRequest = {
          messages: history,
        };

        // 创建包装的 onChunk 回调
        let firstChunkReceived = false;
        const wrappedOnChunk: TextGenerationStreamCallback = async (chunk) => {
          if (finalSignal?.aborted) {
            throw new Error('翻译已取消');
          }

          if (aiProcessingStore && taskId) {
            if (!firstChunkReceived) {
              void aiProcessingStore.updateTask(taskId, {
                status: 'processing',
                message: '正在生成翻译...',
              });
              firstChunkReceived = true;
            }

            if (chunk.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
            }

            if (chunk.text) {
              void aiProcessingStore.appendOutputContent(taskId, chunk.text);
            }
          }

          if (onChunk) {
            await onChunk(chunk);
          }
        };

        const result = await service.generateText(config, request, wrappedOnChunk);

        // 保存思考内容
        if (aiProcessingStore && taskId && result.reasoningContent) {
          void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
        }

        // 解析 JSON 响应
        const responseText = result.text || '';
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr);

            if (parsed && typeof parsed.translation === 'string') {
              finalText = parsed.translation;
            } else {
              throw new Error('AI 响应格式错误：JSON 中缺少 translation 字段。');
            }
          } else {
            throw new Error('AI 响应格式错误：未找到有效的 JSON 格式。');
          }
        } catch (parseError) {
          const errorMessage =
            parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`AI 响应格式错误：${errorMessage}。无法获取有效翻译。`);
        }

        // 更新任务状态为完成
        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'end',
            message: '翻译完成',
          });
        }

        return { text: finalText, ...(taskId ? { taskId } : {}) };
      }

      // 标准路径：使用工具调用循环
      while (iterationCount < MAX_TOOL_CALLS) {
        iterationCount++; // 每次循环迭代都递增，确保准确计数
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('翻译已取消');
        }

        const request: TextGenerationRequest = {
          messages: history,
          ...(tools.length > 0 ? { tools } : {}),
        };

        // 创建包装的 onChunk 回调
        let firstChunkReceived = false;
        const wrappedOnChunk: TextGenerationStreamCallback = async (chunk) => {
          if (finalSignal?.aborted) {
            throw new Error('翻译已取消');
          }

          if (aiProcessingStore && taskId) {
            if (!firstChunkReceived) {
              void aiProcessingStore.updateTask(taskId, {
                status: 'processing',
                message: iterationCount > 1 ? '正在使用工具获取上下文...' : '正在生成翻译...',
              });
              firstChunkReceived = true;
            }

            if (chunk.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
            }

            if (chunk.text) {
              void aiProcessingStore.appendOutputContent(taskId, chunk.text);
            }
          }

          if (onChunk) {
            await onChunk(chunk);
          }
        };

        const result = await service.generateText(config, request, wrappedOnChunk);

        // 保存思考内容
        if (aiProcessingStore && taskId && result.reasoningContent) {
          void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
        }

        // 检查是否有工具调用
        if (result.toolCalls && result.toolCalls.length > 0) {
          // 添加助手消息（包含工具调用）
          history.push({
            role: 'assistant',
            // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
            content: result.text && result.text.trim() ? result.text : '（调用工具）',
            tool_calls: result.toolCalls,
            reasoning_content: result.reasoningContent || null,
          });

          // 执行工具调用
          for (const toolCall of result.toolCalls) {
            // [警告] 严格限制：只能调用本次会话提供的 tools
            if (!allowedToolNames.has(toolCall.function.name)) {
              const toolName = toolCall.function.name;
              console.warn(
                `[TermTranslationService] ⚠️ 工具 ${toolName} 未在本次会话提供的 tools 列表中，已拒绝执行`,
              );
              history.push({
                role: 'tool',
                content: JSON.stringify({
                  success: false,
                  error: `工具 ${toolName} 未在本次会话提供的 tools 列表中，禁止调用`,
                }),
                tool_call_id: toolCall.id,
                name: toolName,
              });
              continue;
            }

            if (aiProcessingStore && taskId) {
              void aiProcessingStore.appendThinkingMessage(
                taskId,
                `\n[调用工具: ${toolCall.function.name}]\n`,
              );
            }

            const toolResult = await ToolRegistry.handleToolCall(
              toolCall,
              bookId || '',
              onAction,
              onToast,
              taskId,
            );

            if (aiProcessingStore && taskId) {
              void aiProcessingStore.appendThinkingMessage(
                taskId,
                `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
              );
            }

            // 添加工具结果到历史
            history.push({
              role: 'tool',
              content: toolResult.content,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          }

          // 继续循环，让 AI 基于工具结果继续
          continue;
        }

        // 没有工具调用，解析 JSON 响应
        const responseText = result.text || '';

        // 尝试从响应中提取 JSON
        try {
          // 尝试提取 JSON（支持代码块格式）
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr);

            // 验证 JSON 结构
            if (parsed && typeof parsed.translation === 'string') {
              finalText = parsed.translation;
              // 成功解析 JSON，跳出循环
              break;
            } else {
              console.warn('[TermTranslationService] JSON 格式不正确，缺少 translation 字段');
              // 如果 JSON 格式不正确，检查重试次数
              if (jsonRetryCount < MAX_JSON_RETRIES) {
                jsonRetryCount++;
                history.push({
                  role: 'assistant',
                  content: responseText,
                });
                history.push({
                  role: 'user',
                  content:
                    '响应格式错误：JSON 中缺少 translation 字段。[警告] **必须只返回 JSON 格式**：\n```json\n{\n  "translation": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。',
                });
                continue; // 继续循环，让 AI 重新生成
              } else {
                // 达到最大重试次数，抛出错误而不是使用可能不正确的原始文本
                throw new Error(
                  'AI 响应格式错误：JSON 中缺少 translation 字段。已达到最大重试次数，无法获取有效翻译。',
                );
              }
            }
          } else {
            // 如果没有找到 JSON，检查重试次数
            if (jsonRetryCount < MAX_JSON_RETRIES) {
              jsonRetryCount++;
              console.warn('[TermTranslationService] 响应中未找到 JSON 格式，要求重新返回');
              history.push({
                role: 'assistant',
                content: responseText,
              });
              history.push({
                role: 'user',
                content:
                  '响应格式错误：未找到 JSON 格式。[警告] **必须只返回 JSON 格式**：\n```json\n{\n  "translation": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。',
              });
              continue; // 继续循环，让 AI 重新生成
            } else {
              // 达到最大重试次数，抛出错误而不是使用可能不正确的原始文本
              throw new Error(
                'AI 响应格式错误：未找到有效的 JSON 格式。已达到最大重试次数，无法获取有效翻译。',
              );
            }
          }
        } catch (parseError) {
          // JSON 解析失败，检查重试次数
          if (jsonRetryCount < MAX_JSON_RETRIES) {
            jsonRetryCount++;
            console.warn('[TermTranslationService] JSON 解析失败，要求重新返回:', parseError);
            history.push({
              role: 'assistant',
              content: responseText,
            });
            history.push({
              role: 'user',
              content: `响应格式错误：JSON 解析失败（${parseError instanceof Error ? parseError.message : String(parseError)}）。[警告] **必须只返回 JSON 格式**：\n\`\`\`json\n{\n  "translation": "翻译结果"\n}\n\`\`\`\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。`,
            });
            continue; // 继续循环，让 AI 重新生成
          } else {
            // 达到最大重试次数，抛出错误而不是使用可能不正确的原始文本
            const errorMessage =
              parseError instanceof Error ? parseError.message : String(parseError);
            throw new Error(
              `AI 响应格式错误：JSON 解析失败（${errorMessage}）。已达到最大重试次数，无法获取有效翻译。`,
            );
          }
        }
      }

      // 如果达到最大循环迭代次数，尝试解析最后一次响应
      if (iterationCount >= MAX_TOOL_CALLS && !finalText) {
        console.warn('[TermTranslationService] 达到最大工具调用次数，尝试解析最后一次响应');
        const lastResponse = history[history.length - 1]?.content || '';
        if (lastResponse) {
          try {
            const jsonMatch = lastResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed && typeof parsed.translation === 'string') {
                finalText = parsed.translation;
              } else {
                throw new Error(
                  'AI 响应格式错误：达到最大工具调用次数，且最后一次响应中 JSON 格式不正确（缺少 translation 字段）。',
                );
              }
            } else {
              throw new Error(
                'AI 响应格式错误：达到最大工具调用次数，且最后一次响应中未找到有效的 JSON 格式。',
              );
            }
          } catch (error) {
            // 如果是我们抛出的错误，直接抛出
            if (error instanceof Error && error.message.includes('AI 响应格式错误')) {
              throw error;
            }
            // 否则是 JSON 解析错误
            throw new Error(
              `AI 响应格式错误：达到最大工具调用次数，且最后一次响应的 JSON 解析失败。无法获取有效翻译。`,
            );
          }
        } else {
          throw new Error(
            'AI 响应格式错误：达到最大工具调用次数，且没有可用的响应内容。无法获取有效翻译。',
          );
        }
      }

      // 更新任务状态为完成（只在真正完成时更新）
      if (aiProcessingStore && taskId && finalText) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'end',
          message: '翻译完成',
        });
      }

      return { text: finalText, ...(taskId ? { taskId } : {}) };
    } catch (error) {
      // 如果使用了任务管理，更新任务状态为错误
      if (aiProcessingStore && taskId) {
        const isCancelled = error instanceof Error && error.message === '翻译已取消';
        if (isCancelled) {
          const currentTask = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
          if (currentTask && currentTask.status !== 'cancelled') {
            void aiProcessingStore.updateTask(taskId, {
              status: 'cancelled',
              message: '已取消',
            });
          }
        } else {
          void aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '翻译时发生未知错误',
          });
        }
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻译时发生未知错误');
    } finally {
      // 清理事件监听器
      cleanupAbort();
    }
  }
}
