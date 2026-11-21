import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { provideTaskCenter, type TaskCenter } from 'src/composables/task-center/useTaskCenter';
import { useTaskQueueStore } from 'src/stores/task-queue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import type { TaskQueueItem } from 'src/models/task-queue';

// 实时日志区（状态栏、待办、流式内容）不在本测试范围，替换成带标记的空壳
vi.mock('src/components/task-center/TaskCenterTaskDetail.vue', async () => {
  const { h: render } = await import('vue');
  return {
    default: {
      name: 'TaskCenterTaskDetail',
      inheritAttrs: false,
      render: () => render('div', { class: 'log-stub' }),
    },
  };
});

import TaskCenterDetailView from 'src/components/task-center/TaskCenterDetailView.vue';

let app: App | null = null;
let pinia: Pinia;

function queueItem(patch: Partial<TaskQueueItem>): TaskQueueItem {
  return {
    id: 'q1',
    bookId: 'b',
    chapterId: 'c',
    kind: 'translation',
    mode: 'continue',
    origin: 'batch',
    status: 'queued',
    order: 1,
    completedParagraphIds: [],
    aiTaskIds: [],
    enqueuedAt: 1,
    ...patch,
  };
}

function aiTask(patch: Partial<AIProcessingTask>): AIProcessingTask {
  return {
    id: 'x',
    type: 'assistant',
    modelName: 'M',
    status: 'processing',
    startTime: 1,
    thinkingMessage: '',
    ...patch,
  } as AIProcessingTask;
}

async function mountDetail(openId: string) {
  let center!: TaskCenter;
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
        center = provideTaskCenter();
        return () => h(TaskCenterDetailView, { mode: 'pinned' });
      },
    }),
  );
  app
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  center.openDetail(openId);
  await nextTick();
  const buttons = () =>
    [...host.querySelectorAll<HTMLButtonElement>('.tc-dv-actions button')].map((button) =>
      button.textContent?.trim(),
    );
  return { host, center, buttons };
}

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('任务中心详情视图', () => {
  it('排队中的任务：提供移出队列与打开章节，并提示开始后才有实时日志', async () => {
    const queue = useTaskQueueStore();
    queue.items = [queueItem({ status: 'queued' })];
    const removeItem = vi.spyOn(queue, 'removeItem').mockResolvedValue();
    const { host, buttons } = await mountDetail('q1');

    expect(buttons()).toEqual(['移出队列', '打开章节']);
    expect(host.querySelector('.tc-dv-hint')?.textContent).toContain('任务尚未开始');
    expect(host.querySelector('.log-stub')).toBeNull();

    host.querySelector<HTMLButtonElement>('.tc-dv-actions button')?.click();
    expect(removeItem).toHaveBeenCalledWith('q1');
  });

  it('失败且日志已清理的任务：显示错误原因、重试与日志已清理提示', async () => {
    useTaskQueueStore().items = [
      queueItem({
        status: 'failed',
        endedAt: 5,
        error: { code: 'UNKNOWN', message: '模型返回了空结果' },
      }),
    ];
    const { host, buttons } = await mountDetail('q1');

    expect(buttons()).toEqual(['重试', '打开章节']);
    expect(host.querySelector('.tc-dv-error')?.textContent).toContain('模型返回了空结果');
    expect(host.querySelector('.tc-dv-hint')?.textContent).toContain('详细日志已清理');
  });

  it('另一个标签页执行的运行中任务：提供停止，显示段落进度条与提示，不显示日志', async () => {
    useTaskQueueStore().items = [queueItem({ status: 'running', aiTaskIds: ['t1'] })];
    useAIProcessingStore().activeTasks = [
      aiTask({ id: 't1', type: 'translation', queueItemId: 'q1' }),
    ];
    const { host, buttons } = await mountDetail('q1');

    expect(buttons()).toEqual(['停止', '打开章节']);
    expect(host.querySelector('.tc-dv-bar')).not.toBeNull();
    expect(host.querySelector('.tc-dv-hint')?.textContent).toContain('另一个标签页');
    expect(host.querySelector('.log-stub')).toBeNull();
  });

  it('运行中的其他 AI 活动：只提供停止，并显示实时日志', async () => {
    useAIProcessingStore().activeTasks = [aiTask({ id: 'x', message: '整理人物关系' })];
    const { host, buttons } = await mountDetail('x');

    expect(buttons()).toEqual(['停止']);
    expect(host.querySelector('.tc-dv-title')?.textContent).toBe('整理人物关系');
    expect(host.querySelector('.log-stub')).not.toBeNull();
  });

  it('已结束的其他 AI 活动没有操作按钮', async () => {
    useAIProcessingStore().activeTasks = [aiTask({ id: 'x', status: 'end' })];
    const { host } = await mountDetail('x');

    expect(host.querySelector('.tc-dv-actions')).toBeNull();
    expect(host.querySelector('.tc-dv-status')?.textContent?.trim()).toBe('已完成');
  });
});
