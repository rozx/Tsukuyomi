import {
  getStatusLabel,
  getValidTransitionsForTaskType,
  getTaskStateWorkflowText,
  type TaskStatus,
  type TaskType,
} from '../utils/task-types';
import { TASK_LABELS } from './common';

/**
 * 获取流式输出错误提示
 */
export function getStreamErrorPrompt(
  errorMessage: string,
  taskType: TaskType,
  currentStatus: TaskStatus,
): string {
  if (errorMessage.includes('状态转换错误')) {
    const validTransitions = getValidTransitionsForTaskType(taskType);
    const expectedNext = validTransitions[currentStatus]?.[0] || 'working';
    return (
      `[警告] **状态转换错误**：你返回了无效的状态转换。\n\n` +
      `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
      `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，应该先转换到 "${getStatusLabel(expectedNext, taskType)}"。\n\n` +
      `请重新返回正确的状态：{"status": "${expectedNext}"}`
    );
  } else if (errorMessage.includes('无效状态值')) {
    return (
      `[警告] **无效状态值**：你返回了无效的状态值。\n\n` +
      `**有效的状态值**：planning、working、review、end\n\n` +
      `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，请返回正确的状态值。`
    );
  } else if (errorMessage.includes('状态与内容不匹配')) {
    return getContentStateMismatchPrompt(currentStatus);
  }
  return errorMessage;
}

/**
 * 获取无效状态转换提示
 */
export function getInvalidTransitionPrompt(
  taskType: TaskType,
  prevStatus: TaskStatus,
  nextStatus: TaskStatus,
): string {
  const expected = getValidTransitionsForTaskType(taskType)[prevStatus]?.[0] || 'working';

  return (
    `[警告] **状态转换错误**：你试图从 "${getStatusLabel(prevStatus, taskType)}" 直接转换到 "${getStatusLabel(nextStatus, taskType)}"，这是**禁止的**。\n\n` +
    `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
    `你当前处于 "${getStatusLabel(prevStatus, taskType)}"，应该先转换到 "${getStatusLabel(expected, taskType)}"。\n\n` +
    `请重新返回正确的状态：{"status": "${expected}"}`
  );
}

/**
 * 获取规划阶段提示（包含循环检测）
 */
export function getPlanningLoopPrompt(
  taskType: TaskType,
  isBriefPlanning: boolean,
  isLoopDetected: boolean,
): string {
  const taskLabel = TASK_LABELS[taskType];

  if (isLoopDetected) {
    return (
      `[警告] **立即开始${taskLabel}**！你已经在规划阶段停留过久。` +
      `**现在必须**将状态设置为 "working" 并**立即输出${taskLabel}结果**。` +
      `不要再返回 planning 状态，直接开始${taskLabel}工作。` +
      `返回格式：\`{"status": "working", "paragraphs": [...]}\``
    );
  }

  return isBriefPlanning
    ? `收到。你已继承前一部分的规划上下文（包括术语、角色、记忆等信息），**请直接使用这些信息**。` +
        `如需补充信息，优先使用**本次会话提供的工具**，并遵循“最小必要”原则。` +
        `只有在需要获取当前段落的前后文上下文时，才建议使用 \`get_previous_paragraphs\`、\`get_next_paragraphs\` 等段落上下文工具。` +
        `仍然注意敬语翻译流程，确保翻译结果准确。`
    : `收到。如果你已获取必要信息，` +
        `**现在**将状态设置为 "working" 并开始输出${taskLabel}结果。` +
        `如果还需要使用工具获取信息，请调用工具后再更新状态。`;
}

/**
 * 获取工作阶段循环提示（无输出）
 */
export function getWorkingLoopPrompt(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const noChangeHint =
    taskType === 'polish' || taskType === 'proofreading'
      ? `如果你确认**没有任何需要修改的段落**，请将状态设置为 "${finishStatus}"（无需输出 paragraphs）；否则请只返回有变化的段落。`
      : '';

  return (
    `[警告] **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。` +
    `**现在必须**输出${taskLabel}结果。${noChangeHint}` +
    `返回格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\``
  );
}

/**
 * 获取工作阶段完成提示
 */
export function getWorkingFinishedPrompt(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const note =
    taskType === 'polish' || taskType === 'proofreading' ? '（润色/校对任务禁止使用 review）' : '';
  return (
    `所有段落${taskLabel}已完成。如果不需要继续${taskLabel}，可以将状态设置为 "${finishStatus}"。` +
    note
  );
}

/**
 * 获取工作阶段继续提示
 */
export function getWorkingContinuePrompt(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const note = taskType === 'translation' ? '无需检查缺失段落，系统会自动验证。' : '';
  return `收到。继续${taskLabel}，完成后设为 "${finishStatus}"。` + note;
}

/**
 * 获取复核阶段缺失段落提示
 */
export function getMissingParagraphsPrompt(taskType: TaskType, missingIndices: number[]): string {
  const taskLabel = TASK_LABELS[taskType];

  // Helper to format indices as ranges (e.g. "1, 2, 3" -> "1-3")
  const ranges: string[] = [];
  const sorted = [...missingIndices].sort((a, b) => a - b);

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    if (start === undefined) continue;
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      end = sorted[i + 1]!;
      i++;
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }

  const missingIndicesList = ranges.join(', ');

  return (
    `检测到以下段落（index）缺少${taskLabel}结果：${missingIndicesList}。` +
    `请将状态设置为 "working" 并补全这些段落的${taskLabel}（需包含 index）。`
  );
}

/**
 * 获取复核阶段循环提示
 */
export function getReviewLoopPrompt(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  return (
    `[警告] 你已经在复核阶段停留过久。` +
    `如果你还想更新任何已输出的${taskLabel}结果，请将状态改回 \`{"status":"working"}\` 并提交需要更新的段落；` +
    `如果不需要后续操作，请**立即**返回 \`{"status": "end"}\`。`
  );
}

/**
 * 获取 JSON 解析错误提示
 */
export function getParseErrorPrompt(error: string): string {
  return (
    `响应格式错误：${error}。[警告] 只返回JSON。` +
    `你可以直接返回 \`{"status":"working","paragraphs":[...]}\`（或仅返回 \`{"status":"working"}\`）。` +
    `系统会自动检查缺失段落。`
  );
}

/**
 * 获取状态与内容不匹配提示
 */
export function getContentStateMismatchPrompt(status: string): string {
  return (
    `[警告] **状态与内容不匹配**：本任务中，只有当 \`status="working"\` 时才允许输出 ` +
    `\`paragraphs/titleTranslation\`。\n\n` +
    `你当前返回的 status="${status}" 却包含了内容字段。` +
    `请立刻重试：用 \`{"status":"working", ...}\` 重新返回（内容保持一致即可）。`
  );
}

/**
 * 获取未授权工具警告
 */
export function getUnauthorizedToolPrompt(taskType: TaskType, toolName: string): string {
  const taskLabel = TASK_LABELS[taskType];
  return (
    `[警告] 工具 ${toolName} 未在本次会话提供的 tools 列表中，禁止调用。` +
    `请改用可用工具或基于已有上下文继续${taskLabel}。`
  );
}

/**
 * 获取工具调用次数上限警告
 */
export function getToolLimitReachedPrompt(toolName: string, limit: number): string {
  return `[警告] 工具 ${toolName} 调用次数已达上限（${limit} 次），请使用已获取的信息继续工作。`;
}

/**
 * 获取简短规划模式下的重复工具警告
 */
export function getBriefPlanningToolWarningPrompt(): string {
  return `\n\n[警告] **注意**：此工具的结果已在规划上下文中提供，后续 chunk 无需重复调用此工具。`;
}
