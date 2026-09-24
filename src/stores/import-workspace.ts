import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type {
  ImportDraftOperation,
  ImportDraftRemoval,
  ImportEvent,
  ImportOperation,
  ImportPlan,
  ImportQuestionAnswer,
  ImportSource,
  ImportTask,
} from 'src/models/import';
import type { AIModel } from 'src/services/ai/types/ai-model';
import { ImportAgentService } from 'src/services/import/import-agent-service';
import { ImportRepository } from 'src/services/import/import-repository';
import { renameImportTask } from 'src/services/import/import-task-naming';
import { canCompactImport } from 'src/services/import/import-agent-compaction';
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportDraftService } from 'src/services/import/import-draft-service';
import { ImportPlanService } from 'src/services/import/import-plan-service';
import {
  ImportQuestionService,
  awaitingImportAnswer,
} from 'src/services/import/import-question-service';
import { ImportMetadataService } from 'src/services/import/import-metadata-service';
import { ImportApplicationService } from 'src/services/import/import-application-service';
import {
  ImportStorageStatus,
  type ImportStorageIssue,
} from 'src/services/import/import-storage-status';
import { useAIModelsStore } from 'src/stores/ai-models';
import { conciseErrorText } from 'src/services/import/import-error-text';
import {
  importSuccess,
  importFailure,
  importApplicationFeedback,
  importPlanFeedback,
  importRunFeedback,
  importPauseFeedback,
  importDraftRemovalFeedback,
} from 'src/utils/import-feedback';
import type { ImportAction, ImportFeedback } from 'src/utils/import-feedback';

const PAGE = 100;
const MAX_EVENTS = 5000;
const CHANNEL = 'tsukuyomi:import-tasks';
const ACTIVE_STATES = new Set<ImportTask['state']>(['running', 'pausing']);

function message(error: unknown): string {
  return conciseErrorText(error instanceof Error ? error.message : String(error));
}

async function allSources(taskId: string): Promise<ImportSource[]> {
  const items: ImportSource[] = [];
  let cursor: string | undefined;
  do {
    const page = await ImportRepository.listSources(taskId, { limit: PAGE, cursor });
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

async function eventsAfter(taskId: string, afterSequence: number): Promise<ImportEvent[]> {
  const items: ImportEvent[] = [];
  let after = afterSequence;
  for (;;) {
    const page = await ImportRepository.listEvents(taskId, { limit: PAGE, afterSequence: after });
    items.push(...page.items);
    if (!page.hasMore || !page.items.length || items.length >= MAX_EVENTS) return items;
    after = page.items.at(-1)!.sequence;
  }
}

async function allTasks(): Promise<ImportTask[]> {
  const items: ImportTask[] = [];
  let cursor: string | undefined;
  do {
    const page = await ImportRepository.listTasks({ limit: PAGE, cursor });
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

/**
 * 导入工作台的共享状态。页面、三个设备变体和布局中的导入聊天面板共用同一份，
 * 断点切换或变体重挂载不会重复初始化或重启 Agent。
 */
export const useImportWorkspaceStore = defineStore('import-workspace', () => {
  const tasks = ref<ImportTask[]>([]);
  const selectedTaskId = ref<string | null>(null);
  const task = ref<ImportTask | null>(null);
  const sources = ref<ImportSource[]>([]);
  const events = ref<ImportEvent[]>([]);
  const plan = ref<ImportPlan | null>(null);
  const operations = ref<ImportOperation[]>([]);
  const runningTaskId = ref<string | undefined>();
  const storageIssues = ref<Record<string, ImportStorageIssue>>({});
  const error = ref<string | null>(null);
  /** 出错的动作（run、compact 等），界面据此决定在对话区还是状态栏显示。 */
  const errorAction = ref<string | null>(null);
  const pendingAction = ref<string | null>(null);
  /** 仅代表刚结束的界面操作；不持久化或广播，避免刷新／跨标签重放通知。 */
  const feedback = shallowRef<ImportFeedback | null>(null);

  function taskName(taskId: string): string | undefined {
    return (
      tasks.value.find((entry) => entry.id === taskId)?.name ??
      (task.value?.id === taskId ? task.value.name : undefined)
    );
  }

  function publishFeedback(value: ImportFeedback | undefined, name?: string): void {
    if (!value) return;
    feedback.value = { ...value, detail: [name, value.detail].filter(Boolean).join('：') };
  }

  function reportFailure(
    action: ImportAction,
    failure: unknown,
    taskId?: string,
    name = taskId ? taskName(taskId) : undefined,
  ): void {
    const detail = message(failure);
    if (!taskId || selectedTaskId.value === taskId) setError(detail, action);
    publishFeedback(importFailure(action, detail), name);
  }

  function setError(text: string | null, action: string | null = null): void {
    error.value = text;
    errorAction.value = text ? action : null;
  }

  const application = new ImportApplicationService();
  const disposers: (() => void)[] = [];
  let initializing: Promise<void> | null = null;
  let channel: BroadcastChannel | null = null;
  let loadToken = 0;

  const storageIssue = computed(() =>
    selectedTaskId.value ? storageIssues.value[selectedTaskId.value] : undefined,
  );
  const isRunning = computed(
    () =>
      Boolean(task.value && ACTIVE_STATES.has(task.value.state)) ||
      (runningTaskId.value !== undefined && runningTaskId.value === selectedTaskId.value),
  );
  /** 可以让月詠继续：已配置模型、没有待回答的必要问题、不在压缩或运行，也没有其他任务在运行。 */
  const canContinue = computed(
    () =>
      Boolean(task.value && !task.value.compacting && !awaitingImportAnswer(task.value)) &&
      !isRunning.value &&
      !(runningTaskId.value !== undefined && runningTaskId.value !== selectedTaskId.value) &&
      Boolean(useAIModelsStore().getDefaultModelForTask('assistant')),
  );
  const canCompact = computed(
    () =>
      Boolean(task.value && !task.value.compacting && canCompactImport(task.value)) &&
      !isRunning.value &&
      pendingAction.value !== 'compact',
  );
  const sourceNames = computed(
    () => new Map(sources.value.map((source) => [source.id, source.name] as const)),
  );

  function upsertTask(updated: ImportTask | undefined, id: string): void {
    const index = tasks.value.findIndex((entry) => entry.id === id);
    if (!updated) {
      if (index >= 0) tasks.value.splice(index, 1);
      return;
    }
    if (index >= 0) tasks.value.splice(index, 1, updated);
    else tasks.value.unshift(updated);
  }

  async function refreshTasks(): Promise<void> {
    tasks.value = await allTasks();
  }

  async function refreshRunning(): Promise<void> {
    runningTaskId.value =
      ImportAgentService.activeTaskId ?? (await ImportAgentService.findActiveTaskId());
  }

  /** 载入选中任务；较早发起的加载在较新选择之后返回时直接丢弃。 */
  async function load(taskId: string, incremental: boolean): Promise<void> {
    const token = ++loadToken;
    const lastSequence = incremental ? (events.value.at(-1)?.sequence ?? 0) : 0;
    const [current, sourceList, newEvents, operationList] = await Promise.all([
      ImportRepository.getTask(taskId),
      allSources(taskId),
      eventsAfter(taskId, lastSequence),
      ImportRepository.listOperations(taskId),
    ]);
    const currentPlan = current?.currentPlanId
      ? await ImportPlanService.get(current.currentPlanId)
      : undefined;
    if (token !== loadToken || selectedTaskId.value !== taskId) return;
    task.value = current ?? null;
    sources.value = sourceList;
    events.value = incremental ? [...events.value, ...newEvents] : newEvents;
    operations.value = operationList;
    plan.value = currentPlan ?? null;
    upsertTask(current, taskId);
  }

  async function onTaskUpdated(taskId: string, broadcast = true): Promise<void> {
    if (broadcast) channel?.postMessage({ taskId });
    try {
      upsertTask(await ImportRepository.getTask(taskId), taskId);
      if (taskId === selectedTaskId.value) await load(taskId, true);
      await refreshRunning();
    } catch (failure) {
      console.warn('导入任务刷新失败:', failure);
    }
  }

  function onStorageChanged(taskId: string): void {
    const issue = ImportStorageStatus.get(taskId);
    const next = { ...storageIssues.value };
    if (issue) next[taskId] = issue;
    else delete next[taskId];
    storageIssues.value = next;
  }

  /** 一次性初始化：订阅更新并回收上次中断的运行。重复调用返回同一个 Promise。 */
  function initialize(): Promise<void> {
    initializing ??= (async () => {
      disposers.push(ImportAgentService.subscribe((taskId) => void onTaskUpdated(taskId)));
      disposers.push(ImportStorageStatus.subscribe(onStorageChanged));
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event: MessageEvent<{ taskId?: string }>) => {
          if (event.data?.taskId) void onTaskUpdated(event.data.taskId, false);
        };
      }
      await refreshTasks();
      for (const entry of tasks.value.filter((item) => ACTIVE_STATES.has(item.state)))
        await ImportAgentService.recover(entry.id);
      await refreshTasks();
      await refreshRunning();
    })();
    return initializing;
  }

  function dispose(): void {
    for (const dispose of disposers.splice(0)) dispose();
    channel?.close();
    channel = null;
    initializing = null;
  }

  async function selectTask(taskId: string | null): Promise<void> {
    selectedTaskId.value = taskId;
    setError(null);
    if (!taskId) {
      loadToken++;
      task.value = null;
      sources.value = [];
      events.value = [];
      plan.value = null;
      operations.value = [];
      return;
    }
    events.value = [];
    await load(taskId, false);
  }

  /** 包装一次界面操作：记录进行中的动作、错误，并在结束后刷新相关任务。 */
  async function act<T>(
    label: ImportAction,
    taskId: string,
    work: () => Promise<T>,
    success: (value: T) => ImportFeedback | undefined = () => importSuccess(label),
  ) {
    const name = taskName(taskId);
    pendingAction.value = label;
    setError(null);
    try {
      const result = await work();
      publishFeedback(success(result), name);
      return result;
    } catch (failure) {
      reportFailure(label, failure, taskId, name);
      return undefined;
    } finally {
      if (pendingAction.value === label) pendingAction.value = null;
      await onTaskUpdated(taskId);
    }
  }

  function selectedOrThrow(): string {
    if (!selectedTaskId.value) throw new Error('TASK_NOT_SELECTED: 请先选择导入任务');
    return selectedTaskId.value;
  }

  async function createTask(name?: string): Promise<ImportTask | undefined> {
    try {
      const created = await ImportRepository.createTask(name);
      upsertTask(created, created.id);
      channel?.postMessage({ taskId: created.id });
      setError(null);
      publishFeedback(importSuccess('create'), created.name);
      return created;
    } catch (failure) {
      reportFailure('create', failure, undefined, name);
      return undefined;
    }
  }

  async function renameTask(taskId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await act('rename', taskId, () =>
      ImportRepository.mutateTask(taskId, (current) =>
        Promise.resolve(renameImportTask(current, trimmed.slice(0, 80), 'user')),
      ),
    );
  }

  async function deleteTask(taskId: string): Promise<boolean> {
    const name = taskName(taskId);
    try {
      await ImportRepository.deleteTask(taskId);
    } catch (failure) {
      reportFailure('delete', failure, taskId, name);
      return false;
    }
    upsertTask(undefined, taskId);
    channel?.postMessage({ taskId });
    if (selectedTaskId.value === taskId) await selectTask(null);
    publishFeedback(importSuccess('delete'), name);
    return true;
  }

  const defaultModel = (): AIModel | undefined =>
    useAIModelsStore().getDefaultModelForTask('assistant');

  /** 向当前任务的月詠发送消息并运行；运行归属于发起时的任务，切换查看不影响。 */
  async function send(text: string, model: AIModel | undefined = defaultModel()): Promise<void> {
    const taskId = selectedOrThrow();
    if (!model) {
      reportFailure('run', '未配置助手模型：请先在「AI 模型」中为助手指定默认模型。', taskId);
      return;
    }
    await act(
      'run',
      taskId,
      async () => {
        const running = ImportAgentService.run(taskId, model, text);
        void refreshRunning();
        return running;
      },
      importRunFeedback,
    );
  }

  async function pause(): Promise<void> {
    const taskId = selectedOrThrow();
    await act('pause', taskId, () => ImportAgentService.pause(taskId), importPauseFeedback);
  }

  /** 手动压缩当前任务的对话上下文（总结历史，来源与草稿不变）。 */
  async function compact(model: AIModel | undefined = defaultModel()): Promise<void> {
    const taskId = selectedOrThrow();
    if (!model) {
      reportFailure('compact', '未配置助手模型：请先在「AI 模型」中为助手指定默认模型。', taskId);
      return;
    }
    await act('compact', taskId, () => ImportAgentService.compact(taskId, model));
  }

  async function addUrl(url: string): Promise<void> {
    const taskId = selectedOrThrow();
    await act('add-source', taskId, () => ImportSourceService.registerUrl(taskId, url.trim()));
  }

  async function removeSource(sourceId: string, taskId = selectedOrThrow()): Promise<boolean> {
    const removed = await act('remove-source', taskId, () =>
      ImportSourceService.remove(taskId, sourceId),
    );
    return removed !== undefined;
  }

  async function addFiles(files: readonly File[]): Promise<void> {
    const taskId = selectedOrThrow();
    if (!files.length) return;
    await act('add-source', taskId, () => ImportSourceService.registerFiles(taskId, files));
  }

  async function addDirectory(entries: readonly { file: File; path: string }[]): Promise<void> {
    const taskId = selectedOrThrow();
    if (!entries.length) return;
    await act('add-source', taskId, () => ImportSourceService.registerDirectory(taskId, entries));
  }

  /** 用户直接编辑草稿；基于界面当前看到的版本，草稿已变化时返回 DRAFT_CHANGED 并重新载入。 */
  async function editDraft(operationsToApply: ImportDraftOperation[]): Promise<boolean> {
    const current = task.value;
    if (!current) return false;
    const result = await act('edit-draft', current.id, () =>
      ImportDraftService.edit(
        current.id,
        { baseDraftRevision: current.draft.revision, operations: operationsToApply },
        { actor: 'user' },
      ),
    );
    return result !== undefined;
  }

  /** 删除确认绑定打开弹窗时的任务、草稿版本和范围，不能改用当前选中的另一份草稿。 */
  async function removeDraft(
    taskId: string,
    revision: number,
    removal: ImportDraftRemoval,
  ): Promise<boolean> {
    const result = await act(
      'delete-draft',
      taskId,
      () =>
        ImportDraftService.edit(
          taskId,
          {
            baseDraftRevision: revision,
            operations: [removal],
          },
          { actor: 'user' },
        ),
      () => importDraftRemovalFeedback(removal),
    );
    return result !== undefined;
  }

  async function chooseNovel(candidateId: string | null): Promise<void> {
    const current = task.value;
    const question = current?.pendingQuestion;
    if (!current || question?.kind !== 'novel') return;
    const result = await act(
      'choose-novel',
      current.id,
      () =>
        ImportDraftService.chooseNovel(
          current.id,
          question.id,
          question.scopeRevision,
          candidateId,
        ),
      () => (candidateId === null ? undefined : importSuccess('choose-novel')),
    );
    if (result !== undefined && candidateId !== null) await continueAfterAnswer(current.id);
  }

  async function answerQuestion(answers: ImportQuestionAnswer['answers']): Promise<boolean> {
    const current = task.value;
    const question = current?.pendingQuestion;
    if (!current || !question) return false;
    const result = await act('answer', current.id, () =>
      ImportQuestionService.answer(current.id, question.id, answers),
    );
    if (result === undefined) return false;
    await continueAfterAnswer(current.id);
    return true;
  }

  /** 用户完成必要回答即表示继续：已配置模型且仍在查看该任务时恢复运行。 */
  async function continueAfterAnswer(taskId: string): Promise<void> {
    if (selectedTaskId.value !== taskId || !defaultModel()) return;
    await send('');
  }

  async function adoptMetadata(candidateId: string): Promise<void> {
    const current = task.value;
    if (!current) return;
    await act('metadata', current.id, () =>
      ImportMetadataService.adopt(current.id, candidateId, current.draft.revision),
    );
  }

  async function setMetadataAdoption(
    field: Parameters<typeof ImportMetadataService.setAdoption>[1],
    adopted: boolean,
  ): Promise<void> {
    const current = task.value;
    if (!current) return;
    await act('metadata', current.id, () =>
      ImportMetadataService.setAdoption(current.id, field, adopted, current.draft.revision),
    );
  }

  async function previewPlan(): Promise<void> {
    const current = task.value;
    if (!current) return;
    await act(
      'preview',
      current.id,
      () => ImportPlanService.preview(current.id, current.draft.revision),
      importPlanFeedback,
    );
  }

  /** 解决方案冲突后草稿版本会变化，需要重新生成方案。 */
  async function resolveAndPreview(
    label: ImportAction,
    work: (taskId: string) => Promise<unknown>,
  ) {
    const current = task.value;
    if (!current) return;
    const done = await act(label, current.id, () => work(current.id));
    if (done !== undefined) await previewPlan();
  }

  const resolveMatch = (draftChapterId: string, targetChapterIds: string[]) =>
    resolveAndPreview('resolve', (taskId) =>
      ImportDraftService.edit(
        taskId,
        {
          baseDraftRevision: task.value!.draft.revision,
          operations: [{ op: 'propose_match', chapterId: draftChapterId, targetChapterIds }],
        },
        { actor: 'user' },
      ),
    );

  /** 用户确认月詠建议的更新目标。 */
  const confirmTarget = () =>
    resolveAndPreview('resolve', (taskId) => {
      const target = task.value!.draft.target;
      if (target.kind !== 'existing') return Promise.resolve(true);
      return ImportDraftService.edit(
        taskId,
        {
          baseDraftRevision: task.value!.draft.revision,
          operations: [{ op: 'propose_target', bookId: target.bookId }],
        },
        { actor: 'user' },
      );
    });

  const confirmReplacement = (signature: string) =>
    resolveAndPreview('resolve', (taskId) =>
      ImportPlanService.confirmReplacement(taskId, plan.value!.id, signature),
    );

  const chooseChapterSettings = (draftChapterId: string, chapterId: string) =>
    resolveAndPreview('resolve', (taskId) =>
      ImportPlanService.chooseChapterSettings(taskId, plan.value!.id, draftChapterId, chapterId),
    );

  /** 仅由用户在确认对话框中点击确认后调用；确认只授权当前方案。 */
  async function applyPlan(): Promise<ImportOperation | undefined> {
    const current = task.value;
    const currentPlan = plan.value;
    if (!current || !currentPlan) return undefined;
    return act(
      'apply',
      current.id,
      async () => application.apply(await application.confirmApply(current.id, currentPlan.id)),
      importApplicationFeedback,
    );
  }

  async function revertOperation(operationId: string): Promise<ImportOperation | undefined> {
    const taskId = selectedOrThrow();
    return act(
      'revert',
      taskId,
      async () => application.revert(await application.confirmRevert(taskId, operationId)),
      importApplicationFeedback,
    );
  }

  function revertStatus(operationId: string) {
    return application.revertStatus(selectedOrThrow(), operationId);
  }

  function clearError(): void {
    setError(null);
  }

  return {
    tasks,
    selectedTaskId,
    task,
    sources,
    events,
    plan,
    operations,
    runningTaskId,
    storageIssue,
    error,
    errorAction,
    pendingAction,
    feedback,
    isRunning,
    canCompact,
    canContinue,
    sourceNames,
    initialize,
    // 测试之间解除更新订阅用；应用内 store 与页面同寿命，不需要调用
    // fallow-ignore-next-line unused-store-member
    dispose,
    selectTask,
    createTask,
    renameTask,
    deleteTask,
    send,
    pause,
    compact,
    addUrl,
    removeSource,
    addFiles,
    addDirectory,
    editDraft,
    removeDraft,
    chooseNovel,
    answerQuestion,
    adoptMetadata,
    setMetadataAdoption,
    previewPlan,
    applyPlan,
    resolveMatch,
    confirmTarget,
    confirmReplacement,
    chooseChapterSettings,
    revertOperation,
    revertStatus,
    clearError,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useImportWorkspaceStore, import.meta.hot));
}
