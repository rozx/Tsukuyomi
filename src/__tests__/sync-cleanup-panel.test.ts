import './setup';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { getActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import SyncCleanupPanel from '../components/settings/SyncCleanupPanel.vue';
import { createAppI18n } from '../i18n/vue';
import { SyncType } from '../models/sync';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('扫描与取消确认均不删除；只有确认后提交预览文件并通知历史刷新', async () => {
  let version = 'a'.repeat(40);
  const files: Record<string, { content?: string; size?: number }> = {
    'manifest.json': { content: JSON.stringify({ schemaVersion: 6, entries: {} }) },
    'novel-old.json': { size: 100 },
  };
  const writes: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    if (init?.method === 'PATCH') {
      writes.push(JSON.parse(typeof init.body === 'string' ? init.body : ''));
      delete files['novel-old.json'];
      version = 'b'.repeat(40);
    }
    const history = [{ version }];
    return Promise.resolve(
      new Response(
        JSON.stringify(
          (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes(
            '/commits',
          )
            ? history
            : { files, history },
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
  });
  const cleaned = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(SyncCleanupPanel, {
        config: {
          enabled: true,
          syncType: SyncType.Gist,
          syncParams: { username: 'tester', gistId: 'test-gist' },
          secret: 'test-token',
          apiEndpoint: '',
          lastSyncTime: 0,
          syncInterval: 0,
        },
        onCleaned: cleaned,
      }),
  });
  app
    .use(getActivePinia()!)
    .use(createAppI18n('zh-CN'))
    .use(PrimeVue)
    .use(ConfirmationService)
    .use(ToastService)
    .mount(host);
  const button = (root: ParentNode, text: string) =>
    [...root.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button(host, '扫描遗留文件').click();
  await vi.waitFor(() => expect(host.textContent).toContain('可清理 1 个文件'));
  expect(writes).toEqual([]);
  button(host, '清理这 1 个文件').click();
  await nextTick();
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
  button(document.querySelector('[role="alertdialog"]')!, '取消').click();
  await nextTick();
  expect(writes).toEqual([]);
  button(host, '清理这 1 个文件').click();
  await nextTick();
  button(document.querySelector('[role="alertdialog"]')!, '清理这 1 个文件').click();
  await vi.waitFor(() => expect(cleaned).toHaveBeenCalledOnce());
  expect(writes).toEqual([{ files: { 'novel-old.json': null } }]);
  expect(host.textContent).not.toContain('可清理 1 个文件');
});
