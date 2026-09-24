/** 导入手动压缩只替换模型上下文；运行中的自动压缩由共享助手请求入口负责。 */
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ImportCheckpoint, ImportRunContext, ImportTask } from 'src/models/import';
import { compactHistory } from 'src/services/ai/context/compact-history';
import { contextBudgets } from 'src/services/ai/context/constants';
import { resolveModelLimits } from 'src/services/ai/model-limits/resolve';
import { ImportRepository } from './import-repository';
import { assertImportOwner } from './import-agent-journal';

function conversation(checkpoint: ImportCheckpoint | undefined) {
  return (checkpoint?.messages ?? []).filter((message) => message.role !== 'system');
}

export function canCompactImport(task: ImportTask): boolean {
  const messages = conversation(task.checkpoint);
  return (
    !task.checkpoint?.remainingCalls.length &&
    messages.some((message) => message.role === 'user') &&
    messages.some(
      (message) =>
        message.role === 'assistant' && (message.content?.trim() || message.tool_calls?.length),
    )
  );
}

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
  if (!canCompactImport(task))
    throw new Error('COMPACT_UNAVAILABLE: 没有可压缩的对话，或还有未完成的工具调用');
  const history = conversation(task.checkpoint);
  const previousCheckpoint = JSON.stringify(task.checkpoint);
  const { run } = options;
  await ImportRepository.mutateTask(taskId, (current) => {
    if (run) assertImportOwner(current, run);
    current.compacting = true;
    return Promise.resolve();
  });
  options.notify?.();
  try {
    const budget =
      options.reason === 'manual'
        ? 0
        : contextBudgets(await resolveModelLimits(model)).keepRecentBudget;
    const result = await compactHistory({
      history,
      pinnedIndex: history.findLastIndex((message) => message.role === 'user'),
      keepRecentBudget: budget,
      previousSummary: task.checkpoint?.summary,
      model,
      signal: options.signal,
    });
    if (!result) throw new Error('COMPACT_UNAVAILABLE: 当前历史没有可以安全压缩的部分');
    options.signal?.throwIfAborted();
    const checkpoint: ImportCheckpoint = {
      ...task.checkpoint!,
      messages: result.keep,
      summary: result.summary,
    };
    delete checkpoint.contextAnchor;
    await ImportRepository.mutateTask(
      taskId,
      (current) => {
        if (run) assertImportOwner(current, run);
        if (JSON.stringify(current.checkpoint) !== previousCheckpoint)
          throw new Error('COMPACT_STALE: 对话在压缩期间已更新，请重试');
        delete current.compacting;
        if (run && current.state === 'paused' && current.lastError?.code === 'CONTEXT_LIMIT') {
          current.state = 'running';
          delete current.lastError;
        }
        return Promise.resolve();
      },
      {
        finish: () => ({
          events: [{ kind: 'summary', data: { reason: options.reason, messages: history.length } }],
          checkpoint,
        }),
      },
    );
  } finally {
    await ImportRepository.mutateTask(taskId, (current) => {
      if (run) assertImportOwner(current, run);
      delete current.compacting;
      return Promise.resolve();
    });
    options.notify?.();
  }
}
