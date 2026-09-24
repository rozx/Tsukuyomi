import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { useImportChatPanel } from '../composables/import-page/useImportChatPanel';
import { ImportAgentService } from '../services/import/import-agent-service';
import { ImportRepository } from '../services/import/import-repository';
import ImportRunBar from '../components/import/ImportRunBar.vue';
import type { ImportEvent, ImportTask } from '../models/import';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

async function repairTask(): Promise<ImportTask> {
  const task = await ImportRepository.createTask('修复更新配方：作品');
  return {
    ...task,
    purpose: { kind: 'recipe-repair', bookId: 'book', reason: '目录无法复现至少半数已导入章节' },
  };
}

function mountPanel() {
  let panel!: ReturnType<typeof useImportChatPanel>;
  const pinia = createPinia();
  setActivePinia(pinia);
  app = createApp(
    defineComponent({
      setup() {
        panel = useImportChatPanel();
        return () => h('div');
      },
    }),
  );
  app.use(pinia).mount(document.createElement('div'));
  return { panel, store: useImportWorkspaceStore() };
}

describe('工作台打开修复任务', () => {
  it('在输入框预填失效说明，但不自动运行 Agent', async () => {
    const run = vi.spyOn(ImportAgentService, 'run');
    const { panel, store } = mountPanel();
    const task = await repairTask();
    store.selectedTaskId = task.id;
    store.task = task;
    store.events = [];
    await nextTick();
    expect(panel.inputMessage.value).toContain('目录无法复现至少半数已导入章节');
    expect(run).not.toHaveBeenCalled();
  });

  it('已有对话的修复任务不预填', async () => {
    const { panel, store } = mountPanel();
    const task = await repairTask();
    store.selectedTaskId = task.id;
    store.events = [{ id: 'e', kind: 'message' } as ImportEvent];
    store.task = task;
    await nextTick();
    expect(panel.inputMessage.value).toBe('');
  });

  it('另一个导入任务正在运行时提示先暂停，而不是同时运行', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useImportWorkspaceStore();
    const task = await repairTask();
    store.selectedTaskId = task.id;
    store.task = task;
    store.runningTaskId = 'other-task';
    const host = document.createElement('div');
    app = createApp({ setup: () => () => h(ImportRunBar) });
    app.use(pinia).use(PrimeVue).mount(host);
    await nextTick();
    expect(host.textContent).toContain(
      '另一个导入任务正在运行。同一时间只能运行一个任务，请先暂停它。',
    );
    expect(store.canContinue).toBe(false);
  });
});
