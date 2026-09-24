import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import type { App, Component, Ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { BookSyncApplyResult, BookSyncChangeset, SyncNewChapter } from 'src/models/book-sync';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { BookSyncError } from 'src/services/book-sync/errors';
import { ImportRecipeRepair } from 'src/services/import/import-recipe-repair';
import { ImportAgentService } from 'src/services/import/import-agent-service';
import { useBooksStore } from 'src/stores/books';
import {
  injectBookSync,
  provideBookSync,
  type BookSyncContext,
  type BookSyncTarget,
} from 'src/composables/book-sync/useBookSync';

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

function added(n: number, groupKey = 'g1'): SyncNewChapter {
  return { url: `u${n}`, title: `第${n}话`, target: { volumeId: 'v1' }, groupKey };
}

function changeset(partial: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: 1,
    new: [added(1), added(2)],
    updated: [
      {
        url: 'x1',
        title: '旧1',
        chapterId: 'c1',
        paragraphs: [],
        changes: [],
        revised: 1,
        inserted: 0,
        removed: 0,
        clearedVersions: 2,
      },
    ],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: ['x1'],
    status: 'ready',
    ...partial,
  };
}

type FakeSession = {
  changeset: BookSyncChangeset;
  quickCheck: ReturnType<typeof vi.fn>;
  deepCheck: ReturnType<typeof vi.fn>;
  apply: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
  preview: ReturnType<typeof vi.fn>;
  setSkipped: ReturnType<typeof vi.fn>;
};

function fakeSession(initial = changeset()): FakeSession {
  const session: FakeSession = {
    changeset: initial,
    quickCheck: vi.fn(() => Promise.resolve(session.changeset)),
    deepCheck: vi.fn(() => Promise.resolve(session.changeset)),
    // 与真实会话一致：apply 会 structuredClone 选择，响应式代理无法克隆
    apply: vi.fn((selection: unknown) => {
      structuredClone(selection);
      return Promise.resolve(undefined);
    }),
    undo: vi.fn(() => Promise.resolve()),
    preview: vi.fn(() => Promise.resolve(['正文'])),
    setSkipped: vi.fn(() => Promise.resolve(session.changeset)),
  };
  return session;
}

let app: App | undefined;
let host: HTMLElement | undefined;
let ctx: BookSyncContext;
const seen: BookSyncContext[] = [];

const VariantA = defineComponent({
  setup() {
    seen.push(injectBookSync());
    return () => h('div', 'A');
  },
});
const VariantB = defineComponent({
  setup() {
    seen.push(injectBookSync());
    return () => h('div', 'B');
  },
});

async function mount(
  target: Ref<BookSyncTarget | null>,
  variant: Ref<Component>,
  onApplied = vi.fn(),
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  const Host = defineComponent({
    setup() {
      ctx = provideBookSync(target, { onApplied });
      return () => h(variant.value);
    },
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(Host);
  app.use(router);
  app.mount(host);
  await flush();
  return { router, onApplied };
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

beforeEach(() => {
  toastAdd.mockClear();
  seen.length = 0;
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = undefined;
  vi.restoreAllMocks();
});

describe('useBookSync 会话生命周期', () => {
  it('进入时只执行一次快速检查，新章节默认勾选、有更新不勾选', async () => {
    const session = fakeSession();
    const open = vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);

    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ target: { bookId: 'b1' } });
    expect(session.quickCheck).toHaveBeenCalledTimes(1);
    expect(ctx.phase.value).toBe('ready');
    expect([...ctx.selected.value].sort()).toEqual(['u1', 'u2']);
  });

  it('切换设备变体后勾选与目标卷覆盖保留，也不会重新检查', async () => {
    const session = fakeSession();
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    const variant = shallowRef<Component>(VariantA);
    await mount(ref({ bookId: 'b1' }), variant);
    ctx.toggle('u1', false);
    ctx.toggle('x1', true);
    ctx.setGroupTarget('g1', { newTitle: '第二部' });

    variant.value = VariantB;
    await flush();

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect([...ctx.selected.value].sort()).toEqual(['u2', 'x1']);
    expect(ctx.volumeOverrides.value.get('g1')).toEqual({ newTitle: '第二部' });
    expect(session.quickCheck).toHaveBeenCalledTimes(1);
  });

  it('目标变化时中止旧检查并新建会话', async () => {
    const first = fakeSession();
    let firstSignal: AbortSignal | undefined;
    first.quickCheck.mockImplementation((signal: AbortSignal) => {
      firstSignal = signal;
      return new Promise(() => undefined);
    });
    const second = fakeSession(changeset({ new: [added(9)] }));
    const open = vi
      .spyOn(BookSyncService, 'openSession')
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never);
    const target = ref<BookSyncTarget | null>({ bookId: 'b1' });
    await mount(target, shallowRef(VariantA));

    target.value = { bookId: 'b2' };
    await flush();

    expect(firstSignal?.aborted).toBe(true);
    expect(open).toHaveBeenLastCalledWith({ target: { bookId: 'b2' } });
    expect([...ctx.selected.value]).toEqual(['u9']);
  });

  it('卸载时中止进行中的检查', async () => {
    const session = fakeSession();
    let signal: AbortSignal | undefined;
    session.quickCheck.mockImplementation((s: AbortSignal) => {
      signal = s;
      return new Promise(() => undefined);
    });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    app!.unmount();
    app = undefined;

    expect(signal?.aborted).toBe(true);
  });

  it('没有目标时不打开会话', async () => {
    const open = vi.spyOn(BookSyncService, 'openSession');
    await mount(ref(null), shallowRef(VariantA));
    expect(open).not.toHaveBeenCalled();
    expect(ctx.phase.value).toBe('idle');
  });

  it('缺少配方时进入 missing 状态', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new Error('RECIPE_MISSING: 尚未建立更新配方'),
    );
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    expect(ctx.phase.value).toBe('missing');
  });

  it('配方失效时进入 invalid 状态并给出原因', async () => {
    const session = fakeSession(
      changeset({
        new: [],
        updated: [],
        status: 'invalid',
        failed: [{ url: '', code: 'CATALOG_UNRECOGNIZED', message: '目录无法复现' }],
      }),
    );
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    expect(ctx.phase.value).toBe('invalid');
    expect(ctx.message.value).toBe('目录无法复现');
  });
});

describe('确认与应用状态流转', () => {
  function success(): BookSyncApplyResult {
    return { bookId: 'b1', revision: 2, status: 'success', appliedUrls: ['u1', 'u2'], failed: [] };
  }

  it('确认摘要来自勾选；确认后按勾选与覆盖应用并回调', async () => {
    const session = fakeSession();
    session.apply.mockImplementation((selection: unknown) => {
      structuredClone(selection);
      return Promise.resolve(success());
    });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    const { onApplied } = await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    ctx.toggle('x1', true);
    ctx.setGroupTarget('g1', { newTitle: '第二部' });

    ctx.requestApply();
    expect(ctx.confirm.value).toEqual({
      stage: 'confirming',
      reconfirm: false,
      summary: { newCount: 2, updatedCount: 1, clearedVersions: 2, newVolumes: ['第二部'] },
    });

    await ctx.confirmApply();

    const selection = session.apply.mock.calls[0]![0] as {
      urls: string[];
      volumeOverrides: Map<string, unknown>;
    };
    expect(selection.urls.sort()).toEqual(['u1', 'u2', 'x1']);
    expect(selection.volumeOverrides.get('g1')).toEqual({ newTitle: '第二部' });
    expect(ctx.confirm.value.stage).toBe('closed');
    expect(onApplied).toHaveBeenCalledWith(success());
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', onRevert: expect.any(Function) }),
    );
  });

  it('应用成功后清空目标卷覆盖，避免后续应用重复新建同名卷', async () => {
    const session = fakeSession();
    session.apply.mockResolvedValue(success());
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    ctx.setGroupTarget('g1', { newTitle: '第二部' });

    ctx.requestApply();
    await ctx.confirmApply();

    expect(ctx.volumeOverrides.value.size).toBe(0);
  });

  it('应用失败时保留目标卷覆盖', async () => {
    const session = fakeSession();
    session.apply.mockResolvedValue({ ...success(), status: 'failed', appliedUrls: [] });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    ctx.setGroupTarget('g1', { newTitle: '第二部' });

    ctx.requestApply();
    await ctx.confirmApply();

    expect(ctx.volumeOverrides.value.get('g1')).toEqual({ newTitle: '第二部' });
  });

  it('书籍已被修改时显示重算后的摘要并要求再次确认，不自动写入', async () => {
    const session = fakeSession();
    session.apply.mockImplementation(() => {
      session.changeset = changeset({ new: [added(1)] });
      return Promise.reject(new BookSyncError('BOOK_CHANGED', '书籍已变化'));
    });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    ctx.requestApply();
    await ctx.confirmApply();

    expect(session.apply).toHaveBeenCalledTimes(1);
    expect(ctx.confirm.value).toEqual({
      stage: 'confirming',
      reconfirm: true,
      summary: { newCount: 1, updatedCount: 0, clearedVersions: 0, newVolumes: [] },
    });
  });

  it('书籍被占用时关闭确认并指明占用任务', async () => {
    const session = fakeSession();
    session.apply.mockRejectedValue(new BookSyncError('TARGET_BUSY', '翻译第 3 话'));
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    ctx.requestApply();
    await ctx.confirmApply();

    expect(ctx.confirm.value.stage).toBe('closed');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', detail: expect.stringContaining('翻译第 3 话') }),
    );
  });

  it('没有勾选时不打开确认', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    ctx.toggle('u1', false);
    ctx.toggle('u2', false);
    ctx.requestApply();
    expect(ctx.confirm.value.stage).toBe('closed');
  });

  it('失败章节重试只应用该章节', async () => {
    const session = fakeSession(
      changeset({ failed: [{ url: 'u3', code: 'CONTENT_FETCH_FAILED', message: '超时' }] }),
    );
    session.apply.mockResolvedValue({ ...success(), appliedUrls: ['u3'] });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    await ctx.retry('u3');

    expect((session.apply.mock.calls[0]![0] as { urls: string[] }).urls).toEqual(['u3']);
  });

  it('撤销被拒时说明书籍已有后续修改', async () => {
    const session = fakeSession();
    session.apply.mockResolvedValue(success());
    session.undo.mockRejectedValue(new BookSyncError('BOOK_CHANGED', '书籍已有后续修改，无法撤销'));
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    ctx.requestApply();
    await ctx.confirmApply();

    await ctx.undo();

    expect(toastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'error', detail: expect.stringContaining('后续修改') }),
    );
  });
});

describe('跳过', () => {
  it('跳过后以会话返回的变更集刷新，并移出勾选', async () => {
    const session = fakeSession();
    session.setSkipped.mockImplementation(() => {
      session.changeset = changeset({
        new: [added(1)],
        skipped: [{ url: 'u2', title: '第2话' }],
      });
      return Promise.resolve(session.changeset);
    });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));

    await ctx.setSkipped([{ url: 'u2', title: '第2话' }], true);

    expect(session.setSkipped).toHaveBeenCalledWith([{ url: 'u2', title: '第2话' }], true);
    expect(ctx.changeset.value?.skipped.map((e) => e.url)).toEqual(['u2']);
    expect([...ctx.selected.value]).toEqual(['u1']);
  });
});

describe('来源配方摘要', () => {
  it('从书库 store 中的响应式书籍读取配方摘要', async () => {
    const { useBooksStore } = await import('src/stores/books');
    const store = useBooksStore();
    store.books.push({
      id: 'b1',
      title: '书',
      createdAt: new Date(),
      lastEdited: new Date(),
      updateRecipe: {
        version: 1,
        engine: { kind: 'html', content: { selector: 'article' } },
        catalogUrls: ['https://example.com/book'],
        cleanup: [{ pattern: { kind: 'literal', value: '广告' }, action: 'remove_lines' }],
        verifiedChapterCount: 1,
        recordedAt: 1,
      },
    } as never);
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    expect(ctx.recipe.value).toEqual({
      engine: 'html',
      catalogUrl: 'https://example.com/book',
      cleanupCount: 1,
      virtual: false,
    });
  });
});

describe('配方修复入口', () => {
  const invalid = () =>
    fakeSession(
      changeset({
        new: [],
        updated: [],
        status: 'invalid',
        failed: [{ url: '', code: 'CATALOG_UNRECOGNIZED', message: '目录无法复现' }],
      }),
    );

  beforeEach(() => {
    useBooksStore().books = [
      { id: 'b1', title: '作品', createdAt: new Date(0), lastEdited: new Date(0) },
    ];
  });

  it('配方失效时打开修复任务并跳转，不启动 Agent', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(invalid() as never);
    const open = vi.spyOn(ImportRecipeRepair, 'open').mockResolvedValue('task-1');
    const run = vi.spyOn(ImportAgentService, 'run');
    const { router } = await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    await ctx.handoff();
    await flush();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), '目录无法复现');
    expect(router.currentRoute.value.path).toBe('/import/task-1');
    expect(run).not.toHaveBeenCalled();
  });

  it('缺少配方时以「还没有更新配方」作为原因', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new BookSyncError('RECIPE_MISSING', '尚未建立更新配方'),
    );
    const open = vi.spyOn(ImportRecipeRepair, 'open').mockResolvedValue('task-2');
    await mount(ref({ bookId: 'b1' }), shallowRef(VariantA));
    expect(ctx.phase.value).toBe('missing');
    await ctx.handoff();
    expect(open).toHaveBeenCalledWith(expect.anything(), '这本书还没有更新配方');
  });
});
