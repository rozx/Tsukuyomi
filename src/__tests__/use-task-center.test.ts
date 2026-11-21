import './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTaskCenter } from 'src/composables/task-center/useTaskCenter';
import { useTaskQueueStore } from 'src/stores/task-queue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useUiStore } from 'src/stores/ui';
import type { TaskQueueItem } from 'src/models/task-queue';

let app: ReturnType<typeof createApp> | null = null;
let pinia: Pinia;

function mountCenter() {
  let center!: ReturnType<typeof createTaskCenter>;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/books/:id', component: { render: () => null } },
    ],
  });
  app = createApp(
    defineComponent({
      setup() {
        center = createTaskCenter();
        return () => h('div');
      },
    }),
  );
  app.use(pinia).use(router).mount(document.createElement('div'));
  return center;
}

function queueItem(patch: Partial<TaskQueueItem>): TaskQueueItem {
  return {
    id: 'q1',
    bookId: 'b',
    chapterId: 'c',
    kind: 'translation',
    mode: 'continue',
    origin: 'batch',
    status: 'running',
    order: 1,
    completedParagraphIds: [],
    aiTaskIds: ['t1'],
    enqueuedAt: 1,
    ...patch,
  };
}

function task(patch: Partial<AIProcessingTask>): AIProcessingTask {
  return {
    id: 't1',
    type: 'translation',
    modelName: 'M',
    status: 'processing',
    startTime: 1,
    thinkingMessage: '',
    ...patch,
  } as AIProcessingTask;
}

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  app?.unmount();
  app = null;
});

describe('useTaskCenter', () => {
  it('打开详情解析为对应的队列行或其他 AI 活动，关闭后回到列表', () => {
    useTaskQueueStore().items = [queueItem({ id: 'q1', status: 'queued', aiTaskIds: [] })];
    useAIProcessingStore().activeTasks = [task({ id: 'x', type: 'assistant' })];
    const center = mountCenter();
    expect(center.detail.value).toBeNull();

    center.openDetail('q1');
    expect(center.detail.value).toMatchObject({ kind: 'row', row: { id: 'q1' } });
    expect(center.detailTask.value).toBeNull();

    center.openDetail('x');
    expect(center.detail.value).toMatchObject({ kind: 'other', task: { id: 'x' } });
    expect(center.detailTask.value?.id).toBe('x');

    center.closeDetail();
    expect(center.detail.value).toBeNull();
    expect(useUiStore().taskCenterExpandedId).toBeNull();
  });

  it('保存的详情 ID 对应的任务已不存在时回到列表', () => {
    useUiStore().setTaskCenterExpandedId('gone');
    const center = mountCenter();
    expect(center.detail.value).toBeNull();
    expect(center.detailTask.value).toBeNull();
  });

  it('未打开详情的任务有新的思考内容时显示未读，打开后清除', async () => {
    const queue = useTaskQueueStore();
    queue.items = [
      queueItem({ id: 'q1', aiTaskIds: ['t1'] }),
      queueItem({ id: 'q2', chapterId: 'c2', aiTaskIds: ['t2'] }),
    ];
    const ai = useAIProcessingStore();
    ai.activeTasks = [task({ id: 't1', queueItemId: 'q1' }), task({ id: 't2', queueItemId: 'q2' })];
    const center = mountCenter();
    center.openDetail('q1');
    await nextTick();
    ai.activeTasks = [
      task({ id: 't1', queueItemId: 'q1', thinkingMessage: 'x' }),
      task({ id: 't2', queueItemId: 'q2', thinkingMessage: 'y' }),
    ];
    await nextTick();
    await nextTick();
    expect(center.isUnseen('q2')).toBe(true);
    expect(center.isUnseen('q1')).toBe(false);
    center.openDetail('q2');
    expect(center.isUnseen('q2')).toBe(false);
  });

  it('打开任务中心后确认批次结果，chip 回到空闲', () => {
    const queue = useTaskQueueStore();
    queue.items = [queueItem({ status: 'done', endedAt: Date.now() - 10 })];
    const center = mountCenter();
    expect(center.chip.value.kind).toBe('finished');
    center.acknowledge();
    expect(center.chip.value.kind).toBe('idle');
  });

  it('向量化统计只在任务中心真正可见且该区展开时刷新：手机没有固定面板，保存的固定状态不算', async () => {
    const center = mountCenter();
    const ui = useUiStore();
    ui.setTaskCenterEmbeddingCollapsed(false);
    ui.setTaskCenterPinned(true);
    await nextTick();
    // 固定面板没有渲染（手机布局）时不算可见
    expect(center.embeddingStatsVisible.value).toBe(false);

    center.setPinnedPanelShown(true);
    expect(center.embeddingStatsVisible.value).toBe(true);
    ui.setTaskCenterEmbeddingCollapsed(true);
    expect(center.embeddingStatsVisible.value).toBe(false);

    ui.setTaskCenterEmbeddingCollapsed(false);
    center.setPinnedPanelShown(false);
    center.setOpen(true);
    expect(center.embeddingStatsVisible.value).toBe(true);
  });

  it('其他 AI 活动不计入章节任务数量', () => {
    const ai = useAIProcessingStore();
    ai.activeTasks = [task({ id: 'x', type: 'assistant' })];
    const center = mountCenter();
    expect(center.chip.value.kind).toBe('other');
    expect(center.otherTasks.value.map((t) => t.id)).toEqual(['x']);
    expect(center.groups.value.running).toHaveLength(0);
  });

  it('非执行者标签页的运行中行不提供详细过程', () => {
    const queue = useTaskQueueStore();
    queue.items = [queueItem({})];
    useAIProcessingStore().activeTasks = [task({ id: 't1', queueItemId: 'q1' })];
    const center = mountCenter();
    expect(queue.isExecutor).toBe(false);
    expect(center.groups.value.running[0]?.detail).toBe('remote');
  });
});
