import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import BookTranslationSettingsForm from '../components/novel/BookTranslationSettingsForm.vue';
import ChapterToolbarTablet from '../components/novel/ChapterToolbarTablet.vue';
import type { BookTranslationSettingsFormHandle } from '../composables/book-details/chapter-settings-update';
import type { Novel } from '../models/novel';

let app: App | undefined;
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const book: Novel = {
  id: 'b',
  title: '使用者書名',
  targetLanguage: 'zh-TW',
  createdAt: new Date(),
  lastEdited: new Date(),
};

function mount(render: () => ReturnType<typeof h>) {
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
  app = createApp({ setup: () => render });
  app
    .use(createPinia())
    .use(i18n)
    .use(PrimeVue)
    .mount(document.body.appendChild(document.createElement('div')));
  return i18n;
}

describe('英文界面 + 繁中目标书籍', () => {
  it('翻译设置为英文界面，目标语言仍为繁中并以原生名称显示', async () => {
    let form!: BookTranslationSettingsFormHandle;
    mount(() =>
      h(BookTranslationSettingsForm, {
        ref: (value: unknown) => {
          form = value as BookTranslationSettingsFormHandle;
        },
        book,
      }),
    );
    await nextTick();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Translation target language');
    expect(text).toContain('繁體中文');
    expect(text).not.toContain('翻译目标语言');
    expect(form.buildBookLevelPayload().targetLanguage).toBe('zh-TW');
  });

  it('阅读工具栏统计繁中目标译文，界面文字为英文', async () => {
    mount(() =>
      h(ChapterToolbarTablet, {
        selectedChapter: null,
        book,
        canUndo: false,
        canRedo: false,
        selectedChapterParagraphs: [
          {
            id: 'p',
            text: 'original',
            translations: [
              { id: 'tw', translation: '繁中譯文', language: 'zh-TW', aiModelId: '' },
              { id: 'cn', translation: '简中译文', language: 'zh-CN', aiModelId: '' },
            ],
            selectedTranslationId: 'cn',
            selectedTranslations: {
              'zh-TW': { value: 'tw', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
            },
          },
          { id: 'q', text: 'second', translations: [], selectedTranslationId: '' },
        ],
        translatedCharCount: 4,
        modelName: 'User model',
        translationStatus: { hasNone: false, hasAll: false },
        translationButtonLabel: 'User action',
        translationButtonMenuItems: [],
        isTranslatingChapter: false,
        isPolishingChapter: false,
        isSearchVisible: false,
        usedTermCount: 0,
        usedCharacterCount: 0,
        usedMemoryCount: 0,
      }),
    );
    await nextTick();
    const text = document.body.textContent ?? '';
    expect(text).toContain('1 translated');
    expect(text).toContain('User model');
  });
});
