import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import { createAppI18n } from '../i18n/vue';
import { useBooksStore } from '../stores/books';
import TerminologyPanel from '../components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from '../components/novel/CharacterSettingPanel.vue';
import CharacterEditDialog from '../components/dialogs/CharacterEditDialog.vue';
import TermEditDialog from '../components/dialogs/TermEditDialog.vue';
import ParagraphCharacterPopoverList from '../components/novel/ParagraphCharacterPopoverList.vue';
import type { AppLocale } from '../models/locale';

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('译名面板目标语言', () => {
  it('同名不同 ID 的记录保留并明确显示名称冲突', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      terminologies: ['one', 'two'].map((id) => ({
        id,
        name: 'Same term',
        translation: { id: `${id}-t`, translation: '', aiModelId: '' },
      })),
      characterSettings: ['one', 'two'].map((id) => ({
        id,
        name: 'Same character',
        sex: undefined,
        aliases: [],
        translation: { id: `${id}-c`, translation: '', aiModelId: '' },
      })),
    });
    const host = document.body.appendChild(document.createElement('div'));
    app = createApp({
      render: () =>
        h('div', [
          h(TerminologyPanel, { book: books.getBookById('b')! }),
          h(CharacterSettingPanel, { book: books.getBookById('b')! }),
        ]),
    });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .use(createAppI18n('en-US'))
      .mount(host);
    await nextTick();
    expect(host.textContent).toContain('Some records share a name');
    expect(host.textContent?.match(/Same term/g)).toHaveLength(2);
    expect(host.textContent?.match(/Same character/g)).toHaveLength(2);
  });
  it('角色悬浮卡缺少目标译名时保留原名并留空译名', () => {
    const host = document.body.appendChild(document.createElement('div'));
    app = createApp({
      render: () =>
        h(ParagraphCharacterPopoverList, {
          targetLanguage: 'en-US',
          characters: [
            {
              id: 'c',
              name: 'SOURCE',
              sex: undefined,
              aliases: [],
              translation: { id: 'cn', translation: '不能显示的简中译名', aiModelId: '' },
            },
          ],
        }),
    });
    app.use(createAppI18n('en-US')).mount(host);
    expect(host.textContent).toContain('SOURCE');
    expect(host.textContent).not.toContain('不能显示的简中译名');
  });
  it('目标语言改变后旧术语表单不提交旧语言内容', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const visible = ref(false);
    const language = ref<AppLocale>('en-US');
    const saved: unknown[] = [];
    app = createApp({
      render: () =>
        h(TermEditDialog, {
          visible: visible.value,
          mode: 'edit',
          targetLanguage: language.value,
          term: {
            id: 't',
            name: 'TERM',
            translation: { id: 'cn', translation: '中文', aiModelId: '' },
          },
          onSave: (value: unknown) => saved.push(value),
        }),
    });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(ToastService)
      .use(createAppI18n('zh-CN'))
      .mount(document.body.appendChild(document.createElement('div')));
    visible.value = true;
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('input[placeholder="输入翻译"]')!;
    input.value = 'English draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    language.value = 'zh-CN';
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('保存'))!
      .click();
    await nextTick();
    expect(saved).toEqual([]);
  });
  it('编辑弹窗按目标读取角色、别名及术语译名，缺失英文留空', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const visible = ref(false);
    const language = ref<AppLocale>('en-US');
    const translation = { id: 'cn', translation: '不可借用的简中译名', aiModelId: '' };
    app = createApp({
      render: () =>
        h('div', [
          h(TermEditDialog, {
            visible: visible.value,
            mode: 'edit',
            targetLanguage: language.value,
            term: { id: 't', name: 'TERM', translation },
          }),
          h(CharacterEditDialog, {
            visible: visible.value,
            targetLanguage: language.value,
            character: {
              id: 'c',
              name: 'CHARACTER',
              sex: undefined,
              translation,
              aliases: [{ id: 'alias', name: 'ALIAS', translation }],
            },
          }),
        ]),
    });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(ToastService)
      .use(createAppI18n('en-US'))
      .mount(document.body.appendChild(document.createElement('div')));
    visible.value = true;
    await nextTick();
    const values = [...document.querySelectorAll<HTMLInputElement>('input')].map(
      (input) => input.value,
    );
    expect(values).toContain('TERM');
    expect(values).toContain('CHARACTER');
    expect(values).toContain('ALIAS');
    expect(values).not.toContain('不可借用的简中译名');
  });
  it('英文目标缺少译名时留空，切回简中恢复对应译名', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      terminologies: [
        {
          id: 't',
          name: 'SOURCE_TERM',
          translation: { id: 'cn-t', translation: '专用简中术语', aiModelId: '' },
        },
      ],
      characterSettings: [
        {
          id: 'c',
          name: 'SOURCE_CHARACTER',
          sex: undefined,
          translation: { id: 'cn-c', translation: '专用简中角色', aiModelId: '' },
          aliases: [],
        },
      ],
    });
    const host = document.body.appendChild(document.createElement('div'));
    app = createApp({
      render: () =>
        h('div', [
          h(TerminologyPanel, { book: books.getBookById('b')! }),
          h(CharacterSettingPanel, { book: books.getBookById('b')! }),
        ]),
    });
    app
      .use(pinia)
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .use(createAppI18n('en-US'))
      .mount(host);
    await nextTick();
    expect(host.textContent).toContain('SOURCE_TERM');
    expect(host.textContent).toContain('SOURCE_CHARACTER');
    expect(host.textContent).not.toContain('专用简中术语');
    expect(host.textContent).not.toContain('专用简中角色');
    books.books[0]!.targetLanguage = 'zh-CN';
    await nextTick();
    expect(host.textContent).toContain('专用简中术语');
    expect(host.textContent).toContain('专用简中角色');
  });
});
