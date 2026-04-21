import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { reactive } from 'vue';
import * as SettingsStore from 'src/stores/settings';
import * as SyncExecutorModule from 'src/composables/useSyncExecutor';
import { SyncType } from 'src/models/sync';

const { useAutoSync } = await import('src/composables/useAutoSync');

describe('useAutoSync', () => {
  let executeSyncMock: ReturnType<typeof mock>;
  let autoSync: ReturnType<typeof useAutoSync>;
  let settingsStore: {
    gistSync: {
      enabled: boolean;
      lastSyncTime: number;
      syncInterval: number;
      syncType: SyncType;
      syncParams: Record<string, string>;
      secret: string;
      apiEndpoint: string;
    };
    isSyncing: boolean;
    isRestoringSyncSnapshot: boolean;
    setSyncing: ReturnType<typeof mock>;
    resetSyncProgress: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    executeSyncMock = mock(() => Promise.resolve({ success: true, restorableItems: [] }));
    settingsStore = reactive({
      gistSync: {
        enabled: true,
        lastSyncTime: 0,
        syncInterval: 300000,
        syncType: SyncType.Gist,
        syncParams: {
          gistId: 'test-gist',
          username: 'tester',
        },
        secret: 'test-secret',
        apiEndpoint: '',
      },
      isSyncing: false,
      isRestoringSyncSnapshot: true,
      setSyncing: mock((value: boolean) => {
        settingsStore.isSyncing = value;
      }),
      resetSyncProgress: mock(() => {}),
    });

    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(settingsStore as any);
    spyOn(SyncExecutorModule, 'useSyncExecutor').mockReturnValue({
      executeSync: executeSyncMock,
    } as any);

    autoSync = useAutoSync();
  });

  afterEach(() => {
    autoSync.cleanup();
    mock.restore();
  });

  it('恢复修订版本快照期间应跳过自动同步', async () => {
    await autoSync.performAutoSync();

    expect(executeSyncMock).not.toHaveBeenCalled();
    expect(settingsStore.setSyncing).not.toHaveBeenCalled();
  });
});
