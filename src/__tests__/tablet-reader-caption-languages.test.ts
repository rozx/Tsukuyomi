import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import messages from '../i18n';
import BookDetailsTablet from '../pages/book-details/BookDetailsTablet.vue';
const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('src/composables/book-details/useBookDetailsPage', () => ({
  injectBookDetailsPage: () => context.value,
}));
vi.mock('src/pages/book-details/BookDetailsDesktop.vue', () => ({
  default: { render: () => null },
}));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
describe('平板阅读列标题', () => {
  it('英文UI完整显示简中目标，切UI后仍保留书籍目标', async () => {
    context.value = {
      book: ref({ targetLanguage: 'zh-CN' }),
      isTabletSidebarOpen: ref(true),
      activeTranslationTaskCount: ref(0),
    };
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({ setup: () => () => h(BookDetailsTablet) });
    app
      .use(createPinia())
      .use(i18n)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const root = document.querySelector<HTMLElement>('.book-details-tablet')!;
    expect(root.style.getPropertyValue('--reader-columns-header')).toContain(
      'Original · Translation · Simplified Chinese',
    );
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(root.style.getPropertyValue('--reader-columns-header')).toContain(
      '原文 · 譯文 · 簡體中文',
    );
  });
});
