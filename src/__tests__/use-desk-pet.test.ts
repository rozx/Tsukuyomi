import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createAppI18n } from '../i18n/vue';
import { provideTaskCenter, type TaskCenter } from '../composables/task-center/useTaskCenter';
import { useDeskPet } from '../composables/desk-pet/useDeskPet';
import { useTaskQueueStore } from '../stores/task-queue';
import { useAIProcessingStore, type AIProcessingTask } from '../stores/ai-processing';
import { useBooksStore } from '../stores/books';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import type { TaskQueueItem } from '../models/task-queue';

let app: App | undefined;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

function queueItem(patch: Partial<TaskQueueItem>): TaskQueueItem {
  return {
    id: 'q1',
    bookId: 'b',
    chapterId: 'c1',
    kind: 'translation',
    mode: 'continue',
    origin: 'batch',
    status: 'running',
    order: 1,
    completedParagraphIds: ['p1'],
    targetParagraphIds: ['p1', 'p2', 'p3', 'p4'],
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

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  await nextTick();
};

async function mount(path = '/') {
  await useBooksStore().addBook({
    id: 'b',
    title: '演示书',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v',
        title: '卷一',
        chapters: [
          { id: 'c1', title: '第6话 归途', createdAt: new Date(0), lastEdited: new Date(0) },
          { id: 'c2', title: '第7话 灯塔', createdAt: new Date(0), lastEdited: new Date(0) },
        ],
      },
    ],
  } as never);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/books/:id', component: { render: () => null } },
      { path: '/import', component: { render: () => null } },
    ],
  });
  await router.push(path);
  let pet!: ReturnType<typeof useDeskPet>;
  let center!: TaskCenter;
  const Child = defineComponent({
    setup() {
      pet = useDeskPet();
      return () => null;
    },
  });
  app = createApp(
    defineComponent({
      setup() {
        center = provideTaskCenter();
        return () => h(Child);
      },
    }),
  );
  app.use(router).use(createAppI18n('zh-CN')).mount(document.createElement('div'));
  await settle();
  return { pet, center, router, ui: useUiStore() };
}

const runningChapter = () => {
  useTaskQueueStore().items = [queueItem({})];
  useAIProcessingStore().activeTasks = [
    task({
      id: 't1',
      queueItemId: 'q1',
      thinkingMessage: '先看看前文的称呼\n[调用工具: search_memories]\n',
    }),
  ];
};

describe('useDeskPet：跟随与让位', () => {
  it('跟随运行中的章节任务，标题行与最新条目来自任务记录', async () => {
    runningChapter();
    const { pet } = await mount();
    expect(pet.visible.value).toBe(true);
    expect(pet.mood.value).toBe('running');
    expect(pet.runningCount.value).toBe(1);
    expect(pet.bubble.value).toBe('task');
    expect(pet.followed.value).toMatchObject({ id: 'q1', kind: 'chapter' });
    expect(pet.followed.value?.title).toContain('归途');
    expect(pet.followed.value?.meta).toBe('1 / 4 段');
    expect(pet.entries.value.at(-1)).toMatchObject({ kind: 'tool', tool: 'search_memories' });
  });

  it('打开任务中心后不再转述章节任务，关闭后恢复', async () => {
    runningChapter();
    const { pet, center } = await mount();
    center.setOpen(true);
    await nextTick();
    expect(pet.bubble.value).toBe('none');
    expect(pet.mood.value).toBe('running');
    center.setOpen(false);
    await nextTick();
    expect(pet.bubble.value).toBe('task');
  });

  it('助手面板收起时跟随助手回复；助手面板打开时整个桌宠隐藏，关上后恢复', async () => {
    useAIProcessingStore().activeTasks = [
      task({ id: 'a1', type: 'assistant', outputContent: '妙！这里是双关', thinkingMessage: '' }),
    ];
    const { pet, ui } = await mount();
    expect(pet.visible.value).toBe(true);
    expect(pet.followed.value).toMatchObject({ id: 'a1', kind: 'assistant' });
    expect(pet.entries.value.at(-1)).toMatchObject({ kind: 'output', text: '妙！这里是双关' });
    ui.openRightPanel();
    await nextTick();
    expect(pet.visible.value).toBe(false);
    ui.closeRightPanel();
    await nextTick();
    expect(pet.visible.value).toBe(true);
  });

  it('跟随直到结束：正在跟随章节时助手开始回复也不切换', async () => {
    runningChapter();
    const { pet } = await mount();
    expect(pet.followed.value?.id).toBe('q1');
    useAIProcessingStore().activeTasks.push(task({ id: 'a1', type: 'assistant' }));
    await nextTick();
    expect(pet.followed.value?.id).toBe('q1');
    expect(pet.candidateCount.value).toBe(2);
    pet.selectNext();
    await nextTick();
    expect(pet.followed.value?.id).toBe('a1');
  });

  it('导入页右侧常驻月詠导入对话：桌宠隐藏，离开导入页后恢复', async () => {
    runningChapter();
    const { pet, router } = await mount();
    expect(pet.visible.value).toBe(true);
    await router.push('/import');
    await nextTick();
    expect(pet.visible.value).toBe(false);
    await router.push('/');
    await nextTick();
    expect(pet.visible.value).toBe(true);
  });

  it('章节任务在其他标签页执行时，气泡说明在别处运行而不是一直「准备中」', async () => {
    useTaskQueueStore().items = [queueItem({})];
    const { pet } = await mount();
    expect(pet.followed.value).toMatchObject({ id: 'q1', remote: true });
  });

  it('从桌宠打开任务中心：用顶部任务中心按钮定位，已打开时不再切换', async () => {
    runningChapter();
    const chip = document.body.appendChild(document.createElement('button'));
    chip.dataset.testid = 'task-center-chip';
    const { pet, center } = await mount();
    const open = vi.spyOn(center, 'open');
    pet.openTaskCenter();
    expect(open.mock.calls[0]?.[0]).toBe(chip);
    chip.remove();
  });

  it('关闭设置开关后不可见', async () => {
    const { pet } = await mount();
    useSettingsStore().settings.showDeskPet = false;
    await nextTick();
    expect(pet.visible.value).toBe(false);
  });

  it('没有任务时空闲', async () => {
    const { pet } = await mount();
    expect(pet.mood.value).toBe('idle');
    expect(pet.bubble.value).toBe('none');
  });
});

describe('useDeskPet：结果小结', () => {
  it('章节任务完成后显示小结，关闭小结同时清除任务中心 chip 的完成提示', async () => {
    useTaskQueueStore().items = [queueItem({ status: 'done', endedAt: Date.now() - 1000 })];
    const { pet, center } = await mount();
    expect(pet.mood.value).toBe('review');
    expect(pet.bubble.value).toBe('summary');
    expect(pet.summary.value?.text).toContain('归途');
    expect(pet.summary.value?.text).toContain('译完了');
    expect(center.chip.value.kind).toBe('finished');

    pet.dismissSummary();
    await nextTick();
    expect(pet.summary.value).toBeNull();
    expect(center.chip.value.kind).toBe('idle');
    expect(pet.mood.value).toBe('idle');
  });

  it('打开任务中心视为已查看章节结果', async () => {
    useTaskQueueStore().items = [
      queueItem({ id: 'q1', status: 'done', endedAt: Date.now() - 1000 }),
      queueItem({ id: 'q2', chapterId: 'c2', status: 'failed', endedAt: Date.now() - 1000 }),
    ];
    const { pet, center } = await mount();
    expect(pet.summary.value?.text).toBe('1 个章节任务完成');
    expect(pet.summary.value?.failed).toBe(1);
    expect(pet.summary.value?.tone).toBe('fail');
    center.setOpen(true);
    await nextTick();
    expect(pet.summary.value).toBeNull();
  });

  it('单个章节任务失败或被停止时，小结说明结果而不是「译完了」', async () => {
    useTaskQueueStore().items = [queueItem({ status: 'failed', endedAt: Date.now() - 1000 })];
    const { pet } = await mount();
    expect(pet.summary.value?.text).toContain('归途');
    expect(pet.summary.value?.text).not.toContain('译完了');
    expect(pet.summary.value?.tone).toBe('fail');

    useTaskQueueStore().items = [queueItem({ status: 'cancelled', endedAt: Date.now() - 500 })];
    await nextTick();
    expect(pet.summary.value?.text).toContain('已停止');
    expect(pet.summary.value?.tone).toBe('neutral');
  });

  it('完成的单个章节任务为成功小结', async () => {
    useTaskQueueStore().items = [queueItem({ status: 'done', endedAt: Date.now() - 1000 })];
    const { pet } = await mount();
    expect(pet.summary.value?.tone).toBe('ok');
  });

  it('助手面板收起时回复完成：显示「答好了」与回复开头，打开助手面板后清除', async () => {
    const ai = useAIProcessingStore();
    ai.activeTasks = [task({ id: 'a1', type: 'assistant', outputContent: '' })];
    const { pet, ui } = await mount();
    ai.activeTasks[0]!.outputContent = '妙！这里的月影是双关\n第二行';
    ai.activeTasks[0]!.status = 'end';
    await nextTick();
    expect(pet.summary.value).toMatchObject({ kind: 'assistant', text: '月詠答好了' });
    expect(pet.summary.value?.detail).toBe('妙！这里的月影是双关');
    ui.openRightPanel();
    await nextTick();
    expect(pet.summary.value).toBeNull();
  });
});
