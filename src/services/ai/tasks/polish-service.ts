import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import { buildOriginalTranslationsMap, filterChangedParagraphs } from 'src/utils';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getTodosSystemPrompt } from './todo-helper';
import {
  executeToolCallLoop,
  type AIProcessingStore,
  buildMaintenanceReminder,
  buildInitialUserPromptBase,
  addChapterContext,
  addParagraphContext,
  addTaskPlanningSuggestions,
  buildExecutionSection,
  createUnifiedAbortController,
  initializeTask,
  getSpecialInstructions,
  handleTaskError,
  completeTask,
} from './ai-task-helper';
import {
  getSymbolFormatRules,
  getOutputFormatRules,
  getExecutionWorkflowRules,
  getTodoToolsDescription,
  getMemoryWorkflowRules,
} from './prompts';

/**
 * 润色服务选项
 */
export interface PolishServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收润色过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收润色进度更新
   * @param progress 进度信息
   */
  onProgress?: (progress: { total: number; current: number; currentParagraphs?: string[] }) => void;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * 段落润色回调函数，用于接收每个块完成后的段落润色结果
   * @param translations 段落润色数组，包含段落ID和润色文本
   */
  onParagraphPolish?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
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
  /**
   * 当前段落 ID（可选），用于单段落润色时提供上下文
   */
  currentParagraphId?: string;
  /**
   * 章节 ID（可选），如果提供，将在上下文中提供给 AI
   */
  chapterId?: string;
}

export interface PolishResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 润色服务
 * 使用 AI 服务进行文本润色，支持术语 CRUD 工具和翻译历史参考
 */
export class PolishService {
  static readonly CHUNK_SIZE = 2500;

  /**
   * 润色文本
   * @param content 要润色的段落列表（必须包含翻译历史）
   * @param model AI 模型配置
   * @param options 润色选项（可选）
   * @returns 润色后的文本和任务 ID（如果使用了任务管理）
   */
  static async polish(
    content: Paragraph[],
    model: AIModel,
    options?: PolishServiceOptions,
  ): Promise<PolishResult> {
    console.log('[PolishService] 🎨 开始润色任务', {
      段落数量: content?.length || 0,
      有效段落数: content?.filter((p) => p.text?.trim() && p.translations?.length > 0).length || 0,
      AI模型: model.name,
      AI提供商: model.provider,
      书籍ID: options?.bookId || '无',
    });

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      aiProcessingStore,
      onParagraphPolish,
      onToast,
      currentParagraphId,
      chapterId,
    } = options || {};
    const actions: ActionInfo[] = [];

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

    if (!content || content.length === 0) {
      throw new Error('要润色的内容不能为空');
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = content.filter(
      (p) => p.text?.trim() && p.translations && p.translations.length > 0,
    );
    if (paragraphsWithTranslation.length === 0) {
      throw new Error('要润色的段落必须包含至少一个翻译版本');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 使用共享工具初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'polish',
      model.name,
    );

    // 使用共享工具创建统一的 AbortController
    const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
      signal,
      abortController,
    );
    const finalSignal = internalController.signal;

    try {
      const service = AIServiceFactory.getService(model.provider);
      // 排除翻译管理工具，只返回JSON
      const tools = ToolRegistry.getToolsExcludingTranslationManagement(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        // 润色和校对共用 proofreading 配置（参见 AIModelDefaultTasks 类型定义）
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 使用共享工具获取特殊指令
      const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'polish');

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词（使用共享提示词模块）
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = specialInstructions
        ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
        : '';

      const systemPrompt = `你是一个专业的日轻小说润色助手。${todosPrompt}${specialInstructionsSection}

========================================
【核心规则】
========================================
1. **语气词优化**:
   - 适当地添加语气词，如"呀"、"呢"、"吧"、"啊"等，以增强翻译的语气。
   - 不要过度使用语气词，以免影响翻译的流畅性。
   - 准确地根据角色的说话风格进行润色，不要使用与角色不符的语气词。

2. **摆脱"翻译腔"**:
   - 将生硬的直译转换为自然流畅的中文表达。
   - 避免日式语序和生硬的字面翻译。
   - 使用符合中文习惯的表达方式。

3. **句子流畅和节奏**:
   - 调整句子长度和结构，确保阅读节奏自然。
   - 避免过长的句子，适当断句。
   - 保持句子的韵律感。

4. **消除语病和不必要的重复**:
   - 修正语法错误和表达不当。
   - 删除冗余的词汇和重复表达。
   - 优化表达，使语言更精炼。

5. **人物语言的区分**:
   - 检查不同角色的对白是否符合他们的身份、性格和所处的时代背景。
   - 例如，一位贵族和一位平民的对话用词应有所区别。
   - 参考角色设定中的口吻和说话风格。

6. **专有名词的统一**:
   - 确保术语和角色名称在整个文本中保持一致。
   - 使用术语表和角色表中的标准翻译。

7. **意境和情感的传达**:
   - 确保译文能准确传达原作所营造的意境和其中蕴含的情感。
   - 保持原文的情感色彩和氛围。
   - **参考前面段落的原文和翻译，确保翻译的一致性。**

8. **翻译历史参考**:
   - 每个段落都提供了多个翻译历史版本。
   - 你可以参考这些历史翻译，混合匹配不同版本中的优秀表达。
   - 选择最合适的词汇和句式，创造最佳润色结果。

9. ${getSymbolFormatRules()}

========================================
【工具使用】
========================================
- 使用工具获取术语、角色和段落上下文
- ⚠️ 如果提供了章节 ID，调用 \`list_terms\` 和 \`list_characters\` 时应传递 \`chapter_id\` 参数
- 如遇到敬语翻译，必须**首先**使用 \`search_memory_by_keywords\` 搜索记忆，**然后**使用 \`find_paragraph_by_keywords\` 检查历史翻译一致性
- ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**
- 如遇到新术语/角色，确认需要后直接创建；如遇到数据问题，立即使用工具修复
- ${getTodoToolsDescription('polish')}

${getMemoryWorkflowRules()}

${getOutputFormatRules('polish')}

${getExecutionWorkflowRules('polish')}`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      let initialUserPrompt = buildInitialUserPromptBase('polish');

      // 如果提供了章节ID，添加到上下文中
      if (chapterId) {
        initialUserPrompt = addChapterContext(initialUserPrompt, chapterId, 'polish');
      }

      // 如果是单段落润色，添加段落 ID 信息以便 AI 获取上下文
      if (currentParagraphId && content.length === 1) {
        initialUserPrompt = addParagraphContext(initialUserPrompt, currentParagraphId, 'polish');
      }

      initialUserPrompt = addTaskPlanningSuggestions(initialUserPrompt, 'polish');
      initialUserPrompt += buildExecutionSection('polish', chapterId);

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = PolishService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        paragraphIds?: string[];
        translationHistories?: Map<string, string[]>; // 段落ID -> 翻译历史数组
      }> = [];

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];
      let currentChunkTranslationHistories = new Map<string, string[]>();

      for (const paragraph of paragraphsWithTranslation) {
        // 获取段落的翻译历史（最多5个，最新的在前）
        const translations = paragraph.translations || [];
        const translationHistory = translations
          .slice()
          .reverse()
          .slice(0, 5)
          .map((t) => t.translation);

        // 格式化段落：[ID: {id}] {原文}\n当前翻译: {当前翻译}\n翻译历史:\n{历史版本}
        const currentTranslation =
          translations.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
          translations[0]?.translation ||
          '';
        const historyText =
          translationHistory.length > 0
            ? `\n翻译历史:\n${translationHistory.map((h, idx) => `  版本${idx + 1}: ${h}`).join('\n')}`
            : '';
        const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n当前翻译: ${currentTranslation}${historyText}\n\n`;

        // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
            paragraphIds: currentChunkParagraphs.map((p) => p.id),
            translationHistories: new Map(currentChunkTranslationHistories),
          });
          currentChunkText = '';
          currentChunkParagraphs = [];
          currentChunkTranslationHistories = new Map();
        }
        currentChunkText += paragraphText;
        currentChunkParagraphs.push(paragraph);
        currentChunkTranslationHistories.set(paragraph.id, translationHistory);
      }
      // 添加最后一个块
      if (currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText,
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
          translationHistories: new Map(currentChunkTranslationHistories),
        });
      }

      let polishedText = '';
      const paragraphPolishes: { id: string; translation: string }[] = [];

      // 存储每个段落的原始翻译，用于比较是否有变化
      const originalTranslations = buildOriginalTranslationsMap(paragraphsWithTranslation);

      // 3. 循环处理每个块（带重试机制）
      const MAX_RETRIES = 2; // 最大重试次数
      for (let i = 0; i < chunks.length; i++) {
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('请求已取消');
        }

        const chunk = chunks[i];
        if (!chunk) continue;

        const chunkText = chunk.text;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在润色第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 润色块 ${i + 1}/${chunks.length} ===]\n\n`,
          );
        }

        if (onProgress) {
          const progress: {
            total: number;
            current: number;
            currentParagraphs?: string[];
          } = {
            total: chunks.length,
            current: i + 1,
          };
          if (chunk.paragraphIds) {
            progress.currentParagraphs = chunk.paragraphIds;
          }
          onProgress(progress);
        }

        // 构建当前消息
        const maintenanceReminder = buildMaintenanceReminder('polish');
        let content = '';
        if (i === 0) {
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${chunkText}${maintenanceReminder}

**⚠️ 重要：专注于当前文本块**
- 你只需要处理当前提供的文本块（第 ${i + 1}/${chunks.length} 部分），不要考虑其他块的内容
- 当前块完成后，系统会自动提供下一个块
- 请专注于完成当前块的所有段落润色`;
        } else {
          content = `接下来的内容（第 ${i + 1}/${chunks.length} 部分）：\n\n${chunkText}${maintenanceReminder}

**⚠️ 重要：专注于当前文本块**
- 你只需要处理当前提供的文本块（第 ${i + 1}/${chunks.length} 部分），不要考虑其他块的内容
- 当前块完成后，系统会自动提供下一个块
- 请专注于完成当前块的所有段落润色`;
        }

        // 重试循环
        let retryCount = 0;
        let chunkProcessed = false;

        while (retryCount <= MAX_RETRIES && !chunkProcessed) {
          try {
            // 如果是重试，移除上次失败的消息
            if (retryCount > 0) {
              // 移除上次的用户消息和助手回复（如果有）
              if (history.length > 0 && history[history.length - 1]?.role === 'user') {
                history.pop();
              }
              if (history.length > 0 && history[history.length - 1]?.role === 'assistant') {
                history.pop();
              }

              console.warn(
                `[PolishService] ⚠️ 检测到AI降级或错误，重试块 ${i + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
              );

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                });
              }
            }

            history.push({ role: 'user', content });

            // 使用共享的工具调用循环（基于状态的流程）
            const loopResult = await executeToolCallLoop({
              history,
              tools,
              generateText: service.generateText.bind(service),
              aiServiceConfig: config,
              taskType: 'polish',
              chunkText,
              paragraphIds: chunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'PolishService',
              // 对于 polish，只验证有变化的段落
              verifyCompleteness: (_expectedIds, _receivedTranslations) => {
                // 只检查已收到的翻译（有变化的段落）
                // 对于 polish，不需要验证所有段落都有翻译，只需要验证返回的段落格式正确
                return {
                  allComplete: true, // polish 只返回有变化的段落，所以总是完整的
                  missingIds: [],
                };
              },
            });

            // 检查状态
            if (loopResult.status !== 'done') {
              throw new Error(`润色任务未完成（状态: ${loopResult.status}）。请重试。`);
            }

            // 使用从状态流程中提取的段落润色
            const extractedPolishes = loopResult.paragraphs;

            // 处理润色结果：只返回有变化的段落
            if (extractedPolishes.size > 0 && chunk.paragraphIds) {
              // 过滤出有变化的段落
              const chunkParagraphPolishes = filterChangedParagraphs(
                chunk.paragraphIds,
                extractedPolishes,
                originalTranslations,
              );

              if (chunkParagraphPolishes.length > 0) {
                // 按顺序构建文本
                const orderedPolishes: string[] = [];
                for (const paraPolish of chunkParagraphPolishes) {
                  orderedPolishes.push(paraPolish.translation);
                  paragraphPolishes.push(paraPolish);
                }
                const orderedText = orderedPolishes.join('\n\n');
                polishedText += orderedText;
                if (onChunk) {
                  await onChunk({ text: orderedText, done: false });
                }
                // 通知段落润色完成
                if (onParagraphPolish) {
                  onParagraphPolish(chunkParagraphPolishes);
                }
              }
              // 如果所有段落都没有变化，不添加任何内容（这是预期行为）
            } else {
              // 没有提取到段落润色，使用完整文本作为后备
              const fallbackText = loopResult.responseText || '';
              polishedText += fallbackText;
              if (onChunk) {
                await onChunk({ text: fallbackText, done: false });
              }
            }

            // 标记块已成功处理
            chunkProcessed = true;
          } catch (error) {
            // 检查是否是AI降级错误
            const isDegradedError =
              error instanceof Error &&
              (error.message.includes('AI降级检测') || error.message.includes('重复字符'));

            if (isDegradedError) {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                // 重试次数用尽，抛出错误
                console.error(
                  `[PolishService] ❌ AI降级检测失败，块 ${i + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止润色`,
                  {
                    块索引: i + 1,
                    总块数: chunks.length,
                    重试次数: MAX_RETRIES,
                    段落ID: chunk.paragraphIds?.slice(0, 3).join(', ') + '...',
                  },
                );
                throw new Error(
                  `AI降级：检测到重复字符，已重试 ${MAX_RETRIES} 次仍失败。请检查AI服务状态或稍后重试。`,
                );
              }
              // 继续重试循环
              continue;
            } else {
              // 其他错误，直接抛出
              throw error;
            }
          }
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      // 使用共享工具完成任务
      void completeTask(taskId, aiProcessingStore as AIProcessingStore | undefined, 'polish');

      return {
        text: polishedText,
        paragraphTranslations: paragraphPolishes,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      // 使用共享工具处理错误
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'polish',
      );
      throw error;
    } finally {
      // 使用共享工具清理
      cleanupAbort();
    }
  }
}
