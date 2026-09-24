/**
 * 导入对话的上下文压缩：把检查点里的模型历史总结成摘要，清空旧消息。
 * 只压缩模型上下文；来源、提取结果、草稿、用户选择和操作记录（事件）保持不变。
 */
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ChatMessage } from 'src/services/ai/types/ai-service';
import { AssistantService } from 'src/services/ai/tasks/assistant-service';
import type { ImportCheckpoint, ImportRunContext, ImportTask } from 'src/models/import';
import { UNLIMITED_TOKENS } from 'src/constants/ai';
import { estimateMessagesTokenCount, estimateToolSchemaTokens } from 'src/utils/ai-token-utils';
import { ImportRepository } from './import-repository';
import { importTools } from './import-tool-definitions';
import { assertImportOwner } from './import-agent-journal';

/** 历史（含工具定义）占到上下文上限的这个比例时，开始运行前先压缩。 */
const COMPACT_RATIO = 0.7;
/** 上下文上限未知或不限时，按消息条数兜底。 */
const COMPACT_MESSAGE_LIMIT = 180;
/** 单条工具参数或结果进入摘要输入时的最大长度。 */
const TOOL_TEXT_LIMIT = 600;

function clip(text: string): string {
  return text.length > TOOL_TEXT_LIMIT ? `${text.slice(0, TOOL_TEXT_LIMIT)}…` : text;
}

/** 转成摘要输入：保留用户与助手的原话，工具调用和结果写成简短记录以保留来源、资源等标识。 */
function summaryInput(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const input: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.role === 'user' && message.content?.trim())
      input.push({ role: 'user', content: message.content });
    else if (message.role === 'assistant') {
      const calls = (message.tool_calls ?? []).map(
        (call) => `[调用 ${call.function.name} ${clip(call.function.arguments)}]`,
      );
      const content = [message.content?.trim() ?? '', ...calls].filter(Boolean).join('\n');
      if (content) input.push({ role: 'assistant', content });
    } else if (message.role === 'tool')
      input.push({
        role: 'assistant',
        content: `[${message.name ?? '工具'} 结果] ${clip(message.content ?? '')}`,
      });
  }
  return input;
}

function conversation(checkpoint: ImportCheckpoint | undefined): ChatMessage[] {
  return (checkpoint?.messages ?? []).filter((message) => message.role !== 'system');
}

/** 至少有一轮助手回复才值得压缩；只有用户消息时压缩无法缩小上下文。 */
function compactable(input: { role: 'user' | 'assistant' }[]): boolean {
  return input.some((entry) => entry.role === 'assistant');
}

/** 可以压缩：有对话历史，且没有等待执行（如等待回答）的工具调用。 */
export function canCompactImport(task: ImportTask): boolean {
  return (
    !task.checkpoint?.remainingCalls.length &&
    compactable(summaryInput(conversation(task.checkpoint)))
  );
}

export function importNeedsCompaction(task: ImportTask, model: AIModel): boolean {
  if (!canCompactImport(task)) return false;
  const messages = task.checkpoint!.messages;
  const limit = model.maxInputTokens;
  if (!limit || limit <= 0 || limit === UNLIMITED_TOKENS)
    return messages.length >= COMPACT_MESSAGE_LIMIT;
  const tokens = estimateMessagesTokenCount(messages) + estimateToolSchemaTokens(importTools);
  return tokens >= limit * COMPACT_RATIO;
}

async function setCompacting(taskId: string, run: ImportRunContext | undefined, on: boolean) {
  await ImportRepository.mutateTask(taskId, (task) => {
    if (run) assertImportOwner(task, run);
    if (on) task.compacting = true;
    else delete task.compacting;
    return Promise.resolve();
  });
}

/**
 * 总结并替换检查点历史。run 存在时（运行中的自动压缩）校验运行归属。
 * 总结失败时保留原历史，只清除压缩中状态。
 */
export async function compactImportHistory(
  taskId: string,
  model: AIModel,
  options: {
    run?: ImportRunContext;
    reason: 'manual' | 'auto';
    signal?: AbortSignal;
    notify?: () => void;
  },
): Promise<void> {
  const task = await ImportRepository.getTask(taskId);
  if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
  if (task.checkpoint?.remainingCalls.length)
    throw new Error('COMPACT_UNAVAILABLE: 还有未完成的工具调用，请先回答问题或继续执行');
  const input = summaryInput(conversation(task.checkpoint));
  if (!compactable(input)) throw new Error('COMPACT_UNAVAILABLE: 没有可以压缩的对话');
  const { run } = options;
  await setCompacting(taskId, run, true);
  options.notify?.();
  let summary: string;
  try {
    summary = await AssistantService.summarizeSession(model, input, {
      ...(task.checkpoint?.summary ? { previousSummary: task.checkpoint.summary } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    await setCompacting(taskId, run, false);
    throw error;
  }
  const checkpoint: ImportCheckpoint = {
    messages: [],
    remainingCalls: [],
    completedCallIds: [],
    summary,
  };
  await ImportRepository.mutateTask(
    taskId,
    (current) => {
      if (run) assertImportOwner(current, run);
      delete current.compacting;
      // 执行中因上下文上限暂停后压缩：恢复运行状态以便自动继续
      if (run && current.state === 'paused' && current.lastError?.code === 'CONTEXT_LIMIT') {
        current.state = 'running';
        delete current.lastError;
      }
      return Promise.resolve();
    },
    {
      finish: () => ({
        events: [{ kind: 'summary', data: { reason: options.reason, messages: input.length } }],
        checkpoint,
      }),
    },
  );
}
