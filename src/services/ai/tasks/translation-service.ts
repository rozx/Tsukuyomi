import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  AIToolCallResult,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph, Novel, Chapter } from 'src/models/novel';
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
import { getTodosSystemPrompt } from './todo-helper';
import {
  executeToolCallLoop,
  checkMaxTurnsReached,
  type AIProcessingStore,
} from './ai-task-helper';

/**
 * 翻译服务选项
 */
export interface TranslationServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收翻译过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收翻译进度更新
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
   * 段落翻译回调函数，用于接收每个块完成后的段落翻译结果
   * @param translations 段落翻译数组，包含段落ID和翻译文本
   */
  onParagraphTranslation?: (
    translations: { id: string; translation: string }[],
  ) => void | Promise<void>;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
  /**
   * 章节标题（可选），如果提供，将一起翻译
   */
  chapterTitle?: string;
  /**
   * 章节 ID（可选），如果提供，将在上下文中提供给 AI
   */
  chapterId?: string;
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

export interface TranslationResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  titleTranslation?: string;
  actions?: ActionInfo[];
}

/**
 * 翻译服务
 * 使用 AI 服务进行文本翻译，支持术语 CRUD 工具
 */
export class TranslationService {
  static readonly CHUNK_SIZE = 2500;

  /**
   * 检查文本是否只包含符号（不是真正的文本内容）
   * @param text 要检查的文本
   * @returns 如果只包含符号，返回true
   */
  private static isOnlySymbols(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return true;
    }

    // 移除所有空白字符
    const trimmed = text.trim();

    // 检查是否只包含标点符号、数字、特殊符号等
    // 允许的字符：日文假名、汉字、英文字母
    const hasContent =
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u20000-\u2A6DFa-zA-Z]/.test(trimmed);

    return !hasContent;
  }

  /**
   * 处理工具调用
   * @param toolCall 工具调用对象
   * @param bookId 书籍 ID
   * @param onAction 操作回调
   * @returns 工具调用结果
   */
  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
    taskId?: string,
  ): Promise<AIToolCallResult> {
    return ToolRegistry.handleToolCall(toolCall, bookId, onAction, onToast, taskId);
  }

  /**
   * 翻译文本
   * @param content 要翻译的段落列表
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    content: Paragraph[],
    model: AIModel,
    options?: TranslationServiceOptions,
  ): Promise<TranslationResult> {
    console.log('[TranslationService] 🚀 开始翻译任务', {
      段落数量: content?.length || 0,
      有效段落数: content?.filter((p) => p.text?.trim()).length || 0,
      AI模型: model.name,
      AI提供商: model.provider,
      书籍ID: options?.bookId || '无',
      章节标题: options?.chapterTitle || '无',
      是否使用工具: !!options?.bookId,
    });

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      chapterTitle,
      chapterId,
      aiProcessingStore,
      onParagraphTranslation,
      onToast,
    } = options || {};
    const actions: ActionInfo[] = [];
    let titleTranslation: string | undefined;

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

    if (!content || content.length === 0) {
      throw new Error('要翻译的内容不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'translation',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化翻译会话...',
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
        temperature: model.isDefault.translation?.temperature ?? 0.7,
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
          specialInstructions = chapter?.translationInstructions || book?.translationInstructions;
        } catch (e) {
          console.warn(
            `[TranslationService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
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
      const systemPrompt = `你是一个专业的日轻小说翻译助手，负责将日语轻小说翻译为自然流畅的简体中文。${todosPrompt}${specialInstructionsSection}

      ========================================
      【翻译基本原则】
      ========================================
      1. **目标语言**: 简体中文
      2. **翻译风格**: 符合轻小说习惯，自然流畅
      3. **段落对应**: 严格保证 1:1 对应（1个原文段落 = 1个翻译段落）
      4. **术语一致性**: 使用术语表和角色设定表确保翻译一致性
      5. **语气词使用**:
         - 适当地添加语气词（"呀"、"呢"、"吧"、"啊"等）以增强语气
         - 不要过度使用，以免影响流畅性
         - 根据角色的说话风格（speaking_style）准确翻译，不使用与角色不符的语气词
      6. **原文参考**: 参考前面段落或者章节的原文和翻译，确保翻译的一致性，不要出现前后矛盾的情况。
      7. **标题翻译**: 翻译标题时请参考以前章节的标题翻译，确保翻译格式的一致性。可以使用 \`get_previous_chapter\` 工具查看前一个章节的标题翻译作为参考。

      ========================================
      【敬语翻译工作流（必须严格执行）】
      ========================================
      遇到包含敬语的文本时，必须按以下顺序执行：

      **步骤 1: 检查角色别名翻译（最高优先级）**
      - 在【相关角色参考】中查找该角色的 \`aliases\` 列表
      - 如果文本中的角色名称（带敬语）与某个别名**完全匹配**，且该别名已有翻译（\`translation\` 字段），**必须直接使用该翻译**
      - 如果别名中包含敬语但翻译为空，应使用 \`update_character\` 工具补充该别名的翻译
      - ⚠️ **禁止自动创建新的敬语别名**

      **步骤 2: 查看角色设定**
      - 如果别名中没有找到匹配的翻译，查看【相关角色参考】中角色的 \`description\` 字段
      - 角色描述应包含**角色关系信息**（如"主角的妹妹"、"同班同学"、"上司"等）
      - 如果描述中缺少关系信息，应使用 \`update_character\` 工具补充

      **步骤 3: 检查历史翻译一致性（必须执行）**
      - 使用 \`find_paragraph_by_keywords\` 工具搜索该角色在之前段落中的翻译
      - 如果提供 chapter_id 参数，则仅在指定章节内搜索；如果不提供，则搜索所有章节（从开头到当前）
      - 如果找到之前的翻译，**必须保持一致**

      **步骤 4: 应用角色关系**
      - 根据角色描述中的关系信息决定翻译方式：
        * 亲密关系（妹妹、青梅竹马、好友）→ 可考虑省略敬语或使用亲密称呼
        * 正式关系（上司、老师、长辈）→ 必须保留敬语并翻译为相应中文敬语
        * 不明确关系 → 根据对话场景和上下文判断

      **步骤 5: 翻译并保持一致性**
      - 根据以上步骤确定翻译方式后进行翻译
      - **不要**自动添加新的别名
      - 如果用户希望固定某个敬语翻译为别名，应由用户手动添加

      ========================================
      【术语管理工作流】
      ========================================
      **⚠️ 核心规则: 术语与角色严格分离**
      - ✅ 术语表：专有名词、特殊概念、技能、地名、物品等
      - ❌ 术语表中**绝对不能**包含角色名称（人名）
      - ✅ 角色表：人物、角色名称、别名
      - ❌ 角色表中**绝对不能**包含术语

      **翻译前检查**:
      1. 检查【相关术语参考】中的术语
      2. 确认术语/角色分离正确
      3. 检查空翻译 → 使用 \`update_term\` 立即更新
      4. 检查描述匹配 → 使用 \`update_term\` 更新

      **翻译中处理**:
      1. 发现空翻译 → 立即使用 \`update_term\` 更新
      2. 发现需要新术语 → 先使用 \`get_occurrences_by_keywords\` 检查词频（≥3次才添加）
      3. 确认需要后使用 \`create_term\` 创建

      **术语创建原则**:
      - ✅ 应该添加：特殊用法（如网络用语、网络梗、流行语等）、专有名词、特殊概念、反复出现（≥3次）且翻译固定的词汇
      - ❌ 不应该添加：仅由汉字组成且无特殊含义的普通词汇、常见助词、通用词汇、出现次数<3次的词汇

      **术语维护**:
      - 发现误分类的角色名称 → \`delete_term\` + \`create_character\`
      - 发现无用术语 → 使用 \`get_occurrences_by_keywords\` 确认词频后 \`delete_term\`
      - 发现重复术语 → \`delete_term\` 删除重复项

      ========================================
      【角色管理工作流】
      ========================================
      **核心规则**:
      - **主名称 (\`name\`)**: 必须是**全名**（如 "田中太郎"）
      - **别名 (\`aliases\`)**: 名字或姓氏的**单独部分**（如 "田中"、"太郎"），或带敬语的称呼（如 "田中さん"）

      **翻译前检查**:
      1. 检查【相关角色参考】中的角色
      2. 确认术语/角色分离正确
      3. 检查空翻译 → 使用 \`update_character\` 立即更新
      4. 检查描述/口吻 → 使用 \`update_character\` 更新
      5. 检查重复角色 → 合并（删除重复，添加为别名）

      **翻译中处理**:
      1. 遇到新角色 → ⚠️ **先检查是否为已存在角色的别名**
         - 使用 \`list_characters\` 或 \`get_character\` 检查
         - 如果是全名且不存在 → 创建新角色（包含别名）
         - 如果是单独部分 → 检查是否为已存在角色的别名
      2. 发现别名 → 使用 \`update_character\` 添加（⚠️ 先使用 \`list_characters\` 检查冲突）
      3. 发现重复角色 → \`delete_character\` 删除重复，然后 \`update_character\` 添加为别名
      4. 描述需补充 → 使用 \`update_character\` 更新
      5. 发现特殊称呼 → 使用 \`update_character\` 更新

      **角色创建原则**:
      - 创建前必须检查：使用 \`list_characters\` 或 \`get_character\` 确认是否已存在
      - 判断是全名还是别名：全名创建新角色，部分名检查是否为别名
      - 创建时必须包含别名（如果已知）

      **角色更新原则**:
      1. **更新空翻译**: 发现翻译为空时立即使用 \`update_character\` 更新
      2. **更新别名**:
         - 先使用 \`list_characters\` 检查别名是否属于其他角色（避免冲突）
         - 确认不冲突后使用 \`update_character\` 添加
         - ⚠️ 更新别名时，数组中只能包含该角色自己的别名
      3. **更新描述**:
         - 描述应包含：角色身份、角色性别（对代词翻译很重要）、角色关系（对敬语翻译很重要）、角色特征
         - 发现描述为空或不匹配时立即更新
      4. **更新说话口吻**: 发现角色有独特语气、口癖时更新 \`speaking_style\`

      **角色删除与合并**:
      - 误分类的术语 → \`delete_character\` + \`create_term\`
      - 重复角色 → 删除重复，添加为别名
      - 主名称不是全名 → 更新为全名，原名称改为别名

      ========================================
      【工具使用说明】
      ========================================
      **自动提供的参考**:
      - 【相关术语参考】: 当前段落中出现的术语（可直接使用，无需调用工具）
      - 【相关角色参考】: 当前段落中出现的角色（可直接使用，无需调用工具）

      **工具使用优先级**:
      1. **高频必用**:
         - \`find_paragraph_by_keywords\`: 敬语翻译、术语一致性检查（翻译敬语前必须使用，支持多个关键词。如果提供 chapter_id 参数，则仅在指定章节内搜索；否则搜索所有章节）
         - \`update_character\`: 补充翻译、添加别名、更新描述
         - \`update_term\`: 补充术语翻译
         - \`list_characters\`: 检查别名冲突、查找重复角色
         - \`create_memory\`: 保存记忆，用于保存背景设定、角色信息等记忆内容，每当翻译完成后，应该主动使用 \`create_memory\` 保存这些重要信息，以便后续快速参考
      2. **按需使用**:
         - \`create_character\` / \`create_term\`: 确认需要时创建
         - \`delete_character\` / \`delete_term\`: 清理无用或重复项
         - \`get_occurrences_by_keywords\`: 决定术语添加/删除前确认词频
         - \`get_previous_paragraphs\` / \`get_next_paragraphs\`: 需要更多上下文时
         - \`get_previous_chapter\` / \`get_next_chapter\`: 需要查看前一个或下一个章节的上下文时（用于理解章节间的连贯性和保持翻译一致性）
         - \`update_chapter_title\`: 更新章节标题（用于修正章节标题翻译，确保翻译格式的一致性）
      3. **待办事项管理**（用于任务规划）:
         - \`create_todo\`: 创建待办事项来规划任务步骤（建议在开始复杂任务前使用）。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："翻译第1-5段，检查术语一致性，确保角色名称翻译一致" 而不是 "翻译文本"
         - \`list_todos\`: 查看所有待办事项
         - \`update_todo\`: 更新待办事项的内容或状态
         - \`mark_todo_done\`: 标记待办事项为完成（当你完成了该待办的任务时）
         - \`delete_todo\`: 删除待办事项

      ========================================
      【记忆管理工作流】
      ========================================
      1. **参考记忆**:
         - 翻译前可使用 \`search_memory_by_keywords\` 搜索相关的背景设定、角色信息等记忆内容
         - 使用 \`get_memory\` 获取完整内容，确保翻译风格和术语使用的一致性
      2. **保存记忆**:
         - 完成章节或者某个情节翻译后，推荐可使用 \`create_memory\` 保存章节摘要（需要自己生成 summary）
         - 重要背景设定也可保存供后续参考
      3. **搜索后保存**:
         - 当你通过工具（如 \`find_paragraph_by_keywords\`、\`get_chapter_info\`、\`get_previous_chapter\`、\`get_next_chapter\` 等）搜索或检索了大量内容时，应该主动使用 \`create_memory\` 保存这些重要信息，以便后续快速参考

      ========================================
      【输出格式要求（必须严格遵守）】
      ========================================
      **⚠️ 重要：只能返回JSON，禁止使用翻译管理工具**
      - ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
      - ✅ **必须直接返回** JSON 格式的翻译结果
      - 系统会自动处理翻译的保存和管理，你只需要返回翻译内容

      **必须返回有效的 JSON 格式**:
      \`\`\`json
      {
        "paragraphs": [
          { "id": "段落ID1", "translation": "段落1的翻译" },
          { "id": "段落ID2", "translation": "段落2的翻译" }
        ],
        "titleTranslation": "章节标题翻译（仅当提供标题时）"
      }
      \`\`\`

      **格式要求清单**:
      - 如果有章节标题，必须包含 \`titleTranslation\` 字段
      - \`paragraphs\` 数组中每个对象必须包含 \`id\` 和 \`translation\`
      - 段落 ID 必须与原文**完全一致**
      - 段落数量必须**1:1 对应**（不能合并或拆分段落）
      - 必须是有效的 JSON（注意转义特殊字符）
      - 确保 \`paragraphs\` 数组包含所有输入段落的 ID 和对应翻译
      - **不要使用任何翻译管理工具，只返回JSON**

      ========================================
      【执行工作流】
      ========================================
      翻译每个文本块时，按以下步骤执行：

      1. **准备阶段**:
         - 仔细阅读【相关术语参考】和【相关角色参考】
         - 检查术语/角色分离是否正确
         - 检查是否有空翻译需要补充
         - 检查是否有描述不匹配需要更新

      2. **翻译阶段**:
         - 逐段翻译，确保 1:1 对应
         - 遇到敬语时，严格按照【敬语翻译工作流】执行
         - 遇到新术语时，先检查词频，确认需要后创建
         - 遇到新角色时，先检查是否为别名，确认是新角色后创建
         - 发现数据问题（空翻译、描述不匹配、重复项）时立即修复

      3. **验证阶段**:
         - 确保所有段落都有翻译
         - 确保段落 ID 完全对应
         - 确保 JSON 格式有效
         - 确保术语和角色翻译与参考资料一致
         - 确保翻译与原文格式一致，如换行符、标点符号等

      4. **输出阶段**:
         - 返回符合格式要求的 JSON
         - 确保所有输入段落都在 \`paragraphs\` 数组中
         - 如有章节标题，必须包含 \`titleTranslation\` 字段
         - 确保 JSON 格式有效`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      let initialUserPrompt = `开始翻译任务。`;

      // 如果提供了章节ID，添加到上下文中
      if (chapterId) {
        initialUserPrompt += `\n\n**当前章节 ID**: \`${chapterId}\`\n你可以使用工具（如 get_chapter_info、get_previous_chapter、get_next_chapter、find_paragraph_by_keywords 等）获取该章节的上下文信息，以确保翻译的一致性和连贯性。`;
      }

      initialUserPrompt += `

      【任务规划建议】
      - 如果需要规划复杂的翻译任务，你可以使用 \`create_todo\` 工具创建待办事项来规划步骤
      - 例如：为大型章节创建待办事项来跟踪翻译进度、术语检查、角色一致性检查等子任务
      - ⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："翻译第1-5段，检查术语一致性，确保角色名称翻译一致" 而不是 "翻译文本"

      【执行清单（按顺序执行）】
      1. **准备阶段**:
         - 仔细阅读【相关术语参考】和【相关角色参考】
         - 检查术语/角色分离是否正确（术语表中不能有人名，角色表中不能有术语）
         - 检查是否有空翻译（translation 为空）→ 立即使用工具更新
         - 检查是否有描述不匹配 → 立即使用工具更新
         - 检查是否有重复角色 → 合并（删除重复，添加为别名）

      2. **翻译阶段**:
         - 逐段翻译，严格保证 1:1 段落对应
         - 遇到敬语时，严格按照工作流执行：
           (1) 检查角色别名翻译（最高优先级）
           (2) 查看角色设定（description 中的关系信息）
           (3) 使用 find_paragraph_by_keywords 检查历史翻译一致性（必须执行）
           (4) 应用角色关系判断
           (5) 翻译并保持一致性，特别是换行符、标点符号等。
         - 遇到新术语时：先使用 get_occurrences_by_keywords 检查词频（≥3次才添加），确认需要后创建
         - 遇到新角色时：先使用 list_characters 检查是否为已存在角色的别名，确认是新角色后创建（必须用全名）
         - 发现数据问题（空翻译、描述不匹配、重复项、错误分类）时立即使用工具修复

      3. **验证阶段**:
         - 确保所有段落都有翻译（检查 paragraphs 数组是否包含所有输入段落的 ID）
         - 确保段落 ID 完全对应
         - 确保术语和角色翻译与参考资料一致

      4. **输出阶段**:
         - 返回符合格式要求的 JSON
         - 确保所有输入段落都在 paragraphs 数组中
         - 如果有章节标题，必须包含 titleTranslation 字段

      ⚠️ **关键提醒**:
      - 敬语翻译：别名匹配 > 角色关系 > 历史记录。禁止自动创建敬语别名。
      - 数据维护：严禁人名入术语表。发现空翻译立即修复。
      - 一致性：严格遵守已有术语/角色翻译。
      - 格式：保持 JSON 格式，段落 ID 对应，1:1 段落对应。`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = TranslationService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        context?: string;
        paragraphIds?: string[];
      }> = [];

      // 计算全文的角色出现得分，用于消歧义
      let characterScores: Map<string, number> | undefined;
      if (book && book.characterSettings) {
        const fullText = content.map((p) => p.text).join('\n');
        characterScores = calculateCharacterScores(fullText, book.characterSettings);
      }

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];

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

      for (const paragraph of content) {
        // 跳过空段落（原始文本为空或只有空白字符）
        if (!paragraph.text || paragraph.text.trim().length === 0) {
          continue;
        }

        // 格式化段落：[ID: {id}] {text}
        const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n\n`;

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
          context: getContext(currentChunkParagraphs, book),
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
        });
      }

      let translatedText = '';
      const paragraphTranslations: { id: string; translation: string }[] = [];

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
        const chunkContext = chunk.context || '';

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在翻译第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 翻译块 ${i + 1}/${chunks.length} ===]\n\n`,
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
        let content = '';
        const maintenanceReminder = `
        ⚠️ **关键提醒（每个文本块都必须遵守）**:
        1. **敬语翻译工作流（必须严格执行）**:
           - 步骤1: 检查角色别名翻译（最高优先级，必须首先执行）
           - 步骤2: 查看角色设定（description 中的关系信息）
           - 步骤3: 使用 find_paragraph_by_keywords 检查历史翻译一致性（必须执行）
           - 步骤4: 应用角色关系判断
           - 步骤5: 翻译并保持一致性
           - ⚠️ 禁止自动创建敬语别名
        2. **数据维护（发现问题时立即修复）**:
           - 术语/角色严格分离：严禁人名入术语表，严禁术语入角色表
           - 发现空翻译（translation 为空）→ 立即使用 update_term 或 update_character 修复
           - 发现描述不匹配 → 立即使用工具更新
           - 发现重复角色 → 删除重复，添加为别名
           - 发现错误分类 → 删除错误项，添加到正确表
        3. **一致性要求**:
           - 严格遵守已有术语/角色翻译
           - 使用 find_paragraph_by_keywords 确保敬语翻译一致性
           - 新术语创建前必须检查词频（≥3次才添加）
           - 新角色创建前必须检查是否为别名
        4. **输出格式（必须严格遵守）**:
           - 保持 JSON 格式，段落 ID 完全对应
           - 确保 1:1 段落对应（不能合并或拆分段落）
           - paragraphs 数组必须包含所有输入段落的 ID 和对应翻译
        5. **待办事项管理**（可选，用于任务规划）:
           - 如果需要规划复杂的翻译任务，可以使用 create_todo 创建待办事项来规划步骤
           - ⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："翻译第1-5段，检查术语一致性，确保角色名称翻译一致" 而不是 "翻译文本"
           - 完成待办事项后，使用 mark_todo_done 将其标记为完成`;
        if (i === 0) {
          // 如果有标题，在第一个块中包含标题翻译
          const titleSection = chapterTitle ? `【章节标题】\n${chapterTitle}\n\n` : '';
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${titleSection}${chunkContext}${chunkText}${maintenanceReminder}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        }

        // 重试循环
        let retryCount = 0;
        let chunkProcessed = false;
        let finalResponseText: string | null = null;

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
                `[TranslationService] ⚠️ 检测到AI降级或错误，重试块 ${i + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
              );

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                });
              }
            }

            history.push({ role: 'user', content });

            // 使用共享的工具调用循环
            finalResponseText = await executeToolCallLoop({
              history,
              tools,
              generateText: service.generateText.bind(service),
              aiServiceConfig: config,
              taskType: 'translation',
              chunkText,
              paragraphIds: chunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'TranslationService',
              maxTurns: 10,
              includePreview: false,
            });

            // 检查是否在达到最大回合数后仍未获得翻译结果
            checkMaxTurnsReached(finalResponseText, 10, 'translation');

            // 解析 JSON 响应
            try {
              // 尝试提取 JSON
              const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
              let chunkTranslation = '';
              const extractedTranslations: Map<string, string> = new Map();

              // 如果是第一个块且有标题，尝试提取标题翻译（在 JSON 解析之前和之后都尝试）
              if (i === 0 && chapterTitle) {
                // 首先尝试从 JSON 中提取
                if (jsonMatch) {
                  try {
                    const jsonStr = jsonMatch[0];
                    const data = JSON.parse(jsonStr);
                    if (data.titleTranslation) {
                      titleTranslation = data.titleTranslation;
                    }
                  } catch {
                    // JSON 解析失败，稍后在外部 try-catch 中处理
                  }
                }

                // 如果 JSON 提取失败，尝试从文本中直接提取标题翻译
                if (!titleTranslation) {
                  // 尝试匹配 "titleTranslation": "..." 模式
                  const titleMatch = finalResponseText.match(/"titleTranslation"\s*:\s*"([^"]+)"/);
                  if (titleMatch && titleMatch[1]) {
                    titleTranslation = titleMatch[1];
                  }
                }
              }

              if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                try {
                  const data = JSON.parse(jsonStr);

                  // 如果是第一个块且有标题，再次尝试提取标题翻译（确保提取到最新值）
                  if (i === 0 && chapterTitle && data.titleTranslation) {
                    titleTranslation = data.titleTranslation;
                  }

                  // 优先使用 paragraphs 数组（结构化数据）
                  if (data.paragraphs && Array.isArray(data.paragraphs)) {
                    for (const para of data.paragraphs) {
                      if (para.id && para.translation) {
                        extractedTranslations.set(para.id, para.translation);
                      }
                    }

                    // 使用 translation 字段作为完整文本，如果没有则从 paragraphs 构建
                    if (data.translation) {
                      chunkTranslation = data.translation;
                    } else if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                      // 从 paragraphs 数组构建完整文本
                      const orderedTexts: string[] = [];
                      for (const paraId of chunk.paragraphIds) {
                        const translation = extractedTranslations.get(paraId);
                        if (translation) {
                          orderedTexts.push(translation);
                        }
                      }
                      chunkTranslation = orderedTexts.join('\n\n');
                    }
                  } else if (data.translation) {
                    // 后备方案：只有 translation 字段，尝试从字符串中提取段落ID
                    console.warn(
                      `[TranslationService] ⚠️ JSON中未找到paragraphs数组（块 ${i + 1}/${chunks.length}），将尝试从translation字符串中提取段落ID`,
                    );
                    chunkTranslation = data.translation;

                    // 尝试从字符串中提取段落ID（兼容旧格式）
                    const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
                    idPattern.lastIndex = 0;
                    let match;
                    while ((match = idPattern.exec(chunkTranslation)) !== null) {
                      const paragraphId = match[1]?.trim();
                      const translation = match[2]?.trim();
                      if (paragraphId && translation) {
                        extractedTranslations.set(paragraphId, translation);
                      }
                    }
                  } else {
                    console.warn(
                      `[TranslationService] ⚠️ AI响应JSON中未找到translation或paragraphs字段（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为翻译`,
                    );
                    chunkTranslation = finalResponseText;
                  }
                } catch (e) {
                  console.warn(
                    `[TranslationService] ⚠️ 解析AI响应JSON失败（块 ${i + 1}/${chunks.length}）`,
                    e instanceof Error ? e.message : String(e),
                  );
                  // JSON 解析失败，回退到原始文本处理
                  chunkTranslation = finalResponseText;
                }
              } else {
                // 不是 JSON，直接使用原始文本
                console.warn(
                  `[TranslationService] ⚠️ AI响应不是JSON格式（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为翻译`,
                );
                chunkTranslation = finalResponseText;
              }

              // 验证：检查当前块中的所有段落是否都有翻译
              const missingIds: string[] = [];
              if (chunk.paragraphIds && chunk.paragraphIds.length > 0) {
                for (const paraId of chunk.paragraphIds) {
                  if (!extractedTranslations.has(paraId)) {
                    missingIds.push(paraId);
                  }
                }
              }

              if (missingIds.length > 0) {
                console.warn(
                  `[TranslationService] ⚠️ 块 ${i + 1}/${chunks.length} 中缺失 ${missingIds.length}/${chunk.paragraphIds?.length || 0} 个段落的翻译`,
                  {
                    缺失段落ID:
                      missingIds.slice(0, 5).join(', ') +
                      (missingIds.length > 5 ? ` 等 ${missingIds.length} 个` : ''),
                    已提取翻译数: extractedTranslations.size,
                    预期段落数: chunk.paragraphIds?.length || 0,
                  },
                );
                // 如果缺少段落ID，使用完整翻译文本作为后备方案
                if (extractedTranslations.size === 0) {
                  console.warn(
                    `[TranslationService] ⚠️ 块 ${i + 1}/${chunks.length} 未找到任何段落ID，将整个翻译文本作为后备方案`,
                  );
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                } else {
                  // 部分段落有ID，按顺序处理
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  if (chunk.paragraphIds) {
                    for (const paraId of chunk.paragraphIds) {
                      const translation = extractedTranslations.get(paraId);
                      if (translation) {
                        orderedTranslations.push(translation);
                        const paraTranslation = { id: paraId, translation };
                        paragraphTranslations.push(paraTranslation);
                        chunkParagraphTranslations.push(paraTranslation);
                      }
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText || chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: orderedText || chunkTranslation, done: false });
                  }
                  // 通知段落翻译完成（即使只有部分段落）
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    try {
                      await onParagraphTranslation(chunkParagraphTranslations);
                    } catch (error) {
                      console.error(
                        `[TranslationService] ⚠️ 保存段落翻译失败（块 ${i + 1}/${chunks.length}）`,
                        error instanceof Error ? error.message : String(error),
                      );
                      // 继续处理，不中断翻译流程
                    }
                  }
                }
              } else {
                // 所有段落都有翻译，按顺序组织
                if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  for (const paraId of chunk.paragraphIds) {
                    const translation = extractedTranslations.get(paraId);
                    if (translation) {
                      orderedTranslations.push(translation);
                      const paraTranslation = { id: paraId, translation };
                      paragraphTranslations.push(paraTranslation);
                      chunkParagraphTranslations.push(paraTranslation);
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText;
                  if (onChunk) {
                    await onChunk({ text: orderedText, done: false });
                  }
                  // 通知段落翻译完成
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    try {
                      await onParagraphTranslation(chunkParagraphTranslations);
                    } catch (error) {
                      console.error(
                        `[TranslationService] ⚠️ 保存段落翻译失败（块 ${i + 1}/${chunks.length}）`,
                        error instanceof Error ? error.message : String(error),
                      );
                      // 继续处理，不中断翻译流程
                    }
                  }
                } else {
                  // 没有提取到段落翻译，使用完整文本
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                }
              }
            } catch (e) {
              console.warn(
                `[TranslationService] ⚠️ 解析AI响应失败（块 ${i + 1}/${chunks.length}）`,
                e instanceof Error ? e.message : String(e),
              );
              translatedText += finalResponseText;
              if (onChunk) await onChunk({ text: finalResponseText, done: false });
            }

            // 标记块已成功处理（在所有处理完成后）
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
                  `[TranslationService] ❌ AI降级检测失败，块 ${i + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止翻译`,
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

      // 最终验证：确保所有段落都有翻译（排除原始文本为空的段落或只包含符号的段落）
      const paragraphsWithText = content.filter((p) => {
        if (!p.text || p.text.trim().length === 0) {
          return false;
        }
        // 排除只包含符号的段落
        return !this.isOnlySymbols(p.text);
      });
      const allParagraphIds = new Set(paragraphsWithText.map((p) => p.id));
      const translatedParagraphIds = new Set(paragraphTranslations.map((pt) => pt.id));
      const missingParagraphIds = Array.from(allParagraphIds).filter(
        (id) => !translatedParagraphIds.has(id),
      );

      // 如果有缺失翻译的段落，重新翻译它们
      if (missingParagraphIds.length > 0) {
        console.warn(
          `[TranslationService] ⚠️ 发现 ${missingParagraphIds.length}/${paragraphsWithText.length} 个段落缺少翻译，将重新翻译`,
          {
            缺失段落ID:
              missingParagraphIds.slice(0, 5).join(', ') +
              (missingParagraphIds.length > 5 ? ` 等 ${missingParagraphIds.length} 个` : ''),
            总有效段落数: paragraphsWithText.length,
            已翻译段落数: paragraphTranslations.length,
          },
        );

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `发现 ${missingParagraphIds.length} 个段落缺少翻译，正在重新翻译...`,
            status: 'processing',
          });
        }

        // 获取需要重新翻译的段落
        const missingParagraphs = paragraphsWithText.filter((p) =>
          missingParagraphIds.includes(p.id),
        );

        // 重新翻译缺失的段落
        try {
          const missingChunkText = missingParagraphs
            .map((p) => `[ID: ${p.id}] ${p.text}\n\n`)
            .join('');
          const missingChunkContext = getContext(missingParagraphs, book);

          // 构建翻译请求
          const retryContent = `以下段落缺少翻译，请为每个段落提供翻译：\n\n${missingChunkContext}${missingChunkText}`;
          history.push({ role: 'user', content: retryContent });

          let currentTurnCount = 0;
          const MAX_TURNS = 5;
          let finalResponseText = '';

          while (currentTurnCount < MAX_TURNS) {
            currentTurnCount++;

            const request: TextGenerationRequest = {
              messages: history,
            };

            if (tools.length > 0) {
              request.tools = tools;
            }

            let accumulatedText = '';
            const result = await service.generateText(config, request, (c) => {
              // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
              if (aiProcessingStore && taskId && c.reasoningContent) {
                void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
              }

              if (c.text) {
                accumulatedText += c.text;
                if (
                  detectRepeatingCharacters(accumulatedText, missingChunkText, {
                    logLabel: 'TranslationService',
                  })
                ) {
                  throw new Error('AI降级检测：检测到重复字符，停止翻译');
                }
              }
              return Promise.resolve();
            });

            if (result.toolCalls && result.toolCalls.length > 0) {
              history.push({
                role: 'assistant',
                content: result.text || null,
                tool_calls: result.toolCalls,
              });

              for (const toolCall of result.toolCalls) {
                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(
                    taskId,
                    `\n[调用工具: ${toolCall.function.name}]\n`,
                  );
                }

                const toolResult = await TranslationService.handleToolCall(
                  toolCall,
                  bookId || '',
                  handleAction,
                  onToast,
                  taskId,
                );

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
              // 工具调用完成后，添加提示要求AI继续完成翻译
              history.push({
                role: 'user',
                content:
                  '工具调用已完成。请继续完成当前文本块的翻译任务，返回包含翻译结果的JSON格式响应。不要跳过翻译，必须提供完整的翻译结果。',
              });
            } else {
              finalResponseText = result.text;
              if (
                detectRepeatingCharacters(finalResponseText, missingChunkText, {
                  logLabel: 'TranslationService',
                })
              ) {
                throw new Error('AI降级检测：最终响应中检测到重复字符');
              }
              history.push({ role: 'assistant', content: finalResponseText });
              break;
            }
          }

          // 检查是否在达到最大回合数后仍未获得翻译结果
          if (!finalResponseText || finalResponseText.trim().length === 0) {
            throw new Error(
              `AI在工具调用后未返回翻译结果（已达到最大回合数 ${MAX_TURNS}）。请重试。`,
            );
          }

          // 解析重新翻译的结果
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          const retranslatedParagraphs: { id: string; translation: string }[] = [];
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              if (data.paragraphs && Array.isArray(data.paragraphs)) {
                for (const para of data.paragraphs) {
                  if (para.id && para.translation && missingParagraphIds.includes(para.id)) {
                    const paraTranslation = {
                      id: para.id,
                      translation: para.translation,
                    };
                    // 检查是否已存在，如果存在则更新，否则添加
                    const existingIndex = paragraphTranslations.findIndex(
                      (pt) => pt.id === para.id,
                    );
                    if (existingIndex >= 0) {
                      paragraphTranslations[existingIndex] = paraTranslation;
                    } else {
                      paragraphTranslations.push(paraTranslation);
                    }
                    retranslatedParagraphs.push(paraTranslation);
                  }
                }
              }
            } catch (e) {
              console.warn(
                `[TranslationService] ⚠️ 解析重新翻译结果失败，缺失 ${missingParagraphIds.length} 个段落`,
                e instanceof Error ? e.message : String(e),
              );
            }
          }
          // 通知重新翻译的段落完成
          if (onParagraphTranslation && retranslatedParagraphs.length > 0) {
            try {
              await onParagraphTranslation(retranslatedParagraphs);
            } catch (error) {
              console.error(
                `[TranslationService] ⚠️ 保存重新翻译的段落失败`,
                error instanceof Error ? error.message : String(error),
              );
              // 继续处理，不中断翻译流程
            }
          }
        } catch (error) {
          console.error(
            `[TranslationService] ❌ 重新翻译缺失段落失败，${missingParagraphIds.length} 个段落未翻译`,
            {
              错误: error instanceof Error ? error.message : String(error),
              缺失段落数: missingParagraphIds.length,
              缺失段落ID: missingParagraphIds.slice(0, 5).join(', ') + '...',
            },
          );
          // 即使重新翻译失败，也继续执行，至少我们已经记录了警告
        }
      } else {
        console.log(
          `[TranslationService] ✅ 翻译完成：所有 ${paragraphsWithText.length} 个有效段落都有翻译`,
        );
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '翻译完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
        // 注意：待办事项由 AI 自己决定是否标记为完成，不自动标记
      }

      return {
        text: translatedText,
        paragraphTranslations,
        ...(titleTranslation ? { titleTranslation } : {}),
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
            message: error instanceof Error ? error.message : '翻译出错',
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
