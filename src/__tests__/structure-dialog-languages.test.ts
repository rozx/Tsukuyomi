import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import DeleteVolumeConfirmDialog from '../components/dialogs/DeleteVolumeConfirmDialog.vue';
import AddVolumeDialog from '../components/dialogs/AddVolumeDialog.vue';
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
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
describe('卷章共享弹窗行为', () => {
  it('删除问题保留原名和警告，确认事件只发送一次', async () => {
    const confirm = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(DeleteVolumeConfirmDialog, {
          visible: true,
          volumeTitle: '用户卷名',
          onConfirm: confirm,
        }),
    });
    app
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Delete volume “用户卷名”?');
    expect(document.body.textContent).toContain('every chapter');
    expect(document.querySelector('strong')?.textContent).toBe('用户卷名');
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    expect(confirm).toHaveBeenCalledTimes(1);
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('確定要刪除卷「用户卷名」嗎？');
  });
  it('新增卷切语言不清空草稿，保存仍trim原标题', async () => {
    const save = vi.fn();
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({ setup: () => () => h(AddVolumeDialog, { visible: true, onSave: save }) });
    app
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.value = ' 用户新卷 ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(input.value).toBe(' 用户新卷 ');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '新增')!.click();
    expect(save).toHaveBeenCalledWith('用户新卷');
  });
});
