import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from '../utils/indexed-db';
import { useBooksStore } from '../stores/books';
import { useCoverHistoryStore } from '../stores/cover-history';
import { useSettingsStore } from '../stores/settings';
import { SettingsService } from '../services/settings-service';
import { SyncDataService } from '../services/sync-data-service';
import type { Settings } from '../models/settings';
import { SyncType } from '../models/sync';

afterEach(() => vi.restoreAllMocks());

const model = { id: 'm', name: 'M', provider: 'openai', model: 'gpt', apiKey: 'k' };
const novel = { id: 'n', title: 'N', createdAt: '2020-01-01', lastEdited: '2020-01-01' };
const syncConfig = {
  enabled: false,
  lastSyncTime: 0,
  syncInterval: 0,
  syncType: SyncType.Gist,
  syncParams: {},
  secret: '',
  apiEndpoint: '',
};

function parse(raw: Record<string, unknown>) {
  return SettingsService.validateAndParseSettings(raw as unknown as Settings);
}

describe('validateAndParseSettings 保留字段是否存在', () => {
  it('缺少 novels / coverHistory / memories / sync 时对应字段为 undefined', () => {
    const result = parse({ aiModels: [model] });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect('novels' in result.data!).toBe(false);
    expect('coverHistory' in result.data!).toBe(false);
    expect('memories' in result.data!).toBe(false);
    expect('sync' in result.data!).toBe(false);
  });

  it('显式空数组保留为 []，表示清空本机对应数据', () => {
    const result = parse({
      aiModels: [model],
      novels: [],
      coverHistory: [],
      memories: [],
      sync: [],
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      models: [expect.objectContaining({ id: 'm' })],
      novels: [],
      coverHistory: [],
      memories: [],
      sync: [],
    });
  });

  it('非空字段照常解析', () => {
    const result = parse({ aiModels: [], novels: [novel], sync: [syncConfig] });
    expect(result.success).toBe(true);
    expect(result.data!.novels).toHaveLength(1);
    expect(result.data!.sync).toHaveLength(1);
    expect('coverHistory' in result.data!).toBe(false);
  });

  it('只有空数组、没有应用设置时仍视为没有可导入内容', () => {
    const result = parse({ aiModels: [], novels: [], memories: [], sync: [] });
    expect(result.success).toBe(false);
  });
});

describe('整份导入：有字段整体替换，无字段保持不变', () => {
  it('文件缺少书籍与封面历史字段时，本机书籍与封面历史保持不变', async () => {
    setActivePinia(createPinia());
    await useSettingsStore().loadSettings();
    const books = useBooksStore();
    await books.addBook({
      id: 'keep-book',
      title: 'Keep',
      createdAt: new Date(0),
      lastEdited: new Date(0),
    });
    const covers = useCoverHistoryStore();
    const cover = { id: 'keep-cover', url: 'https://img.example/keep.png', addedAt: new Date(1) };
    await (await getDB()).put('cover-history', cover);
    await covers.loadCoverHistory();

    const parsed = parse({ aiModels: [model] });
    await SyncDataService.importSettingsSnapshot(parsed.data!, 'presence-missing');

    await expect((await getDB()).get('books', 'keep-book')).resolves.toBeDefined();
    expect(books.books.map((b) => b.id)).toContain('keep-book');
    expect(covers.covers.map((c) => c.id)).toContain('keep-cover');
  });

  it('文件中 memories 为空数组时清空本机 Memory', async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.loadSettings();
    const db = await getDB();
    await db.put('memories', {
      id: 'old-mem',
      bookId: 'b',
      content: 'old',
      summary: '',
      createdAt: 1,
      lastAccessedAt: 1,
    });

    const parsed = parse({ aiModels: [model], memories: [] });
    await SyncDataService.importSettingsSnapshot(parsed.data!, 'presence-empty-memories');

    expect(await db.get('memories', 'old-mem')).toBeUndefined();
  });

  it('文件中 sync 为空数组时清空本机同步配置', async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.importSyncs([{ ...syncConfig, secret: 'token' }]);

    const parsed = parse({ aiModels: [model], sync: [] });
    await SyncDataService.importSettingsSnapshot(parsed.data!, 'presence-empty-sync');

    expect(settings.syncs).toEqual([]);
  });
});

describe('非空但没有任何有效条目的字段按缺失处理', () => {
  it('解析结果不包含这些字段，本机对应数据保持不变', () => {
    const result = parse({
      aiModels: [model],
      novels: [{ id: 'bad' }],
      coverHistory: [{ id: 'bad' }],
      memories: [{ id: 'bad' }],
      sync: [{ id: 'bad' }],
    });
    expect(result.success).toBe(true);
    expect(Object.keys(result.data!).sort()).toEqual(['models']);
  });

  it('部分条目无效时只导入有效条目', () => {
    const result = parse({ aiModels: [], novels: [novel, { id: 'bad' }] });
    expect(result.data!.novels).toHaveLength(1);
  });
});

describe('文件缺少 sync 字段时只清理被导入条目的删除记录', () => {
  it('其他待传播的删除记录与远端墓碑保留', async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateGistSync({
      deletedNovelIds: [
        { id: 'n', deletedAt: 100 },
        { id: 'gone-book', deletedAt: 100 },
      ],
      deletedModelIds: [
        { id: 'm', deletedAt: 100 },
        { id: 'gone-model', deletedAt: 100 },
      ],
      deletedMemoryIds: [
        { id: 'mem-in', bookId: 'n', deletedAt: 100 },
        { id: 'gone-mem', bookId: 'gone-book', deletedAt: 100 },
      ],
      knownRemoteTombstones: {
        'novel:n': '2026-01-01T00:00:00.000Z',
        'chapters:n:a': '2026-01-01T00:00:00.000Z',
        'memories:n': '2026-01-01T00:00:00.000Z',
        'novel:gone-book': '2026-01-01T00:00:00.000Z',
        'memories:gone-book': '2026-01-01T00:00:00.000Z',
      },
    });

    const parsed = parse({
      aiModels: [model],
      novels: [novel],
      memories: [
        {
          id: 'mem-in',
          bookId: 'n',
          content: 'c',
          summary: 's',
          createdAt: 1,
          lastAccessedAt: 1,
        },
      ],
    });
    await SyncDataService.importSettingsSnapshot(parsed.data!, 'presence-no-sync');

    const gist = settings.gistSync;
    expect(gist.deletedNovelIds!.map((r) => r.id)).toEqual(['gone-book']);
    expect(gist.deletedModelIds!.map((r) => r.id)).toEqual(['gone-model']);
    expect(gist.deletedMemoryIds!.map((r) => r.id)).toEqual(['gone-mem']);
    expect(Object.keys(gist.knownRemoteTombstones!).sort()).toEqual([
      'memories:gone-book',
      'novel:gone-book',
    ]);
  });
});
