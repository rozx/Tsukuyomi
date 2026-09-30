import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import ChapterToolbarTablet from '../components/novel/ChapterToolbarTablet.vue';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
describe('阅读工具栏显示语言', () => {
  it('数量格式跟随UI，中文书籍的目标版本统计保持', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(ChapterToolbarTablet, {
          selectedChapter: null,
          book: {
            id: 'b',
            title: '用户书名',
            targetLanguage: 'zh-CN',
            createdAt: new Date(),
            lastEdited: new Date(),
          },
          canUndo: false,
          canRedo: false,
          selectedChapterParagraphs: [
            {
              id: 'p',
              text: 'original',
              translations: [{ id: 'cn', translation: '中文译文', aiModelId: '' }],
              selectedTranslationId: 'cn',
            },
          ],
          translatedCharCount: 15000,
          modelName: 'User model',
          translationStatus: { hasNone: false, hasAll: true },
          translationButtonLabel: 'User action',
          translationButtonMenuItems: [],
          isTranslatingChapter: false,
          isPolishingChapter: false,
          isSearchVisible: false,
          usedTermCount: 0,
          usedCharacterCount: 0,
          usedMemoryCount: 0,
        }),
    });
    app
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('About 15.0k characters');
    expect(document.body.textContent).toContain('1 translated');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('約 1.5萬 字');
    expect(document.body.textContent).toContain('User model');
  });
});
