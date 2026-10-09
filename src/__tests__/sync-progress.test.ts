import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { watch } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useAIModelsStore } from '../stores/ai-models';
import { useCoverHistoryStore } from '../stores/cover-history';
import { useSyncExecutor } from '../composables/useSyncExecutor';
import { GlobalConfig } from '../services/global-config-cache';
import { GistSyncService } from '../services/gist-sync-service';
import { SyncDataService } from '../services/sync-data-service';
import { buildLocalManifest } from '../services/sync-manifest-builder';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => mock.restore());

function prepareSync(gistId = 'test-gist') {
  const store = useSettingsStore();
  store.syncs = [
    {
      ...store.gistSync,
      enabled: true,
      syncParams: { username: 'test-user', gistId },
      secret: 'test-token',
    },
  ];
  useAIModelsStore().isLoaded = true;
  useCoverHistoryStore().isLoaded = true;
  spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
  spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
    success: true,
    skipped: true,
    remoteETag: 'test-etag',
  });
  return store;
}

describe('云同步整体进度', () => {
  it('并发写入触发重新下载时，整体百分比不会随阶段切换回退', () => {
    const store = useSettingsStore();
    store.updateSyncProgress({ stage: 'uploading', current: 60, total: 100 });
    store.updateSyncProgress({
      stage: 'downloading',
      current: 0,
      total: 100,
      message: '远端已更新，重新下载',
    });

    expect(store.syncProgress.stage).toBe('downloading');
    expect(store.syncProgress.message).toBe('远端已更新，重新下载');
    expect(store.syncProgress.percentage).toBe(60);
  });

  it('上传完成但尚未保存本地同步状态时，不显示 100%', async () => {
    const store = prepareSync();
    spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockImplementation(
      async (_config, payload, _files, onProgress) => {
        onProgress?.({ current: 100, total: 100, message: '上传完成' });
        return {
          success: true,
          gistId: 'test-gist',
          remoteETag: 'test-etag',
          remoteUpdatedAt: '',
          manifest: await buildLocalManifest(payload),
          uploadedEntries: [],
          deletedEntries: [],
        };
      },
    );
    let percentageAtSave = -1;
    spyOn(store, 'updateLastSyncTime').mockImplementation(() => {
      percentageAtSave = store.syncProgress.percentage;
      return Promise.resolve();
    });

    const result = await useSyncExecutor().executeSync({
      messagePrefix: '',
      isManualRetrieval: false,
      onError: () => {},
    });

    expect(result.success).toBe(true);
    expect(percentageAtSave).toBeGreaterThanOrEqual(0);
    expect(percentageAtSave).toBeLessThan(100);
    expect(store.syncProgress.percentage).toBe(100);
  });

  it('构建本地同步数据期间显示准备阶段', async () => {
    const store = prepareSync();
    let stageDuringScan = '';
    const { ChapterContentService } = await import('../services/chapter-content-service');
    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockImplementation((novels) => {
      stageDuringScan = store.syncProgress.stage;
      return Promise.resolve(novels);
    });
    spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);
    await useSyncExecutor().executeSync({
      messagePrefix: '',
      isManualRetrieval: false,
      onError: () => {},
    });

    expect(stageDuringScan).toBe('preparing');
  });

  it('百分比限定在 0–100，数量未知或损坏时保留已完成进度', () => {
    const store = useSettingsStore();
    store.updateSyncProgress({ current: -1, total: 100 });
    expect(store.syncProgress.percentage).toBe(0);
    store.updateSyncProgress({ current: 99.9, total: 100 });
    expect(store.syncProgress.percentage).toBe(99);
    store.updateSyncProgress({ current: Number.NaN, total: 100 });
    expect(store.syncProgress.percentage).toBe(99);
    store.updateSyncProgress({ current: 0, total: 0 });
    expect(store.syncProgress.percentage).toBe(99);
    store.updateSyncProgress({ current: 120, total: 100 });
    expect(store.syncProgress.percentage).toBe(100);
  });

  it('无变更和首次同步均在保存结束后到达 100%，下一次同步从零开始', async () => {
    for (const firstSync of [false, true]) {
      const store = prepareSync(firstSync ? '' : 'test-gist');
      store.resetSyncProgress();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(firstSync);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockImplementation(
        (_config, _payload, onProgress) => {
          onProgress?.({ current: 100, total: 100, message: '上传完成' });
          return Promise.resolve({ success: true, gistId: 'test-gist' });
        },
      );
      let percentageAtSave = -1;
      spyOn(store, 'updateLastSyncTime').mockImplementation(() => {
        percentageAtSave = store.syncProgress.percentage;
        return Promise.resolve();
      });

      const result = await useSyncExecutor().executeSync({
        messagePrefix: '',
        isManualRetrieval: false,
        onError: () => {},
      });

      expect(result.success).toBe(true);
      expect(percentageAtSave).toBeGreaterThanOrEqual(0);
      expect(percentageAtSave).toBeLessThan(100);
      expect(store.syncProgress.percentage).toBe(100);
      store.setSyncing(false);
      expect(store.syncProgress.percentage).toBe(0);
      expect(store.syncProgress.stage).toBe('');
    }
  });

  it('执行器因并发写入重新下载时，界面进度保持单调且失败不显示完成', async () => {
    const store = prepareSync();
    store.gistSync.lastRemoteETag = 'test-etag';
    spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
    const verify = spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged')
      .mockResolvedValueOnce({ status: 'changed', etag: 'new-etag', files: {} })
      .mockResolvedValueOnce({ status: 'unchanged', etag: 'new-etag' });
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockRejectedValue(
      new Error('网络错误'),
    );
    const history: number[] = [];
    const stop = watch(
      () => store.syncProgress.percentage,
      (percentage) => history.push(percentage),
      { flush: 'sync' },
    );
    try {
      const result = await useSyncExecutor().executeSync({
        messagePrefix: '',
        isManualRetrieval: false,
        onError: () => {},
      });

      expect(result.success).toBe(false);
      expect(verify).toHaveBeenCalledTimes(2);
      expect(history.every((value, i) => i === 0 || value >= history[i - 1]!)).toBe(true);
      expect(store.syncProgress.percentage).toBeLessThan(100);
    } finally {
      stop();
    }
  });
});
