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
  getSpecialInstructions,
  buildSpecialInstructionsSection,
} from './utils/ai-task-helper';
import { createUnifiedAbortController } from './utils/ai-task-helper';

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
        const chapterContextSection = buildChapterContextSection(chapterId);

        systemPrompt += `${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **术语一致**: 使用术语表和角色表确保翻译一致
2. **自然流畅**: 符合轻小说风格，保持术语的准确性
3. **上下文理解**: 根据当前书籍、章节的上下文来理解术语含义

【工具使用】⭐ **强烈建议在翻译前获取上下文**
你可以使用以下工具获取上下文信息：
- \`get_book_info\`: 获取当前书籍信息（标题、作者、简介、标签等），了解书籍背景
- \`get_term\`: 根据术语名称获取术语信息
- \`list_terms\`: 获取当前章节或书籍的术语表（传入 chapter_id 获取章节术语），确保术语翻译一致性
- \`search_terms_by_keywords\`: 根据关键词搜索术语
- \`get_character\`: 根据角色名称获取角色信息
- \`list_characters\`: 获取当前章节或书籍的角色表（传入 chapter_id 获取章节角色），了解角色关系
- \`search_characters_by_keywords\`: 根据关键词搜索角色
- \`get_memory\`: 根据记忆 ID 获取记忆信息
- \`get_recent_memories\`: 获取最近的记忆列表
- \`search_memory_by_keywords\`: 搜索相关记忆了解上下文和历史翻译方式
- \`find_paragraph_by_keywords\`: 根据关键词搜索段落，了解术语在上下文中的使用方式
- \`search_paragraphs_by_regex\`: 使用正则表达式搜索段落，进行更精确的搜索

**工作流程**：
1. **获取上下文**（推荐）：先使用工具获取书籍、章节、术语和角色的上下文信息
2. **理解术语**：基于上下文理解术语的含义和用法
3. **翻译术语**：提供准确、一致、符合轻小说风格的翻译

**输出格式**：⚠️ **必须只返回 JSON 格式**
\`\`\`json
{
  "translation": "翻译结果"
}
\`\`\`
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

`;
      }

      // 构建用户提示词
      const userPrompt =
        prompt ||
        `请将以下日文术语翻译为简体中文，保持原文的格式和结构。⚠️ **必须只返回 JSON 格式**：
\`\`\`json
{
  "translation": "翻译结果"
}
\`\`\`
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
      let toolCallCount = 0;
      let jsonRetryCount = 0;
      let finalText = '';

      while (toolCallCount < MAX_TOOL_CALLS) {
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
                message: toolCallCount > 0 ? '正在使用工具获取上下文...' : '正在生成翻译...',
              });
              firstChunkReceived = true;
            }

            if (chunk.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
            }

            if (chunk.text) {
              void aiProcessingStore.appendOutputContent(taskId, chunk.text);
            }

            if (chunk.done) {
              void aiProcessingStore.updateTask(taskId, {
                status: 'completed',
                message: '翻译完成',
              });
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
          toolCallCount++;

          // 添加助手消息（包含工具调用）
          history.push({
            role: 'assistant',
            content: result.text || null,
            tool_calls: result.toolCalls,
            reasoning_content: result.reasoningContent || null,
          });

          // 执行工具调用
          for (const toolCall of result.toolCalls) {
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
                    '响应格式错误：JSON 中缺少 translation 字段。⚠️ **必须只返回 JSON 格式**：\n```json\n{\n  "translation": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。',
                });
                continue; // 继续循环，让 AI 重新生成
              } else {
                // 达到最大重试次数，使用原始文本作为后备
                console.warn('[TermTranslationService] 达到最大 JSON 重试次数，使用原始文本');
                finalText = responseText.trim();
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
                  '响应格式错误：未找到 JSON 格式。⚠️ **必须只返回 JSON 格式**：\n```json\n{\n  "translation": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。',
              });
              continue; // 继续循环，让 AI 重新生成
            } else {
              // 达到最大重试次数，使用原始文本作为后备
              console.warn('[TermTranslationService] 达到最大 JSON 重试次数，使用原始文本');
              finalText = responseText.trim();
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
              content: `响应格式错误：JSON 解析失败（${parseError instanceof Error ? parseError.message : String(parseError)}）。⚠️ **必须只返回 JSON 格式**：\n\`\`\`json\n{\n  "translation": "翻译结果"\n}\n\`\`\`\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。`,
            });
            continue; // 继续循环，让 AI 重新生成
          } else {
            // 达到最大重试次数，使用原始文本作为后备
            console.warn('[TermTranslationService] 达到最大 JSON 重试次数，使用原始文本');
            finalText = responseText.trim();
          }
        }

        break;
      }

      // 如果达到最大工具调用次数，尝试解析最后一次响应
      if (toolCallCount >= MAX_TOOL_CALLS && !finalText) {
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
                finalText = lastResponse.trim();
              }
            } else {
              finalText = lastResponse.trim();
            }
          } catch {
            finalText = lastResponse.trim();
          }
        }
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
