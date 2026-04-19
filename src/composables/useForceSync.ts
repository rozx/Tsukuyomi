import { useConfirm } from 'primevue/useconfirm';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import { useSettingsStore } from 'src/stores/settings';
import type { SyncConfig } from 'src/models/sync';

/**
 * 强制推送 composable：封装"弹出确认对话框 → 调用 forceSync"的交互
 *
 * 两处 UI 入口（SyncSettingsTab、SyncStatusBody）共用此 composable。
 * SyncStatusBody 触发时需要先关闭父 Popover / BottomSheet（通过 onBeforeConfirm 回调）。
 */
export function useForceSync() {
  const confirm = useConfirm();
  const { forceSync } = useGistSync();
  const settingsStore = useSettingsStore();

  /**
   * 弹出确认对话框；用户确认后执行强制推送。
   *
   * @param options.onBeforeConfirm 弹出对话框前的副作用（如关闭父 Popover）
   * @param options.config 可选的同步配置覆盖（设置页传入未持久化的表单值）
   */
  const confirmAndForceSync = async (options?: {
    onBeforeConfirm?: () => void;
    config?: SyncConfig;
  }): Promise<void> => {
    options?.onBeforeConfirm?.();

    const gistId = (options?.config ?? settingsStore.gistSync).syncParams.gistId ?? '';

    // 无 gistId 时跳过确认：executeForceSync 内部会退化为普通首次上传路径
    if (!gistId) {
      if (options?.config) {
        await forceSync(options.config);
      } else {
        await forceSync();
      }
      return;
    }

    confirm.require({
      group: 'force-sync',
      header: '确认强制推送',
      message:
        '这将用本地数据完全覆盖远程 Gist。远程上本地没有的书籍、记忆、AI 模型配置将被永久删除。此操作不可撤销。确认继续？',
      icon: 'pi pi-exclamation-triangle',
      rejectProps: {
        label: '取消',
        severity: 'secondary',
      },
      acceptProps: {
        label: '强制推送',
        severity: 'danger',
      },
      accept: () => {
        void (async () => {
          if (options?.config) {
            await forceSync(options.config);
          } else {
            await forceSync();
          }
        })();
      },
    });
  };

  return {
    confirmAndForceSync,
  };
}
