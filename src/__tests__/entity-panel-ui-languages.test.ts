import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import messages from '../i18n';
import TerminologyPanel from '../components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from '../components/novel/CharacterSettingPanel.vue';
import type { Novel } from '../models/novel';
import { TerminologyService } from '../services/terminology-service';
import { useBooksStore } from '../stores/books';
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => toast }));
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
  toast.add.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('实体面板界面语言', () => {
  it('批量确认打开后切UI，显示更新且删除仍绑定原选中ID', async () => {
    const pinia = createPinia();
    const book: Novel = {
      id: 'b',
      title: '用户书名',
      createdAt: new Date(),
      lastEdited: new Date(),
      terminologies: [
        {
          id: 't',
          name: '用户术语',
          translation: { id: 'cn', translation: '中文译名', aiModelId: '' },
        },
      ],
    };
    await useBooksStore(pinia).addBook(book);
    const remove = vi.spyOn(TerminologyService, 'deleteTerminology');
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({ setup: () => () => h(TerminologyPanel, { book }) });
    app
      .use(pinia)
      .use(i18n)
      .use(PrimeVue)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Batch')!
      .click();
    await nextTick();
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    await nextTick();
    const dialog = document.querySelector('.p-confirmdialog')!;
    expect(dialog.textContent).toContain('Delete the 1 selected term?');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(dialog.textContent).toContain('確定要刪除選取的 1 個術語嗎？');
    expect(dialog.textContent).toContain('用户术语');
    dialog.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('b', 't'));
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('导入一条数据使用英文单数，保留原始译名和语言', async () => {
    const pinia = createPinia();
    const book: Novel = {
      id: 'b',
      title: '用户书名',
      createdAt: new Date(),
      lastEdited: new Date(),
      terminologies: [],
    };
    await useBooksStore(pinia).addBook(book);
    vi.spyOn(TerminologyService, 'importTerminologiesFromFile').mockResolvedValue([
      {
        id: 't',
        name: '用户术语',
        translation: { id: 'cn', translation: '中文译名', aiModelId: '' },
      },
    ]);
    app = createApp({ setup: () => () => h(TerminologyPanel, { book }) });
    app
      .use(pinia)
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .use(PrimeVue)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['{}'], '用户术语.json', { type: 'application/json' })],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Imported 1 term (1 added, 0 updated)' }),
      ),
    );
    const loaded = useBooksStore(pinia).getBookById('b')!;
    expect(loaded.terminologies?.[0]?.name).toBe('用户术语');
    expect(loaded.terminologies?.[0]?.translation.translation).toBe('中文译名');
  });

  it('搜索和当前译名随各自语言变化，用户搜索词不重置', async () => {
    const book = ref<Novel>({
      id: 'b',
      title: '用户书名',
      targetLanguage: 'zh-CN',
      createdAt: new Date(),
      lastEdited: new Date(),
      terminologies: [
        {
          id: 't',
          name: '用户术语',
          translation: { id: 'cn', translation: '中文译名', aiModelId: '' },
        },
      ],
      characterSettings: [
        {
          id: 'c',
          name: '用户角色',
          sex: 'female',
          aliases: [],
          translation: { id: 'ccn', translation: '角色译名', aiModelId: '' },
        },
      ],
    });
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h('div', [
          h(TerminologyPanel, { book: book.value }),
          h(CharacterSettingPanel, { book: book.value }),
        ]),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Term settings');
    expect(document.querySelector('[title="Female"]')).not.toBeNull();
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="Search term names, translations or descriptions..."]',
    )!;
    search.value = '用户术语';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(search.value).toBe('用户术语');
    expect(document.body.textContent).toContain('中文译名');
    book.value.targetLanguage = 'en-US';
    await nextTick();
    expect(document.body.textContent).not.toContain('中文译名');
    expect(document.body.textContent).toContain('用户术语');
  });
  it('导出反馈使用UI语言并保留JSON内容', async () => {
    const exportSpy = vi
      .spyOn(TerminologyService, 'exportTerminologiesToJson')
      .mockImplementation(() => {});
    const book: Novel = {
      id: 'b',
      title: '用户书名',
      createdAt: new Date(),
      lastEdited: new Date(),
      terminologies: [
        {
          id: 't',
          name: '用户术语',
          translation: { id: 'cn', translation: '中文译名', aiModelId: '' },
        },
      ],
    };
    app = createApp({ setup: () => () => h(TerminologyPanel, { book }) });
    app
      .use(createPinia())
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .use(PrimeVue)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Export',
    )!;
    button.click();
    await nextTick();
    await Promise.resolve();
    expect(exportSpy).toHaveBeenCalledWith(book.terminologies);
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Exported', detail: 'Exported 1 term' }),
    );
  });
});
