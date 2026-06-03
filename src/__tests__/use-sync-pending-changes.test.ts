import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { effectScope, nextTick, reactive } from 'vue';
import * as AIModelsStore from 'src/stores/ai-models';
import * as BooksStore from 'src/stores/books';
import * as CoverHistoryStore from 'src/stores/cover-history';
import * as SettingsStore from 'src/stores/settings';
import { dispatchMemoryChanged } from 'src/services/memory-cache';
import { MemoryService } from 'src/services/memory-service';
import { useSyncPendingChanges } from 'src/composables/useSyncPendingChanges';
import { getDB } from 'src/utils/indexed-db';

const flushPendingChanges = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  await Promise.resolve();
};

const waitForPendingItem = async (
  state: ReturnType<typeof useSyncPendingChanges> | undefined,
  predicate: (item: { kind: string; action: string; label: string }) => boolean,
) => {
  for (let i = 0; i < 20; i += 1) {
    await flushPendingChanges();
    if (state?.pendingItems.value.some(predicate)) return;
  }
};

describe('useSyncPendingChanges', () => {
  const settingsStore = reactive({
    gistSync: {
      lastSyncTime: 1_000,
      deletedNovelIds: [],
      deletedModelIds: [],
      deletedCoverIds: [],
      deletedMemoryIds: [],
    },
    settings: { lastEdited: 0 },
  });

  const booksStore = reactive({
    books: [{ id: 'book-1', title: '测试书籍' }],
  });

  const aiModelsStore = reactive({ models: [] });
  const coverHistoryStore = reactive({ covers: [] });

  beforeEach(() => {
    settingsStore.gistSync.lastSyncTime = 1_000;
    settingsStore.gistSync.deletedNovelIds = [];
    settingsStore.gistSync.deletedModelIds = [];
    settingsStore.gistSync.deletedCoverIds = [];
    settingsStore.gistSync.deletedMemoryIds = [];
    settingsStore.settings.lastEdited = 0;
    booksStore.books = [{ id: 'book-1', title: '测试书籍' }];
    aiModelsStore.models = [];
    coverHistoryStore.covers = [];

    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(settingsStore as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(booksStore as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue(aiModelsStore as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue(coverHistoryStore as any);
  });

  afterEach(() => {
    mock.restore();
  });

  it('应将新增和编辑的记忆显示为待同步变更', async () => {
    spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([
      {
        id: 'mem-new',
        bookId: 'book-1',
        content: '新的记忆内容',
        summary: '新增记忆',
        createdAt: 1_500,
        lastAccessedAt: 1_500,
      },
      {
        id: 'mem-edited',
        bookId: 'book-1',
        content: '已有记忆内容',
        summary: '编辑过的记忆',
        createdAt: 500,
        lastAccessedAt: 1_800,
      },
    ]);

    const scope = effectScope();
    const state = scope.run(() => useSyncPendingChanges());

    await flushPendingChanges();

    expect(state?.pendingItems.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'memory',
          action: 'added',
          label: '新增记忆',
          changedAt: 1_500,
        }),
        expect.objectContaining({
          kind: 'memory',
          action: 'edited',
          label: '编辑过的记忆',
          changedAt: 1_800,
        }),
      ]),
    );

    scope.stop();
  });

  it('收到记忆变更事件后应刷新列表，并忽略 embedding-only 更新', async () => {
    let currentMemories: Array<{
      id: string;
      bookId: string;
      content: string;
      summary: string;
      createdAt: number;
      lastAccessedAt: number;
    }> = [];

    const getMemoriesSpy = spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockImplementation(
      () => Promise.resolve(currentMemories),
    );

    const scope = effectScope();
    const state = scope.run(() => useSyncPendingChanges());

    await flushPendingChanges();
    expect(state?.pendingItems.value).toEqual([]);
    expect(getMemoriesSpy).toHaveBeenCalledTimes(1);

    currentMemories = [
      {
        id: 'mem-1',
        bookId: 'book-1',
        content: '内容',
        summary: '事件刷新后的记忆',
        createdAt: 500,
        lastAccessedAt: 1_900,
      },
    ];

    dispatchMemoryChanged({ bookId: 'book-1', memoryId: 'mem-1', action: 'updated' });
    await flushPendingChanges();

    expect(state?.pendingItems.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'memory',
          action: 'edited',
          label: '事件刷新后的记忆',
          changedAt: 1_900,
        }),
      ]),
    );
    expect(getMemoriesSpy).toHaveBeenCalledTimes(2);

    dispatchMemoryChanged({ bookId: 'book-1', memoryId: 'mem-1', action: 'embedding-updated' });
    await flushPendingChanges();

    expect(getMemoriesSpy).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('AI 读取记忆刷新 lastAccessedAt 后应显示待同步变更', async () => {
    const db = await getDB();
    await db.put('memories', {
      id: 'mem-accessed',
      bookId: 'book-1',
      content: '被 AI 读取的记忆',
      summary: '访问后的记忆',
      createdAt: 500,
      lastAccessedAt: 500,
    });

    const scope = effectScope();
    const state = scope.run(() => useSyncPendingChanges());

    await flushPendingChanges();
    expect(state?.pendingItems.value).toEqual([]);

    await MemoryService.getMemory('book-1', 'mem-accessed');
    await waitForPendingItem(
      state,
      (item) => item.kind === 'memory' && item.action === 'edited' && item.label === '访问后的记忆',
    );

    expect(state?.pendingItems.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'memory',
          action: 'edited',
          label: '访问后的记忆',
        }),
      ]),
    );

    scope.stop();
  });
});
