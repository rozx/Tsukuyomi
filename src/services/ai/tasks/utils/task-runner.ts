import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { getCurrentStatusInfo } from '../prompts';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import {
  getStatusLabel,
  getValidTransitionsForTaskType,
  getTaskStateWorkflowText,
  TASK_TYPE_LABELS,
  type TaskStatus,
  type TaskType,
  type AIProcessingStore,
} from './task-types';
import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AITool,
  ChatMessage,
  AIServiceConfig,
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import {
  createStreamCallback,
  createUnifiedAbortController,
  type StreamCallbackConfig,
} from './stream-handler';
import {
  parseStatusResponse,
  verifyParagraphCompleteness,
  type VerificationResult,
  type ParsedResponse,
} from './response-parser';
import {
  detectPlanningContextUpdate,
  PRODUCTIVE_TOOLS,
  TOOL_CALL_LIMITS,
  type PlanningContextUpdate,
} from './productivity-monitor';
import { type PerformanceMetrics } from './tool-executor';
import { buildPostOutputPrompt } from './context-builder';

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
  /**
   * 段落翻译提取回调：每当从 AI 响应中提取到段落翻译时立即调用
   * 用于实时更新 UI，不等待整个循环完成
   */
  onParagraphsExtracted?:
    | ((paragraphs: { id: string; translation: string }[]) => void | Promise<void>)
    | undefined;
  /**
   * 标题翻译提取回调：每当从 AI 响应中提取到标题翻译时立即调用
   */
  onTitleExtracted?: ((title: string) => void | Promise<void>) | undefined;
  /**
   * 是否为简短规划模式（用于后续 chunk，已继承前一个 chunk 的规划上下文）
   * 当为 true 时，AI 会收到简化的规划指令，无需重复获取术语/角色信息
   */
  isBriefPlanning?: boolean;
  /**
   * 收集的 actions（用于检测规划上下文更新）
   */
  collectedActions?: ActionInfo[];
  /**
   * 当前 chunk 索引（用于错误日志）
   */
  chunkIndex?: number;
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
  /**
   * 规划阶段的摘要信息（用于在多个 chunk 之间共享上下文）
   * 包含 AI 在规划阶段的决策、获取的术语/角色信息等
   */
  planningSummary?: string | undefined;
  /**
   * 规划上下文更新信息（用于后续 chunk 更新共享上下文）
   */
  planningContextUpdate?: PlanningContextUpdate | undefined;
  /**
   * 性能指标
   */
  metrics?: PerformanceMetrics | undefined;
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
    verifyCompleteness,
    onParagraphsExtracted,
    onTitleExtracted,
    isBriefPlanning = false,
    collectedActions = [],
  } = config;

  let currentTurnCount = 0;
  let currentStatus: TaskStatus = 'planning';
  const accumulatedParagraphs = new Map<string, string>();
  let titleTranslation: string | undefined;
  let finalResponseText: string | null = null;

  // 用于检测状态循环：记录每个状态连续出现的次数
  let consecutivePlanningCount = 0;
  let consecutiveWorkingCount = 0;
  let consecutiveReviewCount = 0;
  const MAX_CONSECUTIVE_STATUS = 2; // 同一状态最多连续出现 2 次（加速流程）

  // 用于检测“状态与内容不匹配”的连续次数（避免模型反复输出错误状态导致无限重试）
  let consecutiveContentStateMismatchCount = 0;
  const MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH = 2;

  // 用于收集规划阶段的信息（在 planning → working 转换时提取摘要）
  let planningSummary: string | undefined;
  const planningResponses: string[] = []; // 收集 AI 在规划阶段的响应
  const planningToolResults: { tool: string; result: string }[] = []; // 收集规划阶段的工具结果

  // 性能监控
  const metrics: PerformanceMetrics = {
    totalTime: 0,
    planningTime: 0,
    workingTime: 0,
    reviewTime: 0,
    toolCallTime: 0,
    toolCallCount: 0,
    averageToolCallTime: 0,
    chunkProcessingTime: [],
  };
  const startTime = Date.now();
  let statusStartTime = Date.now();

  // 工具调用计数（用于限制）
  const toolCallCounts = new Map<string, number>();
  // 允许的工具名称集合（严格限制：只能调用本次请求提供的 tools）
  const allowedToolNames = new Set(tools.map((t) => t.function.name));

  const taskLabel = TASK_TYPE_LABELS[taskType];

  while (maxTurns === Infinity || currentTurnCount < maxTurns) {
    currentTurnCount++;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // 用于存储流式输出中累积的文本（用于无效状态检测时的错误处理）
    let streamedText = '';

    // 为本次请求创建“可主动中止”的 signal（用于检测到无效状态时立即停止流）
    // 注意：每个 turn 都必须使用新的 AbortController，否则一旦中止就无法重试
    const { controller: streamAbortController, cleanup: cleanupAbort } =
      createUnifiedAbortController(aiServiceConfig.signal);
    const aiServiceConfigForThisTurn: AIServiceConfig = {
      ...aiServiceConfig,
      signal: streamAbortController.signal,
    };

    // 创建流式处理回调（传入当前状态以便实时检测无效状态）
    const streamCallbackConfig: StreamCallbackConfig = {
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
      currentStatus,
      taskType,
      abortController: streamAbortController,
    };
    const streamCallback = createStreamCallback(streamCallbackConfig);

    // 包装流式回调以捕获累积文本
    const wrappedStreamCallback: TextGenerationStreamCallback = async (chunk) => {
      // 累积文本用于错误处理
      if (chunk.text) {
        streamedText += chunk.text;
      }
      // 调用原始回调
      return streamCallback(chunk);
    };

    // 调用 AI（捕获流式回调中抛出的无效状态错误）
    let result;
    try {
      result = await generateText(aiServiceConfigForThisTurn, request, wrappedStreamCallback);
    } catch (streamError) {
      // 检查是否是无效状态错误
      if (
        streamError instanceof Error &&
        (streamError.message.includes('无效状态') ||
          streamError.message.includes('状态转换错误') ||
          streamError.message.includes('状态与内容不匹配'))
      ) {
        console.warn(`[${logLabel}] ⚠️ 流式输出中检测到无效状态，已停止输出`);

        // 使用累积的流式文本或结果文本
        const partialResponse = result?.text !== undefined ? result.text : streamedText || '';

        // 立即警告 AI

        // 解析错误消息以获取详细信息
        const errorMessage = streamError.message;
        let warningMessage = errorMessage;

        // 如果错误消息包含状态转换信息，提取并格式化
        if (errorMessage.includes('状态转换错误')) {
          const validTransitions = getValidTransitionsForTaskType(taskType);
          const expectedNextStatus: TaskStatus = validTransitions[currentStatus]?.[0] || 'working';
          warningMessage =
            `[警告] **状态转换错误**：你返回了无效的状态转换。\n\n` +
            `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
            `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，应该先转换到 "${getStatusLabel(expectedNextStatus, taskType)}"。\n\n` +
            `请重新返回正确的状态：{"status": "${expectedNextStatus}"}`;
        } else if (errorMessage.includes('无效状态值')) {
          // 无效状态值的警告
          warningMessage =
            `[警告] **无效状态值**：你返回了无效的状态值。\n\n` +
            `**有效的状态值**：planning、working、review、end\n\n` +
            `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，请返回正确的状态值。`;
        } else if (errorMessage.includes('状态与内容不匹配')) {
          consecutiveContentStateMismatchCount++;
          if (consecutiveContentStateMismatchCount > MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH) {
            throw new Error(
              `AI 多次返回状态与内容不匹配，已超过最大重试次数（${MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH}）。请更换模型或稍后重试。`,
            );
          }

          warningMessage =
            `[警告] **状态与内容不匹配**：你在非 working 状态下输出了 paragraphs/titleTranslation。\n\n` +
            `本任务中，**只有**当 \`status="working"\` 时才允许输出内容字段。\n\n` +
            `请你立刻重试：用 \`{"status":"working", ...}\` 重新返回（内容保持一致即可）。`;
        }

        // 将部分响应添加到历史（如果有）
        if (partialResponse.trim()) {
          history.push({
            role: 'assistant',
            content: partialResponse,
          });
        }

        // 立即添加警告消息
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n${warningMessage}`,
        });

        // 继续循环，让 AI 重新响应
        continue;
      }

      // 其他错误，重新抛出
      throw streamError;
    } finally {
      cleanupAbort();
    }

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
        // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
        content: result.text && result.text.trim() ? result.text : '（调用工具）',
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoningContent || null, // DeepSeek 要求此字段必须存在
      });

      // 执行工具
      let hasProductiveTool = false;
      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.function.name;

        // [警告] 严格限制：只能调用本次会话提供的 tools
        if (!allowedToolNames.has(toolName)) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 未在本次会话提供的 tools 列表中，已拒绝执行`,
          );
          history.push({
            role: 'tool',
            content:
              `[警告] 工具 ${toolName} 未在本次会话提供的 tools 列表中，禁止调用。` +
              `请改用可用工具或基于已有上下文继续${taskLabel}。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 检查工具调用限制
        // 检查工具调用限制
        const currentCount = toolCallCounts.get(toolName) || 0;
        const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
        const safeLimit = limit as number;

        if (safeLimit !== Infinity && currentCount >= safeLimit) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 调用次数已达上限（${safeLimit}），跳过此次调用`,
          );
          // 添加工具结果，告知 AI 已达到限制
          history.push({
            role: 'tool',
            content: `[警告] 工具 ${toolName} 调用次数已达上限（${safeLimit} 次），请使用已获取的信息继续工作。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 更新工具调用计数
        toolCallCounts.set(toolName, currentCount + 1);

        // 检查是否为生产性工具
        if (PRODUCTIVE_TOOLS.includes(toolName)) {
          hasProductiveTool = true;
        }

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(taskId, `\n[调用工具: ${toolName}]\n`);
        }

        // 记录工具调用开始时间
        const toolCallStartTime = Date.now();

        const toolResult = await ToolRegistry.handleToolCall(
          toolCall,
          bookId,
          handleAction,
          onToast,
          taskId,
        );

        // 记录工具调用耗时
        const toolCallDuration = Date.now() - toolCallStartTime;
        metrics.toolCallTime += toolCallDuration;
        metrics.toolCallCount++;

        // 直接使用工具结果，不进行截断
        const toolResultContent = toolResult.content;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResultContent.slice(0, 100)}...]\n`,
          );
        }

        // 在规划阶段收集工具结果（用于后续 chunk 的上下文共享）
        if (currentStatus === 'planning') {
          // 只收集关键工具的结果（术语、角色、记忆等）
          const keyTools = [
            'list_terms',
            'list_characters',
            'search_memory_by_keywords',
            'get_chapter_info',
            'get_book_info',
            'list_chapters',
          ];
          if (keyTools.includes(toolName)) {
            // 如果是简短规划模式且调用了已获取的工具，给出警告
            if (isBriefPlanning) {
              console.warn(
                `[${logLabel}] ⚠️ 简短规划模式下检测到重复工具调用: ${toolName}，该工具的结果已在规划上下文中提供`,
              );
              // 在工具结果后添加警告信息，提醒 AI 这些信息已经在上下文中
              const warningMessage = `\n\n[警告] **注意**：此工具的结果已在规划上下文中提供，后续 chunk 无需重复调用此工具。`;
              history.push({
                role: 'tool',
                content: toolResultContent + warningMessage,
                tool_call_id: toolCall.id,
                name: toolName,
              });
              // 跳过正常的工具结果推送，因为已经推送了带警告的版本
              // [DEBUG] 这里 continue 会跳过后续的 history.push，这是预期的行为
              continue;
            }
            planningToolResults.push({
              tool: toolName,
              result: toolResultContent, // 使用完整结果
            });
          }
        }

        // 注意：如果已经在上面推送了带警告的工具结果，这里会跳过（通过 continue）
        // 否则正常推送工具结果（使用完整结果）
        history.push({
          role: 'tool',
          content: toolResultContent,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }

      // 只有生产性工具调用才重置循环检测计数器
      // 这样可以避免在 AI 合法地使用工具获取信息时触发误报
      if (hasProductiveTool) {
        consecutivePlanningCount = 0;
        consecutiveWorkingCount = 0;
        consecutiveReviewCount = 0;
      }

      // 工具调用完成后，直接继续循环，让 AI 基于工具结果自然继续
      continue;
    }

    // 没有工具调用，解析响应
    const responseText = result.text || '';
    finalResponseText = responseText;

    // 检测重复字符
    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(
        `AI降级检测：最终响应中检测到重复字符（chunkIndex: ${config.chunkIndex ?? 'unknown'}, paragraphCount: ${paragraphIds?.length ?? 0}）`,
      );
    }

    // 解析状态响应
    // 传入 paragraphIds 以支持索引映射（Simplified Schema: i -> id）
    const parsed = parseStatusResponse(responseText, paragraphIds);

    if (parsed.error) {
      // JSON 解析失败，要求重试
      console.warn(`[${logLabel}] ⚠️ ${parsed.error}`);
      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content:
          `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
          `响应格式错误：${parsed.error}。[警告] 只返回JSON。` +
          `你可以直接返回 \`{"status":"working","paragraphs":[...]}\`（或仅返回 \`{"status":"working"}\`）。` +
          `系统会自动检查缺失段落。`,
      });
      continue;
    }

    // 容错：部分模型可能在输出内容时误标为 planning
    // 规则：当返回包含段落/标题等实际内容时，视作 working（避免多一轮来回）
    const paragraphs = parsed.content?.paragraphs;
    const hasContent =
      !!parsed.content?.titleTranslation || (Array.isArray(paragraphs) && paragraphs.length > 0);

    // 翻译/润色/校对任务：只要输出 paragraphs/titleTranslation，就必须处于 working
    // 若状态为 planning/review/end 且包含内容，视为错误状态：纠正并让模型重试
    if (
      (taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading') &&
      hasContent &&
      parsed.status !== 'working'
    ) {
      consecutiveContentStateMismatchCount++;
      if (consecutiveContentStateMismatchCount > MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH) {
        throw new Error(
          `AI 多次返回状态与内容不匹配，已超过最大重试次数（${MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH}）。请更换模型或稍后重试。`,
        );
      }

      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content:
          `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
          `[警告] **状态与内容不匹配**：本任务中，只有当 \`status="working"\` 时才允许输出 ` +
          `\`paragraphs/titleTranslation\`。\n\n` +
          `你当前返回的 status="${parsed.status}" 却包含了内容字段。` +
          `请立刻重试：用 \`{"status":"working", ...}\` 重新返回（内容保持一致即可）。`,
      });
      continue;
    }

    // 已进入正常处理流程，重置 mismatch 计数器
    consecutiveContentStateMismatchCount = 0;

    const newStatus: TaskStatus =
      taskType !== 'translation' && parsed.status === 'planning' && hasContent
        ? 'working'
        : parsed.status;
    const previousStatus: TaskStatus = currentStatus;

    // 记录状态转换时间
    if (previousStatus !== newStatus) {
      const statusDuration = Date.now() - statusStartTime;
      switch (previousStatus) {
        case 'planning':
          metrics.planningTime += statusDuration;
          break;
        case 'working':
          metrics.workingTime += statusDuration;
          break;
        case 'review':
          metrics.reviewTime += statusDuration;
          break;
      }
      statusStartTime = Date.now();
    }

    // 定义允许的状态转换（按任务类型区分）
    const validTransitions = getValidTransitionsForTaskType(taskType);

    // 检查状态转换是否有效
    if (previousStatus !== newStatus) {
      const allowedNextStatuses: TaskStatus[] | undefined = validTransitions[previousStatus];
      if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
        // 无效的状态转换，提醒AI
        console.warn(
          `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(previousStatus, taskType)} → ${getStatusLabel(newStatus, taskType)}`,
        );

        const expectedNextStatus: TaskStatus =
          (allowedNextStatuses?.[0] as TaskStatus) || 'working';

        history.push({
          role: 'assistant',
          content: responseText,
        });

        history.push({
          role: 'user',
          content:
            `[警告] **状态转换错误**：你试图从 "${getStatusLabel(previousStatus, taskType)}" 直接转换到 "${getStatusLabel(newStatus, taskType)}"，这是**禁止的**。\n\n` +
            `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
            `你当前处于 "${getStatusLabel(previousStatus, taskType)}"，应该先转换到 "${getStatusLabel(expectedNextStatus, taskType)}"。\n\n` +
            `请重新返回正确的状态：{"status": "${expectedNextStatus}"}${newStatus === 'working' && previousStatus === 'planning' ? ' 或包含内容时 {"status": "working", "paragraphs": [...]}' : ''}`,
        });

        // 不更新状态，继续循环让AI重新响应
        continue;
      }
    }

    // 检测 planning → working 状态转换，提取规划摘要
    if (previousStatus === 'planning' && newStatus === 'working' && !planningSummary) {
      // 构建规划摘要
      const summaryParts: string[] = [];

      // 添加 AI 的规划响应摘要（包括之前的规划响应）
      if (planningResponses.length > 0) {
        summaryParts.push('【AI规划决策】');
        summaryParts.push(planningResponses.join('\n'));
      }

      // 添加当前转换响应（从 planning 到 working 的响应，这是最终的规划决策）
      if (responseText && responseText.trim().length > 0) {
        if (summaryParts.length === 0) {
          summaryParts.push('【AI规划决策】');
        }
        summaryParts.push(responseText);
      }

      // 添加关键工具结果摘要
      if (planningToolResults.length > 0) {
        summaryParts.push('\n【已获取的上下文信息】');
        for (const { tool, result } of planningToolResults) {
          // 使用完整的工具结果
          summaryParts.push(`- ${tool}: ${result}`);
        }
      }

      if (summaryParts.length > 0) {
        planningSummary = summaryParts.join('\n');
        console.log(`[${logLabel}] ✅ 已提取规划摘要（${planningSummary.length} 字符）`);
      }
    }

    // 更新状态
    currentStatus = newStatus;

    // 提取内容
    // 注意：必须先处理标题翻译，确保标题更新后再处理段落
    // 这样段落处理时可以读取到最新的标题
    if (parsed.content) {
      // 1. 先处理标题翻译（必须等待完成）
      if (parsed.content.titleTranslation) {
        // 允许标题翻译在同一任务中被更新（以最新为准）
        if (titleTranslation !== parsed.content.titleTranslation) {
          titleTranslation = parsed.content.titleTranslation;
          // 立即调用标题回调，并等待完成
          if (onTitleExtracted) {
            try {
              await onTitleExtracted(titleTranslation);
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
            }
          }
        }
      }

      // 2. 再处理段落翻译（此时标题已更新）
      if (parsed.content.paragraphs) {
        const newParagraphs: { id: string; translation: string }[] = [];
        for (const para of parsed.content.paragraphs) {
          // 只处理有效的段落翻译（有ID且翻译内容不为空）
          if (para.id && para.translation && para.translation.trim().length > 0) {
            // 允许同一段落在同一任务中被"纠错/改写"
            // 策略：当翻译内容发生变化时，以最新输出为准（last-write-wins）
            const prev = accumulatedParagraphs.get(para.id);
            if (prev !== para.translation) {
              accumulatedParagraphs.set(para.id, para.translation);
              newParagraphs.push({ id: para.id, translation: para.translation });
            }
          }
        }
        if (newParagraphs.length > 0) {
          // 立即调用回调，不等待循环完成（但标题已更新）
          if (onParagraphsExtracted) {
            try {
              await onParagraphsExtracted(newParagraphs);
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onParagraphsExtracted 回调失败:`, error);
              // 根据需要决定是否抛出错误
            }
          }
        }
      }
    }

    // 将响应添加到历史
    history.push({
      role: 'assistant',
      content: responseText,
    });

    // 根据状态处理
    if (currentStatus === 'planning') {
      // 更新连续状态计数
      consecutivePlanningCount++;
      consecutiveWorkingCount = 0; // 重置其他状态计数
      consecutiveReviewCount = 0; // 重置其他状态计数

      // 收集规划阶段的 AI 响应（用于后续 chunk 的上下文共享）
      if (responseText && responseText.trim().length > 0) {
        planningResponses.push(responseText);
      }

      // 检测循环：如果连续处于 planning 状态超过阈值，强制要求开始工作
      if (consecutivePlanningCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 planning 状态循环（连续 ${consecutivePlanningCount} 次），强制要求开始工作`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
            `[警告] **立即开始${taskLabel}**！你已经在规划阶段停留过久。` +
            `**现在必须**将状态设置为 "working" 并**立即输出${taskLabel}结果**。` +
            `不要再返回 planning 状态，直接开始${taskLabel}工作。` +
            `返回格式：\`{"status": "working", "paragraphs": [...]}\``,
        });
      } else {
        // 正常的 planning 响应 - 使用更明确的指令
        // 如果是简短规划模式，强烈提醒 AI 已有上下文信息，无需重复获取
        const planningInstruction = isBriefPlanning
          ? `收到。你已继承前一部分的规划上下文（包括术语、角色、记忆等信息），**请直接使用这些信息**。` +
            `如需补充信息，优先使用**本次会话提供的工具**，并遵循“最小必要”原则（拿到信息就立刻回到任务输出）。` +
            `只有在需要获取当前段落的前后文上下文时，才建议使用 \`get_previous_paragraphs\`、\`get_next_paragraphs\` 等段落上下文工具。` +
            `仍然注意敬语翻译流程，确保翻译结果准确。`
          : `收到。如果你已获取必要信息，` +
            `**现在**将状态设置为 "working" 并开始输出${taskLabel}结果。` +
            `如果还需要使用工具获取信息，请调用工具后再更新状态。`;
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n${planningInstruction}`,
        });
      }
      continue;
    } else if (currentStatus === 'working') {
      // 更新连续状态计数
      consecutiveWorkingCount++;
      consecutivePlanningCount = 0; // 重置其他状态计数
      consecutiveReviewCount = 0; // 重置其他状态计数

      // 检测循环：如果连续处于 working 状态超过阈值且没有输出段落，强制要求完成
      if (consecutiveWorkingCount >= MAX_CONSECUTIVE_STATUS && accumulatedParagraphs.size === 0) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 working 状态循环（连续 ${consecutiveWorkingCount} 次且无输出），强制要求输出内容`,
        );

        const finishStatus = taskType === 'translation' ? 'review' : 'end';
        const noChangeHint =
          taskType === 'polish' || taskType === 'proofreading'
            ? `如果你确认**没有任何需要修改的段落**，请将状态设置为 "${finishStatus}"（无需输出 paragraphs）；否则请只返回有变化的段落。`
            : '';

        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。` +
            `**现在必须**输出${taskLabel}结果。${noChangeHint}` +
            `返回格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\``,
        });
      } else {
        // 检查是否所有段落都已返回
        let allParagraphsReturned = false;
        if (paragraphIds && paragraphIds.length > 0) {
          const verification = verifyCompleteness
            ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
            : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);
          allParagraphsReturned = verification.allComplete;
        }

        if (allParagraphsReturned) {
          const finishStatus = taskType === 'translation' ? 'review' : 'end';
          // 所有段落都已返回，提醒 AI 可以结束当前块
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `所有段落${taskLabel}已完成。如果不需要继续${taskLabel}，可以将状态设置为 "${finishStatus}"。` +
              (taskType === 'polish' || taskType === 'proofreading'
                ? '（润色/校对任务禁止使用 review）'
                : ''),
          });
        } else {
          // 正常的 working 响应 - 使用更明确的指令
          const finishStatus = taskType === 'translation' ? 'review' : 'end';
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `收到。继续${taskLabel}，完成后设为 "${finishStatus}"。` +
              (taskType === 'translation' ? '无需检查缺失段落，系统会自动验证。' : ''),
          });
        }
      }
      continue;
    } else if (currentStatus === 'review') {
      // 更新连续状态计数
      consecutiveReviewCount++;
      consecutivePlanningCount = 0;
      consecutiveWorkingCount = 0;

      // 复核阶段：验证完整性
      if (paragraphIds && paragraphIds.length > 0) {
        const verification = verifyCompleteness
          ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
          : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);

        if (!verification.allComplete && verification.missingIds.length > 0) {
          // 缺少段落，要求继续工作
          const missingIdsList = verification.missingIds.slice(0, 10).join(', ');
          const hasMore = verification.missingIds.length > 10;
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `检测到以下段落缺少${taskLabel}：${missingIdsList}` +
              `${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。` +
              `请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
          });
          currentStatus = 'working';
          consecutiveReviewCount = 0; // 重置计数，因为状态回到 working
          continue;
        }
      }

      // 检测循环：如果连续处于 review 状态超过阈值，强制要求结束
      if (consecutiveReviewCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 review 状态循环（连续 ${consecutiveReviewCount} 次），强制要求结束`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] 你已经在复核阶段停留过久。` +
            `如果你还想更新任何已输出的${taskLabel}结果，请将状态改回 \`{"status":"working"}\` 并提交需要更新的段落；` +
            `如果不需要后续操作，请**立即**返回 \`{"status": "end"}\`。`,
        });
      } else {
        // 所有段落都完整，询问后续操作
        const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus)}\n\n${postOutputPrompt}`,
        });
      }
      continue;
    } else if (currentStatus === 'end') {
      // 完成：退出循环
      break;
    }
  }

  // 检查是否达到最大回合数（仅在设置了有限值时才检查）
  if (currentStatus !== 'end' && maxTurns !== Infinity && currentTurnCount >= maxTurns) {
    throw new Error(
      `AI在${maxTurns}回合内未完成${taskLabel}任务（当前状态: ${currentStatus}）。请重试。`,
    );
  }

  // 计算总耗时和平均工具调用时间
  metrics.totalTime = Date.now() - startTime;
  metrics.averageToolCallTime =
    metrics.toolCallCount > 0 ? metrics.toolCallTime / metrics.toolCallCount : 0;

  // 检测规划上下文更新
  const planningContextUpdate = detectPlanningContextUpdate(collectedActions);

  // 输出性能日志
  if (aiProcessingStore && taskId) {
    console.log(`[${logLabel}] 📊 性能指标:`, {
      总耗时: `${metrics.totalTime}ms`,
      规划阶段: `${metrics.planningTime}ms`,
      工作阶段: `${metrics.workingTime}ms`,
      复核阶段: `${metrics.reviewTime}ms`,
      工具调用: `${metrics.toolCallCount} 次，平均 ${metrics.averageToolCallTime.toFixed(2)}ms`,
    });
  }

  return {
    responseText: finalResponseText,
    status: currentStatus,
    paragraphs: accumulatedParagraphs,
    titleTranslation,
    planningSummary,
    planningContextUpdate,
    metrics,
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
  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${TASK_TYPE_LABELS[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}
