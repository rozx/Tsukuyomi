import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import type { BookSyncChangeset, SyncUpdatedChapter } from 'src/models/book-sync';
import type { ImportParagraphChange } from 'src/models/import';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { FEATURES } from 'src/constants/features';
import { provideBookSync, type BookSyncTarget } from 'src/composables/book-sync/useBookSync';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';
import ParagraphDiffView from 'src/components/book-sync/fragments/ParagraphDiffView.vue';

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));
const variant = vi.hoisted(() => ({ value: 'desktop' as 'desktop' | 'tablet' | 'mobile' }));
vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref: vueRef } = await import('vue');
  const current = vueRef(variant.value);
  return {
    useDeviceVariant: () => {
      current.value = variant.value;
      return { variant: current };
    },
  };
});

const NCODE = 'https://ncode.syosetu.com/n1234ab/';

function update(n: number, changes: ImportParagraphChange[] = []): SyncUpdatedChapter {
  return {
    url: `${NCODE}${n}/`,
    title: `旧第${n}话`,
    chapterId: `c${n}`,
    paragraphs: [],
    changes,
    revised: 1,
    inserted: 0,
    removed: 0,
    clearedVersions: 2,
  };
}

function changeset(partial: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: null,
    new: [
      { url: `${NCODE}3/`, title: '第3话', target: { newTitle: '正文' }, groupKey: '1:a' },
      { url: `${NCODE}4/`, title: '第4话', target: { newTitle: '正文' }, groupKey: '1:a' },
    ],
    updated: [update(1)],
    skipped: [{ url: `${NCODE}5/`, title: '登場人物紹介' }],
    failed: [{ url: `${NCODE}6/`, code: 'CONTENT_FETCH_FAILED', message: '请求超时' }],
    unchecked: [`${NCODE}2/`],
    checked: [`${NCODE}1/`],
    dateUnchanged: [],
    status: 'ready',
    ...partial,
  };
}

function fakeSession(initial = changeset()) {
  const session = {
    changeset: initial,
    quickCheck: vi.fn(() => Promise.resolve(session.changeset)),
    deepCheck: vi.fn(),
    apply: vi.fn(() =>
      Promise.resolve({
        bookId: 'b',
        revision: 1,
        status: 'success' as const,
        appliedUrls: [],
        failed: [],
      }),
    ),
    undo: vi.fn(() => Promise.resolve()),
    preview: vi.fn(() => Promise.resolve(['第一段正文', '第二段正文'])),
    setSkipped: vi.fn(() => Promise.resolve(session.changeset)),
  };
  return session;
}

let app: App | undefined;
let host: HTMLElement;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount(target: BookSyncTarget | null = { newFrom: NCODE }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  const targetRef = ref(target);
  app = createApp(
    defineComponent({
      setup() {
        provideBookSync(targetRef);
        return () => h(BookSyncWorkspace);
      },
    }),
  );
  app.use(router);
  app.use(PrimeVue);
  app.mount(host);
  await flush();
  return { router };
}

function button(label: string, root: ParentNode = document.body): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').includes(label) || b.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`找不到按钮：${label}`);
  return found;
}

function hasButton(label: string): boolean {
  return [...document.body.querySelectorAll('button')].some(
    (b) => (b.textContent ?? '').includes(label) || b.getAttribute('aria-label') === label,
  );
}

beforeEach(() => {
  toastAdd.mockClear();
  variant.value = 'desktop';
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host?.remove();
  document.body.innerHTML = '';
  FEATURES.importWorkspace = true;
  vi.restoreAllMocks();
});

describe('工作区 dispatcher 与设备变体', () => {
  it.each([
    ['desktop', 'bsw--desktop'],
    ['tablet', 'bsw--desktop'],
    ['mobile', 'bsw--mobile'],
  ] as const)('%s 变体可以渲染', async (device, cls) => {
    variant.value = device;
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    expect(host.querySelector(`.${cls}`)).not.toBeNull();
    expect(host.textContent).toContain('第3话');
  });

  it('确认弹窗只挂载一份', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    button('应用').click();
    await flush();
    expect(document.body.querySelectorAll('[data-testid="bsw-confirm"]')).toHaveLength(1);
  });
});

describe('工作区片段', () => {
  it('来源只显示站点与目录网址，配方细节收在详情里', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    expect(host.textContent).toContain(NCODE);
    expect(host.textContent).toContain('小説家になろう');
    expect(host.textContent).not.toContain('清理规则');
    button('配方详情').click();
    await flush();
    expect(host.textContent).toContain('清理规则');
  });

  it('结论先回答有没有更新，只列出非零项', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount({ bookId: 'b1' });
    const summary = host.querySelector('[data-testid="bsw-summary"]')!;
    expect(summary.textContent).toContain('2 章新章节 · 1 章原文有修订');
    expect(summary.textContent).toContain('1 章未比对正文');
    expect(summary.textContent).toContain('跳过 1 章');
    expect(summary.textContent).not.toContain('按更新日期无变化');
  });

  it('已是最新时不显示空列表和应用栏，提供逐章比对', async () => {
    const latest = changeset({
      new: [],
      updated: [],
      skipped: [],
      failed: [],
      unchecked: [`${NCODE}1/`, `${NCODE}2/`],
      dateUnchanged: [`${NCODE}1/`, `${NCODE}2/`],
      checked: [],
    });
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession(latest) as never);
    await mount({ bookId: 'b1' });
    const summary = host.querySelector('[data-testid="bsw-summary"]')!;
    expect(summary.textContent).toContain('已是最新');
    expect(summary.textContent).toContain('2 章按更新日期无变化');
    expect(host.textContent).not.toContain('新章节');
    expect(host.textContent).not.toContain('有更新');
    expect(host.querySelector('[data-testid="bsw-apply-bar"]')).toBeNull();
    expect(hasButton('逐章比对正文')).toBe(true);
  });

  it('已跳过默认折叠', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    expect(host.textContent).not.toContain('登場人物紹介');
    button('已跳过 1 章').click();
    await flush();
    expect(host.textContent).toContain('登場人物紹介');
  });

  it('更改一组新章节的目标卷为新建卷，确认摘要使用新卷名', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    button('更改目标卷').click();
    await flush();
    const input = host.querySelector<HTMLInputElement>('input[data-testid="bsw-new-volume"]')!;
    input.value = '第二部';
    input.dispatchEvent(new Event('input'));
    await flush();
    button('使用新卷').click();
    await flush();
    expect(host.textContent).toContain('新建卷「第二部」');

    button('应用').click();
    await flush();
    const dialog = document.body.querySelector('[data-testid="bsw-confirm"]')!;
    expect(dialog.textContent).toContain('第二部');
  });

  it('取消勾选新章节会更新应用栏的数量', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession() as never);
    await mount();
    const box = host.querySelector<HTMLInputElement>(`input[data-url="${NCODE}3/"]`)!;
    box.click();
    await flush();
    expect(host.querySelector('[data-testid="bsw-apply-bar"]')!.textContent).toContain(
      '将写入 1 章新章节',
    );
  });

  it('预览新章节正文', async () => {
    const session = fakeSession();
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();
    button('预览第3话').click();
    await flush();
    expect(session.preview).toHaveBeenCalledWith(`${NCODE}3/`);
    expect(host.textContent).toContain('第一段正文');
  });

  it('跳过新章节与取消跳过已跳过章节', async () => {
    const session = fakeSession();
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();
    button('跳过第3话').click();
    await flush();
    expect(session.setSkipped).toHaveBeenCalledWith([{ url: `${NCODE}3/`, title: '第3话' }], true);
    button('已跳过 1 章').click();
    await flush();
    button('取消跳过登場人物紹介').click();
    await flush();
    expect(session.setSkipped).toHaveBeenLastCalledWith(
      [{ url: `${NCODE}5/`, title: '登場人物紹介' }],
      false,
    );
  });

  it('失败章节可以重试', async () => {
    const session = fakeSession();
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();
    button('重试').click();
    await flush();
    expect(session.apply).toHaveBeenCalledWith(expect.objectContaining({ urls: [`${NCODE}6/`] }));
  });

  it('有更新章节不自动勾选，可以查看段落差异', async () => {
    const session = fakeSession(
      changeset({
        updated: [
          update(1, [
            {
              chapterId: 'c1',
              paragraphId: 'p1',
              kind: 'revise',
              before: '旧的一段',
              after: '新的一段',
              clearedVersions: 2,
            },
          ]),
        ],
      }),
    );
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount({ bookId: 'b1' });
    const box = host.querySelector<HTMLInputElement>(`input[data-url="${NCODE}1/"]`)!;
    expect(box.checked).toBe(false);
    button('查看差异').click();
    await flush();
    expect(host.textContent).toContain('旧的一段');
    expect(host.textContent).toContain('新的一段');
  });
});

describe('段落差异视图', () => {
  it('标出变化、新增、移除段落以及会被清空的译文', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const changes: ImportParagraphChange[] = [
      {
        chapterId: 'c',
        paragraphId: 'a',
        kind: 'retain',
        before: '不变',
        after: '不变',
        clearedVersions: 0,
      },
      {
        chapterId: 'c',
        paragraphId: 'b',
        kind: 'revise',
        before: '旧',
        after: '新',
        clearedVersions: 3,
      },
      { chapterId: 'c', paragraphId: 'c', kind: 'insert', after: '新增段', clearedVersions: 0 },
      { chapterId: 'c', paragraphId: 'd', kind: 'remove', before: '删除段', clearedVersions: 1 },
    ];
    app = createApp(ParagraphDiffView, { changes });
    app.mount(host);
    await flush();
    const rows = [...host.querySelectorAll('[data-kind]')].map((row) =>
      row.getAttribute('data-kind'),
    );
    expect(rows).toEqual(['revise', 'insert', 'remove']);
    expect(host.textContent).toContain('修订');
    expect(host.textContent).toContain('新增');
    expect(host.textContent).toContain('移除');
    expect(host.textContent).toContain('清空 3 个译文版本');
    expect(host.textContent).toContain('1 段未变化');
  });
});

describe('深度检查与失效状态', () => {
  it('深度检查显示进度并可取消', async () => {
    const session = fakeSession();
    let signal: AbortSignal | undefined;
    let progress: ((done: number, total: number) => void) | undefined;
    session.deepCheck.mockImplementation(
      (options: { signal: AbortSignal; onProgress: (done: number, total: number) => void }) => {
        signal = options.signal;
        progress = options.onProgress;
        return new Promise((resolve) =>
          options.signal.addEventListener('abort', () => resolve(session.changeset)),
        );
      },
    );
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount({ bookId: 'b1' });
    button('逐章比对正文').click();
    await flush();
    progress?.(1, 4);
    await flush();
    expect(host.textContent).toContain('1 / 4');
    button('取消深度检查').click();
    await flush();
    expect(signal?.aborted).toBe(true);
  });

  it('配方失效时显示原因和入口，不显示章节列表和应用按钮', async () => {
    const session = fakeSession(
      changeset({
        new: [],
        updated: [],
        skipped: [],
        unchecked: [],
        status: 'invalid',
        failed: [{ url: '', code: 'CATALOG_UNRECOGNIZED', message: '目录无法复现已导入章节' }],
      }),
    );
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount({ bookId: 'b1' });
    expect(host.textContent).toContain('目录无法复现已导入章节');
    expect(hasButton('用 AI 导入器修复配方')).toBe(true);
    expect(host.querySelector('[data-testid="bsw-apply-bar"]')).toBeNull();
    expect(hasButton('应用')).toBe(false);
  });

  it('非内置站点新建时提供交给 AI 导入器', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new Error('RECIPE_MISSING: 尚未建立更新配方'),
    );
    await mount({ newFrom: 'https://example.com/novel' });
    expect(host.textContent).toContain('需要 AI 导入');
    expect(hasButton('交给 AI 导入器')).toBe(true);
  });

  it('AI 导入关闭时隐藏交接入口并提示', async () => {
    FEATURES.importWorkspace = false;
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new Error('RECIPE_MISSING: 尚未建立更新配方'),
    );
    await mount({ newFrom: 'https://example.com/novel' });
    expect(hasButton('交给 AI 导入器')).toBe(false);
    expect(host.textContent).toContain('当前版本已关闭 AI 导入');
  });
});

describe('失败原因显示', () => {
  it('去掉错误码前缀，只显示说明', async () => {
    const session = fakeSession(
      changeset({
        failed: [
          {
            url: `${NCODE}6/`,
            code: 'CONTENT_FETCH_FAILED',
            message: 'CONTENT_FETCH_FAILED: 请求超时',
          },
        ],
      }),
    );
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(session as never);
    await mount();
    const text = host.querySelector('.fl')!.textContent ?? '';
    expect(text).toContain('请求超时');
    expect(text).not.toContain('CONTENT_FETCH_FAILED');
  });
});
