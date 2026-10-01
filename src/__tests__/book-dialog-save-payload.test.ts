import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import type { Novel } from 'src/models/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

// Textarea 的自动高度依赖 ResizeObserver，jsdom 没有实现
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
const t = (key: string) => i18n.global.t(key);

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

function makeBook(): Novel {
  return {
    id: 'b1',
    title: '书',
    author: '作者',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v1',
        title: '第一卷',
        chapters: [{ id: 'c1', title: '序章', createdAt: new Date(0), lastEdited: new Date(0) }],
      },
    ],
  } as Novel;
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mount(mode: 'add' | 'edit', book: Novel | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push('/books');
  const onSave = vi.fn();
  app = createApp(
    defineComponent({
      setup: () => () => h(BookDialog, { visible: true, mode, book, onSave }),
    }),
  );
  app.use(router).use(i18n).use(PrimeVue);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { onSave };
}

function clickButton(label: string) {
  const button = [...document.body.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!button) throw new Error(`找不到按钮「${label}」`);
  button.click();
}

function typeInto(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findInputByValue(value: string): HTMLInputElement {
  const input = [...document.body.querySelectorAll('input')].find((el) => el.value === value);
  if (!input) throw new Error(`找不到值为「${value}」的输入框`);
  return input;
}

describe('书籍对话框保存载荷中的 volumes', () => {
  it('编辑模式未改动卷章节时不携带 volumes，只改元数据', async () => {
    const { onSave } = await mount('edit', makeBook());
    typeInto(findInputByValue('作者'), '新作者');
    await settle();
    clickButton(t('bookDialogUi.save'));
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as Partial<Novel>;
    // 只携带用户改动的字段：未改动的标题、卷章节等不能用对话框打开时的旧值覆盖最新记录
    expect(payload).toEqual({ author: '新作者' });
  });

  it('新建模式仍提交完整表单数据', async () => {
    const { onSave } = await mount('add', null);
    const titleInput = document.body.querySelector<HTMLInputElement>('#title');
    if (!titleInput) throw new Error('找不到标题输入框');
    typeInto(titleInput, '新书');
    await settle();
    clickButton(t('bookDialogUi.save'));
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as Partial<Novel>;
    expect(payload).toMatchObject({ title: '新书', author: '', tags: [] });
  });

  it('编辑模式清空卷章节后携带 volumes: []', async () => {
    const { onSave } = await mount('edit', makeBook());
    clickButton(t('libraryUi.clearAll'));
    await settle();
    const confirmInput = document.body.querySelector<HTMLInputElement>(
      `input[placeholder="${t('bookDialogUi.enterBookName')}"]`,
    );
    if (!confirmInput) throw new Error('找不到清除确认输入框');
    typeInto(confirmInput, '书');
    await settle();
    clickButton(t('bookDialogUi.confirmClear'));
    await settle();
    clickButton(t('bookDialogUi.save'));
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as Partial<Novel>;
    expect(payload).toEqual({ volumes: [] });
  });

  it('保存后对话框表单仍保留卷章节用于展示', async () => {
    await mount('edit', makeBook());
    clickButton(t('bookDialogUi.save'));
    await settle();
    expect(document.body.textContent).toContain('第一卷');
  });
});
