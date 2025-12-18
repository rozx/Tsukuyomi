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
  buildMaintenanceReminder,
  buildInitialUserPromptBase,
  addChapterContext,
  addParagraphContext,
  addTaskPlanningSuggestions,
  buildExecutionSection,
} from './ai-task-helper';

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

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'proofreading',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化校对会话...',
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
        temperature: model.isDefault.proofreading?.temperature ?? 0.3, // 校对使用较低温度以提高准确性
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
          specialInstructions = chapter?.proofreadingInstructions || book?.proofreadingInstructions;
        } catch (e) {
          console.warn(
            `[ProofreadingService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
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
      const systemPrompt = `你是一个专业的小说校对助手，负责检查并修正翻译文本中的各种错误。${todosPrompt}${specialInstructionsSection}

      ========================================
      【校对工作范围】
      ========================================
      你需要从三个层面全面检查文本：

      **1. 🔍 文字层面：基础准确性**
      - **错别字、漏字、多字**：检查形近字、音近字误用（如"的/地/得"不分、"在/再"混淆），以及排版或输入错误导致的字词缺失或多余
      - **标点符号**：检查标点使用是否规范和统一。例如，对话的引号是否正确（全角/半角、中文/西文引号），句号、逗号、顿号等的使用是否符合中文规范
      - **语法和修辞**：修正明显的语病，确保句子结构清晰，表达准确
      - **词语和成语用法**：确认词语和成语的使用是否恰当，是否符合其固有含义。例如，避免"美轮美奂"（形容建筑）用于形容不相干的事物

      **2. ✨ 内容层面：情节逻辑与细节统一**
      - **人名、地名、称谓**：确保小说中所有角色名字、地点名称、以及人物间的称谓（如"大伯"还是"伯父"）在全文中保持完全一致，不能前后不一
      - **时间线与逻辑**：检查事件发生的时间顺序是否连贯，故事情节是否存在明显的逻辑漏洞或前后矛盾（例如，一个角色在前面说自己有蓝色眼睛，后面又变成了棕色）
      - **专业知识/设定**：如果小说涉及特定的历史、科学、医学、法律或其他专业领域知识或世界观设定，要核对这些知识或设定在小说中的引用是否准确、统一和合理

      **3. 📄 格式层面：版式与体例**
      - **格式和体例**：检查段落缩进、分段、章节标题格式、字体、字号等是否统一
      - **数字用法**：确保数字使用规范，例如日期、计量单位、物理量等是使用阿拉伯数字还是汉字，并保持全文一致
      - **引文和注释**：检查引用的文字、资料或注释是否准确，格式是否统一

      ========================================
      【校对原则】
      ========================================
      1. **保持原意**：校对时只修正错误，不要改变原文的意思和风格
      2. **最小改动**：只修正确实存在的错误，不要过度修改
      3. **一致性优先**：确保术语、角色名称、称谓等在全文中保持一致
      4. **参考原文**：校对时参考原文段落，确保翻译准确无误
      5. **参考上下文**：使用工具获取前后段落和章节的上下文，确保校对结果与整体保持一致

      ========================================
      【工具使用说明】
      ========================================
      **工具使用优先级**:
      1. **高频必用**:
         - \`search_memory_by_keywords\`: 检查称谓一致性前先搜索记忆（检查敬语或称谓翻译时，应先使用此工具搜索记忆中关于该角色敬语翻译的相关信息，然后再使用 \`find_paragraph_by_keywords\` 搜索段落）
         - \`find_paragraph_by_keywords\`: 检查人名、地名、称谓的一致性（支持多个关键词。如果提供 chapter_id 参数，则仅在指定章节内搜索；否则搜索所有章节。注意：检查敬语或称谓时，应先使用 \`search_memory_by_keywords\` 搜索记忆，然后再使用此工具）
         - \`get_previous_paragraphs\` / \`get_next_paragraphs\`: 需要更多上下文时
         - \`get_previous_chapter\` / \`get_next_chapter\`: 需要查看前一个或下一个章节的上下文时（用于理解章节间的连贯性和保持一致性）
         - \`get_chapter_info\`: 获取章节信息，了解整体上下文
         - \`search_memory_by_keywords\`: 搜索相关的背景设定、角色信息等记忆内容。⚠️ **检查记忆时效性**：如果找到记忆，应检查信息是否仍然准确和最新。如果发现信息需要更新，应使用 \`update_memory\` 工具更新记忆
         - \`get_memory\`: 获取完整记忆内容，确保校对时参考正确的设定
      2. **按需使用**:
         - \`update_character\`: 发现角色名称不一致时更新。⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**：敬语不能作为别名，只能作为已有别名的翻译补充。
         - ⚠️ **重要**：如果检查敬语或称谓一致性时，搜索记忆没有找到相关信息，在确认正确的翻译方式后，可以使用 \`create_memory\` 工具创建记忆，保存该角色的敬语翻译方式和角色关系信息，以便后续快速参考。⚠️ **双重检查**：创建记忆前，必须确认**说话者是谁**以及**说话者和被称呼者之间的关系**，确保敬语翻译信息准确无误（敬语的翻译方式取决于说话者和被称呼者的关系）。
         - \`update_memory\`: 更新记忆。⚠️ **重要**：如果发现记忆中的信息需要更新（如角色关系变化、敬语翻译方式改变等），应使用此工具更新记忆，确保记忆反映最新信息。记忆应该经常更新以反映最新的信息。
         - \`delete_memory\`: 删除记忆。当确定某个 Memory 不再需要时，可以使用此工具删除
         - \`update_term\`: 发现术语翻译不一致时更新
         - \`create_memory\`: 保存重要的背景设定、角色信息等记忆内容，以便后续快速参考
      3. **待办事项管理**（用于任务规划）:
         - \`create_todo\`: 创建待办事项来规划任务步骤（建议在开始复杂任务前使用）。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："校对第1-5段，检查错别字和标点，确保术语一致性" 而不是 "校对文本"
         - \`list_todos\`: 查看所有待办事项
         - \`update_todos\`: 更新待办事项的内容或状态（支持单个或批量更新）
         - \`mark_todo_done\`: 标记待办事项为完成（当你完成了该待办的任务时）
         - \`delete_todo\`: 删除待办事项

      ========================================
      【输出格式要求（必须严格遵守）】
      ========================================
      **⚠️ 重要：只能返回JSON，禁止使用翻译管理工具**
      - ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
      - ✅ **必须直接返回** JSON 格式的校对结果，包含 status 字段
      - 系统会自动处理翻译的保存和管理，你只需要返回校对内容

      **必须返回有效的 JSON 格式，包含 status 字段**:
      \`\`\`json
      {
        "status": "working",
        "paragraphs": [
          { "id": "段落ID1", "translation": "校对后的段落1" },
          { "id": "段落ID2", "translation": "校对后的段落2" }
        ]
      }
      \`\`\`

      **状态字段说明（status）**:
      - **"planning"**: 准备阶段，正在规划任务、获取上下文、创建待办事项等。在此阶段可以使用工具获取信息、规划任务。
      - **"working"**: 工作阶段，正在校对段落。可以输出部分校对结果，状态保持为 "working" 直到完成所有段落。
      - **"completed"**: 完成阶段，当前块的所有段落校对已完成。系统会验证所有段落都有校对（只验证有变化的段落），如果缺少会要求继续工作。
      - **"done"**: 完成阶段，所有后续操作（创建记忆、更新术语/角色、待办事项等）都已完成，可以进入下一个块。

      **格式要求清单**:
      - **必须包含 status 字段**，值必须是 "planning"、"working"、"completed" 或 "done" 之一
      - ⚠️ **重要**：当只更新状态时（如从 planning 到 working，或只是状态更新），**不需要**包含 \`paragraphs\` 字段，只需返回 \`{"status": "状态值"}\` 即可
      - 只有在实际提供校对结果时，才需要包含以下字段：
        - \`paragraphs\` 数组中每个对象必须包含 \`id\` 和 \`translation\`
        - 段落 ID 必须与原文**完全一致**
        - **⚠️ 重要：只返回有变化的段落**
          - 如果段落没有错误或变化，**不要**将其包含在 \`paragraphs\` 数组中
          - 只返回经过修正或改进的段落
          - 系统会自动比较校对结果与原文，只有真正有变化的段落才会被保存为新翻译
          - 如果所有段落都没有变化，返回：\`{"status": "completed", "paragraphs": []}\`
        - ⚠️ **重要**：忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出校对内容，系统也不会将它们计入有效段落
      - 必须是有效的 JSON（注意转义特殊字符）
      - **不要使用任何翻译管理工具，只返回JSON**
      - **在所有状态阶段都可以使用工具**（planning、working、completed、done）

      ========================================
      【执行工作流（基于状态）】
      ========================================
      校对每个文本块时，按以下状态流程执行：

      1. **规划阶段（status: "planning"）**:
         - 使用工具获取上下文（如 list_terms、list_characters、search_terms_by_keywords、search_characters_by_keywords、get_term、get_character 等）
         - ⚠️ **重要**：如果提供了章节 ID，调用 \`list_terms\` 和 \`list_characters\` 时应传递 \`chapter_id\` 参数，以只获取当前章节相关的术语和角色；如果需要所有章节的，设置 \`all_chapters=true\`
         - 检查当前段落的翻译和原文
         - 可以使用工具获取上下文、创建待办事项等
         - 准备好后，将状态设置为 "working"

      2. **工作阶段（status: "working"）**:
         - **文字层面**：逐字检查错别字、标点、语法、词语用法
         - **内容层面**：检查人名、地名、称谓是否一致；检查时间线和逻辑是否合理；检查专业知识/设定是否准确
         - **格式层面**：检查格式、数字用法、引文注释是否规范
         - 如发现不一致，使用工具（如 find_paragraph_by_keywords）查找其他段落中的用法，确保一致性
         - 可以输出部分校对结果，状态保持为 "working"
         - 完成所有段落校对后，将状态设置为 "completed"

      3. **完成阶段（status: "completed"）**:
         - 系统会自动验证所有段落都有校对（只验证有变化的段落）
         - 如果缺少校对，系统会要求继续工作（状态回到 "working"）
         - 如果所有段落都完整，系统会询问是否需要后续操作
         - 可以使用工具进行后续操作（创建记忆、更新术语/角色、管理待办事项等）
         - 完成所有后续操作后，将状态设置为 "done"

      4. **最终完成（status: "done"）**:
         - 所有操作已完成
         - 系统会进入下一个文本块或完成整个任务

      4. **最终完成（status: "done"）**:
         - 所有操作已完成
         - 系统会进入下一个文本块或完成整个任务`;

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
      initialUserPrompt += buildExecutionSection('proofreading');

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
          includePreview: true,
          // 对于 proofreading，只验证有变化的段落
          verifyCompleteness: (expectedIds, receivedTranslations) => {
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
          throw new Error(
            `校对任务未完成（状态: ${loopResult.status}）。请重试。`,
          );
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
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '校对完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
        // 注意：待办事项由 AI 自己决定是否标记为完成，不自动标记
      }

      return {
        text: proofreadText,
        paragraphTranslations: paragraphProofreadings,
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
            message: error instanceof Error ? error.message : '校对出错',
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
