import { watch } from 'vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useToastWithHistory } from 'src/composables/useToastHistory';

/** 应用根部只挂一次；离开导入页后，在途操作仍通过系统 toast 和通知历史反馈。 */
export function useImportNotifications(): void {
  const store = useImportWorkspaceStore();
  const toast = useToastWithHistory();
  watch(
    () => store.feedback,
    (feedback) => {
      if (feedback) toast.add({ ...feedback, life: feedback.severity === 'error' ? 5000 : 3000 });
    },
    { flush: 'sync' },
  );
}
