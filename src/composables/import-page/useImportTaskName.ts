import { ref, watch } from 'vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

/**
 * 当前导入任务的名称编辑：输入框绑定 name，失焦或回车时 save()。
 * 跟随当前任务（切换任务时换成新任务的名字），名字没变或为空时不保存。
 * 桌面 / 平板的运行条与手机任务标题共用。
 */
export function useImportTaskName() {
  const store = useImportWorkspaceStore();
  const name = ref('');
  watch(
    () => [store.task?.id, store.task?.name] as const,
    ([, value]) => {
      name.value = value ?? '';
    },
    { immediate: true },
  );
  const save = () => {
    const task = store.task;
    if (task && name.value.trim() && name.value !== task.name) {
      void store.renameTask(task.id, name.value);
    }
  };
  return { name, save };
}
