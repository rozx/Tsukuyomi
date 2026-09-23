import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { vi } from 'vitest';
import * as AIModelsStore from 'src/stores/ai-models';
import * as BooksStore from 'src/stores/books';
import * as CoverHistoryStore from 'src/stores/cover-history';
import * as SettingsStore from 'src/stores/settings';
import { buildLocalManifest } from 'src/services/sync-manifest-builder';
import { getChapterBaselines } from 'src/services/sync-chapter-baselines';
import { chapterStructureHash } from 'src/utils/chapter-structure-hash';
import { getDB } from 'src/utils/indexed-db';
import type { Novel, Paragraph } from 'src/models/novel';

/**
 * 执行器写入章节结构基准的时机：
 *   - 上传成功后，用本次序列化上传的数据写入
 *   - 同步完全成功且无需上传时，为本地与已知远端一致的书补写
 *   - 上传失败时不写
 */

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

const state = {
  knownRemoteHashes: {} as Record<string, string>,
};

const makeMockSettingsStore = () => ({
  get gistSync() {
    return {
      enabled: true,
      lastSyncTime: 0,
      syncInterval: 300000,
      syncType: 'gist',
      syncParams: { username: 'u', gistId: 'abc' },
      secret: 'token',
      apiEndpoint: '',
      lastRemoteETag: 'etag',
      knownRemoteHashes: state.knownRemoteHashes,
      knownRemoteEntries: {},
      knownRemoteTombstones: {},
      deletedNovelIds: [],
      forceSyncMode: { active: false },
    };
  },
  getAllSettings: () => ({ lastEdited: new Date(0) }),
  updateSyncProgress: () => {},
  updateLastRemoteETag: () => Promise.resolve(),
  updateKnownRemoteHashes: (hashes: Record<string, string>) => {
    state.knownRemoteHashes = hashes;
    return Promise.resolve();
  },
  updateKnownRemoteEntries: () => Promise.resolve(),
  updateKnownRemoteTombstones: () => Promise.resolve(),
  updateLastSyncTime: () => Promise.resolve(),
  cleanupOldDeletionRecords: () => Promise.resolve(),
  updateForceSyncMode: () => Promise.resolve(),
});

function p(id: string, text: string): Paragraph {
  return { id, text, selectedTranslationId: '', translations: [] };
}

function book(id: string, content: Paragraph[]): Novel {
  const time = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    title: id,
    createdAt: time,
    lastEdited: time,
    volumes: [
      {
        id: `${id}-v`,
        title: '卷',
        chapters: [{ id: `${id}-c1`, title: '一', createdAt: time, lastEdited: time, content }],
      },
    ],
  };
}

const mockBooksStore = { books: [] as Novel[] };

const { useSyncExecutor } = await import('src/composables/useSyncExecutor');
const { SyncDataService } = await import('src/services/sync-data-service');
const { GistSyncService } = await import('src/services/gist-sync-service');
const { ChapterContentService } = await import('src/services/chapter-content-service');
const { MemoryService } = await import('src/services/memory-service');

const callbacks = { messagePrefix: '', isManualRetrieval: false, onError: () => {} };

function stubDownloadNoChanges() {
  return spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
    skipped: false,
    remoteETag: 'etag',
    remoteFilesSnapshot: {},
    changedEntries: {},
    deletedEntries: [],
    manifest: undefined,
    remoteTombstones: {},
    needsMigration: false,
    schemaVersionTooNew: false,
  } as never);
}

/** 上传桩：按上传载荷构建 manifest（与真实实现一致），可在返回前模拟本地被修改 */
function stubUpload(afterUpload?: () => void) {
  const upload = async (_config: unknown, payload: unknown) => {
    const manifest = await buildLocalManifest(payload as Parameters<typeof buildLocalManifest>[0]);
    afterUpload?.();
    return {
      remoteETag: 'etag-after',
      remoteUpdatedAt: '',
      manifest,
      uploadedEntries: Object.keys(manifest.entries),
      deletedEntries: [] as string[],
    };
  };
  return spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockImplementation(
    upload as never,
  );
}

async function baselineOf(chapterId: string) {
  return (await getChapterBaselines([chapterId])).get(chapterId);
}

beforeEach(() => {
  toastAdd.mockClear();
  state.knownRemoteHashes = {};
  mockBooksStore.books = [];
  spyOn(SettingsStore, 'useSettingsStore').mockImplementation(
    makeMockSettingsStore as unknown as typeof SettingsStore.useSettingsStore,
  );
  spyOn(BooksStore, 'useBooksStore').mockReturnValue(
    mockBooksStore as unknown as ReturnType<typeof BooksStore.useBooksStore>,
  );
  spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as never);
  spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({ covers: [] } as never);
  spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockImplementation((novels) =>
    Promise.resolve(novels),
  );
  spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);
  spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
    status: 'unchanged',
    etag: 'etag',
  });
});

afterEach(() => {
  mock.restore();
});

describe('执行器写入章节结构基准', () => {
  it('上传成功后，用本次上传时的数据写入基准，而不是上传后被修改的本地数据', async () => {
    const uploaded = [p('p1', '一')];
    mockBooksStore.books = [book('b1', uploaded)];
    stubDownloadNoChanges();
    stubUpload(() => {
      // 上传期间本地又被修改（例如导入器应用了新段落）
      mockBooksStore.books = [book('b1', [p('p1', '一'), p('pX', '上传后新增')])];
    });

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(true);
    expect(await baselineOf('b1-c1')).toBe(await chapterStructureHash(uploaded));
  });

  it('上传失败时不写基准', async () => {
    mockBooksStore.books = [book('b1', [p('p1', '一')])];
    stubDownloadNoChanges();
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockRejectedValue(
      new Error('网络错误'),
    );

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(false);
    expect(await baselineOf('b1-c1')).toBeUndefined();
  });

  it('升级后第一次同步为没有变化的书补写基准', async () => {
    const content = [p('p1', '一'), p('p2', '二')];
    mockBooksStore.books = [book('b1', content)];
    stubDownloadNoChanges();
    const upload = stubUpload();
    // 第一轮：上传，建立已知远端哈希
    await useSyncExecutor().executeSync(callbacks);
    // 模拟升级前的状态：已知远端哈希存在，但还没有任何基准
    const db = await getDB();
    await db.clear('sync-chapter-baselines');

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await baselineOf('b1-c1')).toBe(await chapterStructureHash(content));
  });

  it('本地有未上传修改且上传失败时不补写', async () => {
    mockBooksStore.books = [book('b1', [p('p1', '一')])];
    stubDownloadNoChanges();
    const upload = stubUpload();
    await useSyncExecutor().executeSync(callbacks);
    const db = await getDB();
    await db.clear('sync-chapter-baselines');
    upload.mockRejectedValue(new Error('网络错误'));
    mockBooksStore.books = [book('b1', [p('p1', '一改')])];

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(false);
    expect(await baselineOf('b1-c1')).toBeUndefined();
  });

  it('伪 CAS 中止同步时不写基准', async () => {
    mockBooksStore.books = [book('b1', [p('p1', '一')])];
    stubDownloadNoChanges();
    const upload = stubUpload();
    spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockRejectedValue(
      new Error('校验失败'),
    );

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(await baselineOf('b1-c1')).toBeUndefined();
  });
});

describe('结构冲突提示', () => {
  function stubDownloadWithNovelChange() {
    return spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
      skipped: false,
      remoteETag: 'etag',
      remoteFilesSnapshot: {},
      changedEntries: { 'novel:b1': { kind: 'novel', value: {} } },
      deletedEntries: [],
      manifest: undefined,
      remoteTombstones: {},
      needsMigration: false,
      schemaVersionTooNew: false,
    } as never);
  }

  function conflict(i: number) {
    return { bookId: 'b1', bookTitle: '测试书', chapterId: `c${i}`, chapterTitle: `第${i}话` };
  }

  it('有结构冲突时同步结束后只提示一次，最多列出 5 章', async () => {
    stubDownloadWithNovelChange();
    stubUpload();
    spyOn(SyncDataService, 'applyPartialRemoteData').mockImplementation((_entries, report) => {
      report?.structureConflicts.push(...[1, 2, 3, 4, 5, 6, 7].map(conflict));
      // 同一章重复报告（例如伪 CAS 重试后再次合并）只计一次
      report?.structureConflicts.push(conflict(1));
      return Promise.resolve([]);
    });

    await useSyncExecutor().executeSync(callbacks);

    expect(toastAdd).toHaveBeenCalledTimes(1);
    const message = toastAdd.mock.calls[0]![0] as { severity: string; detail: string };
    expect(message.severity).toBe('warn');
    expect(message.detail).toContain('测试书 · 第1话');
    expect(message.detail).toContain('测试书 · 第5话');
    expect(message.detail).not.toContain('第6话');
    expect(message.detail).toContain('等 7 章');
  });

  it('同步失败时，已合并章节的冲突仍然提示', async () => {
    stubDownloadWithNovelChange();
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockRejectedValue(
      new Error('网络错误'),
    );
    mockBooksStore.books = [book('b1', [p('p1', '一')])];
    spyOn(SyncDataService, 'applyPartialRemoteData').mockImplementation((_entries, report) => {
      report?.structureConflicts.push(conflict(1));
      return Promise.resolve([]);
    });

    const result = await useSyncExecutor().executeSync(callbacks);

    expect(result.success).toBe(false);
    expect(toastAdd).toHaveBeenCalledTimes(1);
  });

  it('没有结构冲突时不提示', async () => {
    stubDownloadWithNovelChange();
    stubUpload();
    spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);

    await useSyncExecutor().executeSync(callbacks);

    expect(toastAdd).not.toHaveBeenCalled();
  });
});
