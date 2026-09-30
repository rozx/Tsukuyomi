import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ConfirmDialog from 'primevue/confirmdialog';
import ToastService from 'primevue/toastservice';
import messages from '../i18n';
import MemoryDetailDialog from '../components/novel/MemoryDetailDialog.vue';
import MemoryPanel from '../components/novel/MemoryPanel.vue';
import { MemoryService } from '../services/memory-service';
const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  feedback.add.mockClear();
  document.body.innerHTML = '';
});
describe('记忆面板和详情界面语言', () => {
  it('记忆保存失败释放按钮且保留原诊断和未保存内容', async () => {
    const failure = vi
      .spyOn(MemoryService, 'createMemory')
      .mockRejectedValue(new Error('Original storage detail'));
    app = createApp({
      setup: () => () =>
        h(MemoryPanel, {
          book: { id: 'b', title: '用户书名', createdAt: new Date(), lastEdited: new Date() },
        }),
    });
    app
      .use(createPinia())
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')!.click();
    await nextTick();
    const dialog = document.querySelector('.p-dialog')!;
    const content = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    content.value = '用户待保存正文';
    content.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
    save.click();
    await vi.waitFor(() =>
      expect(feedback.add).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Could not save', detail: 'Original storage detail' }),
      ),
    );
    expect(failure).toHaveBeenCalledWith('b', '用户待保存正文', '');
    expect(content.value).toBe('用户待保存正文');
    expect(save.disabled).toBe(false);
  });

  it('已打开的未保存确认即时重绘，保存仍提交原草稿一次', async () => {
    const visible = ref(false);
    const save = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    const memory = {
      id: 'memory01',
      bookId: 'b',
      summary: '用户摘要',
      content: '原记忆',
      createdAt: 1000,
      lastAccessedAt: 1000,
    };
    app = createApp({
      setup: () => () =>
        h('div', [
          h(MemoryDetailDialog, {
            visible: visible.value,
            bookId: 'b',
            memory,
            initialEditMode: true,
            onSave: save,
          }),
          h(ConfirmDialog),
        ]),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    visible.value = true;
    await nextTick();
    const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = '用户未保存记忆';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    document.querySelector<HTMLButtonElement>('.p-dialog-close-button')!.click();
    await nextTick();
    expect(document.body.textContent).toContain('Save unsaved changes?');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    const dialog = document.querySelector('.p-confirmdialog')!;
    expect(dialog.textContent).toContain('有未儲存的變更，要儲存嗎？');
    dialog.querySelector<HTMLButtonElement>('.p-confirmdialog-accept-button')!.click();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('memory01', '用户摘要', '用户未保存记忆');
  });

  it('详情切语言保留未保存记忆并以原内容发送保存', async () => {
    const visible = ref(false);
    const save = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    const memory = {
      id: 'memory01',
      bookId: 'b',
      summary: '用户摘要',
      content: '用户记忆正文',
      createdAt: 1000,
      lastAccessedAt: 1000,
    };
    app = createApp({
      setup: () => () =>
        h(MemoryDetailDialog, {
          visible: visible.value,
          bookId: 'b',
          memory,
          initialEditMode: true,
          onSave: save,
        }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    visible.value = true;
    await nextTick();
    expect(document.body.textContent).toContain('Edit memory');
    const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = '用户未保存记忆';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(input.value).toBe('用户未保存记忆');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '儲存')!.click();
    expect(save).toHaveBeenCalledWith('memory01', '用户摘要', '用户未保存记忆');
  });
  it('真实记忆列表加载共享正文，英文固定标签且搜索词切UI保持', async () => {
    await MemoryService.createMemory('b', '用户记忆正文', '用户摘要');
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(MemoryPanel, {
          book: {
            id: 'b',
            title: '用户书名',
            targetLanguage: 'zh-CN',
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        }),
    });
    app
      .use(createPinia())
      .use(i18n)
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await vi.waitFor(() => expect(document.body.textContent).toContain('用户记忆正文'));
    expect(document.body.textContent).toContain('Memory management');
    expect(document.body.textContent).toContain('用户记忆正文');
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="Search memories..."]',
    )!;
    search.value = '用户';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(search.value).toBe('用户');
  });
});
