import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { useBookDetailsStore } from '../stores/book-details';
import { ChapterContentService } from '../services/chapter-content-service';

const variant = vi.hoisted(() => ({ value: 'desktop' as 'desktop' | 'tablet' | 'mobile' }));
vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref } = await import('vue');
  return { useDeviceVariant: () => ({ variant: ref(variant.value) }) };
});

import BookDetailsPage from '../pages/BookDetailsPage.vue';

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
/** 品牌名与用户内容以外，界面自有文字不应出现中日文 */
const ALLOWED = ['月詠'];

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

function ownTexts(root: HTMLElement): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent?.trim();
    if (value) texts.push(value);
  }
  for (const element of root.querySelectorAll('*')) {
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute(name)?.trim();
      if (value) texts.push(value);
    }
  }
  return texts.filter((text) => CJK.test(text) && !ALLOWED.includes(text));
}

async function renderPage(
  device: 'desktop' | 'tablet' | 'mobile',
  locale: 'en-US' | 'zh-CN',
  withChapter = false,
): Promise<HTMLElement> {
  variant.value = device;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().setUiLocale(locale);
  await useBooksStore().addBook({
    id: 'b',
    title: 'User Book',
    targetLanguage: 'zh-TW',
    createdAt: new Date(),
    lastEdited: new Date(),
    volumes: [
      {
        id: 'v',
        title: 'Volume One',
        chapters: [
          { id: 'c', title: 'Chapter One', createdAt: new Date(), lastEdited: new Date() },
        ],
      },
    ],
  });
  if (withChapter) {
    // 用户内容用拉丁字母，避免与界面文字混淆
    await ChapterContentService.saveChapterContent(
      'c',
      [
        {
          id: '11111111',
          text: 'Source line',
          translations: [{ id: 't', translation: 'Target line', language: 'zh-TW', aiModelId: '' }],
          selectedTranslationId: '',
          selectedTranslations: {
            'zh-TW': { value: 't', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
          },
        },
      ],
      { bookId: 'b' },
    );
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/books/:id', component: BookDetailsPage },
      { path: '/:path(.*)*', component: { render: () => null } },
    ],
  });
  await router.push('/books/b');
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp({ template: '<router-view />' });
  app
    .use(pinia)
    .use(router)
    .use(createAppI18n(locale))
    .use(PrimeVue)
    .use(ToastService)
    .use(ConfirmationService)
    .directive('tooltip', Tooltip)
    .mount(host);
  await vi.waitFor(() => expect(host.textContent).toContain('User Book'));
  if (withChapter) useBookDetailsStore().setSelectedChapter('b', 'c');
  await flush();
  return host;
}

describe('书籍详情三设备变体的界面文字', () => {
  it.each(['desktop', 'tablet', 'mobile'] as const)(
    '%s：英文界面 + 繁中目标书籍不出现中文界面文字',
    async (device) => {
      await renderPage(device, 'en-US');
      expect(ownTexts(document.body)).toEqual([]);
    },
  );

  it.each(['desktop', 'tablet', 'mobile'] as const)(
    '%s：打开章节后阅读工具栏与章节信息为英文（段落行由虚拟列表按需渲染，另有组件测试）',
    async (device) => {
      await renderPage(device, 'en-US', true);
      await flush();
      await vi.waitFor(() => expect(document.body.textContent).toContain('1 translated'));
      await flush();
      expect(ownTexts(document.body)).toEqual([]);
    },
  );

  it.each(['desktop', 'tablet', 'mobile'] as const)(
    '%s：对照组简中界面能检出中文界面文字',
    async (device) => {
      await renderPage(device, 'zh-CN');
      expect(ownTexts(document.body).length).toBeGreaterThan(0);
    },
  );
});
