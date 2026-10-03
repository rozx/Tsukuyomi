import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSyncExecutor } from '../composables/useSyncExecutor';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { useAIModelsStore } from '../stores/ai-models';
import { useCoverHistoryStore } from '../stores/cover-history';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { MemoryService } from '../services/memory-service';
import { GistSyncService } from '../services/gist-sync-service';
import { EmbeddingQueue } from '../services/embedding-queue';
import * as ManifestBuilder from '../services/sync-manifest-builder';
import { MANIFEST_SCHEMA_VERSION, TOMBSTONE_TTL_MS } from '../models/manifest';
import type { Novel, Paragraph } from '../models/novel';
import type { AIModel } from '../services/ai/types/ai-model';
import { resetDbForTests, getDB } from '../utils/indexed-db';
import { cloneDeep } from 'lodash';

vi.mock('../composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

const callbacks = { messagePrefix: '', isManualRetrieval: false, onError: vi.fn() };
const paragraph = (text = '原文'): Paragraph => ({
  id: 'p',
  text,
  translations: [],
  selectedTranslationId: '',
});
const novel = (): Novel => ({
  id: 'b',
  title: '测试书',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  volumes: [
    {
      id: 'v',
      title: '卷',
      chapters: [
        {
          id: 'c',
          title: '章',
          createdAt: new Date(0),
          lastEdited: new Date(0),
          content: [paragraph()],
        },
      ],
    },
  ],
});

beforeEach(async () => {
  callbacks.onError.mockClear();
  spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  const settings = useSettingsStore();
  await settings.loadSettings();
  await settings.updateGistSync({
    enabled: true,
    secret: 'test-token',
    syncParams: { username: 'test', gistId: 'test-gist' },
    knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION,
  });
  await BookService.saveBook(novel());
  await MemoryService.upsertMemoryForSync({
    id: 'm',
    bookId: 'b',
    content: '记忆',
    summary: '',
    createdAt: 100,
    updatedAt: 100,
    lastAccessedAt: 100,
  });
  await useBooksStore().loadBooks();
  spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
    success: true,
    skipped: true,
    remoteETag: 'etag',
  });
  spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
    status: 'unchanged',
    etag: 'etag',
  });
  spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockImplementation(
    async (_config, payload, _files, _progress, options) => ({
      success: true,
      gistId: 'test-gist',
      remoteETag: 'etag',
      remoteUpdatedAt: '',
      manifest: options?.preparedManifest ?? (await ManifestBuilder.buildLocalManifest(payload)),
      uploadedEntries: ['novel:b'],
      deletedEntries: [],
    }),
  );
});
afterEach(() => mock.restore());

describe('无变更同步的本地快照检查', () => {
  for (const [label, change] of [
    [
      '章节正文',
      () => ChapterContentService.saveChapterContent('c', [paragraph('新原文')], { bookId: 'b' }),
    ],
    ['记忆内容', () => MemoryService.updateMemory('b', 'm', '新记忆', '新摘要')],
    [
      '记忆修改时间',
      () =>
        MemoryService.upsertMemoryForSync({
          id: 'm',
          bookId: 'b',
          content: '记忆',
          summary: '',
          createdAt: 100,
          updatedAt: 200,
          lastAccessedAt: 200,
        }),
    ],
    [
      '书籍元数据',
      () => {
        useBooksStore().books[0]!.description = '同一 lastEdited 的新描述';
      },
    ],
    [
      '设置',
      () => useSettingsStore().updateSettings({ proxyEnabled: false, lastEdited: new Date(0) }),
    ],
    [
      'AI 模型',
      () => {
        useAIModelsStore().models.push({
          id: 'model',
          name: '模型',
          provider: 'openai',
          lastEdited: new Date(0),
        } as AIModel);
      },
    ],
    [
      '封面',
      () => {
        useCoverHistoryStore().covers.push({
          id: 'cover',
          url: 'https://cover.test/a',
          addedAt: new Date(0),
        });
      },
    ],
    [
      '删除记录',
      () =>
        useSettingsStore().updateGistSync({
          deletedMemoryIds: [{ id: 'deleted', bookId: 'b', deletedAt: Date.now() }],
        }),
    ],
    ['同步目标', () => useSettingsStore().updateGistSync({ syncParams: { gistId: 'other-gist' } })],
    [
      '协议版本',
      () => useSettingsStore().updateKnownRemoteSchemaVersion(MANIFEST_SCHEMA_VERSION - 1),
    ],
    [
      '损坏的检查点',
      () =>
        useSettingsStore().updateGistSync({
          localSyncCheckpoint: { version: 999, fingerprint: '坏数据', hashes: {} },
        } as never),
    ],
  ] as const) {
    it(`${label}变化必须回到完整同步`, async () => {
      expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
      await change();
      const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
      expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
      expect(load).toHaveBeenCalledTimes(1);
    });
  }

  it('仅访问记忆及更新嵌入不会触发整库扫描', async () => {
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    await MemoryService.getMemory('b', 'm');
    await MemoryService.updateMemoryEmbeddingOnly('m', [[0.1, 0.2]], 'test');
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('内联正文无持久化序号变化时也不得漏掉修改', async () => {
    const chapter = useBooksStore().books[0]!.volumes![0]!.chapters![0]!;
    chapter.content = [paragraph()];
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).not.toHaveBeenCalled();
    chapter.content[0]!.text = '内存中的新原文';
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('上传期间发生修改，不得给过时快照建立有效检查点', async () => {
    const upload = vi
      .spyOn(GistSyncService.prototype, 'uploadToGistIncremental')
      .getMockImplementation()!;
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockImplementation(
      async (...args) => {
        await ChapterContentService.saveChapterContent('c', [paragraph('上传期间的新原文')], {
          bookId: 'b',
        });
        return upload(...args);
      },
    );
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('上传失败后不能用检查点跳过尚未同步的本地数据', async () => {
    const upload = spyOn(
      GistSyncService.prototype,
      'uploadToGistIncremental',
    ).mockRejectedValueOnce(new Error('网络错误'));
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(false);
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('连续同步未变书库应跳过正文、记忆读取及完整 manifest 计算', async () => {
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    const memories = spyOn(MemoryService, 'getAllMemories');
    const build = spyOn(ManifestBuilder, 'buildLocalManifest');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(memories).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('重新加载 Pinia 后，持久化检查点仍能跳过完整扫描', async () => {
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    setActivePinia(createPinia());
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    const memories = spyOn(MemoryService, 'getAllMemories');
    const build = spyOn(ManifestBuilder, 'buildLocalManifest');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(memories).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });

  it('数据库重建后恢复旧配置，即使书籍序号相等也必须重新扫描正文', async () => {
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const config = cloneDeep(useSettingsStore().gistSync);
    await resetDbForTests();
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateGistSync(config);
    const restored = novel();
    restored.volumes![0]!.chapters![0]!.content = [paragraph('重建数据库后的正文')];
    await BookService.saveBook(restored);
    await MemoryService.upsertMemoryForSync({
      id: 'm',
      bookId: 'b',
      content: '记忆',
      summary: '',
      createdAt: 100,
      updatedAt: 100,
      lastAccessedAt: 100,
    });
    await useBooksStore().loadBooks();
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('损坏的修改序号应回退完整同步', async () => {
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    await (await getDB()).put('book-revisions', { bookId: 'b', revision: -1 });
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('序号读取失败应回退完整同步', async () => {
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const db = await getDB();
    const getAll = db.getAll.bind(db);
    spyOn(db, 'getAll').mockImplementation((store, ...args) => {
      if (store === 'book-revisions') return Promise.reject(new Error('序号读取失败'));
      return getAll(store, ...args);
    });
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('删除墓碑到达 TTL 边界时应重新计算并清理', async () => {
    const now = Date.now();
    await useSettingsStore().updateGistSync({
      deletedMemoryIds: [{ id: 'deleted', bookId: 'b', deletedAt: now }],
    });
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    spyOn(Date, 'now').mockReturnValue(now + TOMBSTONE_TTL_MS);
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(useSettingsStore().gistSync.deletedMemoryIds).toEqual([]);
  });

  it('性能：未变的 200 章书库应跳过完整扫描', async () => {
    const large = novel();
    large.volumes![0]!.chapters = Array.from({ length: 200 }, (_, i) => ({
      id: `chapter-${i}`,
      title: `章 ${i}`,
      createdAt: new Date(0),
      lastEdited: new Date(0),
      content: Array.from({ length: 20 }, (_, j) => ({
        ...paragraph('正文'.repeat(100)),
        id: `p-${i}-${j}`,
      })),
    }));
    await BookService.saveBook(large);
    await useBooksStore().refreshBookFromStorage('b');
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const settings = useSettingsStore();
    // 同一份已同步数据，强制走一次原有的无变更完整扫描，避免把首次初始化算入基准。
    await settings.updateLocalSyncCheckpoint({
      ...settings.gistSync.localSyncCheckpoint!,
      fingerprint: '0'.repeat(64),
    });
    const load = spyOn(ChapterContentService, 'loadAllChapterContentsForNovels');
    const build = spyOn(ManifestBuilder, 'buildLocalManifest');
    const fullStart = performance.now();
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const full = performance.now() - fullStart;
    load.mockClear();
    build.mockClear();
    const fastStart = performance.now();
    expect((await useSyncExecutor().executeSync(callbacks)).success).toBe(true);
    const fast = performance.now() - fastStart;
    console.info(
      `[sync-perf] 200 chapters: full=${full.toFixed(0)} ms, unchanged=${fast.toFixed(0)} ms`,
    );
    expect(load).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });
});
