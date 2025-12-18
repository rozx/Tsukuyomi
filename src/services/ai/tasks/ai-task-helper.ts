/**
 * AI 任务服务的共享辅助函数
 * 用于消除重复代码，实现 DRY 原则
 */

import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  ChatMessage,
  AIServiceConfig,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getPostToolCallReminder } from './todo-helper';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading';

/**
 * 状态类型
 */
export type TaskStatus = 'planning' | 'working' | 'completed' | 'done';

/**
 * 解析后的 JSON 响应结果
 */
export interface ParsedResponse {
  status: TaskStatus;
  content?:
    | {
        paragraphs?: Array<{ id: string; translation: string }>;
        titleTranslation?: string;
      }
    | undefined;
  error?: string | undefined;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
}

/**
 * AI 处理 Store 接口
 */
export interface AIProcessingStore {
  addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
  updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
  appendThinkingMessage: (id: string, text: string) => Promise<void>;
  appendOutputContent: (id: string, text: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  activeTasks: AIProcessingTask[];
}

/**
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
}

/**
 * 解析和验证 JSON 响应（带状态字段）
 * @param responseText AI 返回的文本
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string): ParsedResponse {
  try {
    // 尝试提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    const jsonStr = jsonMatch[0];
    const data = JSON.parse(jsonStr);

    // 验证状态字段
    if (!data.status || typeof data.status !== 'string') {
      return {
        status: 'working',
        error: 'JSON 中缺少 status 字段',
      };
    }

    const status = data.status as string;
    const validStatuses: TaskStatus[] = ['planning', 'working', 'completed', 'done'];

    if (!validStatuses.includes(status as TaskStatus)) {
      return {
        status: 'working',
        error: `无效的状态值: ${status}，必须是 planning、working、completed 或 done 之一`,
      };
    }

    // 提取内容（如果有）
    const content: ParsedResponse['content'] = {};
    if (data.paragraphs && Array.isArray(data.paragraphs)) {
      content.paragraphs = data.paragraphs;
    }
    if (data.titleTranslation && typeof data.titleTranslation === 'string') {
      content.titleTranslation = data.titleTranslation;
    }

    return {
      status: status as TaskStatus,
      content: Object.keys(content).length > 0 ? content : undefined,
    };
  } catch (e) {
    return {
      status: 'working',
      error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @param taskType 任务类型
 * @param skipEmptyParagraphs 是否跳过空段落（用于 polish 和 proofreading）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
  taskType: TaskType,
  _skipEmptyParagraphs: boolean = false,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    // 对于 polish 和 proofreading，如果设置了 skipEmptyParagraphs，可以跳过空段落
    // 但这里我们只检查是否有翻译，不检查段落是否为空
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}

/**
 * 创建流式处理回调函数
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const { taskId, aiProcessingStore, originalText, logLabel } = config;
  let accumulatedText = '';

  return (c) => {
    // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
    if (aiProcessingStore && taskId && c.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
    }

    // 处理流式输出
    if (c.text) {
      // 累积文本用于检测重复字符
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendOutputContent(taskId, c.text);
      }

      // 检测重复字符（AI降级检测），传入原文进行比较
      if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
        throw new Error(`AI降级检测：检测到重复字符，停止${logLabel.replace('Service', '')}`);
      }
    }
    return Promise.resolve();
  };
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
    );
  }
}

/**
 * 构建维护提醒（用于每个文本块）
 */
export function buildMaintenanceReminder(taskType: TaskType): string {
  const reminders = {
    translation: `⚠️ **关键提醒**: 敬语翻译工作流（检查别名→查看角色设定→先搜索记忆再检查历史一致性→应用关系判断→翻译）；数据维护（术语/角色分离，发现问题立即修复）；严格遵守已有翻译一致性；JSON格式1:1对应；严禁将敬语添加为别名；待办事项需详细可执行，多步骤需分别创建`,
    proofreading: `⚠️ **提醒**: 检查文字（错别字、标点、语法）、内容（一致性、逻辑、设定）、格式；使用工具确保全文一致；最小改动原则；严禁将敬语添加为别名；待办事项需详细可执行`,
    polish: `⚠️ **提醒**: 适当添加语气词符合角色风格；使用地道中文摆脱翻译腔；使用工具获取术语/角色/上下文；参考历史翻译；只返回有变化的段落；严禁将敬语添加为别名；待办事项需详细可执行`,
  };

  return `\n${reminders[taskType]}`;
}

/**
 * 构建初始用户提示的基础部分
 */
export function buildInitialUserPromptBase(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };

  const taskLabel = taskLabels[taskType];
  const startAction = taskType === 'translation' ? '开始翻译任务。' : `开始${taskLabel}。`;
  const workAction = taskType === 'translation' ? '翻译' : taskLabel;
  const completeAction = taskType === 'translation' ? '翻译' : taskLabel;

  return `${startAction}

**重要：必须使用状态字段（status）**
- 所有响应必须是有效的 JSON 格式，包含 status 字段
- status 值必须是 "planning"、"working"、"completed" 或 "done" 之一
- 可以从 "planning" 状态开始，规划任务、获取上下文
- 准备好后，将状态设置为 "working" 并开始${workAction}
- 完成所有段落${completeAction}后，将状态设置为 "completed"
- 完成所有后续操作后，将状态设置为 "done"`;
}

/**
 * 添加章节上下文到初始提示
 */
export function addChapterContext(prompt: string, chapterId: string, taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  return `${prompt}\n\n**当前章节 ID**: \`${chapterId}\`\n你可以使用工具（如 get_chapter_info、get_previous_chapter、get_next_chapter、find_paragraph_by_keywords 等）获取该章节的上下文信息，以确保${taskLabel}的一致性和连贯性。`;
}

/**
 * 添加段落上下文到初始提示
 */
export function addParagraphContext(
  prompt: string,
  paragraphId: string,
  taskType: TaskType,
): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  const tools =
    taskType === 'proofreading'
      ? 'find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs'
      : 'find_paragraph_by_keywords、get_chapter_info';

  return `${prompt}\n\n**当前段落 ID**: ${paragraphId}\n你可以使用工具（如 ${tools} 等）获取该段落的前后上下文，以确保${taskLabel}的一致性和连贯性。`;
}

/**
 * 添加任务规划建议到初始提示
 */
export function addTaskPlanningSuggestions(prompt: string, taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  const examples = {
    translation: '翻译第1-5段，检查术语一致性，确保角色名称翻译一致',
    proofreading: '校对第1-5段，检查错别字和标点，确保术语一致性',
    polish: '润色第1-5段，优化语气词使用，确保自然流畅',
  };

  const subTasks = {
    translation: '翻译进度、术语检查、角色一致性检查等子任务',
    proofreading: '校对进度、一致性检查、格式检查等子任务',
    polish: '润色进度、术语一致性检查等子任务',
  };

  return `${prompt}

      【任务规划建议】
      - 如果需要规划复杂的${taskLabel}任务，你可以使用 \`create_todo\` 工具创建待办事项来规划步骤
      - 例如：为大型章节创建待办事项来跟踪${subTasks[taskType]}
      - ⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："${examples[taskType]}" 而不是 "${taskLabel}文本"
      - ⚠️ **关键要求**：如果你规划了一个包含多个步骤的任务，**必须为每个步骤创建一个独立的待办事项**。不要只在文本中列出步骤，而应该使用 \`create_todo\` 为每个步骤创建实际的待办任务。例如，如果你计划"1. 获取上下文 2. 检查术语 3. ${taskLabel}段落"，你应该创建3个独立的待办事项，每个步骤一个。
      - **批量创建**：可以使用 \`items\` 参数一次性创建多个待办事项，例如：\`create_todo(items=["${taskLabel}第1-5段", "${taskLabel}第6-10段", "检查术语一致性"])\`。这样可以更高效地为多步骤任务创建所有待办事项。`;
}

/**
 * 构建完成阶段的通用说明
 */
export function buildCompletedStageDescription(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  const verificationNote =
    taskType === 'translation'
      ? '所有段落都有翻译'
      : `所有段落都有${taskLabel}（只验证有变化的段落）`;

  return `3. **完成阶段（status: "completed"）**:
         - 系统会自动验证${verificationNote}
         - 如果缺少${taskLabel}，系统会要求继续工作（状态回到 "working"）
         - 如果所有段落都完整，系统会询问是否需要后续操作
         - 可以使用工具进行后续操作（创建记忆、更新术语/角色、管理待办事项等）
         - 完成所有后续操作后，将状态设置为 "done"`;
}

/**
 * 构建执行要点/清单（任务特定）
 */
export function buildExecutionSection(taskType: TaskType, chapterId?: string): string {
  if (taskType === 'translation') {
    const chapterIdNote = chapterId
      ? `\n         - ⚠️ 调用 \`list_terms\` 和 \`list_characters\` 时传递 \`chapter_id\` 参数`
      : '';

    return `
      【执行清单】
      1. **规划阶段（planning）**: 使用工具获取上下文${chapterIdNote}；检查术语/角色分离、空翻译、描述不匹配、重复角色；发现问题立即修复；准备就绪后设为 "working"
      2. **工作阶段（working）**: 逐段翻译1:1对应；敬语工作流（别名→角色设定→先搜索记忆再检查历史一致性→关系判断→翻译）；新术语/角色直接创建；发现数据问题立即修复；完成所有段落后设为 "completed"
      ${buildCompletedStageDescription('translation')}
      ⚠️ **关键**: 敬语翻译（别名>关系>记忆>历史，禁止自动创建别名，严禁将敬语添加为别名）；数据维护（术语/角色分离，发现空翻译立即修复）；严格遵守已有翻译一致性；JSON格式1:1对应；所有阶段可使用工具
      ⚠️ **重要**: 忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出翻译内容，系统也不会将它们计入有效段落`;
  }

  if (taskType === 'proofreading') {
    return `

        【执行要点】
        - **文字**：错别字、标点、语法、词语用法
        - **内容**：人名/地名/称谓一致性、时间线、逻辑、专业知识/设定
        - **格式**：格式、数字用法、引文注释
        - **一致性**：使用工具查找其他段落确保全文一致
        - **最小改动**：只修正确实错误，保持原意和风格
        - **参考原文**：确保翻译准确无误
        - ⚠️ **只返回有变化的段落**，无变化不包含在结果中
        - ⚠️ **重要**: 忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出校对内容，系统也不会将它们计入有效段落

        请按 JSON 格式返回，只包含有变化的段落。`;
  }

  if (taskType === 'polish') {
    const chapterIdNote = chapterId
      ? `；调用 \`list_terms\` 和 \`list_characters\` 时传递 \`chapter_id\` 参数`
      : '';

    return `

        【执行要点】
        1. **规划阶段（planning）**: 使用工具获取上下文、创建待办事项；准备就绪后设为 "working"
        2. **工作阶段（working）**: 语气词（符合角色风格）、自然流畅（摆脱翻译腔）、节奏优化、语病修正、角色区分、专有名词统一；完成所有段落后设为 "completed"
        ${buildCompletedStageDescription('polish')}
        ⚠️ **关键**: 只返回有变化的段落；使用工具获取术语/角色/上下文${chapterIdNote}；参考翻译历史混合匹配最佳表达；润色前搜索记忆，完成后可保存摘要；保留原文格式（标点、换行符等）；所有阶段可使用工具
        ⚠️ **重要**: 忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出润色内容，系统也不会将它们计入有效段落

        请按 JSON 格式返回，只包含有变化的段落。`;
  }

  return '';
}

/**
 * 构建输出内容后的后续操作提示
 * 询问 AI 是否需要进行其他操作（如创建记忆、更新术语等）
 */
export function buildPostOutputPrompt(taskType: TaskType, taskId?: string): string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  const taskLabel = taskTypeLabels[taskType];
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  return `${taskLabel}任务的主要输出已完成。现在你可以选择进行以下后续操作（可选）：

**可选的后续操作**：
1. **更新翻译**：如果你想要更新之前返回的翻译内容，可以将状态设置为 "working" 并返回包含更新段落的 JSON。例如：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "更新后的翻译"}]}\`。如果不需要更新，可以跳过此选项。
2. **创建记忆**：如果翻译过程中发现了重要的背景设定、角色信息、剧情要点等，可以使用 \`create_memory\` 工具保存这些信息，以便后续快速参考
3. **更新术语/角色**：如果发现术语或角色信息需要更新（如补充翻译、添加别名、更新描述等），可以使用相应的更新工具
4. **创建待办事项**：如果需要规划后续任务步骤，可以使用 \`create_todo\` 创建待办事项。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。⚠️ **关键要求**：如果你规划了一个包含多个步骤的任务，**必须为每个步骤创建一个独立的待办事项**。不要只在文本中列出步骤，而应该使用 create_todo 为每个步骤创建实际的待办任务。可以使用 \`items\` 参数批量创建多个待办事项，例如：\`create_todo(items=["步骤1", "步骤2", "步骤3"])\`。
5. **标记待办完成**：如果已经完成了某个待办事项的任务，使用 \`mark_todo_done\` 工具将其标记为完成

**重要说明**：
- 这些操作都是**可选的**，如果你不需要进行任何后续操作，请返回 JSON 格式，状态设置为 "done"
- 如果你需要进行后续操作，请直接调用相应的工具
- 如果不需要任何后续操作，请返回 JSON 格式：\`{"status": "done"}\`，这样系统就会结束当前任务${todosReminder}

**必须返回 JSON 格式**：
- 如果需要进行后续操作，调用工具后继续返回 JSON，状态保持为 "completed"
- 如果不需要后续操作，返回：\`{"status": "done"}\`

请告诉我你是否需要进行任何后续操作，或者直接返回状态为 "done" 的 JSON。`;
}

/**
 * 处理工具调用循环
 */
export interface ToolCallLoopConfig {
  history: ChatMessage[];
  tools: AITool[];
  generateText: (
    config: AIServiceConfig,
    request: TextGenerationRequest,
    callback: TextGenerationStreamCallback,
  ) => Promise<{
    text: string;
    toolCalls?: AIToolCall[];
    reasoningContent?: string;
  }>;
  aiServiceConfig: AIServiceConfig;
  taskType: TaskType;
  chunkText: string;
  paragraphIds: string[] | undefined;
  bookId: string;
  handleAction: (action: ActionInfo) => void;
  onToast: ToastCallback | undefined;
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  logLabel: string;
  maxTurns?: number;
  includePreview?: boolean;
  /**
   * 验证回调：用于服务特定的验证逻辑
   * @param expectedIds 期望的段落 ID 列表
   * @param receivedTranslations 已收到的翻译
   * @returns 验证结果
   */
  verifyCompleteness?: (
    expectedIds: string[],
    receivedTranslations: Map<string, string>,
  ) => VerificationResult;
}

/**
 * 执行工具调用循环（基于状态的流程）
 * 返回最终响应文本和状态信息
 */
export interface ToolCallLoopResult {
  responseText: string | null;
  status: TaskStatus;
  paragraphs: Map<string, string>;
  titleTranslation?: string | undefined;
}

export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<ToolCallLoopResult> {
  const {
    history,
    tools,
    generateText,
    aiServiceConfig,
    taskType,
    chunkText,
    paragraphIds,
    bookId,
    handleAction,
    onToast,
    taskId,
    aiProcessingStore,
    logLabel,
    maxTurns = Infinity,
    includePreview: _includePreview = false,
    verifyCompleteness,
  } = config;

  let currentTurnCount = 0;
  let currentStatus: TaskStatus = 'planning';
  const accumulatedParagraphs = new Map<string, string>();
  let titleTranslation: string | undefined;
  let finalResponseText: string | null = null;

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskTypeLabels[taskType];

  while (maxTurns === Infinity || currentTurnCount < maxTurns) {
    currentTurnCount++;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // 创建流式处理回调
    const streamCallback = createStreamCallback({
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
    });

    // 调用 AI
    const result = await generateText(aiServiceConfig, request, streamCallback);

    // 保存思考内容
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // 检查是否有工具调用
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 工具调用在所有状态阶段都允许
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      history.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoningContent || null, // DeepSeek 要求此字段必须存在
      });

      // 执行工具
      for (const toolCall of result.toolCalls) {
        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n[调用工具: ${toolCall.function.name}]\n`,
          );
        }

        const toolResult = await ToolRegistry.handleToolCall(
          toolCall,
          bookId,
          handleAction,
          onToast,
          taskId,
        );

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
          );
        }

        history.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }

      // 工具调用完成后，直接继续循环，让 AI 基于工具结果自然继续
      continue;
    }

    // 没有工具调用，解析响应
    const responseText = result.text || '';
    finalResponseText = responseText;

    // 检测重复字符
    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(`AI降级检测：最终响应中检测到重复字符`);
    }

    // 解析状态响应
    const parsed = parseStatusResponse(responseText);

    if (parsed.error) {
      // JSON 解析失败，要求重试
      console.warn(`[${logLabel}] ⚠️ ${parsed.error}`);
      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content: `响应格式错误：${parsed.error}。请确保返回有效的 JSON 格式，包含 status 字段（值必须是 planning、working、completed 或 done 之一）。⚠️ **注意**：当只更新状态时，只需返回 \`{"status": "状态值"}\` 即可，不需要包含 paragraphs 或 titleTranslation 字段。`,
      });
      continue;
    }

    // 更新状态
    currentStatus = parsed.status;

    // 提取内容
    if (parsed.content) {
      if (parsed.content.paragraphs) {
        for (const para of parsed.content.paragraphs) {
          // 只处理有效的段落翻译（有ID且翻译内容不为空）
          if (para.id && para.translation && para.translation.trim().length > 0) {
            accumulatedParagraphs.set(para.id, para.translation);
          }
        }
      }
      if (parsed.content.titleTranslation) {
        titleTranslation = parsed.content.titleTranslation;
      }
    }

    // 将响应添加到历史
    history.push({
      role: 'assistant',
      content: responseText,
    });

    // 根据状态处理
    if (currentStatus === 'planning') {
      // 规划阶段：继续规划
      history.push({
        role: 'user',
        content: `请继续规划任务。**专注于当前文本块**：你只需要处理当前提供的文本块，不要考虑其他块的内容。当你准备好开始${taskLabel}当前块时，请将状态设置为 "working" 并开始返回${taskLabel}结果。`,
      });
      continue;
    } else if (currentStatus === 'working') {
      // 工作阶段：继续工作，直到状态变为 completed
      history.push({
        role: 'user',
        content: `请继续任务。**专注于当前文本块**：你只需要处理当前提供的文本块，不要考虑其他块的内容。当你完成当前块的所有段落${taskLabel}时，请将状态设置为 "completed"。`,
      });
      continue;
    } else if (currentStatus === 'completed') {
      // 完成阶段：验证完整性
      if (paragraphIds && paragraphIds.length > 0) {
        const verification = verifyCompleteness
          ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
          : verifyParagraphCompleteness(
              paragraphIds,
              accumulatedParagraphs,
              taskType,
              taskType === 'polish' || taskType === 'proofreading',
            );

        if (!verification.allComplete && verification.missingIds.length > 0) {
          // 缺少段落，要求继续工作
          const missingIdsList = verification.missingIds.slice(0, 10).join(', ');
          const hasMore = verification.missingIds.length > 10;
          history.push({
            role: 'user',
            content: `检测到以下段落缺少${taskLabel}：${missingIdsList}${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。**专注于当前文本块**：你只需要处理当前提供的文本块。请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
          });
          currentStatus = 'working';
          continue;
        }
      }

      // 所有段落都完整，询问后续操作
      const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
      history.push({
        role: 'user',
        content: postOutputPrompt,
      });
      continue;
    } else if (currentStatus === 'done') {
      // 完成：退出循环
      break;
    }
  }

  // 检查是否达到最大回合数（仅在设置了有限值时才检查）
  if (currentStatus !== 'done' && maxTurns !== Infinity && currentTurnCount >= maxTurns) {
    throw new Error(
      `AI在${maxTurns}回合内未完成${taskLabel}任务（当前状态: ${currentStatus}）。请重试。`,
    );
  }

  return {
    responseText: finalResponseText,
    status: currentStatus,
    paragraphs: accumulatedParagraphs,
    titleTranslation,
  };
}

/**
 * 检查是否达到最大回合数限制（已废弃，状态检查在 executeToolCallLoop 中处理）
 * 保留此函数以保持向后兼容性
 */
export function checkMaxTurnsReached(
  finalResponseText: string | null,
  maxTurns: number,
  taskType: TaskType,
): asserts finalResponseText is string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${taskTypeLabels[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}
