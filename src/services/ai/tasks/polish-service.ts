import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph, Novel } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import {
  findUniqueTermsInText,
  findUniqueCharactersInText,
  calculateCharacterScores,
} from 'src/utils/text-matcher';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { TranslationService } from './translation-service';

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
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
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
  static readonly CHUNK_SIZE = 1500;

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

    const { onChunk, onProgress, signal, bookId, aiProcessingStore, onParagraphPolish, onToast } =
      options || {};
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

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'polish',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化润色会话...',
        thinkingMessage: '',
      });

      // 获取任务的 abortController
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      abortController = task?.abortController;
    }

    // 创建一个合并的 AbortSignal，同时监听 signal 和 task.abortController
    const internalController = new AbortController();
    const finalSignal = internalController.signal;

    // 监听信号并触发内部 controller
    const abortHandler = () => {
      internalController.abort();
    };

    if (signal) {
      if (signal.aborted) {
        internalController.abort();
      } else {
        signal.addEventListener('abort', abortHandler);
      }
    }

    if (abortController) {
      if (abortController.signal.aborted) {
        internalController.abort();
      } else {
        abortController.signal.addEventListener('abort', abortHandler);
      }
    }

    try {
      const service = AIServiceFactory.getService(model.provider);
      const tools = ToolRegistry.getAllTools(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const systemPrompt = `你是一个专业的日轻小说润色助手。

【核心规则】
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

8. **翻译历史参考**:
   - 每个段落都提供了多个翻译历史版本。
   - 你可以参考这些历史翻译，混合匹配不同版本中的优秀表达。
   - 选择最合适的词汇和句式，创造最佳润色结果。

9. **工具使用**:
   - 使用工具获取术语、角色和段落上下文。
   - 优先使用上下文中的术语/角色，如果上下文中没有，再调用工具查询。

10. **记忆管理**:
   - **参考记忆**: 润色前可使用 search_memory_by_keyword 搜索相关的背景设定、角色信息等记忆内容，使用 get_memory 获取完整内容，确保润色风格和术语使用的一致性。
   - **保存记忆**: 完成章节润色后，可使用 create_memory 保存章节摘要（需要自己生成 summary）。重要背景设定也可保存供后续参考。
   - **搜索后保存**: 当你通过工具（如 search_paragraph_by_keyword、get_chapter_info 等）搜索或检索了大量内容时，应该主动使用 create_memory 保存这些重要信息，以便后续快速参考。

11. **输出润色**:
   - **必须使用工具**: 完成每个段落的润色后，必须使用 \`add_paragraph_translation\` 工具为每个段落添加润色结果。
   - **调用工具**: 直接调用工具返回润色结果。
   - **工具参数**:
     - \`paragraph_id\`: 段落的ID（从输入中的 [ID: xxx] 格式获取）
     - \`translation\`: 润色后的内容
     - \`ai_model_id\`: 当前使用的AI模型ID（已提供在上下文中）`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      const initialUserPrompt = `开始润色。

【执行要点】
- **语气词**: 适当添加，符合角色风格。
- **自然流畅**: 摆脱翻译腔，使用地道中文。
- **节奏优化**: 调整句子长度和结构。
- **语病修正**: 消除语病和不必要重复。
- **角色区分**: 根据角色身份、性格、时代背景调整语言。
- **专有名词**: 保持术语和角色名称统一。
- **情感传达**: 准确传达意境和情感。
- **历史参考**: 参考翻译历史，混合匹配最佳表达。
- **工具使用**: 优先使用上下文，必要时调用工具。
- **记忆**: 润色前搜索相关记忆，完成后可保存章节摘要。
- **保留原文格式**: 保留原文的格式，如标点符号、换行符等。
- **输出方式**: 完成每个段落的润色后，使用 \`add_paragraph_translation\` 工具添加润色结果。当前AI模型ID: ${model.id}`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = PolishService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        context?: string;
        paragraphIds?: string[];
        translationHistories?: Map<string, string[]>; // 段落ID -> 翻译历史数组
      }> = [];

      // 获取书籍数据以提取上下文（仅当提供了 bookId 时）
      let book: Novel | undefined;
      if (bookId) {
        try {
          // 动态导入 store 以避免循环依赖
          const booksStore = (await import('src/stores/books')).useBooksStore();
          book = booksStore.getBookById(bookId);
        } catch (e) {
          console.warn(
            `[PolishService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      // 计算全文的角色出现得分，用于消歧义
      let characterScores: Map<string, number> | undefined;
      if (book && book.characterSettings) {
        const fullText = paragraphsWithTranslation.map((p) => p.text).join('\n');
        characterScores = calculateCharacterScores(fullText, book.characterSettings);
      }

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];
      let currentChunkTranslationHistories = new Map<string, string[]>();

      // 辅助函数：提取上下文
      const getContext = (paragraphs: Paragraph[], bookData?: Novel): string => {
        if (!bookData || paragraphs.length === 0) return '';

        const textContent = paragraphs.map((p) => p.text).join('\n');
        const contextParts: string[] = [];

        // 查找相关术语
        const relevantTerms = findUniqueTermsInText(textContent, bookData.terminologies || []);
        if (relevantTerms.length > 0) {
          contextParts.push('【相关术语参考】');
          contextParts.push(
            relevantTerms
              .map(
                (t) =>
                  `- [ID: ${t.id}] ${t.name}: ${t.translation.translation}${t.description ? ` (${t.description})` : ''}`,
              )
              .join('\n'),
          );
        }

        // 查找相关角色
        const relevantCharacters = findUniqueCharactersInText(
          textContent,
          bookData.characterSettings || [],
          characterScores,
        );
        if (relevantCharacters.length > 0) {
          contextParts.push('【相关角色参考】');
          contextParts.push(
            relevantCharacters
              .map((c) => {
                let charInfo = `- [ID: ${c.id}] ${c.name}: ${c.translation.translation}`;
                if (c.aliases && c.aliases.length > 0) {
                  const aliasList = c.aliases
                    .map((a) => `${a.name}(${a.translation.translation})`)
                    .join(', ');
                  charInfo += ` [别名: ${aliasList}]`;
                }
                if (c.description) {
                  charInfo += ` (${c.description})`;
                }
                if (c.speakingStyle) {
                  charInfo += ` [口吻: ${c.speakingStyle}]`;
                }
                return charInfo;
              })
              .join('\n'),
          );
        }

        return contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : '';
      };

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

        // 预测加入新段落后的上下文
        const nextParagraphs = [...currentChunkParagraphs, paragraph];
        const nextContext = getContext(nextParagraphs, book);

        // 如果当前块加上新段落和上下文超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length + nextContext.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
            context: getContext(currentChunkParagraphs, book),
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
          context: getContext(currentChunkParagraphs, book),
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
          translationHistories: new Map(currentChunkTranslationHistories),
        });
      }

      let polishedText = '';
      const paragraphPolishes: { id: string; translation: string }[] = [];

      // 3. 循环处理每个块
      for (let i = 0; i < chunks.length; i++) {
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('请求已取消');
        }

        const chunk = chunks[i];
        if (!chunk) continue;

        const chunkText = chunk.text;
        const chunkContext = chunk.context || '';

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在润色第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
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
        const maintenanceReminder = `
⚠️ **提醒**:
- **语气词**: 适当添加，符合角色风格。
- **自然流畅**: 摆脱翻译腔，使用地道中文。
- **工具**: 优先使用上下文中的术语/角色，勿滥用列表工具。
- **历史参考**: 参考翻译历史，混合匹配最佳表达。`;
        let content = '';
        if (i === 0) {
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        }

        history.push({ role: 'user', content });

        let currentTurnCount = 0;
        const MAX_TURNS = 10; // 增加最大回合数，因为需要为每个段落调用工具
        const chunkPolishes = new Map<string, string>(); // 收集当前块的润色结果

        // 工具调用循环
        while (currentTurnCount < MAX_TURNS) {
          currentTurnCount++;

          const request: TextGenerationRequest = {
            messages: history,
          };

          if (tools.length > 0) {
            request.tools = tools;
          }

          // 调用 AI
          let chunkReceived = false;
          let accumulatedText = '';

          // 确保 AI 请求完全完成后再继续
          const result = await service.generateText(config, request, (c) => {
            // 处理流式输出
            if (c.text) {
              if (!chunkReceived && aiProcessingStore && taskId) {
                chunkReceived = true;
              }

              // 累积文本用于检测重复字符
              accumulatedText += c.text;

              // 检测重复字符（AI降级检测），传入原文进行比较
              if (
                detectRepeatingCharacters(accumulatedText, chunkText, { logLabel: 'PolishService' })
              ) {
                throw new Error('AI降级检测：检测到重复字符，停止润色');
              }

              // 累积思考消息（异步操作，但不阻塞）
              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendThinkingMessage(taskId, c.text);
              }
            }
            return Promise.resolve();
          });

          // 检查是否有工具调用
          if (result.toolCalls && result.toolCalls.length > 0) {
            // 将助手的回复（包含工具调用）添加到历史
            history.push({
              role: 'assistant',
              content: result.text || null,
              tool_calls: result.toolCalls,
            });

            // 执行工具
            for (const toolCall of result.toolCalls) {
              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `\n[调用工具: ${toolCall.function.name}]\n`,
                );
              }

              // 执行工具
              const toolResult = await TranslationService.handleToolCall(
                toolCall,
                bookId || '',
                handleAction,
                onToast,
              );

              // 如果是添加翻译的工具，收集润色结果
              if (toolCall.function.name === 'add_paragraph_translation') {
                try {
                  const toolResultData = JSON.parse(toolResult.content);
                  if (
                    toolResultData.success &&
                    toolResultData.paragraph_id &&
                    toolResultData.translation
                  ) {
                    chunkPolishes.set(toolResultData.paragraph_id, toolResultData.translation);
                    // 同时添加到全局润色列表
                    paragraphPolishes.push({
                      id: toolResultData.paragraph_id,
                      translation: toolResultData.translation,
                    });
                  }
                } catch (e) {
                  console.warn(
                    `[PolishService] ⚠️ 解析工具结果失败: ${toolCall.function.name}`,
                    e instanceof Error ? e.message : String(e),
                  );
                }
              }

              // 添加工具结果到历史
              history.push({
                role: 'tool',
                content: toolResult.content,
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
                );
              }
            }

            // 检查是否所有段落都已润色
            const allParagraphsPolished =
              chunk.paragraphIds?.every((id) => chunkPolishes.has(id)) ?? false;

            if (allParagraphsPolished) {
              // 所有段落都已润色，可以结束
              break;
            } else {
              // 还有段落未润色，继续
              const missingCount = (chunk.paragraphIds?.length || 0) - chunkPolishes.size;
              history.push({
                role: 'user',
                content: `工具调用已完成。还有 ${missingCount} 个段落需要润色，请继续使用 add_paragraph_translation 工具为剩余的段落添加润色结果。`,
              });
              // 继续循环
            }
          } else {
            // 没有工具调用，检查是否所有段落都已润色
            const allParagraphsPolished =
              chunk.paragraphIds?.every((id) => chunkPolishes.has(id)) ?? false;

            if (allParagraphsPolished) {
              // 所有段落都已润色，可以结束
              break;
            } else {
              // 还有段落未润色，提醒AI使用工具
              const missingCount = (chunk.paragraphIds?.length || 0) - chunkPolishes.size;
              history.push({
                role: 'user',
                content: `还有 ${missingCount} 个段落需要润色。请使用 add_paragraph_translation 工具为每个段落添加润色结果，不要返回JSON格式。`,
              });
              // 继续循环
            }
          }
        }

        // 检查是否所有段落都已润色
        const allParagraphsPolished =
          chunk.paragraphIds?.every((id) => chunkPolishes.has(id)) ?? false;

        if (!allParagraphsPolished) {
          const missingIds = chunk.paragraphIds?.filter((id) => !chunkPolishes.has(id)) || [];
          console.warn(
            `[PolishService] ⚠️ 块 ${i + 1}/${chunks.length} 中缺失 ${missingIds.length}/${chunk.paragraphIds?.length || 0} 个段落的润色结果`,
            {
              缺失段落ID:
                missingIds.slice(0, 5).join(', ') +
                (missingIds.length > 5 ? ` 等 ${missingIds.length} 个` : ''),
              已润色段落数: chunkPolishes.size,
              预期段落数: chunk.paragraphIds?.length || 0,
            },
          );
        }

        // 使用从工具调用收集的润色结果
        if (chunkPolishes.size > 0 && chunk.paragraphIds) {
          // 按顺序组织润色文本
          const orderedPolishes: string[] = [];
          const chunkParagraphPolishes: { id: string; translation: string }[] = [];
          for (const paraId of chunk.paragraphIds) {
            const polish = chunkPolishes.get(paraId);
            if (polish) {
              orderedPolishes.push(polish);
              // paragraphPolishes 已经在工具调用时添加了，这里只需要收集当前块的
              chunkParagraphPolishes.push({ id: paraId, translation: polish });
            }
          }
          const orderedText = orderedPolishes.join('\n\n');
          polishedText += orderedText;
          if (onChunk) {
            await onChunk({ text: orderedText, done: false });
          }
          // 通知段落润色完成
          if (onParagraphPolish && chunkParagraphPolishes.length > 0) {
            onParagraphPolish(chunkParagraphPolishes);
          }
        } else {
          // 没有收集到润色结果，记录警告
          console.warn(`[PolishService] ⚠️ 块 ${i + 1}/${chunks.length} 未收集到任何润色结果`);
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '润色完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
      }

      return {
        text: polishedText,
        paragraphTranslations: paragraphPolishes,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      if (aiProcessingStore && taskId) {
        // 检查是否是取消错误
        const isCancelled =
          error instanceof Error &&
          (error.message === '请求已取消' || error.message.includes('aborted'));

        if (isCancelled) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'cancelled',
            message: '已取消',
          });
        } else {
          void aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '润色出错',
          });
        }
      }
      throw error;
    } finally {
      // 清理事件监听器
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
