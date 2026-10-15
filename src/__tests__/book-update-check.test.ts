import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App, Ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import messages from '../i18n';
import type { BookSyncChangeset, BookUpdateRecipe, SyncNewChapter } from 'src/models/book-sync';
import type { Novel } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { CheckedSessions } from 'src/services/book-sync/checked-sessions';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';
import {
  useBookUpdateCheck,
  type BookUpdateCheck,
} from 'src/composables/books-page/useBookUpdateCheck';

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

function added(n: number): SyncNewChapter {
  return { url: `u${n}`, title: `第${n}话`, target: { volumeId: 'v1' }, groupKey: 'g1' };
}

function changeset(partial: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: 1,
    new: [],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    dateUnchanged: [],
    dateNewer: [],
    status: 'ready',
    ...partial,
  };
}

/** 已导入章节 x1、x2：快速检查的「待比对」只会出现在已导入章节上 */
function imported(url: string) {
  return { id: url, title: url, webUrl: url, createdAt: new Date('2026-01-01T00:00:00Z') };
}

function book(partial: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    webUrl: ['https://kakuyomu.jp/works/123'],
    volumes: [{ id: 'v1', title: '卷一', chapters: [imported('x1'), imported('x2')] }],
    createdAt: new Date(0),
    lastEdited: new Date(0),
    ...partial,
  } as Novel;
}

function fakeSession(result: BookSyncChangeset | Promise<BookSyncChangeset>) {
  return { quickCheck: vi.fn((_signal?: AbortSignal) => Promise.resolve(result)) };
}

let app: App | undefined;
let check: BookUpdateCheck;
let router: Router;

async function mount(books: Novel[] | Ref<Novel[]> = []) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push('/books');
  const Host = defineComponent({
    setup() {
      check = useBookUpdateCheck({ books: () => (Array.isArray(books) ? books : books.value) });
      return () => h('div');
    },
  });
  app = createApp(Host);
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

/** 推进假时钟（只假造 Date，Promise 与定时器照常） */
function later(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  toastAdd.mockClear();
  await useSettingsStore().setUiLocale('zh-CN');
});

afterEach(() => {
  CheckedSessions.take('b1');
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('书架检查更新', () => {
  it('只有内置站点网址或已录制配方的书可以检查更新', async () => {
    await mount();
    expect(check.canCheckUpdate(book())).toBe(true);
    expect(
      check.canCheckUpdate(
        book({ webUrl: ['https://example.com/x'], updateRecipe: {} as BookUpdateRecipe }),
      ),
    ).toBe(true);
    expect(check.canCheckUpdate(book({ webUrl: [] }))).toBe(false);
    expect(check.canCheckUpdate(book({ webUrl: undefined }))).toBe(false);
    expect(check.canCheckUpdate(book({ webUrl: ['https://example.com/x'] }))).toBe(false);
    expect(check.canCheckUpdate(book({ webUrl: ['not a url'] }))).toBe(false);
  });

  it('在书架上直接快速检查：检查中标记、发现新章节后显示角标并提示', async () => {
    let resolve!: (value: BookSyncChangeset) => void;
    const pending = new Promise<BookSyncChangeset>((r) => (resolve = r));
    const session = fakeSession(pending);
    const open = vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();

    const running = check.checkBookUpdate(book());
    await flush();
    expect(check.isCheckingUpdate(book())).toBe(true);
    expect(check.updateCheckIcon(book())).toBe('pi pi-sync pi-spin');
    expect(check.updateCheckLabel(book())).toBe('正在检查更新…');

    resolve(changeset({ new: [added(1), added(2), added(3)] }));
    await running;

    expect(open).toHaveBeenCalledWith({ target: { bookId: 'b1' } });
    expect(check.isCheckingUpdate(book())).toBe(false);
    expect(check.updateCheckLabel(book())).toBe('检查更新');
    expect(check.updateBadge(book())).toBe('3 新章');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        summary: '发现更新',
        detail: '《测试书》有 3 个新章节',
      }),
    );
  });

  it('没有新章节但站点日期变新时显示待比对角标', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ dateNewer: ['x1', 'x2'] })) as never,
    );
    await mount();

    await check.checkBookUpdate(book());

    expect(check.updateBadge(book())).toBe('2 章待比对');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        summary: '发现更新',
        detail: '《测试书》有 2 章在站点上更新过，可在检查更新页比对正文',
      }),
    );
  });

  it('已是最新时不显示角标并提示', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ dateUnchanged: ['x1'] })) as never,
    );
    await mount();

    await check.checkBookUpdate(book());

    expect(check.updateBadge(book())).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: '已是最新' }),
    );
  });

  it('打开会话失败时提示错误并清除检查中状态', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new CodedLocalizedError('RECIPE_MISSING', 'bookUi.sync.recipeNone'),
    );
    await mount();

    await check.checkBookUpdate(book());

    expect(check.isCheckingUpdate(book())).toBe(false);
    expect(check.updateBadge(book())).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', summary: '检查更新失败' }),
    );
  });

  it('配方回放失败时提示到检查更新页处理', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ status: 'invalid' })) as never,
    );
    await mount();

    await check.checkBookUpdate(book());

    expect(check.updateBadge(book())).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: '检查更新失败' }),
    );
  });

  it('同一本书检查进行中重复点击不会再开会话', async () => {
    const pending = new Promise<BookSyncChangeset>(() => {});
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockResolvedValue(fakeSession(pending) as never);
    await mount();

    void check.checkBookUpdate(book());
    await flush();
    void check.checkBookUpdate(book());
    await flush();

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('重新检查会清掉旧角标', async () => {
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(fakeSession(changeset({ new: [added(1)] })) as never)
      .mockResolvedValueOnce(fakeSession(changeset()) as never);
    await mount();

    await check.checkBookUpdate(book());
    expect(check.updateBadge(book())).toBe('1 新章');
    later(61_000);
    await check.checkBookUpdate(book());

    expect(open).toHaveBeenCalledTimes(2);
    expect(check.updateBadge(book())).toBeNull();
  });

  it('检查完成的会话交给更新页复用，避免重新请求目录', async () => {
    const session = fakeSession(changeset({ new: [added(1)] }));
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();

    await check.checkBookUpdate(book());

    expect(CheckedSessions.take('b1')).toBe(session);
  });

  it('已是最新的会话同样交接，从详情进入更新页也不必重新检查', async () => {
    const session = fakeSession(changeset());
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();

    await check.checkBookUpdate(book());

    expect(CheckedSessions.take('b1')).toBe(session);
  });

  it('配方回放失败或出错时不交接会话', async () => {
    vi.spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(fakeSession(changeset({ status: 'invalid' })) as never)
      .mockRejectedValueOnce(new Error('NETWORK: 断网'));
    await mount();

    await check.checkBookUpdate(book());
    expect(CheckedSessions.take('b1')).toBeUndefined();
    await check.checkBookUpdate(book());
    expect(CheckedSessions.take('b1')).toBeUndefined();
  });

  it('重新检查时先丢弃上一次交接的会话', async () => {
    const first = fakeSession(changeset({ new: [added(1)] }));
    let resolve!: (value: BookSyncChangeset) => void;
    const second = fakeSession(new Promise<BookSyncChangeset>((r) => (resolve = r)));
    vi.spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never);
    await mount();

    await check.checkBookUpdate(book());
    later(61_000);
    const running = check.checkBookUpdate(book());
    await flush();
    expect(CheckedSessions.take('b1')).toBeUndefined();

    resolve(changeset());
    await running;
    expect(CheckedSessions.take('b1')).toBe(second);
  });

  it('刷新页面后（重新创建）检查结果仍在', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ new: [added(1)] })) as never,
    );
    await mount();
    await check.checkBookUpdate(book());
    app!.unmount();
    app = undefined;

    await mount();

    expect(check.updateBadge(book())).toBe('1 新章');
  });

  it('新章节导入书籍后角标自动消失', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ new: [added(1)] })) as never,
    );
    await mount();
    await check.checkBookUpdate(book());

    const imported = book({
      volumes: [{ id: 'v1', title: '卷一', chapters: [{ id: 'c1', webUrl: 'u1' }] }],
    } as Partial<Novel>);
    expect(check.updateBadge(imported)).toBeNull();
  });

  it('检查失败时清除之前保存的结果', async () => {
    vi.spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(fakeSession(changeset({ new: [added(1)] })) as never)
      .mockRejectedValueOnce(new Error('NETWORK: 断网'));
    await mount();
    await check.checkBookUpdate(book());
    later(61_000);
    await check.checkBookUpdate(book());
    app!.unmount();
    app = undefined;

    await mount();

    expect(check.updateBadge(book())).toBeNull();
  });

  it('检查被中止时保留上一次的结果', async () => {
    let resolve!: (value: BookSyncChangeset) => void;
    vi.spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(fakeSession(changeset({ new: [added(1)] })) as never)
      .mockResolvedValueOnce(
        fakeSession(new Promise<BookSyncChangeset>((r) => (resolve = r))) as never,
      );
    await mount();
    await check.checkBookUpdate(book());
    later(61_000);
    const running = check.checkBookUpdate(book());
    await flush();
    app!.unmount();
    app = undefined;
    resolve(changeset({ status: 'cancelled' }));
    await running;

    await mount();

    expect(check.updateBadge(book())).toBe('1 新章');
  });

  it('60 秒内再次检查同一本书不发请求，重新提示上次结果', async () => {
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockResolvedValue(fakeSession(changeset({ new: [added(1)] })) as never);
    await mount();
    await check.checkBookUpdate(book());
    toastAdd.mockClear();

    later(59_000);
    await check.checkBookUpdate(book());

    expect(open).toHaveBeenCalledTimes(1);
    expect(check.updateBadge(book())).toBe('1 新章');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '发现更新', detail: '《测试书》有 1 个新章节' }),
    );
  });

  it('冷却期内重新提示的结果按当前书籍计算', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ new: [added(1)] })) as never,
    );
    await mount();
    await check.checkBookUpdate(book());
    toastAdd.mockClear();

    const imported = book({
      volumes: [{ id: 'v1', title: '卷一', chapters: [{ id: 'c1', webUrl: 'u1' }] }],
    } as Partial<Novel>);
    await check.checkBookUpdate(imported);

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: '已是最新' }),
    );
  });

  it('超过 60 秒再次检查会重新请求', async () => {
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockResolvedValue(fakeSession(changeset()) as never);
    await mount();
    await check.checkBookUpdate(book());

    later(60_001);
    await check.checkBookUpdate(book());

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('上次检查失败的书没有冷却，可以立即重试', async () => {
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockRejectedValueOnce(new Error('NETWORK: 断网'))
      .mockResolvedValueOnce(fakeSession(changeset()) as never);
    await mount();
    await check.checkBookUpdate(book());
    await check.checkBookUpdate(book());

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('用检查后 store 里的最新书籍生成记录（检查期间写回的章节网址不丢）', async () => {
    const booksStore = useBooksStore();
    const before = book({
      volumes: [{ id: 'v1', title: '卷一', chapters: [{ ...imported('x1'), webUrl: undefined }] }],
    } as Partial<Novel>);
    booksStore.books = [before];
    const linked = book();
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue({
      quickCheck: vi.fn(() => {
        // 会话给手动章节写回网址后刷新了书籍
        booksStore.books = [linked];
        return Promise.resolve(changeset({ dateNewer: ['x1'] }));
      }),
    } as never);
    await mount();

    await check.checkBookUpdate(before);

    expect(check.updateBadge(linked)).toBe('1 章待比对');
  });

  it('打开更新页跳转到该书的检查更新设置', async () => {
    await mount();

    await check.openBookUpdate(book());

    expect(router.currentRoute.value.fullPath).toBe('/books/b1/settings/update');
  });

  it('离开书架时中止进行中的检查且不再提示', async () => {
    let signal: AbortSignal | undefined;
    let resolve!: (value: BookSyncChangeset) => void;
    const session = {
      quickCheck: vi.fn((s?: AbortSignal) => {
        signal = s;
        return new Promise<BookSyncChangeset>((r) => (resolve = r));
      }),
    };
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();

    const running = check.checkBookUpdate(book());
    await flush();
    app!.unmount();
    app = undefined;
    resolve(changeset({ status: 'cancelled' }));
    await running;

    expect(signal?.aborted).toBe(true);
    expect(toastAdd).not.toHaveBeenCalled();
  });
});

/** 可逐本控制结果的快速检查：记录每次 openSession 的书与收到的中止信号 */
function controllableSessions() {
  const calls: {
    bookId: string;
    signal?: AbortSignal | undefined;
    resolve: (value: BookSyncChangeset) => void;
    reject: (error: unknown) => void;
  }[] = [];
  vi.spyOn(BookSyncService, 'openSession').mockImplementation(((options: {
    target: { bookId: string };
  }) => {
    const call = {
      bookId: options.target.bookId,
    } as (typeof calls)[number];
    calls.push(call);
    return Promise.resolve({
      quickCheck: (signal?: AbortSignal) => {
        call.signal = signal;
        return new Promise<BookSyncChangeset>((resolve, reject) => {
          call.resolve = resolve;
          call.reject = reject;
        });
      },
    });
  }) as never);
  return calls;
}

function shelf(count: number): Novel[] {
  return Array.from({ length: count }, (_, i) => book({ id: `b${i + 1}`, title: `书${i + 1}` }));
}

describe('书架全部检查更新', () => {
  it('没有可检查的书时禁用全部检查', async () => {
    await mount([book({ webUrl: [] }), book({ id: 'b2', webUrl: ['https://example.com/x'] })]);

    expect(check.canCheckAll.value).toBe(false);
    await check.checkAllUpdates();
    expect(check.isCheckingAll.value).toBe(false);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('全部检查完成的会话同样交给更新页复用', async () => {
    const first = fakeSession(changeset({ new: [added(1)] }));
    const second = fakeSession(changeset());
    vi.spyOn(BookSyncService, 'openSession').mockImplementation(({ target }) =>
      Promise.resolve(('bookId' in target && target.bookId === 'b1' ? first : second) as never),
    );
    await mount([book(), book({ id: 'b2', title: '第二本' })]);

    await check.checkAllUpdates();

    expect(CheckedSessions.take('b1')).toBe(first);
    expect(CheckedSessions.take('b2')).toBe(second);
  });

  it('只检查可检查的书，并发不超过 2，进度随完成递增', async () => {
    const calls = controllableSessions();
    await mount([...shelf(4), book({ id: 'x', webUrl: [] })]);
    expect(check.canCheckAll.value).toBe(true);

    const running = check.checkAllUpdates();
    await flush();
    expect(check.isCheckingAll.value).toBe(true);
    expect(calls.map((c) => c.bookId)).toEqual(['b1', 'b2']);
    expect(check.checkAllProgress.value).toEqual({ checked: 0, total: 4 });
    expect(check.checkAllLabel.value).toBe('已检查 0 / 共 4');
    expect(check.checkAllCount.value).toBe('0/4');
    expect(check.checkAllIcon.value).toBe('pi pi-sync pi-spin');

    calls[0]!.resolve(changeset());
    await flush();
    expect(calls.map((c) => c.bookId)).toEqual(['b1', 'b2', 'b3']);
    expect(check.checkAllProgress.value).toEqual({ checked: 1, total: 4 });

    calls[1]!.resolve(changeset());
    calls[2]!.resolve(changeset());
    await flush();
    expect(calls).toHaveLength(4);
    calls[3]!.resolve(changeset());
    await running;

    expect(check.isCheckingAll.value).toBe(false);
    expect(check.checkAllProgress.value).toBeNull();
    expect(check.checkAllLabel.value).toBe('全部检查更新');
    expect(check.checkAllCount.value).toBeNull();
    expect(check.checkAllIcon.value).toBe('pi pi-sync');
  });

  it('跑完后只弹一条汇总提示，各书角标照常显示', async () => {
    const calls = controllableSessions();
    await mount(shelf(4));

    const running = check.checkAllUpdates();
    await flush();
    calls[0]!.resolve(changeset({ new: [added(1), added(2)] }));
    calls[1]!.resolve(changeset());
    await flush();
    calls[2]!.resolve(changeset({ dateNewer: ['x1'] }));
    calls[3]!.resolve(changeset({ new: [added(1)] }));
    await running;

    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', summary: '发现更新', detail: '3 本书有更新' }),
    );
    const [b1, b2, b3, b4] = shelf(4);
    expect(check.updateBadge(b1!)).toBe('2 新章');
    expect(check.updateBadge(b2!)).toBeNull();
    expect(check.updateBadge(b3!)).toBe('1 章待比对');
    expect(check.updateBadge(b4!)).toBe('1 新章');
  });

  it('全部已是最新时汇总为已是最新', async () => {
    const calls = controllableSessions();
    await mount(shelf(2));

    const running = check.checkAllUpdates();
    await flush();
    calls.forEach((c) => c.resolve(changeset()));
    await running;

    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: '已是最新',
        detail: '已检查 2 本书，均没有新章节',
      }),
    );
  });

  it('部分失败时不逐本报错，汇总里带上失败数', async () => {
    const calls = controllableSessions();
    await mount(shelf(3));

    const running = check.checkAllUpdates();
    await flush();
    calls[0]!.reject(new Error('网络错误'));
    calls[1]!.resolve(changeset({ status: 'invalid' }));
    await flush();
    calls[2]!.resolve(changeset({ new: [added(1)] }));
    await running;

    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        summary: '发现更新',
        detail: '1 本书有更新，2 本检查失败',
      }),
    );
    expect(check.isCheckingUpdate(shelf(3)[0]!)).toBe(false);
  });

  it('没有更新但有失败时以警告汇总', async () => {
    const calls = controllableSessions();
    await mount(shelf(2));

    const running = check.checkAllUpdates();
    await flush();
    calls[0]!.reject(new Error('网络错误'));
    calls[1]!.resolve(changeset());
    await running;

    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        summary: '检查更新完成',
        detail: '2 本书中有 1 本检查失败，其余没有新章节',
      }),
    );
  });

  it('取消后中止进行中的检查、不再开始剩余的书、不弹汇总', async () => {
    const calls = controllableSessions();
    await mount(shelf(4));

    const running = check.checkAllUpdates();
    await flush();
    calls[0]!.resolve(changeset({ new: [added(1)] }));
    await flush();
    expect(calls).toHaveLength(3);

    later(1_001);
    void check.toggleCheckAll();
    calls[1]!.resolve(changeset({ status: 'cancelled' }));
    calls[2]!.resolve(changeset({ status: 'cancelled' }));
    await running;

    expect(calls).toHaveLength(3);
    expect(calls[1]!.signal?.aborted).toBe(true);
    expect(calls[2]!.signal?.aborted).toBe(true);
    expect(toastAdd).not.toHaveBeenCalled();
    expect(check.isCheckingAll.value).toBe(false);
    expect(check.isCheckingUpdate(shelf(4)[1]!)).toBe(false);
    // 取消前已完成的书角标保留
    expect(check.updateBadge(shelf(4)[0]!)).toBe('1 新章');
  });

  it('全部检查进行中再次调用不会重复开始', async () => {
    const calls = controllableSessions();
    await mount(shelf(2));

    void check.checkAllUpdates();
    await flush();
    void check.checkAllUpdates();
    await flush();

    expect(calls).toHaveLength(2);
  });

  it('全部检查中单本按钮不会对同一本书重复开会话', async () => {
    const calls = controllableSessions();
    await mount(shelf(1));

    void check.checkAllUpdates();
    await flush();
    void check.checkBookUpdate(shelf(1)[0]!);
    await flush();

    expect(calls).toHaveLength(1);
  });

  it('工具栏按钮：空闲时开始、进行中再点取消，提示文字随状态切换', async () => {
    const calls = controllableSessions();
    await mount(shelf(3));
    expect(check.checkAllTitle.value).toBe('全部检查更新');

    const running = check.toggleCheckAll();
    await flush();
    expect(check.checkAllTitle.value).toBe('取消全部检查（已检查 0 / 共 3）');

    later(1_001);
    void check.toggleCheckAll();
    calls.forEach((c) => c.resolve(changeset({ status: 'cancelled' })));
    await running;

    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
    expect(check.isCheckingAll.value).toBe(false);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('全部检查跳过 10 分钟内检查过的书：不发请求，但计入进度与汇总', async () => {
    const calls = controllableSessions();
    const books = shelf(2);
    await mount(books);
    const single = check.checkBookUpdate(books[0]!);
    await flush();
    calls[0]!.resolve(changeset({ new: [added(1)] }));
    await single;
    toastAdd.mockClear();

    later(9 * 60_000);
    const running = check.checkAllUpdates();
    await flush();
    expect(calls.map((c) => c.bookId)).toEqual(['b1', 'b2']);
    calls[1]!.resolve(changeset());
    await running;

    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '发现更新', detail: '1 本书有更新' }),
    );
  });

  it('超过 10 分钟的书全部检查会重新请求', async () => {
    const calls = controllableSessions();
    const books = shelf(1);
    await mount(books);
    const single = check.checkBookUpdate(books[0]!);
    await flush();
    calls[0]!.resolve(changeset());
    await single;

    later(10 * 60_000 + 1);
    const running = check.checkAllUpdates();
    await flush();
    calls[1]!.resolve(changeset());
    await running;

    expect(calls).toHaveLength(2);
  });

  it('开始全部检查后 1 秒内再点不会取消（防双击）', async () => {
    const calls = controllableSessions();
    await mount(shelf(2));

    const running = check.toggleCheckAll();
    await flush();
    later(500);
    void check.toggleCheckAll();
    await flush();

    expect(check.isCheckingAll.value).toBe(true);
    expect(calls.every((c) => !c.signal?.aborted)).toBe(true);
    calls.forEach((c) => c.resolve(changeset()));
    await running;
    expect(toastAdd).toHaveBeenCalledTimes(1);
  });

  it('全部检查进行中即使已没有可检查的书，取消按钮仍可用', async () => {
    controllableSessions();
    const books = ref(shelf(1));
    await mount(books);

    void check.checkAllUpdates();
    await flush();
    books.value = [];
    await nextTick();

    expect(check.isCheckingAll.value).toBe(true);
    expect(check.canCheckAll.value).toBe(true);
  });

  it('没有可检查的书时按钮提示原因', async () => {
    await mount([book({ webUrl: [] })]);
    expect(check.checkAllTitle.value).toBe(
      '没有可检查更新的书（需要来自支持站点或已录制更新规则）',
    );
  });
});
