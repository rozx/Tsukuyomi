import type { AIModel } from 'src/services/ai/types/ai-model';
import type { TextGenerationChunk } from 'src/services/ai/types/ai-service';
import { AssistantService } from 'src/services/ai/tasks/assistant-service';
import { AssistantExecution } from 'src/services/ai/tasks/utils/assistant-execution';
import type { AssistantExecutionCheckpoint } from 'src/services/ai/tasks/utils/assistant-execution';
import type { ImportRunContext, ImportTask } from 'src/models/import';
import { ImportRepository } from './import-repository';
import { ImportToolExecutor, importTools } from './import-tool-executor';
import { importAgentPrompt } from './import-agent-prompt';
import { assertImportOwner, saveImportAgentCheckpoint } from './import-agent-journal';
import { awaitingImportAnswer } from './import-question-service';
import { conciseErrorText } from './import-error-text';

type UpdateListener = (taskId: string) => void;
const listeners = new Set<UpdateListener>();
const TASK_LOCK_PREFIX = 'tsukuyomi:import-task:';
const RELEASE_TIMEOUT_MS = 30_000;
function notify(taskId: string): void {
  for (const listener of listeners) {
    try {
      Promise.resolve(listener(taskId)).catch((error: unknown) =>
        console.warn('导入界面刷新失败:', error),
      );
    } catch (error) {
      console.warn('导入界面刷新失败:', error);
    }
  }
}
function restoredCheckpoint(task: ImportTask): AssistantExecutionCheckpoint | undefined {
  if (!task.checkpoint) return undefined;
  return {
    ...task.checkpoint,
    remainingCalls: task.checkpoint.remainingCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}
async function requireTask(taskId: string): Promise<ImportTask> {
  const task = await ImportRepository.getTask(taskId);
  if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
  return task;
}

/** 页面切换不结束执行；锁、取消和检查点归属于一次明确的任务运行。 */
export class ImportAgentService {
  private static active:
    | { taskId: string; controller: AbortController; promise: Promise<ImportTask> }
    | undefined;
  static get activeTaskId(): string | undefined {
    return this.active?.taskId;
  }
  static async findActiveTaskId(): Promise<string | undefined> {
    if (typeof navigator === 'undefined' || !navigator.locks?.query) return this.activeTaskId;
    const snapshot = await navigator.locks.query();
    return snapshot.held
      ?.find((lock) => lock.name?.startsWith(TASK_LOCK_PREFIX))
      ?.name?.slice(TASK_LOCK_PREFIX.length);
  }
  static subscribe(listener: UpdateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  static async run(taskId: string, model: AIModel, message = ''): Promise<ImportTask> {
    if (typeof navigator === 'undefined' || !navigator.locks)
      throw new Error('LOCK_UNAVAILABLE: 当前环境不能协调导入运行');
    if (!model.id || !model.enabled) throw new Error('MODEL_UNAVAILABLE: 请先选择可用的助手模型');
    const locks = navigator.locks;
    return locks.request('tsukuyomi:import-agent', { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('IMPORT_BUSY: 已有导入任务正在运行，请先暂停该任务');
      const task = await requireTask(taskId);
      if (awaitingImportAnswer(task))
        throw new Error('PENDING_QUESTION: 请先完成当前任务的必要选择');
      const prompt = message.trim()
        ? message
        : task.checkpoint?.remainingCalls.length
          ? ''
          : '请根据当前来源与草稿继续整理，并生成可检查的导入方案。';
      return locks.request(`${TASK_LOCK_PREFIX}${taskId}`, { ifAvailable: true }, async (owner) => {
        if (!owner) throw new Error('IMPORT_BUSY: 当前任务仍有未结束的执行');
        return this.runOwned(taskId, model, prompt);
      });
    });
  }

  private static async runOwned(
    taskId: string,
    model: AIModel,
    message: string,
  ): Promise<ImportTask> {
    const controller = new AbortController();
    const promise = this.perform(taskId, model, message, controller);
    const active = { taskId, controller, promise };
    this.active = active;
    notify(taskId);
    try {
      return await promise;
    } finally {
      if (this.active === active) this.active = undefined;
      notify(taskId);
    }
  }

  static async pause(taskId: string): Promise<ImportTask> {
    await ImportRepository.mutateTask(taskId, (task) => {
      if (task.state === 'running') task.state = 'pausing';
      return Promise.resolve();
    });
    notify(taskId);
    const active = this.active;
    if (active?.taskId === taskId) {
      active.controller.abort();
      await active.promise;
      return requireTask(taskId);
    }
    return this.waitForRelease(taskId);
  }

  /**
   * 刷新或关闭页面后，任务可能停留在 running／pausing。只有取得任务锁（确认没有页面仍在执行）
   * 才把它转为可继续状态并作废旧运行代次；锁被占用时仅返回当前状态，不抢占。
   */
  static async recover(taskId: string): Promise<ImportTask> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks || this.active?.taskId === taskId) return requireTask(taskId);
    const reclaimed = await locks.request(
      `${TASK_LOCK_PREFIX}${taskId}`,
      { ifAvailable: true },
      async (lock) => (lock ? this.reclaim(taskId) : undefined),
    );
    return reclaimed ?? requireTask(taskId);
  }

  private static async reclaim(taskId: string): Promise<ImportTask> {
    const task = await ImportRepository.mutateTask(taskId, (current) => {
      if (current.state !== 'running' && current.state !== 'pausing')
        return Promise.resolve(current);
      if (current.state === 'running')
        current.lastError = {
          code: 'INTERRUPTED',
          message: '上次执行在页面关闭或刷新时中断，已保存的进度可以继续。',
        };
      current.state = awaitingImportAnswer(current) ? 'waiting_user' : 'paused';
      delete current.run;
      delete current.streaming;
      current.runEpoch++;
      return Promise.resolve(current);
    });
    notify(taskId);
    return task;
  }

  /** 执行在其他页面：等它在下一步骤前停止并释放任务锁；超时则保持「暂停中」交给界面显示。 */
  private static async waitForRelease(taskId: string): Promise<ImportTask> {
    const deadline = Date.now() + RELEASE_TIMEOUT_MS;
    for (;;) {
      const task = await this.recover(taskId);
      const stopping = task.state === 'running' || task.state === 'pausing';
      if (!stopping || typeof navigator === 'undefined' || !navigator.locks) return task;
      if (Date.now() >= deadline) return task;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private static async perform(
    taskId: string,
    model: AIModel,
    message: string,
    controller: AbortController,
  ): Promise<ImportTask> {
    const run = await ImportRepository.mutateTask(
      taskId,
      (task) => {
        task.runEpoch++;
        const run: ImportRunContext = {
          taskId,
          runId: crypto.randomUUID(),
          runEpoch: task.runEpoch,
          modelId: model.id,
        };
        task.run = run;
        task.state = 'running';
        delete task.lastError;
        return Promise.resolve(run);
      },
      {
        finish: () => ({
          events: message.trim()
            ? [{ kind: 'message', message: { role: 'user', content: message }, data: {} }]
            : [],
        }),
      },
    );
    const task = await requireTask(taskId);
    const executor = new ImportToolExecutor(run);
    let streaming = '';
    let lastStreamSave = 0;
    let checking = false;
    const checkPause = () => {
      if (checking) return;
      checking = true;
      void requireTask(taskId)
        .then((current) => {
          if (current.run?.runId !== run.runId || current.state !== 'running') controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          checking = false;
        });
    };
    const timer = setInterval(checkPause, 750);
    const resume = restoredCheckpoint(task);
    const execution = new AssistantExecution({
      context: {
        currentBookId: null,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      },
      tools: importTools,
      systemPrompt: (summary) => importAgentPrompt(taskId, summary),
      ...(resume ? { resume } : {}),
      executeTool: (call, options) => executor.execute(call, options),
      saveCheckpoint: async (checkpoint, state) => {
        await saveImportAgentCheckpoint(run, checkpoint, state);
        if (state.phase === 'response') streaming = '';
        notify(taskId);
      },
    });
    const onChunk = async (chunk: TextGenerationChunk) => {
      if (!chunk.text || controller.signal.aborted) return;
      streaming += chunk.text;
      if (Date.now() - lastStreamSave < 400 && !chunk.done) return;
      lastStreamSave = Date.now();
      await ImportRepository.mutateTask(taskId, (current) => {
        assertImportOwner(current, run);
        if (current.state !== 'running') throw new Error('RUN_STALE: 执行已停止');
        current.streaming = { text: streaming };
        return Promise.resolve();
      });
      notify(taskId);
    };
    try {
      await AssistantService.chat(model, message, {
        execution,
        signal: controller.signal,
        onChunk,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = conciseErrorText(
        model.apiKey ? raw.replaceAll(model.apiKey, '[已隐藏凭据]') : raw,
      );
      await ImportRepository.mutateTask(taskId, (current) => {
        assertImportOwner(current, run);
        current.state = awaitingImportAnswer(current)
          ? 'waiting_user'
          : controller.signal.aborted
            ? 'paused'
            : 'failed';
        current.lastError = { code: 'IMPORT_FAILED', message };
        return Promise.resolve();
      });
      if (!controller.signal.aborted) throw new Error(message, { cause: error });
    } finally {
      clearInterval(timer);
      await ImportRepository.mutateTask(taskId, (current) => {
        assertImportOwner(current, run);
        if (current.state === 'running' || current.state === 'pausing') current.state = 'paused';
        delete current.run;
        current.runEpoch++;
        return Promise.resolve();
      });
      notify(taskId);
    }
    return requireTask(taskId);
  }
}
