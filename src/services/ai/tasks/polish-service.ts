import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph, Novel, Chapter } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import { buildOriginalTranslationsMap, filterChangedParagraphs } from 'src/utils';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { TranslationService } from './translation-service';
import { getTodosSystemPrompt } from './todo-helper';
import {
  executeToolCallLoop,
  type AIProcessingStore,
  verifyParagraphCompleteness,
  buildMaintenanceReminder,
  buildInitialUserPromptBase,
  addChapterContext,
  addParagraphContext,
  addTaskPlanningSuggestions,
  buildExecutionSection,
} from './ai-task-helper';

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
      // 排除翻译管理工具，只返回JSON
      const tools = ToolRegistry.getToolsExcludingTranslationManagement(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 获取书籍和章节数据以获取特殊指令（仅当提供了 bookId 时）
      let book: Novel | undefined;
      let chapter: Chapter | undefined;
      let specialInstructions: string | undefined;
      if (bookId) {
        try {
          // 动态导入 store 以避免循环依赖
          const booksStore = (await import('src/stores/books')).useBooksStore();
          book = booksStore.getBookById(bookId);

          // 如果提供了章节ID，获取章节数据以获取章节级别的特殊指令
          if (chapterId && book) {
            for (const volume of book.volumes || []) {
              const foundChapter = volume.chapters?.find((c) => c.id === chapterId);
              if (foundChapter) {
                chapter = foundChapter;
                break;
              }
            }
          }

          // 获取合并后的特殊指令（章节级别覆盖书籍级别）
          specialInstructions = chapter?.polishInstructions || book?.polishInstructions;
        } catch (e) {
          console.warn(
            `[PolishService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = specialInstructions
        ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
        : '';
      const systemPrompt = `你是一个专业的日轻小说润色助手。${todosPrompt}${specialInstructionsSection}

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
        - **参考前面段落的原文和翻译，确保翻译的一致性。**

      8. **翻译历史参考**:
        - 每个段落都提供了多个翻译历史版本。
        - 你可以参考这些历史翻译，混合匹配不同版本中的优秀表达。
        - 选择最合适的词汇和句式，创造最佳润色结果。

      9. **格式与符号保持**: ⚠️ **必须严格保持原文的格式和符号，并使用全角符号**
        - **必须使用全角符号**：所有标点符号、引号、括号、破折号等必须使用全角（中文）版本
          * 逗号：， （不是 ,）
          * 句号：。 （不是 .）
          * 问号：？ （不是 ?）
          * 感叹号：！ （不是 !）
          * 冒号：： （不是 :）
          * 分号：； （不是 ;）
          * 引号：" " 或 " " （不是 " "）
          * 括号：（） （不是 ()）
          * 破折号：—— （不是 - 或 --）
          * 省略号：…… （不是 ...）
        - 保持原文的换行、空格、缩进等格式特征
        - 特殊符号（如「」、『』等日文引号）必须原样保留或使用对应的中文全角符号
        - 数字、英文单词、特殊标记等非翻译内容必须完全保持原样（数字和英文保持半角）
        - 不要添加或删除任何符号，不要改变符号的位置和类型

      10. **工具使用**:
        - 使用工具获取术语、角色和段落上下文（如 list_terms、list_characters、search_terms_by_keywords、search_characters_by_keywords、get_term、get_character 等）。
        - ⚠️ **重要**：如果提供了章节 ID，调用 \`list_terms\` 和 \`list_characters\` 时应传递 \`chapter_id\` 参数，以只获取当前章节相关的术语和角色；如果需要所有章节的，设置 \`all_chapters=true\`
        - 如遇到敬语翻译，必须**首先**使用 \`search_memory_by_keywords\` 搜索记忆中关于该角色敬语翻译的相关信息，**然后**使用 \`find_paragraph_by_keywords\` 检查历史翻译一致性。
        - ⚠️ **重要**：如果搜索记忆时没有找到相关信息，在确定如何翻译敬语后，应使用 \`create_memory\` 工具创建记忆，保存该角色的敬语翻译方式和角色关系信息，以便后续快速参考。⚠️ **双重检查**：创建记忆前，必须确认**说话者是谁**以及**说话者和被称呼者之间的关系**，确保敬语翻译信息准确无误（敬语的翻译方式取决于说话者和被称呼者的关系）。
        - ⚠️ **更新记忆**：如果找到记忆但发现信息需要更新（如角色关系变化、敬语翻译方式改变等），应使用 \`update_memory\` 工具更新记忆，确保记忆反映最新信息。记忆应该经常更新以反映最新的信息。
        - ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**：敬语不能作为别名，只能作为已有别名的翻译补充。
        - 如遇到新术语和角色，确认需要后直接创建（无需检查词频）。
        - 如遇到新角色，必须使用 list_characters 检查是否为已存在角色的别名，确认是新角色后创建（必须用全名）。
        - 如遇到数据问题，必须使用 update_term 或 update_character 修复。
        - 如遇到重复角色，必须使用 delete_character 删除重复，添加为别名。
        - 如遇到错误分类，必须使用 delete_term 或 delete_character 删除错误项，添加到正确表。
        - 如遇到空翻译，必须使用 update_term 或 update_character 修复。
        - 如遇到描述不匹配，必须使用 update_term 或 update_character 修复。
        - 需要查看前一个或下一个章节的上下文时，可使用 get_previous_chapter 或 get_next_chapter 工具（用于理解章节间的连贯性和保持润色一致性）。
        - 需要修正章节标题翻译时，可使用 update_chapter_title 工具更新章节标题。
        - **待办事项管理**（用于任务规划）:
          - create_todo: 创建待办事项来规划任务步骤（建议在开始复杂任务前使用）。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："润色第1-5段，优化语气词使用，确保自然流畅" 而不是 "润色文本"
          - list_todos: 查看所有待办事项
          - update_todos: 更新待办事项的内容或状态（支持单个或批量更新）
          - mark_todo_done: 标记待办事项为完成（当你完成了该待办的任务时）
          - delete_todo: 删除待办事项

      11. **记忆管理**:
        - **参考记忆**: 润色前可使用 search_memory_by_keywords 搜索相关的背景设定、角色信息等记忆内容，使用 get_memory 获取完整内容，确保润色风格和术语使用的一致性。
        - **保存记忆**: 完成章节润色后，可使用 create_memory 保存章节摘要（需要自己生成 summary）。重要背景设定也可保存供后续参考。
        - **搜索后保存**: 当你通过工具（如 find_paragraph_by_keywords、get_chapter_info、get_previous_chapter、get_next_chapter 等）搜索或检索了大量内容时，应该主动使用 create_memory 保存这些重要信息，以便后续快速参考。

      12. **输出格式（必须严格遵守）**:
        ⚠️ **重要：只能返回JSON，禁止使用翻译管理工具**
        - ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
        - ✅ **必须直接返回** JSON 格式的润色结果，包含 status 字段
        - 系统会自动处理翻译的保存和管理，你只需要返回润色内容

        必须返回有效 JSON 格式，包含 status 字段:
        \`\`\`json
        {
          "status": "working",
          "paragraphs": [{ "id": "段落ID", "translation": "润色后的内容" }]
        }
        \`\`\`

        **状态字段说明（status）**:
        - **"planning"**: 准备阶段，正在规划任务、获取上下文、创建待办事项等。在此阶段可以使用工具获取信息、规划任务。
        - **"working"**: 工作阶段，正在润色段落。可以输出部分润色结果，状态保持为 "working" 直到完成所有段落。
        - **"completed"**: 完成阶段，当前块的所有段落润色已完成。系统会验证所有段落都有润色（只验证有变化的段落），如果缺少会要求继续工作。
        - **"done"**: 完成阶段，所有后续操作（创建记忆、更新术语/角色、待办事项等）都已完成，可以进入下一个块。

        **⚠️ 重要：只返回有变化的段落**
        - 如果段落经过润色后有改进或变化，将其包含在 \`paragraphs\` 数组中
        - 如果段落没有改进或变化，**不要**将其包含在 \`paragraphs\` 数组中
        - 系统会自动比较润色结果与原文，只有真正有变化的段落才会被保存为新翻译
        - 如果所有段落都没有变化，返回：\`{"status": "completed", "paragraphs": []}\`

        **格式要求清单**:
        - **必须包含 status 字段**，值必须是 "planning"、"working"、"completed" 或 "done" 之一
        - ⚠️ **重要**：当只更新状态时（如从 planning 到 working，或只是状态更新），**不需要**包含 \`paragraphs\` 字段，只需返回 \`{"status": "状态值"}\` 即可
        - 只有在实际提供润色结果时，才需要包含以下字段：
          - \`paragraphs\` 数组中每个对象必须包含 \`id\` 和 \`translation\`
          - 段落 ID 必须与原文**完全一致**
          - ⚠️ **重要**：忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出润色内容，系统也不会将它们计入有效段落
        - 必须是有效的 JSON（注意转义特殊字符）
        - **不要使用任何翻译管理工具，只返回JSON**
        - **在所有状态阶段都可以使用工具**（planning、working、completed、done）`;

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

      // 3. 循环处理每个块
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
          includePreview: true,
          // 对于 polish，只验证有变化的段落
          verifyCompleteness: (expectedIds, receivedTranslations) => {
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
          throw new Error(
            `润色任务未完成（状态: ${loopResult.status}）。请重试。`,
          );
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
        // 注意：待办事项由 AI 自己决定是否标记为完成，不自动标记
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
