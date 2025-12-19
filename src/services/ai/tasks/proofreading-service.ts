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
 * 校对服务选项
 */
export interface ProofreadingServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收校对过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收校对进度更新
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
   * 段落校对回调函数，用于接收每个块完成后的段落校对结果
   * @param translations 段落校对数组，包含段落ID和校对后的文本
   */
  onParagraphProofreading?: (translations: { id: string; translation: string }[]) => void;
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
   * 当前段落 ID（可选），用于单段落校对时提供上下文
   */
  currentParagraphId?: string;
  /**
   * 章节 ID（可选），如果提供，将在上下文中提供给 AI
   */
  chapterId?: string;
}

export interface ProofreadingResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 校对服务
 * 使用 AI 服务进行文本校对，检查并修正文字、内容和格式层面的错误
 */
export class ProofreadingService {
  static readonly CHUNK_SIZE = 2500;

  /**
   * 校对文本
   * @param content 要校对的段落列表（必须包含翻译）
   * @param model AI 模型配置
   * @param options 校对选项（可选）
   * @returns 校对后的文本和任务 ID（如果使用了任务管理）
   */
  static async proofread(
    content: Paragraph[],
    model: AIModel,
    options?: ProofreadingServiceOptions,
  ): Promise<ProofreadingResult> {
    console.log('[ProofreadingService] 🔍 开始校对任务', {
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
      onParagraphProofreading,
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
      throw new Error('要校对的内容不能为空');
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = content.filter(
      (p) => p.text?.trim() && p.translations && p.translations.length > 0,
    );
    if (paragraphsWithTranslation.length === 0) {
      throw new Error('要校对的段落必须包含至少一个翻译版本');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 使用共享工具初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'proofreading',
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
        temperature: model.isDefault.proofreading?.temperature ?? 0.3, // 校对使用较低温度以提高准确性
        signal: finalSignal,
      };

      // 使用共享工具获取特殊指令
      const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'proofreading');

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词（使用共享提示词模块）
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = specialInstructions
        ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
        : '';

      const systemPrompt = `你是一个专业的小说校对助手，负责检查并修正翻译文本中的各种错误。${todosPrompt}${specialInstructionsSection}

========================================
【校对工作范围】
========================================
你需要从三个层面全面检查文本：

**1. 🔍 文字层面：基础准确性**
- **错别字、漏字、多字**：检查形近字、音近字误用（如"的/地/得"不分、"在/再"混淆），以及排版或输入错误导致的字词缺失或多余
- **标点符号**：⚠️ **必须使用全角符号**
  * 所有标点符号必须使用全角（中文）版本
  * 检查标点使用是否规范和统一
  * 数字、英文单词保持半角
- **语法和修辞**：修正明显的语病，确保句子结构清晰，表达准确
- **词语和成语用法**：确认词语和成语的使用是否恰当

**2. ✨ 内容层面：情节逻辑与细节统一**
- **人名、地名、称谓**：确保在全文中保持完全一致
- **时间线与逻辑**：检查事件顺序是否连贯，是否存在逻辑漏洞
- **专业知识/设定**：核对专业领域知识或世界观设定是否准确、统一

**3. 📄 格式层面：版式与体例**
- **格式和体例**：检查段落缩进、分段、章节标题格式等是否统一
- **数字用法**：确保数字使用规范且全文一致
- **引文和注释**：检查引用的文字是否准确，格式是否统一

========================================
【校对原则】
========================================
1. **保持原意**：校对时只修正错误，不要改变原文的意思和风格
2. **最小改动**：只修正确实存在的错误，不要过度修改
3. **一致性优先**：确保术语、角色名称、称谓等在全文中保持一致
4. **参考原文**：校对时参考原文段落，确保翻译准确无误
5. **参考上下文**：使用工具获取前后段落和章节的上下文
6. ${getSymbolFormatRules()}

========================================
【工具使用】
========================================
- \`search_memory_by_keywords\`: 检查称谓一致性前先搜索记忆
- \`find_paragraph_by_keywords\`: 检查人名、地名、称谓的一致性
- \`get_previous_paragraphs\` / \`get_next_paragraphs\`: 需要更多上下文时
- \`get_previous_chapter\` / \`get_next_chapter\`: 需要查看章节上下文时
- \`update_character\` / \`update_term\`: 发现不一致时更新
- ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**
- ${getTodoToolsDescription('proofreading')}

${getMemoryWorkflowRules()}

${getOutputFormatRules('proofreading')}

${getExecutionWorkflowRules('proofreading')}`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      let initialUserPrompt = buildInitialUserPromptBase('proofreading');

      // 如果提供了章节ID，添加到上下文中
      if (chapterId) {
        initialUserPrompt = addChapterContext(initialUserPrompt, chapterId, 'proofreading');
      }

      // 如果是单段落校对，添加段落 ID 信息以便 AI 获取上下文
      if (currentParagraphId && content.length === 1) {
        initialUserPrompt = addParagraphContext(initialUserPrompt, currentParagraphId, 'proofreading');
      }

      initialUserPrompt = addTaskPlanningSuggestions(initialUserPrompt, 'proofreading');
      initialUserPrompt += buildExecutionSection('proofreading', chapterId);

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = ProofreadingService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        paragraphIds?: string[];
      }> = [];

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];

      for (const paragraph of paragraphsWithTranslation) {
        // 获取段落的当前翻译
        const currentTranslation =
          paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)
            ?.translation ||
          paragraph.translations?.[0]?.translation ||
          '';

        // 格式化段落：[ID: {id}] 原文: {原文}\n翻译: {当前翻译}
        const paragraphText = `[ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

        // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
            paragraphIds: currentChunkParagraphs.map((p) => p.id),
          });
          currentChunkText = '';
          currentChunkParagraphs = [];
        }
        currentChunkText += paragraphText;
        currentChunkParagraphs.push(paragraph);
      }
      // 添加最后一个块
      if (currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText,
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
        });
      }

      let proofreadText = '';
      const paragraphProofreadings: { id: string; translation: string }[] = [];

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
            message: `正在校对第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 校对块 ${i + 1}/${chunks.length} ===]\n\n`,
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
        const maintenanceReminder = buildMaintenanceReminder('proofreading');
        let content = '';
        if (i === 0) {
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${chunkText}${maintenanceReminder}

**⚠️ 重要：专注于当前文本块**
- 你只需要处理当前提供的文本块（第 ${i + 1}/${chunks.length} 部分），不要考虑其他块的内容
- 当前块完成后，系统会自动提供下一个块
- 请专注于完成当前块的所有段落校对`;
        } else {
          content = `接下来的内容（第 ${i + 1}/${chunks.length} 部分）：\n\n${chunkText}${maintenanceReminder}

**⚠️ 重要：专注于当前文本块**
- 你只需要处理当前提供的文本块（第 ${i + 1}/${chunks.length} 部分），不要考虑其他块的内容
- 当前块完成后，系统会自动提供下一个块
- 请专注于完成当前块的所有段落校对`;
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
                `[ProofreadingService] ⚠️ 检测到AI降级或错误，重试块 ${i + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
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
              taskType: 'proofreading',
              chunkText,
              paragraphIds: chunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'ProofreadingService',
              // 对于 proofreading，只验证有变化的段落
              verifyCompleteness: (_expectedIds, _receivedTranslations) => {
                // 只检查已收到的翻译（有变化的段落）
                // 对于 proofreading，不需要验证所有段落都有翻译，只需要验证返回的段落格式正确
                return {
                  allComplete: true, // proofreading 只返回有变化的段落，所以总是完整的
                  missingIds: [],
                };
              },
            });

            // 检查状态
            if (loopResult.status !== 'done') {
              throw new Error(`校对任务未完成（状态: ${loopResult.status}）。请重试。`);
            }

            // 使用从状态流程中提取的段落校对
            const extractedProofreadings = loopResult.paragraphs;

            // 处理校对结果：只返回有变化的段落
            if (extractedProofreadings.size > 0 && chunk.paragraphIds) {
              // 过滤出有变化的段落
              const chunkParagraphProofreadings = filterChangedParagraphs(
                chunk.paragraphIds,
                extractedProofreadings,
                originalTranslations,
              );

              if (chunkParagraphProofreadings.length > 0) {
                // 按顺序构建文本
                const orderedProofreadings: string[] = [];
                for (const paraProofreading of chunkParagraphProofreadings) {
                  orderedProofreadings.push(paraProofreading.translation);
                  paragraphProofreadings.push(paraProofreading);
                }
                const orderedText = orderedProofreadings.join('\n\n');
                proofreadText += orderedText;
                if (onChunk) {
                  await onChunk({ text: orderedText, done: false });
                }
                // 通知段落校对完成
                if (onParagraphProofreading) {
                  onParagraphProofreading(chunkParagraphProofreadings);
                }
              }
              // 如果所有段落都没有变化，不添加任何内容（这是预期行为）
            } else {
              // 没有提取到段落校对，使用完整文本作为后备
              const fallbackText = loopResult.responseText || '';
              proofreadText += fallbackText;
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
                  `[ProofreadingService] ❌ AI降级检测失败，块 ${i + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止校对`,
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
      void completeTask(
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'proofreading',
      );

      return {
        text: proofreadText,
        paragraphTranslations: paragraphProofreadings,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      // 使用共享工具处理错误
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'proofreading',
      );
      throw error;
    } finally {
      // 使用共享工具清理
      cleanupAbort();
    }
  }
}
