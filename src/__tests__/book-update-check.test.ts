import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import messages from '../i18n';
import type { BookSyncChangeset, BookUpdateRecipe, SyncNewChapter } from 'src/models/book-sync';
import type { Novel } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';
import { useSettingsStore } from 'src/stores/settings';
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

function book(partial: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    webUrl: ['https://kakuyomu.jp/works/123'],
    volumes: [],
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

async function mount() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push('/books');
  const Host = defineComponent({
    setup() {
      check = useBookUpdateCheck();
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

beforeEach(async () => {
  toastAdd.mockClear();
  await useSettingsStore().setUiLocale('zh-CN');
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
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
    await check.checkBookUpdate(book());

    expect(open).toHaveBeenCalledTimes(2);
    expect(check.updateBadge(book())).toBeNull();
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
