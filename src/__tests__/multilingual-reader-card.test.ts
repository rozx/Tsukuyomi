import { afterEach, describe, expect, it } from 'bun:test';
import { beforeEach, vi } from 'vitest';
import './setup';
import { createAppI18n } from '../i18n/vue';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ParagraphCard from '../components/novel/ParagraphCard.vue';
import TranslationHistoryDialog from '../components/dialogs/TranslationHistoryDialog.vue';
import { useBooksStore } from '../stores/books';
import type { Novel, Paragraph } from '../models/novel';

let app: App | undefined;
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  ),
);
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('阅读卡片目标语言', () => {
  it('历史可显示其他语言，但点击其他语言版本不能选入当前槽', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const selected: string[] = [];
    const paragraph: Paragraph = {
      id: 'p',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '中文历史', language: 'zh-CN', aiModelId: '' },
        { id: 'en', translation: 'English history', language: 'en-US', aiModelId: '' },
      ],
    };
    app = createApp({
      render: () =>
        h(TranslationHistoryDialog, {
          visible: true,
          paragraph,
          targetLanguage: 'en-US',
          onSelectTranslation: (id: string) => selected.push(id),
        }),
    });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(createAppI18n('zh-CN'))
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const rows = [...document.querySelectorAll<HTMLElement>('.translation-history-item')];
    expect(rows).toHaveLength(2);
    rows.find((row) => row.textContent?.includes('中文历史'))!.click();
    expect(selected).toEqual([]);
    rows.find((row) => row.textContent?.includes('English history'))!.click();
    expect(selected).toEqual(['en']);
  });
  it('目标语言变化后旧编辑框不能提交到新语言', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    books.books = [
      {
        id: 'b',
        title: '书',
        targetLanguage: 'en-US',
        createdAt: new Date(0),
        lastEdited: new Date(0),
      },
    ];
    const paragraph: Paragraph = {
      id: 'p',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '中文', language: 'zh-CN', aiModelId: '' },
        { id: 'en', translation: 'English', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const writes: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({
      render: () =>
        h(ParagraphCard, {
          paragraph,
          bookId: 'b',
          onUpdateTranslation: (_id: string, text: string) => writes.push(text),
        }),
    });
    app.use(pinia).use(PrimeVue).use(createAppI18n('zh-CN')).use(ToastService).mount(host);
    (host.querySelector('.p-inplace-display') as HTMLElement).click();
    await nextTick();
    books.books[0]!.targetLanguage = 'zh-CN';
    await nextTick();
    const textarea = host.querySelector('textarea')!;
    textarea.value = 'Old English draft';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const apply = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('应用'),
    )!;
    apply.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(writes).toEqual([]);
  });
  it('共享卡片切换目标时只显示对应选用，缺失时显示原文', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    const book: Novel = {
      id: 'b',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
    };
    books.books = [book];
    const paragraph: Paragraph = {
      id: 'p',
      text: 'Original source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: '中文译文', language: 'zh-CN', aiModelId: '' },
        { id: 'en', translation: 'English translation', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({ render: () => h(ParagraphCard, { paragraph, bookId: 'b' }) });
    app.use(pinia).use(PrimeVue).use(createAppI18n('zh-CN')).use(ToastService).mount(host);
    await nextTick();
    expect(host.textContent).toContain('English translation');
    expect(host.textContent).not.toContain('中文译文');
    books.books[0]!.targetLanguage = 'zh-TW';
    await nextTick();
    expect(host.textContent).toContain('Original source');
    expect(host.textContent).not.toContain('English translation');
    books.books[0]!.targetLanguage = 'zh-CN';
    await nextTick();
    expect(host.textContent).toContain('中文译文');
  });

  it('点取消关闭编辑器时同样清除草稿并通知父组件停止编辑', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useBooksStore().books = [
      {
        id: 'b',
        title: '书',
        targetLanguage: 'zh-CN',
        createdAt: new Date(0),
        lastEdited: new Date(0),
      },
    ];
    const paragraph: Paragraph = {
      id: 'p',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [{ id: 'cn', translation: '中文', language: 'zh-CN', aiModelId: '' }],
    };
    const drafts = new Map<string, string>();
    const stops: string[] = [];
    const writes: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({
      render: () =>
        h(ParagraphCard, {
          paragraph,
          bookId: 'b',
          editDraftStore: drafts,
          onParagraphEditStop: (id: string) => stops.push(id),
          onUpdateTranslation: (_id: string, text: string) => writes.push(text),
        }),
    });
    app.use(pinia).use(PrimeVue).use(createAppI18n('zh-CN')).use(ToastService).mount(host);
    (host.querySelector('.p-inplace-display') as HTMLElement).click();
    await nextTick();
    const textarea = host.querySelector('textarea')!;
    textarea.value = '未保存草稿';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(drafts.get('p:zh-CN')).toBe('未保存草稿');
    const cancel = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('取消'),
    )!;
    cancel.click();
    await nextTick();
    expect(stops).toEqual(['p']);
    expect(drafts.has('p:zh-CN')).toBe(false);
    expect(writes).toEqual([]);
    expect(host.querySelector('textarea')).toBeNull();
  });
});
