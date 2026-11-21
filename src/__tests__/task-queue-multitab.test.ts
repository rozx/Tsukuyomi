import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { getDB } from 'src/utils/indexed-db';
import type { TaskQueueItem } from 'src/models/task-queue';
import {
  configureTaskQueue,
  resetTaskQueueConfig,
  useTaskQueueStore,
  type TaskQueueRunner,
} from 'src/stores/task-queue';
import { useSettingsStore } from 'src/stores/settings';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { webLocksFixture } from './web-locks-fixture';

/** 支持排队等待的锁管理器，模拟同源多个标签页 */
function queueingLocks(): LockManager {
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const request = async (
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => unknown),
    maybeCallback?: (lock: Lock | null) => unknown,
  ) => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback)!;
    if (held.has(name)) {
      if (options.ifAvailable) return callback(null);
      await new Promise<void>((resolve) => {
        waiting.set(name, [...(waiting.get(name) ?? []), resolve]);
      });
    }
    held.add(name);
    try {
      return await callback({ name, mode: 'exclusive' } as Lock);
    } finally {
      held.delete(name);
      const next = waiting.get(name)?.shift();
      next?.();
    }
  };
  return { request, query: () => Promise.resolve({ held: [], pending: [] }) } as unknown as LockManager;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(times = 10) {
  for (let i = 0; i < times; i += 1) await flush();
}

interface Tab {
  pinia: Pinia;
  store: ReturnType<typeof useTaskQueueStore>;
}

const tabs: Tab[] = [];

async function openTab(): Promise<Tab> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  await settings.loadSettings();
  await settings.updateSettings({ uiLocale: 'zh-CN' });
  const store = useTaskQueueStore();
  await store.ensureStarted();
  const tab = { pinia, store };
  tabs.push(tab);
  return tab;
}

function use(tab: Tab) {
  setActivePinia(tab.pinia);
  return tab.store;
}

afterEach(() => {
  for (const tab of tabs.splice(0)) {
    setActivePinia(tab.pinia);
    tab.store.dispose();
  }
  resetTaskQueueConfig();
  vi.unstubAllGlobals();
});

function hangingRunner() {
  const started: { item: TaskQueueItem; signal: AbortSignal; finish: () => void }[] = [];
  const runner: TaskQueueRunner = (item, signal) =>
    new Promise((resolve, reject) => {
      started.push({ item, signal, finish: () => resolve({ appliedCount: 1, targetCount: 1, actions: [] }) });
      signal.addEventListener('abort', () => reject(new Error('请求已取消')));
    });
  return { started, runner };
}

const req = (chapterId: string) => ({
  bookId: 'b1',
  chapterId,
  kind: 'translation' as const,
  mode: 'continue' as const,
  origin: 'batch' as const,
});

describe('任务队列 · 多标签页', () => {
  it('只有一个标签页成为执行者；另一个标签页入队后由执行者运行', async () => {
    const { started, runner } = hangingRunner();
    configureTaskQueue({ locks: queueingLocks(), runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const a = await openTab();
    const b = await openTab();
    expect(a.store.isExecutor).toBe(true);
    expect(b.store.isExecutor).toBe(false);
    await use(b).enqueue([req('c1')], { position: 'back' });
    await settle();
    expect(started.map((s) => s.item.chapterId)).toEqual(['c1']);
    await settle();
    expect(use(b).items.find((i) => i.chapterId === 'c1')?.status).toBe('running');
  });

  it('在非执行者标签页停止任务，由执行者中止', async () => {
    const { started, runner } = hangingRunner();
    configureTaskQueue({ locks: queueingLocks(), runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const a = await openTab();
    const b = await openTab();
    const { added } = await use(a).enqueue([req('c1')], { position: 'back' });
    await settle();
    await use(b).stopItem(added[0]!);
    await settle();
    expect(started[0]!.signal.aborted).toBe(true);
    expect((await use(a).waitForItem(added[0]!))?.status).toBe('cancelled');
  });

  it('执行者标签页离开后另一个标签页接管：运行项继续且队列不进入暂停', async () => {
    const { started, runner } = hangingRunner();
    configureTaskQueue({ locks: queueingLocks(), runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const a = await openTab();
    const b = await openTab();
    await use(a).enqueue([req('c1')], { position: 'back' });
    await settle();
    expect(started).toHaveLength(1);
    // 模拟执行者标签页刷新 / 关闭
    setActivePinia(a.pinia);
    a.store.dispose();
    tabs.splice(tabs.indexOf(a), 1);
    await settle();
    expect(use(b).isExecutor).toBe(true);
    expect(use(b).executorMode).toBe('takeover');
    expect(use(b).meta.paused).toBe(false);
    expect(started.map((s) => s.item.chapterId)).toEqual(['c1', 'c1']);
  });

  it('两个标签页几乎同时入队同一章节，只留一项', async () => {
    const { runner } = hangingRunner();
    configureTaskQueue({ locks: queueingLocks(), runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const a = await openTab();
    const b = await openTab();
    await use(a).pause();
    setActivePinia(a.pinia);
    const first = a.store.enqueue([req('c9')], { position: 'back' });
    setActivePinia(b.pinia);
    const second = b.store.enqueue([req('c9')], { position: 'back' });
    const results = await Promise.all([first, second]);
    expect(results.reduce((sum, r) => sum + r.added.length, 0)).toBe(1);
    const all = await (await getDB()).getAll('task-queue');
    expect(all.filter((r) => 'chapterId' in r && r.chapterId === 'c9')).toHaveLength(1);
  });
});

describe('任务队列 · 恢复对账与占用者标签', () => {
  it('恢复时把上次中断的运行记录对账为已取消并附说明', async () => {
    const db = await getDB();
    await db.put('thinking-processes', {
      id: 't1',
      type: 'translation',
      modelName: 'M',
      status: 'thinking',
      startTime: 1,
      queueItemId: 'r1',
    });
    await db.put('task-queue', {
      id: 'r1',
      bookId: 'b1',
      chapterId: 'c1',
      kind: 'translation',
      mode: 'continue',
      origin: 'batch',
      status: 'running',
      order: 1,
      completedParagraphIds: [],
      aiTaskIds: ['t1'],
      enqueuedAt: 1,
    });
    const { runner } = hangingRunner();
    configureTaskQueue({ locks: undefined, runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const tab = await openTab();
    await settle();
    setActivePinia(tab.pinia);
    const task = useAIProcessingStore().activeTasks.find((entry) => entry.id === 't1');
    expect(task?.status).toBe('cancelled');
    expect(task?.message).toContain('已中断');
    expect(tab.store.meta.paused).toBe(true);
  });

  it('运行时书籍占用者标签为「任务队列 · 类型 · 章节」', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    let labels: string[] = [];
    const runner: TaskQueueRunner = async (item) => {
      const owners = await BookExecutionGuard.occupants(item.bookId);
      labels = owners.map((owner) => owner.label);
      return { appliedCount: 0, targetCount: 0, actions: [] };
    };
    configureTaskQueue({ locks: undefined, runItem: runner, notify: () => {}, record: () => {}, watchLibrary: false, restartPending: () => false });
    const tab = await openTab();
    const { added } = await tab.store.enqueue([req('c1')], { position: 'back' });
    await tab.store.waitForItem(added[0]!);
    expect(labels).toEqual(['任务队列 · 翻译 · c1']);
  });
});

describe('任务队列 · 多标签页批量汇总', () => {
  it('只由执行者汇总一次；非执行者之后移出排队项不会重复汇总', async () => {
    const { started, runner } = hangingRunner();
    const notified: { summary?: string | undefined }[] = [];
    configureTaskQueue({
      locks: queueingLocks(),
      runItem: runner,
      notify: (message) => notified.push(message),
      record: () => {},
      watchLibrary: false,
      restartPending: () => false,
    });
    const a = await openTab();
    const b = await openTab();
    await use(a).enqueue([req('c1'), req('c2')], { position: 'back' });
    await settle();
    expect(started).toHaveLength(2);
    for (const run of started) run.finish();
    await settle();
    expect(notified.filter((m) => m.summary === '批量任务已结束')).toHaveLength(1);
    await use(b).removeAllQueued();
    await settle();
    expect(notified.filter((m) => m.summary === '批量任务已结束')).toHaveLength(1);
  });
});
