import { TASK_TYPE_LABELS, type TaskType } from '../utils/task-types';
import { MAX_TRANSLATION_BATCH_SIZE } from './common';

/**
 * 获取规划阶段提示（包含循环检测）
 */
export function getPlanningLoopPrompt(
  taskType: TaskType,
  isBriefPlanning: boolean,
  isLoopDetected: boolean,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  if (isLoopDetected) {
    return (
      `[警告] **立即进入准备阶段**！你已经在规划阶段停留过久。` +
      `**现在必须**将状态更新为 "preparing"，并在准备阶段完成必要的数据维护。` +
      `不要再停留在 planning。` +
      `请使用工具调用：\`update_task_status({"status":"preparing"})\`。`
    );
  }

  return isBriefPlanning
    ? `收到。你已继承前一部分的规划上下文（包括术语、角色、记忆等信息），**请直接使用这些信息**。` +
        `如需补充信息，优先使用**本次会话提供的工具**，并遵循“最小必要”原则。` +
        `只有在需要获取当前段落的前后文上下文时，才建议使用 \`get_previous_paragraphs\`、\`get_next_paragraphs\` 等段落上下文工具。` +
        `仍然注意敬语翻译流程，确保翻译结果准确。完成规划后进入 preparing。`
    : `收到。如果你已获取必要信息，` +
        `**现在**用 \`update_task_status({"status":"preparing"})\` 切到 preparing。` +
        `如果还需要使用工具获取信息，请调用工具后再更新状态。`;
}

/**
 * 获取准备阶段提示（包含循环检测）
 */
export function getPreparingLoopPrompt(taskType: TaskType, isLoopDetected: boolean): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  if (isLoopDetected) {
    return (
      `[警告] **立即进入${taskLabel}输出阶段**！你已经在准备阶段停留过久。` +
      `如果数据维护已完成，请**现在**调用 \`update_task_status({"status":"working"})\` 开始${taskLabel}。`
    );
  }

  return (
    `收到。请在 preparing 阶段完成术语/角色/记忆维护。` +
    `如果无需更新，可直接调用 \`update_task_status({"status":"working"})\` 进入输出阶段。`
  );
}

/**
 * 获取工作阶段循环提示（无输出）
 */
export function getWorkingLoopPrompt(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const noChangeHint =
    taskType === 'polish' || taskType === 'proofreading'
      ? `如果你确认**没有任何需要修改的段落**，请用 \`update_task_status({"status":"${finishStatus}"})\` 结束（无需输出 paragraphs）；否则请只返回有变化的段落。`
      : '';

  return (
    `[警告] **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。` +
    `**现在必须**输出${taskLabel}结果。${noChangeHint}` +
    `请使用工具调用：\`add_translation_batch\` 提交段落（必须使用 paragraph_id，单次最多 ${MAX_TRANSLATION_BATCH_SIZE} 段）。`
  );
}

/**
 * 获取工作阶段完成提示
 */
export function getWorkingFinishedPrompt(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const note =
    taskType === 'polish' || taskType === 'proofreading' ? '（润色/校对任务禁止使用 review）' : '';
  return (
    `所有段落${taskLabel}已完成。如果不需要继续${taskLabel}，请用 \`update_task_status({"status":"${finishStatus}"})\` 结束。` +
    note
  );
}

/**
 * 获取工作阶段继续提示
 */
export function getWorkingContinuePrompt(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const finishStatus = taskType === 'translation' ? 'review' : 'end';
  const note = taskType === 'translation' ? '无需检查缺失段落，系统会自动验证。' : '';
  return (
    `收到。继续${taskLabel}，完成后用 \`update_task_status({"status":"${finishStatus}"})\` 结束。` +
    note
  );
}

/**
 * 获取复核阶段缺失段落提示
 */
export function getMissingParagraphsPrompt(taskType: TaskType, missingIds: string[]): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  const missingIdList = missingIds.map((id) => `"${id}"`).join(', ');

  return (
    `检测到以下段落缺少${taskLabel}结果（共 ${missingIds.length} 段，paragraph_id）：${missingIdList}。` +
    `请先用 \`update_task_status({"status":"working"})\` 切回 working，` +
    `再用 \`add_translation_batch\` 补全这些段落（必须使用 paragraph_id，单次最多 ${MAX_TRANSLATION_BATCH_SIZE} 段）。`
  );
}

/**
 * 获取复核阶段循环提示
 */
export function getReviewLoopPrompt(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  return (
    `[警告] 你已经在复核阶段停留过久。` +
    `如果你还想更新任何已输出的${taskLabel}结果，请用 \`update_task_status({"status":"working"})\` 切回 working 并提交需要更新的段落；` +
    `如果不需要后续操作，请**立即**用 \`update_task_status({"status":"end"})\` 结束。`
  );
}

/**
 * 获取状态限制下的工具调用提示
 */
export function getStatusRestrictedToolPrompt(
  toolName: string,
  currentStatus: 'planning' | 'working' | 'end',
): string {
  if (currentStatus === 'planning') {
    return (
      `[限制] 当前状态为 planning，不能调用 ${toolName} 进行数据写入。` +
      `请先用 \`update_task_status({"status":"preparing"})\` 进入 preparing 后再更新术语/角色/记忆。`
    );
  }

  if (currentStatus === 'working') {
    return (
      `[限制] 当前状态为 working，禁止调用 ${toolName} 进行数据写入。` +
      `请在 preparing 或 review 阶段进行术语/角色/记忆更新。`
    );
  }

  return `[限制] 当前状态为 end，任务已结束，不能调用 ${toolName} 进行数据写入。`;
}

/**
 * 获取 JSON 解析错误提示
 */
/**
 * 获取未授权工具警告
 */
export function getUnauthorizedToolPrompt(taskType: TaskType, toolName: string): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
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
