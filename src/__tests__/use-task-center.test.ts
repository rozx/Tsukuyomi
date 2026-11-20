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
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/books/:id', component: { render: () => null } }] });
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
  return { id: 't1', type: 'translation', modelName: 'M', status: 'processing', startTime: 1, thinkingMessage: '', ...patch } as AIProcessingTask;
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
  it('同一时间最多展开一行，展开另一行时原行收起', () => {
    const center = mountCenter();
    center.toggleExpand('a');
    expect(useUiStore().taskCenterExpandedId).toBe('a');
    center.toggleExpand('b');
    expect(useUiStore().taskCenterExpandedId).toBe('b');
    center.toggleExpand('b');
    expect(useUiStore().taskCenterExpandedId).toBeNull();
  });

  it('未展开的任务有新的思考内容时显示未读，展开后清除', async () => {
    const queue = useTaskQueueStore();
    queue.items = [queueItem({ id: 'q1', aiTaskIds: ['t1'] }), queueItem({ id: 'q2', chapterId: 'c2', aiTaskIds: ['t2'] })];
    const ai = useAIProcessingStore();
    ai.activeTasks = [task({ id: 't1', queueItemId: 'q1' }), task({ id: 't2', queueItemId: 'q2' })];
    const center = mountCenter();
    center.toggleExpand('q1');
    await nextTick();
    ai.activeTasks = [task({ id: 't1', queueItemId: 'q1', thinkingMessage: 'x' }), task({ id: 't2', queueItemId: 'q2', thinkingMessage: 'y' })];
    await nextTick();
    await nextTick();
    expect(center.isUnseen('q2')).toBe(true);
    expect(center.isUnseen('q1')).toBe(false);
    center.toggleExpand('q2');
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
