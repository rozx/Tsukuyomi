import './setup';
import { afterEach, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import { createAppI18n } from '../i18n/vue';
import SyncRevisionFileList from '../components/settings/SyncRevisionFileList.vue';
import { useBooksStore } from '../stores/books';

let app: App | undefined;
afterEach(() => app?.unmount());

it('默认按书籍折叠文件，展开后查看原名和带负号的大小差值', async () => {
  useBooksStore().books = [
    { id: 'b1', title: '测试书籍', createdAt: new Date(0), lastEdited: new Date(0) },
  ];
  const host = document.createElement('div');
  app = createApp({
    render: () =>
      h(SyncRevisionFileList, {
        isLoading: false,
        files: [
          { filename: 'book-b1.json', status: 'modified', size: 100, sizeDiff: 0 },
          { filename: 'chapters-b1_a.json', status: 'modified', size: 200, sizeDiff: -50 },
        ],
      }),
  });
  app.use(getActivePinia()!).use(createAppI18n('zh-CN')).mount(host);
  await nextTick();
  expect(host.querySelectorAll('summary')).toHaveLength(1);
  expect(host.textContent).toContain('测试书籍');
  expect(host.textContent).not.toContain('chapters-b1_a.json');
  expect(host.textContent).toContain('−50.0 B');
  const details = host.querySelector('details')!;
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
  await nextTick();
  expect(host.textContent).toContain('chapters-b1_a.json');
  expect(host.querySelectorAll('[data-size-diff]')).toHaveLength(2);
});
