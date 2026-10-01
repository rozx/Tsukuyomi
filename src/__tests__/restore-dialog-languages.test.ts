import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import RestoreDeletedItemsDialog from '../components/dialogs/RestoreDeletedItemsDialog.vue';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
describe('恢复弹窗显示语言', () => {
  it('类型和时间使用当前语言，书名与恢复数据不变', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    const date = new Date('2026-08-20T08:30:00Z');
    app = createApp({
      setup: () => () =>
        h(RestoreDeletedItemsDialog, {
          visible: true,
          items: [
            {
              id: 'b',
              type: 'novel',
              title: '用户书名',
              deletedAt: date.getTime(),
              data: { id: 'b', title: '用户书名', createdAt: date, lastEdited: date },
            },
          ],
        }),
    });
    app
      .use(i18n)
      .use(PrimeVue)
      .mount(document.body.appendChild(document.createElement('div')));
    await nextTick();
    expect(document.body.textContent).toContain('Restore deleted items');
    expect(document.body.textContent).toContain('Book');
    expect(document.body.textContent).toContain(
      date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('復原已刪除的項目');
    expect(document.body.textContent).toContain('用户书名');
  });
});
