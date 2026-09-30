/** 导入手动压缩只替换模型上下文；运行中的自动压缩由共享助手请求入口负责。 */
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ImportCheckpoint, ImportRunContext, ImportTask } from 'src/models/import';
import { compactHistory } from 'src/services/ai/context/compact-history';
import { contextBudgets } from 'src/services/ai/context/constants';
import { resolveModelLimits } from 'src/services/ai/model-limits/resolve';
import { ImportRepository } from './import-repository';
import { assertImportOwner } from './import-agent-journal';
import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';

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
    uiLocale?: AppLocale;
  },
): Promise<void> {
  const task = await ImportRepository.getTask(taskId);
  if (!task)
    throw new Error(
      'TASK_NOT_FOUND: ' + translateText(options.uiLocale ?? 'zh-CN', 'aiImportPrompt.taskMissing'),
    );
  const uiLocale = task.checkpoint?.uiLocale ?? 'zh-CN';
  if (!canCompactImport(task))
    throw new Error(
      'COMPACT_UNAVAILABLE: ' + translateText(uiLocale, 'aiImportPrompt.compactNoConversation'),
    );
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
      uiLocale: task.checkpoint?.uiLocale ?? 'zh-CN',
      history,
      pinnedIndex: history.findLastIndex((message) => message.role === 'user'),
      keepRecentBudget: budget,
      previousSummary: task.checkpoint?.summary,
      model,
      signal: options.signal,
    });
    if (!result)
      throw new Error(
        'COMPACT_UNAVAILABLE: ' + translateText(uiLocale, 'aiImportPrompt.compactNoSafePart'),
      );
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
          throw new Error(
            'COMPACT_STALE: ' + translateText(uiLocale, 'aiImportPrompt.compactStale'),
          );
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
