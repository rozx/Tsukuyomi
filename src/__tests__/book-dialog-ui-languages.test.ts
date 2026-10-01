import BookChapterRow from '../components/dialogs/BookChapterRow.vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import BookDialog from '../components/dialogs/BookDialog.vue';
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
vi.mock('src/components/dialogs/CoverManagerDialog.vue', () => ({
  default: { render: () => null },
}));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});
describe('书籍表单切换界面语言', () => {
  it('章节字符数量使用单位而非指标标题，切语言保留原始标题', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(BookChapterRow, {
          chapter: {
            id: 'c',
            createdAt: new Date(),
            lastEdited: new Date(),
            title: {
              original: '用户章节标题',
              translation: { id: 't', translation: '', aiModelId: '' },
            },
          },
          charDisplay: 15000,
          charLoading: false,
        }),
    });
    app
      .use(PrimeVue)
      .use(i18n)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('15.0k characters');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('1.5萬 字');
    expect(document.body.textContent).not.toContain('字數');
    expect(document.body.textContent).toContain('用户章节标题');
  });
  it('已显示必填校验响应式变更，未提交作者内容保留', async () => {
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    });
    await router.push('/');
    app = createApp({ setup: () => () => h(BookDialog, { visible: true, mode: 'add' }) });
    app
      .use(createPinia())
      .use(router)
      .use(PrimeVue)
      .use(i18n)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const author = document.querySelector<HTMLInputElement>('input[placeholder="例如: 伏瀬"]')!;
    author.value = '用户作者草稿';
    author.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === '保存',
    )!;
    save.click();
    await nextTick();
    expect(document.body.textContent).toContain('书籍标题不能为空');
    i18n.global.locale.value = 'en-US';
    await nextTick();
    expect(document.body.textContent).toContain('Book title is required');
    expect(document.body.textContent).not.toContain('书籍标题不能为空');
    expect(author.value).toBe('用户作者草稿');
  });
});
