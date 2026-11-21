import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { useImportChatPanel } from '../composables/import-page/useImportChatPanel';
import { ImportRepository } from '../services/import/import-repository';

let apps: App[] = [];
afterEach(() => {
  for (const app of apps) app.unmount();
  apps = [];
});

/** 模拟手机对话抽屉：每次打开都重新挂载一份面板 */
function mountPanel(pinia: Pinia) {
  let panel!: ReturnType<typeof useImportChatPanel>;
  const app = createApp(
    defineComponent({
      setup() {
        panel = useImportChatPanel();
        return () => h('div');
      },
    }),
  );
  app
    .use(pinia)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages }))
    .mount(document.createElement('div'));
  apps.push(app);
  return { panel, app };
}

async function openTask(name: string) {
  const store = useImportWorkspaceStore();
  const task = await ImportRepository.createTask(name);
  store.selectedTaskId = task.id;
  store.task = task;
  store.events = [];
  await nextTick();
  return task;
}

describe('导入对话的输入草稿', () => {
  it('关闭对话抽屉（面板卸载）后再打开，同一任务的草稿还在', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await openTask('任务 A');
    const first = mountPanel(pinia);
    first.panel.inputMessage.value = '先抓第一卷';
    first.app.unmount();
    apps = apps.filter((app) => app !== first.app);

    const second = mountPanel(pinia);
    expect(second.panel.inputMessage.value).toBe('先抓第一卷');
  });

  it('每个任务各自保留草稿，切换任务不互相带过去', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useImportWorkspaceStore();
    const a = await openTask('任务 A');
    const { panel } = mountPanel(pinia);
    panel.inputMessage.value = 'A 的草稿';

    const b = await openTask('任务 B');
    expect(panel.inputMessage.value).toBe('');
    panel.inputMessage.value = 'B 的草稿';

    store.selectedTaskId = a.id;
    store.task = a;
    await nextTick();
    expect(panel.inputMessage.value).toBe('A 的草稿');

    store.selectedTaskId = b.id;
    store.task = b;
    await nextTick();
    expect(panel.inputMessage.value).toBe('B 的草稿');
  });
});
