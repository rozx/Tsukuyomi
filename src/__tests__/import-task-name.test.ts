import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { useImportTaskName } from '../composables/import-page/useImportTaskName';
import type { ImportTask } from '../models/import';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

function mount() {
  setActivePinia(createPinia());
  const store = useImportWorkspaceStore();
  const rename = vi.spyOn(store, 'renameTask').mockResolvedValue();
  let editor!: ReturnType<typeof useImportTaskName>;
  app = createApp(
    defineComponent({
      setup() {
        editor = useImportTaskName();
        return () => h('div');
      },
    }),
  );
  app.mount(document.createElement('div'));
  return { store, rename, editor };
}

const task = (id: string, name: string) => ({ id, name }) as ImportTask;

describe('导入任务改名', () => {
  it('跟随当前任务名，改动后保存', async () => {
    const { store, rename, editor } = mount();
    store.task = task('a', '任务 A');
    await nextTick();
    expect(editor.name.value).toBe('任务 A');
    editor.name.value = '月下的来客';
    editor.save();
    expect(rename).toHaveBeenCalledWith('a', '月下的来客');
  });

  it('名字没变或为空时不保存', async () => {
    const { store, rename, editor } = mount();
    store.task = task('a', '任务 A');
    await nextTick();
    editor.save();
    editor.name.value = '   ';
    editor.save();
    expect(rename).not.toHaveBeenCalled();
  });

  it('切换任务时换成新任务的名字', async () => {
    const { store, editor } = mount();
    store.task = task('a', '任务 A');
    await nextTick();
    editor.name.value = '未保存的改动';
    store.task = task('b', '任务 B');
    await nextTick();
    expect(editor.name.value).toBe('任务 B');
  });
});
