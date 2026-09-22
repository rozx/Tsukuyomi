import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
import type {
  ImportDraftOperation,
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
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportDraftService } from 'src/services/import/import-draft-service';
import { ImportPlanService } from 'src/services/import/import-plan-service';
import { ImportQuestionService } from 'src/services/import/import-question-service';
import { ImportMetadataService } from 'src/services/import/import-metadata-service';
import { ImportApplicationService } from 'src/services/import/import-application-service';
import {
  ImportStorageStatus,
  type ImportStorageIssue,
} from 'src/services/import/import-storage-status';
import { useAIModelsStore } from 'src/stores/ai-models';

const PAGE = 100;
const MAX_EVENTS = 5000;
const CHANNEL = 'tsukuyomi:import-tasks';
const ACTIVE_STATES = new Set<ImportTask['state']>(['running', 'pausing']);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const pendingAction = ref<string | null>(null);

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
    error.value = null;
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
  async function act<T>(label: string, taskId: string, work: () => Promise<T>) {
    pendingAction.value = label;
    error.value = null;
    try {
      return await work();
    } catch (failure) {
      if (selectedTaskId.value === taskId) error.value = message(failure);
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

  async function createTask(name?: string): Promise<ImportTask> {
    const created = await ImportRepository.createTask(name);
    upsertTask(created, created.id);
    channel?.postMessage({ taskId: created.id });
    return created;
  }

  async function renameTask(taskId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await act('rename', taskId, () =>
      ImportRepository.mutateTask(taskId, (current) => {
        current.name = trimmed.slice(0, 200);
        return Promise.resolve();
      }),
    );
  }

  async function deleteTask(taskId: string): Promise<boolean> {
    try {
      await ImportRepository.deleteTask(taskId);
    } catch (failure) {
      error.value = message(failure);
      return false;
    }
    upsertTask(undefined, taskId);
    channel?.postMessage({ taskId });
    if (selectedTaskId.value === taskId) await selectTask(null);
    return true;
  }

  const defaultModel = (): AIModel | undefined =>
    useAIModelsStore().getDefaultModelForTask('assistant');

  /** 向当前任务的月詠发送消息并运行；运行归属于发起时的任务，切换查看不影响。 */
  async function send(text: string, model: AIModel | undefined = defaultModel()): Promise<void> {
    const taskId = selectedOrThrow();
    if (!model) {
      error.value = '未配置助手模型：请先在「AI 模型」中为助手指定默认模型。';
      return;
    }
    await act('run', taskId, async () => {
      const running = ImportAgentService.run(taskId, model, text);
      void refreshRunning();
      return running;
    });
  }

  async function pause(): Promise<void> {
    const taskId = selectedOrThrow();
    await act('pause', taskId, () => ImportAgentService.pause(taskId));
  }

  async function addUrl(url: string): Promise<void> {
    const taskId = selectedOrThrow();
    await act('add-source', taskId, () => ImportSourceService.registerUrl(taskId, url.trim()));
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

  async function chooseNovel(candidateId: string | null): Promise<void> {
    const current = task.value;
    const question = current?.pendingQuestion;
    if (!current || question?.kind !== 'novel') return;
    await act('choose-novel', current.id, () =>
      ImportDraftService.chooseNovel(current.id, question.id, question.scopeRevision, candidateId),
    );
  }

  async function answerQuestion(answers: ImportQuestionAnswer['answers']): Promise<boolean> {
    const current = task.value;
    const question = current?.pendingQuestion;
    if (!current || !question) return false;
    const result = await act('answer', current.id, () =>
      ImportQuestionService.answer(current.id, question.id, answers),
    );
    return result !== undefined;
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
    await act('preview', current.id, () =>
      ImportPlanService.preview(current.id, current.draft.revision),
    );
  }

  /** 解决方案冲突后草稿版本会变化，需要重新生成方案。 */
  async function resolveAndPreview(label: string, work: (taskId: string) => Promise<unknown>) {
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
    return act('apply', current.id, async () =>
      application.apply(await application.confirmApply(current.id, currentPlan.id)),
    );
  }

  async function revertOperation(operationId: string): Promise<ImportOperation | undefined> {
    const taskId = selectedOrThrow();
    return act('revert', taskId, async () =>
      application.revert(await application.confirmRevert(taskId, operationId)),
    );
  }

  function revertStatus(operationId: string) {
    return application.revertStatus(selectedOrThrow(), operationId);
  }

  function clearError(): void {
    error.value = null;
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
    pendingAction,
    isRunning,
    sourceNames,
    initialize,
    dispose,
    refreshTasks,
    selectTask,
    createTask,
    renameTask,
    deleteTask,
    send,
    pause,
    addUrl,
    addFiles,
    addDirectory,
    editDraft,
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
