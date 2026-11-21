import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from 'src/utils/indexed-db';
import { mutateTaskQueue } from 'src/services/chapter-task/task-queue-repository';
import type { TaskQueueItem } from 'src/models/task-queue';
import {
  configureTaskQueue,
  resetTaskQueueConfig,
  useTaskQueueStore,
  type TaskQueueRunner,
} from 'src/stores/task-queue';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(times = 6) {
  for (let i = 0; i < times; i += 1) await flush();
}

type Call = { item: TaskQueueItem; signal: AbortSignal; done: ReturnType<typeof deferred<void>> };

function controlledRunner() {
  const calls: Call[] = [];
  const runner: TaskQueueRunner = (item, signal) => {
    const done = deferred<void>();
    calls.push({ item, signal, done });
    signal.addEventListener('abort', () => done.reject(new Error('请求已取消')));
    return done.promise.then(() => ({ appliedCount: 1, targetCount: 1, actions: [] }));
  };
  return { calls, runner };
}

const req = (chapterId: string, extra: Record<string, unknown> = {}) => ({
  bookId: 'b1',
  chapterId,
  kind: 'translation' as const,
  mode: 'continue' as const,
  origin: 'batch' as const,
  ...extra,
});

let notified: { summary?: string | undefined; detail?: string | undefined }[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
  notified = [];
  configureTaskQueue({
    locks: undefined,
    retryDelayMs: 20,
    notify: (message) => notified.push(message),
    record: () => {},
    restartPending: () => false,
    watchLibrary: false,
  });
});

afterEach(() => {
  useTaskQueueStore().dispose();
  resetTaskQueueConfig();
  vi.restoreAllMocks();
});

async function startStore(runner: TaskQueueRunner, max = 2) {
  configureTaskQueue({ runItem: runner });
  const settings = useSettingsStore();
  await settings.loadSettings();
  await settings.updateSettings({ uiLocale: 'zh-CN' });
  await settings.setTaskQueueMaxConcurrent(max);
  const store = useTaskQueueStore();
  await store.ensureStarted();
  return store;
}

describe('任务队列 store · 入队与调度', () => {
  it('手动启动有空位时立即运行，完成后标为 done', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner);
    const { added } = await store.enqueue([req('c1', { origin: 'manual' })], { position: 'front' });
    await settle();
    expect(calls).toHaveLength(1);
    expect(store.items.find((i) => i.id === added[0])?.status).toBe('running');
    calls[0]!.done.resolve();
    const finished = await store.waitForItem(added[0]!);
    expect(finished?.status).toBe('done');
  });

  it('遵守全局上限：3 项只运行 2 项，一项结束后补位', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    await settle();
    expect(calls.map((c) => c.item.chapterId)).toEqual(['c1', 'c2']);
    calls[0]!.done.resolve();
    await settle();
    expect(calls.map((c) => c.item.chapterId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('调高上限立即补位', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    await store.enqueue([req('c1'), req('c2')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(1);
    await useSettingsStore().setTaskQueueMaxConcurrent(2);
    await store.schedule();
    await settle();
    expect(calls).toHaveLength(2);
  });

  it('暂停时不启动新项，继续后按序补满', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.pause();
    await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(0);
    await store.resume();
    await settle();
    expect(calls.map((c) => c.item.chapterId)).toEqual(['c1', 'c2']);
  });

  it('去重：同章同类型重复入队被跳过', async () => {
    const { runner } = controlledRunner();
    const store = await startStore(runner, 1);
    await store.enqueue([req('c1')], { position: 'back' });
    const second = await store.enqueue([req('c1')], { position: 'back' });
    expect(second.added).toHaveLength(0);
    expect(second.skippedDuplicate).toBe(1);
  });
});

describe('任务队列 store · 停止、移出、排序、重试', () => {
  it('停止单项：标为已取消并补位', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2')], { position: 'back' });
    await settle();
    await store.stopItem(added[0]!);
    const stopped = await store.waitForItem(added[0]!);
    expect(stopped?.status).toBe('cancelled');
    expect(calls[0]!.signal.aborted).toBe(true);
    await settle();
    expect(calls.map((c) => c.item.chapterId)).toEqual(['c1', 'c2']);
  });

  it('全部停止：中止运行项并暂停，排队项保留，只提示一次', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    await settle();
    await store.stopAll();
    await settle();
    expect(calls.every((c) => c.signal.aborted)).toBe(true);
    expect(store.meta.paused).toBe(true);
    expect(store.items.filter((i) => i.status === 'queued').map((i) => i.chapterId)).toEqual([
      'c3',
    ]);
    expect(store.items.filter((i) => i.status === 'cancelled')).toHaveLength(2);
    expect(notified.filter((n) => n.summary?.includes('已停止'))).toHaveLength(1);
  });

  it('移出排队项后不会被执行；全部移除清空排队', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    await settle();
    await store.removeItem(added[1]!);
    expect(store.items.some((i) => i.id === added[1])).toBe(false);
    await store.removeAllQueued();
    expect(store.items.filter((i) => i.status === 'queued')).toHaveLength(0);
    calls[0]!.done.resolve();
    await settle();
    expect(calls).toHaveLength(1);
  });

  it('拖动排序后第 3 位成为下一个被启动的项', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2'), req('c3'), req('c4')], {
      position: 'back',
    });
    await settle();
    await store.reorder(added[3]!, 0);
    calls[0]!.done.resolve();
    await settle();
    expect(calls[1]!.item.chapterId).toBe('c4');
  });

  it('一项失败不影响其他项；失败项保留错误，可手动重试并带上断点', async () => {
    const calls: TaskQueueItem[] = [];
    let fail = true;
    const runner: TaskQueueRunner = async (item, _signal, ctx) => {
      calls.push(item);
      if (item.chapterId === 'c1' && fail) {
        await ctx.persistItem({
          targetParagraphIds: ['p1', 'p2'],
          targetLanguage: 'zh-CN',
          completedParagraphIds: ['p1'],
          aiTaskIds: [],
        });
        throw new Error('模型错误');
      }
      return { appliedCount: 1, targetCount: 1, actions: [] };
    };
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2')], { position: 'back' });
    const failed = await store.waitForItem(added[0]!);
    expect(failed?.status).toBe('failed');
    expect(failed?.error?.message).toContain('模型错误');
    expect((await store.waitForItem(added[1]!))?.status).toBe('done');

    fail = false;
    await store.retry(added[0]!);
    const retried = await store.waitForItem(added[0]!);
    expect(retried?.status).toBe('done');
    expect(calls.at(-1)?.completedParagraphIds).toEqual(['p1']);
  });
});

describe('任务队列 store · 书籍占用与重启准备', () => {
  it('书籍被占用时保持排队并标记等待，先跑其他书，稍后重试', async () => {
    let busy = true;
    const calls: string[] = [];
    const runner: TaskQueueRunner = (item) => {
      calls.push(item.chapterId);
      if (item.bookId === 'busy-book' && busy) {
        return Promise.reject(
          new CodedLocalizedError('TARGET_BUSY', 'bookUi.execution.busyUnknown'),
        );
      }
      return Promise.resolve({ appliedCount: 1, targetCount: 1, actions: [] });
    };
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue(
      [req('c1', { bookId: 'busy-book' }), req('c2', { bookId: 'free-book' })],
      { position: 'back' },
    );
    await settle();
    const waiting = store.items.find((i) => i.id === added[0]);
    expect(waiting?.status).toBe('queued');
    expect(waiting?.waitingReason).toBe('book-busy');
    expect((await store.waitForItem(added[1]!))?.status).toBe('done');
    busy = false;
    expect((await store.waitForItem(added[0]!))?.status).toBe('done');
    expect(calls.filter((c) => c === 'c1').length).toBeGreaterThanOrEqual(2);
  });

  it('桌面端准备重启时不启动新项，也不标为失败', async () => {
    let pending = true;
    configureTaskQueue({ restartPending: () => pending });
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.enqueue([req('c1')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(0);
    expect(store.items[0]?.status).toBe('queued');
    pending = false;
    await store.schedule();
    await settle();
    expect(calls).toHaveLength(1);
  });
});

describe('任务队列 store · 持久化与恢复', () => {
  async function seed(items: TaskQueueItem[]) {
    const db = await getDB();
    for (const entry of items) await db.put('task-queue', entry);
  }
  const base = (patch: Partial<TaskQueueItem>): TaskQueueItem => ({
    id: 'x',
    bookId: 'b1',
    chapterId: 'c',
    kind: 'translation',
    mode: 'continue',
    origin: 'batch',
    status: 'queued',
    order: 0,
    completedParagraphIds: [],
    aiTaskIds: [],
    enqueuedAt: 0,
    ...patch,
  });

  it('刷新后运行项回到队首、保持相对顺序，队列暂停且不自动开始', async () => {
    await seed([
      base({ id: 'r1', chapterId: 'c1', status: 'running', order: 5 }),
      base({ id: 'r2', chapterId: 'c2', status: 'running', order: 6 }),
      base({ id: 'q1', chapterId: 'c3', status: 'queued', order: 1 }),
    ]);
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await settle();
    expect(calls).toHaveLength(0);
    expect(store.meta.paused).toBe(true);
    expect(store.queuedItems.map((i) => i.id)).toEqual(['r1', 'r2', 'q1']);
  });

  it('恢复时队列为空则不进入暂停', async () => {
    const { runner } = controlledRunner();
    const store = await startStore(runner, 2);
    expect(store.meta.paused).toBe(false);
  });
});

describe('任务队列 store · 删除联动', () => {
  it('启动时发现章节已不存在：直接移除该项，不记为失败', async () => {
    const runner: TaskQueueRunner = () =>
      Promise.reject(
        new CodedLocalizedError('CHAPTER_MISSING', 'bookUi.chapterTask.chapterChanged'),
      );
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('gone')], { position: 'back' });
    const result = await store.waitForItem(added[0]!);
    expect(result).toBeUndefined();
    expect(store.items).toHaveLength(0);
  });

  it('书库中章节消失时移除其排队项', async () => {
    configureTaskQueue({ watchLibrary: true });
    const books = useBooksStore();
    await books.loadBooks();
    await books.addBook({
      id: 'b1',
      title: 'B',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title: '',
          chapters: [
            { id: 'c1', title: '', createdAt: new Date(0), lastEdited: new Date(0) },
            { id: 'c2', title: '', createdAt: new Date(0), lastEdited: new Date(0) },
          ],
        },
      ],
    } as never);
    const { runner } = controlledRunner();
    const store = await startStore(runner, 1);
    await store.pause();
    await store.enqueue([req('c1'), req('c2')], { position: 'back' });
    const book = books.getBookById('b1')!;
    await books.updateBook('b1', {
      volumes: [
        {
          ...book.volumes![0]!,
          chapters: book.volumes![0]!.chapters!.filter((c) => c.id !== 'c2'),
        },
      ],
    });
    await settle();
    expect(store.items.map((i) => i.chapterId)).toEqual(['c1']);
  });

  it('运行中的章节被删除时中止该项', async () => {
    configureTaskQueue({ watchLibrary: true });
    const books = useBooksStore();
    await books.loadBooks();
    await books.addBook({
      id: 'b1',
      title: 'B',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title: '',
          chapters: [{ id: 'c1', title: '', createdAt: new Date(0), lastEdited: new Date(0) }],
        },
      ],
    } as never);
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(1);
    const book = books.getBookById('b1')!;
    await books.updateBook('b1', { volumes: [{ ...book.volumes![0]!, chapters: [] }] });
    await settle();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect((await store.waitForItem(added[0]!))?.status).toBe('cancelled');
  });
});

describe('任务队列 store · 通知节制', () => {
  let recorded: { summary?: string | undefined }[] = [];
  beforeEach(() => {
    recorded = [];
    configureTaskQueue({ record: (message) => recorded.push(message) });
  });

  it('批量任务不逐项提示，全部结束后只弹一条汇总', async () => {
    const runner: TaskQueueRunner = (item, _signal, ctx) => {
      ctx.notify?.({ severity: 'info', summary: `动作:${item.chapterId}` });
      return item.chapterId === 'c2'
        ? Promise.reject(new Error('模型错误'))
        : Promise.resolve({ appliedCount: 1, targetCount: 1, actions: [] });
    };
    const store = await startStore(runner, 2);
    const { added } = await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    for (const id of added) await store.waitForItem(id);
    await settle();
    expect(notified).toHaveLength(1);
    expect(notified[0]?.summary).toBe('批量任务已结束');
    expect(notified[0]?.detail).toBe('2 完成 · 1 失败 · 0 已取消');
    // AI 动作通知只写入消息历史
    expect(recorded.map((m) => m.summary)).toEqual(['动作:c1', '动作:c2', '动作:c3']);
  });

  it('批量跨越刷新恢复：继续后全部结束时仍弹一次汇总，计入刷新前已完成的项', async () => {
    const db = await getDB();
    const entry = (patch: Partial<TaskQueueItem>): TaskQueueItem => ({
      id: 'x',
      bookId: 'b1',
      chapterId: 'c',
      kind: 'translation',
      mode: 'continue',
      origin: 'batch',
      status: 'queued',
      order: 0,
      completedParagraphIds: [],
      aiTaskIds: [],
      enqueuedAt: 100,
      ...patch,
    });
    await db.put('task-queue', entry({ id: 'd1', chapterId: 'c1', status: 'done', endedAt: 150 }));
    await db.put('task-queue', entry({ id: 'r1', chapterId: 'c2', status: 'running', order: 1 }));
    await db.put('task-queue', entry({ id: 'q1', chapterId: 'c3', status: 'queued', order: 2 }));
    // 更早的另一批已结束的项不计入本批
    await db.put(
      'task-queue',
      entry({ id: 'old', chapterId: 'c9', status: 'failed', enqueuedAt: 10, endedAt: 20 }),
    );
    const runner: TaskQueueRunner = () =>
      Promise.resolve({ appliedCount: 1, targetCount: 1, actions: [] });
    const store = await startStore(runner, 2);
    expect(store.meta.paused).toBe(true);
    await store.resume();
    await store.waitForItem('r1');
    await store.waitForItem('q1');
    await settle();
    expect(notified.map((m) => m.summary)).toEqual(['批量任务已结束']);
    expect(notified[0]?.detail).toBe('3 完成 · 0 失败 · 0 已取消');
  });

  it('其他标签页入队的批量项也会在执行者全部结束时汇总', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    // 模拟其他标签页直接写入的批量项（本标签页没有调用 enqueue）
    const db = await getDB();
    await db.put('task-queue', {
      id: 'ext',
      bookId: 'b1',
      chapterId: 'c1',
      kind: 'translation',
      mode: 'continue',
      origin: 'batch',
      status: 'queued',
      order: 0,
      completedParagraphIds: [],
      aiTaskIds: [],
      enqueuedAt: 500,
    } satisfies TaskQueueItem);
    const otherTab = new BroadcastChannel('tsukuyomi:task-queue');
    otherTab.postMessage({ type: 'changed' });
    otherTab.close();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.done.resolve();
    await store.waitForItem('ext');
    await settle();
    expect(notified.map((m) => m.summary)).toEqual(['批量任务已结束']);
    expect(notified[0]?.detail).toBe('1 完成 · 0 失败 · 0 已取消');
  });

  it('批量项先结束、最后结束的是手动任务时，仍在队列清空后汇总一次', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.enqueue([req('m1', { origin: 'manual' })], { position: 'front' });
    const { added } = await store.enqueue([req('c1')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(2);
    calls.find((call) => call.item.chapterId === 'c1')!.done.resolve();
    await store.waitForItem(added[0]!);
    await settle();
    expect(notified.map((m) => m.summary)).not.toContain('批量任务已结束');
    calls.find((call) => call.item.chapterId === 'm1')!.done.resolve();
    await settle();
    expect(notified.filter((m) => m.summary === '批量任务已结束')).toHaveLength(1);
  });

  it('移出剩余批量项后汇总已结束的项；一项都没结束时不提示', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2'), req('c3')], { position: 'back' });
    await settle();
    calls[0]!.done.resolve();
    await store.waitForItem(added[0]!);
    await settle();
    await store.pause();
    await store.stopItem(added[1]!);
    await store.waitForItem(added[1]!);
    await store.removeAllQueued();
    await settle();
    expect(notified.filter((m) => m.summary === '批量任务已结束').map((m) => m.detail)).toEqual([
      '1 完成 · 0 失败 · 1 已取消',
    ]);
    notified = [];
    const second = await store.enqueue([req('c4')], { position: 'back' });
    await store.removeItem(second.added[0]!);
    await settle();
    expect(notified.filter((m) => m.summary === '批量任务已结束')).toHaveLength(0);
  });

  it('手动任务保留原有提示：完成、失败、停止各提示一次', async () => {
    let mode: 'ok' | 'fail' | 'hang' = 'ok';
    const runner: TaskQueueRunner = (_item, signal) => {
      if (mode === 'fail') return Promise.reject(new Error('模型错误'));
      if (mode === 'hang') {
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('请求已取消'))),
        );
      }
      return Promise.resolve({ appliedCount: 2, targetCount: 2, actions: [] });
    };
    const store = await startStore(runner, 1);
    const manual = (chapterId: string) => req(chapterId, { origin: 'manual' });

    let r = await store.enqueue([manual('c1')], { position: 'front' });
    await store.waitForItem(r.added[0]!);
    expect(notified.at(-1)?.summary).toBe('翻译完成');

    mode = 'fail';
    r = await store.enqueue([manual('c2')], { position: 'front' });
    await store.waitForItem(r.added[0]!);
    expect(notified.at(-1)?.summary).toBe('翻译失败');
    expect(notified.at(-1)?.detail).toContain('模型错误');

    mode = 'hang';
    r = await store.enqueue([manual('c3')], { position: 'front' });
    await settle();
    await store.stopItem(r.added[0]!);
    await store.waitForItem(r.added[0]!);
    expect(notified).toHaveLength(3);
    expect(notified.at(-1)?.summary).toBe('AI 任务已取消');
  });

  it('手动翻译中途失败但已保存部分段落时，另外提示已保存部分结果', async () => {
    const runner: TaskQueueRunner = (_item, _signal, ctx) => {
      ctx.onAppliedCount?.(3);
      return Promise.reject(new Error('网络中断'));
    };
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1', { origin: 'manual' })], { position: 'front' });
    await store.waitForItem(added[0]!);
    expect(notified.map((m) => m.summary)).toEqual(['翻译失败', '翻译中断（已保存部分结果）']);
  });

  it('继续翻译时没有可翻译段落：提示无需翻译', async () => {
    const runner: TaskQueueRunner = () =>
      Promise.resolve({ appliedCount: 0, targetCount: 0, actions: [] });
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1', { origin: 'manual' })], { position: 'front' });
    await store.waitForItem(added[0]!);
    expect(notified.at(-1)?.summary).toBe('无需翻译');
  });
});

describe('任务队列 store · 评审修复', () => {
  it('取得书籍锁后先从存储刷新书籍与本章，再运行（跨标签页改了书籍设置也用最新上下文）', async () => {
    const order: string[] = [];
    configureTaskQueue({
      refreshBook: (bookId: string, chapterId: string) => {
        order.push(`refresh:${bookId}/${chapterId}`);
        return Promise.resolve();
      },
    });
    const runner: TaskQueueRunner = (item) => {
      order.push(`run:${item.chapterId}`);
      return Promise.resolve({ appliedCount: 1, targetCount: 1, actions: [] });
    };
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1', { origin: 'manual' })], { position: 'back' });
    await store.waitForItem(added[0]!);
    expect(order).toEqual(['refresh:b1/c1', 'run:c1']);
    expect(store.items[0]?.status).toBe('done');
  });

  it('调度时内存中的暂停状态已过期（另一标签页刚暂停）：启动事务里重新检查，不再启动新项', async () => {
    const { calls, runner } = controlledRunner();
    const store = await startStore(runner, 2);
    await store.pause();
    await store.enqueue([req('c1'), req('c2')], { position: 'back' });
    await settle();
    expect(calls).toHaveLength(0);
    // 模拟暂停已写入存储、但本执行者手里的快照还没更新
    store.meta = { paused: false };
    await store.schedule();
    await settle();
    expect(calls).toHaveLength(0);
    expect(store.items.every((item) => item.status === 'queued')).toBe(true);
    expect(store.meta.paused).toBe(true);
  });

  it('运行中已落盘停止请求、这次运行又以「书籍被占用」结束：落为已取消，不会带着停止请求卡在排队里', async () => {
    const runner: TaskQueueRunner = async (item) => {
      // 另一标签页的停止请求已写入存储，本执行者还没收到广播、没有中止
      await mutateTaskQueue((snapshot) => {
        const current = snapshot.items.find((entry) => entry.id === item.id)!;
        return { put: [{ ...current, cancelRequested: true }], result: null };
      });
      throw new CodedLocalizedError('TARGET_BUSY', 'bookUi.execution.busyUnknown');
    };
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1', { origin: 'manual' })], { position: 'back' });
    await settle(12);
    const item = store.items.find((entry) => entry.id === added[0]);
    expect(item?.status).toBe('cancelled');
    expect(item?.cancelRequested).toBe(false);
    expect(item?.waitingReason).toBeUndefined();
  });

  it('批量结束项超过历史保留上限时，汇总仍按整轮结果统计，汇总后再裁剪历史', async () => {
    configureTaskQueue({ finishedLimit: 2 });
    const runner: TaskQueueRunner = (item) =>
      item.chapterId === 'c1'
        ? Promise.reject(new Error('模型错误'))
        : Promise.resolve({ appliedCount: 1, targetCount: 1, actions: [] });
    const store = await startStore(runner, 1);
    const { added } = await store.enqueue([req('c1'), req('c2'), req('c3'), req('c4')], {
      position: 'back',
    });
    for (const id of added) await store.waitForItem(id);
    await settle();
    expect(notified).toHaveLength(1);
    expect(notified[0]?.summary).toBe('批量任务已结束');
    expect(notified[0]?.detail).toBe('3 完成 · 1 失败 · 0 已取消');
    expect(store.finishedItems.length).toBeLessThanOrEqual(2);
  });
});
