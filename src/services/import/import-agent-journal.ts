import type {
  AssistantExecutionCheckpoint,
  AssistantExecutionProfile,
} from 'src/services/ai/tasks/utils/assistant-execution';
import type { ImportRunContext, ImportTask } from 'src/models/import';
import { ImportRepository } from './import-repository';
import type { ImportTransaction, NewEvent } from './import-repository';
import { importCheckpoint } from './import-tool-executor';
import { awaitingImportAnswer } from './import-question-service';

export function assertImportOwner(task: ImportTask, run: ImportRunContext): void {
  if (task.run?.runId !== run.runId || task.runEpoch !== run.runEpoch)
    throw new Error('RUN_STALE: 导入运行已被替代');
}

async function hasToolEvent(
  tx: ImportTransaction,
  taskId: string,
  callId: string,
  kind: NewEvent['kind'],
): Promise<boolean> {
  return (
    await tx.objectStore('import-events').index('by-task-call').getAll([taskId, callId])
  ).some((event) => event.kind === kind);
}

async function missingToolEvents(
  tx: ImportTransaction,
  taskId: string,
  checkpoint: AssistantExecutionCheckpoint,
): Promise<NewEvent[]> {
  const events: NewEvent[] = [];
  for (const message of checkpoint.messages) {
    for (const call of message.tool_calls ?? []) {
      if (!(await hasToolEvent(tx, taskId, call.id, 'tool-call')))
        events.push({
          kind: 'tool-call',
          callId: call.id,
          toolName: call.function.name,
          data: call.function.arguments,
        });
    }
    if (
      message.role === 'tool' &&
      message.tool_call_id &&
      !(await hasToolEvent(tx, taskId, message.tool_call_id, 'tool-result'))
    ) {
      events.push({
        kind: 'tool-result',
        callId: message.tool_call_id,
        toolName: message.name ?? '',
        data: JSON.parse(message.content ?? '{}') as unknown,
      });
    }
  }
  return events;
}

/** 模型完整回复与工具调用先落盘；有副作用的工具仍自行原子保存结果。 */
export async function saveImportAgentCheckpoint(
  run: ImportRunContext,
  checkpoint: AssistantExecutionCheckpoint,
  state: Parameters<AssistantExecutionProfile['saveCheckpoint']>[1],
): Promise<void> {
  await ImportRepository.mutateTask(
    run.taskId,
    async (task, tx) => {
      assertImportOwner(task, run);
      const events = await missingToolEvents(tx, task.id, checkpoint);
      if (state.phase === 'response') {
        const message = checkpoint.messages.at(-1);
        if (message?.role === 'assistant') events.push({ kind: 'message', message, data: {} });
        delete task.streaming;
      }
      if (state.phase === 'paused' || state.phase === 'complete') {
        const plan = task.currentPlanId
          ? await tx.objectStore('import-operations').get(task.currentPlanId)
          : undefined;
        const ready =
          plan?.state === 'planned' &&
          plan.plan.draftRevision === task.draft.revision &&
          !plan.plan.conflicts.length;
        task.state = awaitingImportAnswer(task)
          ? 'waiting_user'
          : state.phase === 'complete' && ready
            ? 'ready'
            : 'paused';
        if (state.reason && state.reason !== 'user' && state.reason !== 'waiting_user')
          task.lastError = {
            code: state.reason.toUpperCase(),
            message:
              state.reason === 'context_limit'
                ? '上下文达到上限，已保存进度，请继续整理或缩小当前范围。'
                : '本轮工具调用达到上限，已保存剩余调用，可继续执行。',
          };
        events.push({ kind: 'progress', data: { state: task.state, reason: state.reason } });
        delete task.streaming;
      }
      return events;
    },
    { finish: (events) => ({ events, checkpoint: importCheckpoint(checkpoint) }) },
  );
}
