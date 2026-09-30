import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import type { BookSyncChangeset } from 'src/models/book-sync';
import type { AppLocale } from 'src/models/locale';
import { applyDescription, syncVerdict } from 'src/composables/book-sync/book-sync-rules';
import {
  provideBookSync,
  type BookSyncContext,
  type BookSyncTarget,
} from 'src/composables/book-sync/useBookSync';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { BookSyncError } from 'src/services/book-sync/errors';
import { serializeImportError } from 'src/services/import/import-error';
import { LocalizedError } from 'src/utils/localized-error';
import { useSettingsStore } from 'src/stores/settings';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';
import {
  provideBookSyncNew,
  type BookSyncNewContext,
} from 'src/composables/book-sync-new/useBookSyncNew';

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

const variant = vi.hoisted(() => ({ value: 'desktop' as 'desktop' | 'tablet' | 'mobile' }));
vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref: vueRef } = await import('vue');
  return { useDeviceVariant: () => ({ variant: vueRef(variant.value) }) };
});

const NCODE = 'https://ncode.syosetu.com/n1234ab/';

function changeset(partial: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: null,
    new: [
      { url: `${NCODE}3/`, title: 'Chapter 3', target: { newTitle: 'Arc 2' }, groupKey: '1:a' },
    ],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [`${NCODE}2/`],
    checked: [`${NCODE}1/`],
    dateUnchanged: [],
    dateNewer: [],
    status: 'ready',
    ...partial,
  };
}

function fakeSession(initial: BookSyncChangeset) {
  const session = {
    changeset: initial,
    quickCheck: vi.fn(() => Promise.resolve(session.changeset)),
    deepCheck: vi.fn(),
    apply: vi.fn(),
    undo: vi.fn(() => Promise.reject(new BookSyncError('BOOK_CHANGED', 'changed'))),
    preview: vi.fn(() => Promise.resolve(['Body'])),
    setSkipped: vi.fn(() => Promise.resolve(session.changeset)),
  };
  return session;
}

let app: App | undefined;
let host: HTMLElement;
let ctx: BookSyncContext;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount(locale: AppLocale, target: BookSyncTarget = { bookId: 'b1' }) {
  await useSettingsStore().setUiLocale(locale);
  const i18n = createI18n({ legacy: false, locale, messages });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(
    defineComponent({
      setup() {
        ctx = provideBookSync(ref(target));
        return () => h(BookSyncWorkspace);
      },
    }),
  );
  app.use(router).use(PrimeVue).use(i18n);
  app.mount(host);
  await flush();
  return i18n;
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
  vi.restoreAllMocks();
});

describe('同步结论文字跟随界面语言', () => {
  it('英文使用单复数且没有中文，繁中为繁体', () => {
    const value = changeset({
      new: [
        { url: 'a', title: 'A', target: { volumeId: 'v' }, groupKey: 'g' },
        { url: 'b', title: 'B', target: { volumeId: 'v' }, groupKey: 'g' },
      ],
      skipped: [{ url: 's', title: 'S' }],
    });
    const en = syncVerdict(value, false, 'en-US');
    expect(en.title).toBe('2 new chapters');
    expect(en.details).toContain('1 chapter skipped');
    expect(en.deepHint).toBe(
      '1 chapter has no usable update date; compare the chapter bodies to confirm whether they were revised.',
    );
    expect([en.title, ...en.details, en.deepHint].join(' ')).not.toMatch(CJK);
    expect(syncVerdict(value, false, 'zh-TW').details).toContain('略過 1 章');
    expect(syncVerdict(value, false).title).toBe('2 章新章节');
    expect(syncVerdict(changeset({ new: [] }), true, 'en-US').title).toBe(
      'The contents have no chapters to import',
    );
  });

  it('应用说明按语言连接各部分', () => {
    expect(applyDescription({ newCount: 3, updatedCount: 1 }, 'en-US')).toBe(
      'Will add 3 new chapters, update 1 chapter',
    );
    expect(applyDescription({ newCount: 0, updatedCount: 0 }, 'en-US')).toBe(
      'No chapters selected yet',
    );
    expect(applyDescription({ newCount: 2, updatedCount: 1 })).toBe('将写入 2 章新章节，更新 1 章');
  });
});

describe('同步工作区英文界面', () => {
  it.each(['desktop', 'tablet', 'mobile'] as const)(
    '%s 工作区固定文字为英文，用户章节标题保持原文',
    async (device) => {
      variant.value = device;
      vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession(changeset()) as never);
      await mount('en-US');
      const text = host.textContent ?? '';
      expect(text).toContain('New chapters');
      expect(text).toContain('Chapter 3');
      expect(text).toContain('Will add 1 new chapter');
      expect(text).not.toMatch(CJK);
    },
  );

  it('新建页网址校验说明随界面语言渲染', async () => {
    await useSettingsStore().setUiLocale('en-US');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
    });
    let page!: BookSyncNewContext;
    host = document.createElement('div');
    app = createApp(
      defineComponent({
        setup() {
          page = provideBookSyncNew();
          return () => null;
        },
      }),
    );
    app.use(router).mount(host);
    await flush();
    page.url.value = 'ftp://example.com';
    page.submit();
    expect(page.error.value).toBe(
      'Enter a novel contents URL that starts with http:// or https://',
    );
    await useSettingsStore().setUiLocale('zh-CN');
    expect(page.error.value).toBe('请输入以 http:// 或 https:// 开头的小说目录网址');
  });

  it('失败记录按界面语言重投影爬虫错误，切换语言后更新', async () => {
    const failure = {
      url: `${NCODE}6/`,
      ...serializeImportError(
        new LocalizedError('SCRAPER_CONTENT_MISSING', 'bookUi.scraper.contentMissing'),
      ),
      code: 'CONTENT_FETCH_FAILED',
    };
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(
      fakeSession(changeset({ failed: [failure] })) as never,
    );
    const i18n = await mount('en-US');
    expect(host.querySelector('.fl')!.textContent).toContain('Could not find the chapter body');
    i18n.global.locale.value = 'zh-TW';
    await useSettingsStore().setUiLocale('zh-TW');
    await flush();
    expect(host.querySelector('.fl')!.textContent).toContain('找不到章節正文內容');
  });

  it('检查失败的说明随界面语言重新渲染', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockRejectedValue(
      new BookSyncError(
        'CATALOG_FETCH_FAILED',
        new LocalizedError('FETCH_NETWORK_FAILED', 'bookUi.fetch.networkFailed'),
      ),
    );
    await mount('en-US');
    expect(ctx.phase.value).toBe('error');
    expect(ctx.message.value).toBe('Network connection failed; check your network settings');
    await useSettingsStore().setUiLocale('zh-CN');
    expect(ctx.message.value).toBe('网络连接失败，请检查网络设置');
  });

  it('确认弹窗的数量插值使用英文单复数', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession(changeset()) as never);
    await mount('en-US');
    ctx.requestApply();
    await flush();
    const dialog = document.querySelector('[data-testid="bsw-confirm"]');
    expect(dialog?.textContent).toContain('Add 1 chapter');
    expect(dialog?.textContent).toContain('Update 0 chapters');
    expect(dialog?.textContent).toContain('New volume “Arc 2”');
    expect(document.body.textContent).toContain('New volume “Arc 2”');
  });

  it('撤销失败提示为英文', async () => {
    vi.spyOn(BookSyncService, 'openSession').mockResolvedValue(fakeSession(changeset()) as never);
    await mount('en-US');
    ctx.canUndo.value = true;
    await ctx.undo();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Cannot undo',
        detail: 'The book was changed afterwards, so this sync cannot be undone',
      }),
    );
  });
});
