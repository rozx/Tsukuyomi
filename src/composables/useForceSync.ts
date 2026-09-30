import { useConfirm } from 'primevue/useconfirm';
import { useGistSync } from 'src/composables/useGistUploadWithConflictCheck';
import { useSettingsStore } from 'src/stores/settings';
import type { SyncConfig } from 'src/models/sync';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

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
  const t = (key: string, values?: Record<string, string | number>) =>
    translateText(settingsStore.uiLocale, `syncUi.actions.${key}` as MessageKey, values);

  /**
   * 弹出确认对话框；用户确认后执行强制推送。
   *
   * @param options.onBeforeConfirm 弹出对话框前的副作用（如关闭父 Popover）
   * @param options.config 可选的同步配置覆盖（设置页传入未持久化的表单值）
   */
  const confirmAndForceSync = (options?: {
    onBeforeConfirm?: () => void;
    config?: SyncConfig;
  }): Promise<void> => {
    options?.onBeforeConfirm?.();

    const runForceSync = () => (options?.config ? forceSync(options.config) : forceSync());

    const gistId = (options?.config ?? settingsStore.gistSync).syncParams.gistId ?? '';

    // 无 gistId 时跳过确认：executeForceSync 内部会退化为普通首次上传路径
    if (!gistId) {
      return runForceSync();
    }

    // 返回的 Promise 在用户 accept + forceSync 结束后 resolve，reject 视为取消（resolve 不抛）
    return new Promise<void>((resolve, reject) => {
      confirm.require({
        group: 'force-sync',
        header: t('forceConfirmHeader'),
        message: t('forceConfirmMessage'),
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
          label: t('cancel'),
          severity: 'secondary',
        },
        acceptProps: {
          label: t('forcePush'),
          severity: 'danger',
        },
        accept: () => {
          runForceSync().then(resolve).catch(reject);
        },
        reject: () => {
          resolve();
        },
      });
    });
  };

  return {
    confirmAndForceSync,
  };
}
