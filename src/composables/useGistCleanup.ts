import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { SyncConfig } from 'src/models/sync';
import { GistSyncService } from 'src/services/gist-sync-service';
import { useSettingsStore } from 'src/stores/settings';
import { useGistCleanupStore } from 'src/stores/gist-cleanup';
import { localizedErrorMessage } from 'src/utils/localized-error';

/** 与手动/自动同步共用锁；预览失效或请求失败后必须重新扫描。 */
export function useGistCleanup(getConfig: () => SyncConfig) {
  const settings = useSettingsStore();
  const service = new GistSyncService(() => settings.uiLocale);
  const state = useGistCleanupStore();
  const { plan, error, phase, completed } = storeToRefs(state);
  const blocked = computed(() => settings.isSyncing || settings.isRestoringSyncSnapshot);
  const identity = () => {
    const config = getConfig();
    return JSON.stringify([
      config.enabled,
      config.syncParams.gistId,
      config.syncParams.username,
      config.secret,
      config.syncParams.token,
    ]);
  };
  watch(
    identity,
    (_next, previous) => {
      const gistId = getConfig().syncParams.gistId ?? '';
      if (previous !== undefined || state.gistId !== gistId) plan.value = null;
      state.gistId = gistId;
      error.value = '';
    },
    { flush: 'sync', immediate: true },
  );

  async function run(action: 'scan' | 'cleanup', operation: () => Promise<void>): Promise<boolean> {
    if (blocked.value || !getConfig().enabled) return false;
    settings.setSyncing(true);
    phase.value = action;
    error.value = '';
    try {
      await operation();
      return true;
    } catch (cause) {
      error.value = localizedErrorMessage(cause, settings.uiLocale, 'syncUi.cleanup.failed');
      return false;
    } finally {
      phase.value = null;
      settings.setSyncing(false);
    }
  }

  async function scan(): Promise<void> {
    await run('scan', async () => {
      plan.value = null;
      const startedWith = identity();
      const result = await service.scanLeftoverFiles(getConfig());
      if (identity() === startedWith && state.gistId === result.gistId) plan.value = result;
    });
  }

  async function cleanup(preview = plan.value): Promise<boolean> {
    if (!preview || preview !== plan.value) return false;
    const succeeded = await run('cleanup', async () => {
      plan.value = null;
      await service.cleanupLeftoverFiles(getConfig(), preview);
    });
    if (succeeded) completed.value += 1;
    return succeeded;
  }

  return { plan, error, phase, completed, blocked, scan, cleanup };
}
