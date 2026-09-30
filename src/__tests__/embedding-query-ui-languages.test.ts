import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import messages from '../i18n';
import BatchEmbeddingsTestQueryDialog from '../components/dialogs/BatchEmbeddingsTestQueryDialog.vue';
import { ChapterEmbeddingService } from '../services/chapter-embedding-service';
import { LocalizedError } from '../utils/localized-error';
vi.mock('src/components/layout/AdaptiveDialog.vue', () => ({
  default: {
    props: ['visible', 'header'],
    setup:
      (props: { visible: boolean; header: string }, { slots }: { slots: Slots }) =>
      () =>
        props.visible
          ? h('section', [h('h2', props.header), slots.default?.(), slots.footer?.()])
          : null,
  },
}));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
let app: App | undefined;
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('向量查询界面语言', () => {
  it('关闭后旧请求失败不重新填回错误或污染再次打开', async () => {
    let reject!: (reason: Error) => void;
    vi.spyOn(ChapterEmbeddingService, 'queryChapters').mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const visible = ref(true);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    });
    await router.push('/');
    app = createApp({
      setup: () => () =>
        h(BatchEmbeddingsTestQueryDialog, { visible: visible.value, bookId: 'book' }),
    });
    app
      .use(createPinia())
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .use(PrimeVue)
      .use(ConfirmationService)
      .use(ToastService)
      .use(router)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.value = '用户查询';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Query chapters')!
      .click();
    await nextTick();
    visible.value = false;
    await nextTick();
    reject(new LocalizedError('LATE_QUERY', 'embeddingUi.queryFailed'));
    await Promise.resolve();
    await nextTick();
    visible.value = true;
    await nextTick();
    expect(document.body.textContent).not.toContain('Vector search failed');
  });

  it('查询错误按当前UI重绘，输入和原始ID保留', async () => {
    vi.spyOn(ChapterEmbeddingService, 'queryChapters').mockRejectedValue(
      new LocalizedError('QUERY_FAILED', 'embeddingUi.queryFailed', {}, 'zh-CN'),
    );
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    });
    await router.push('/');
    app = createApp({
      setup: () => () =>
        h(BatchEmbeddingsTestQueryDialog, { visible: true, bookId: 'original-book-id' }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .use(ConfirmationService)
      .use(ToastService)
      .use(router)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Test vector search');
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.value = '用户查询原文';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Query chapters')!
      .click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Vector search failed'));
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('向量查詢失敗');
    expect(input.value).toBe('用户查询原文');
  });
});
