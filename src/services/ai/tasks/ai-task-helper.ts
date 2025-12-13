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
 * 构建工具调用后的继续提示
 */
export function buildContinuePrompt(
  taskType: TaskType,
  paragraphIds: string[] | undefined,
  chunkText: string,
  includePreview?: boolean,
  taskId?: string,
): string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  const taskLabel = taskTypeLabels[taskType];
  const paragraphIdList = paragraphIds
    ? paragraphIds.slice(0, 10).join(', ') + (paragraphIds.length > 10 ? '...' : '')
    : '';

  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  let prompt = `工具调用已完成。请继续完成当前文本块的${taskLabel}任务。

**⚠️ 重要提醒**：
- 你正在${taskLabel}以下段落（不要重新开始，继续之前的${taskLabel}任务）：
  段落ID: ${paragraphIdList || '见下方内容'}`;

  if (includePreview) {
    const preview = chunkText.split('\n').slice(0, 3).join('\n');
    const hasMore = chunkText.split('\n').length > 3;
    prompt += `\n  内容预览: ${preview}${hasMore ? '\n...' : ''}`;
  }

  const taskSpecificInstructions = {
    translation: `- 必须返回包含翻译结果的JSON格式响应，包含 status 字段
- 不要跳过翻译，必须提供完整的翻译结果
- 确保 paragraphs 数组中包含所有输入段落的 ID 和对应翻译`,
    polish: `- 必须返回包含润色结果的JSON格式响应，包含 status 字段
- 不要跳过润色，必须提供完整的润色结果
- 只返回有变化的段落，没有变化的段落不要包含在结果中`,
    proofreading: `- 必须返回包含校对结果的JSON格式响应，包含 status 字段
- 不要跳过校对，必须提供完整的校对结果
- 只返回有变化的段落，没有变化的段落不要包含在结果中`,
  };

  prompt += `\n${taskSpecificInstructions[taskType]}
- **必须包含 status 字段**：当前状态必须是 "working"（正在处理）或 "completed"（已完成当前块）
- 工具调用只是为了获取参考信息，现在请直接返回${taskLabel}结果
- **待办事项管理**：
  - 如果需要规划${taskLabel}步骤，可以使用 create_todo 创建待办事项
  - ⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤
  - ⚠️ **关键要求**：如果你规划了一个包含多个步骤的任务，**必须为每个步骤创建一个独立的待办事项**。不要只在文本中列出步骤，而应该使用 create_todo 为每个步骤创建实际的待办任务。例如，如果你计划"1. 获取上下文 2. 检查术语 3. 翻译段落"，你应该创建3个独立的待办事项，每个步骤一个。
  - 如果已经完成了某个待办事项的任务，使用 mark_todo_done 工具将其标记为完成
  - 只有当你真正完成了待办事项的任务时才标记为完成，不要过早标记${todosReminder}`;

  return prompt;
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
1. **创建记忆**：如果翻译过程中发现了重要的背景设定、角色信息、剧情要点等，可以使用 \`create_memory\` 工具保存这些信息，以便后续快速参考
2. **更新术语/角色**：如果发现术语或角色信息需要更新（如补充翻译、添加别名、更新描述等），可以使用相应的更新工具
3. **创建待办事项**：如果需要规划后续任务步骤，可以使用 \`create_todo\` 创建待办事项。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。⚠️ **关键要求**：如果你规划了一个包含多个步骤的任务，**必须为每个步骤创建一个独立的待办事项**。不要只在文本中列出步骤，而应该使用 create_todo 为每个步骤创建实际的待办任务。
4. **标记待办完成**：如果已经完成了某个待办事项的任务，使用 \`mark_todo_done\` 工具将其标记为完成

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
    maxTurns = 10,
    includePreview = false,
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

  while (currentTurnCount < maxTurns) {
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

      // 根据当前状态决定下一步提示
      if (currentStatus === 'planning') {
        // 规划阶段：继续规划，直到状态变为 working
        history.push({
          role: 'user',
          content: `请继续规划任务。当你准备好开始${taskLabel}时，请将状态设置为 "working" 并开始返回${taskLabel}结果。`,
        });
      } else if (currentStatus === 'working') {
        // 工作阶段：继续工作
        const continuePrompt = buildContinuePrompt(
          taskType,
          paragraphIds,
          chunkText,
          includePreview,
          taskId,
        );
        history.push({
          role: 'user',
          content: continuePrompt,
        });
      } else if (currentStatus === 'completed') {
        // 完成阶段：询问后续操作
        const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
        history.push({
          role: 'user',
          content: postOutputPrompt,
        });
      } else if (currentStatus === 'done') {
        // 完成阶段：应该已经完成，但允许最后的工具调用
        history.push({
          role: 'user',
          content: `所有操作已完成。如果还有需要处理的事项，请继续。否则请保持状态为 "done"。`,
        });
      }

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
        content: `响应格式错误：${parsed.error}。请确保返回有效的 JSON 格式，包含 status 字段（值必须是 planning、working、completed 或 done 之一）。`,
      });
      continue;
    }

    // 更新状态
    currentStatus = parsed.status;

    // 提取内容
    if (parsed.content) {
      if (parsed.content.paragraphs) {
        for (const para of parsed.content.paragraphs) {
          if (para.id && para.translation) {
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
        content: `请继续规划任务。当你准备好开始${taskLabel}时，请将状态设置为 "working" 并开始返回${taskLabel}结果。`,
      });
      continue;
    } else if (currentStatus === 'working') {
      // 工作阶段：继续工作，直到状态变为 completed
      history.push({
        role: 'user',
        content: `请继续${taskLabel}任务。当你完成当前块的所有段落${taskLabel}时，请将状态设置为 "completed"。`,
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
            content: `检测到以下段落缺少${taskLabel}：${missingIdsList}${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
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

  // 检查是否达到最大回合数
  if (currentStatus !== 'done' && currentTurnCount >= maxTurns) {
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
