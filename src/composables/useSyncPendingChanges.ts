import { computed } from 'vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';

/**
 * 一条待同步变更（UI 展示用，非权威）。
 * - kind: 条目类型
 * - action: 发生的操作语义（edited / added / deleted）
 * - label: 人类可读的标题（书名、模型名等）
 */
export interface PendingChangeItem {
  kind: 'book' | 'ai-model' | 'cover' | 'settings' | 'memory';
  action: 'edited' | 'added' | 'deleted';
  label: string;
  changedAt: number;
}

/**
 * 顶部状态栏的"待同步变更数"指示器。
 *
 * 以 `gistSync.lastSyncTime` 为基准，快速估算自上次同步以来发生变化的条目——
 * 用作 UI 提示，不替代 `useSyncExecutor` 内部基于 manifest 哈希的权威判定。
 *
 * 统计范围：books / ai-models / covers / settings 的 lastEdited(addedAt)，
 * 以及 SyncConfig 中的删除记录（deletedAt > lastSyncTime）。Memory 本体按需加载
 * 此处不枚举；其删除记录仍会出现。
 */
export function useSyncPendingChanges() {
  const settingsStore = useSettingsStore();
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();
  const coverHistoryStore = useCoverHistoryStore();

  const lastSyncTime = computed(() => settingsStore.gistSync.lastSyncTime ?? 0);

  const toMs = (value: Date | number | string | undefined | null): number => {
    if (value == null) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const pendingItems = computed<PendingChangeItem[]>(() => {
    const baseline = lastSyncTime.value;
    if (!baseline) return [];

    const items: PendingChangeItem[] = [];

    for (const book of booksStore.books) {
      const ms = toMs(book.lastEdited);
      if (ms > baseline) {
        const createdMs = toMs(book.createdAt);
        items.push({
          kind: 'book',
          action: createdMs > baseline ? 'added' : 'edited',
          label: book.title || '未命名书籍',
          changedAt: ms,
        });
      }
    }

    for (const model of aiModelsStore.models) {
      const ms = toMs(model.lastEdited);
      if (ms > baseline) {
        items.push({
          kind: 'ai-model',
          action: 'edited',
          label: model.name || model.model || 'AI 模型',
          changedAt: ms,
        });
      }
    }

    for (const cover of coverHistoryStore.covers) {
      const ms = toMs(cover.addedAt);
      if (ms > baseline) {
        items.push({
          kind: 'cover',
          action: 'added',
          label: cover.url?.split('/').pop() || '封面',
          changedAt: ms,
        });
      }
    }

    if (toMs(settingsStore.settings.lastEdited) > baseline) {
      items.push({
        kind: 'settings',
        action: 'edited',
        label: '应用设置',
        changedAt: toMs(settingsStore.settings.lastEdited),
      });
    }

    const gistSync = settingsStore.gistSync;
    const pushDeletions = (
      records: Array<{ deletedAt: number; id?: string; url?: string }> | undefined,
      kind: PendingChangeItem['kind'],
      labelFn: (r: { id?: string; url?: string }) => string,
    ) => {
      if (!records) return;
      for (const r of records) {
        if (r.deletedAt > baseline) {
          items.push({ kind, action: 'deleted', label: labelFn(r), changedAt: r.deletedAt });
        }
      }
    };
    pushDeletions(gistSync.deletedNovelIds, 'book', (r) => `书籍 ${r.id ?? ''}`.trim());
    pushDeletions(gistSync.deletedModelIds, 'ai-model', (r) => `模型 ${r.id ?? ''}`.trim());
    pushDeletions(gistSync.deletedCoverIds, 'cover', (r) => `封面 ${r.id ?? ''}`.trim());
    pushDeletions(gistSync.deletedMemoryIds, 'memory', (r) => `记忆 ${r.id ?? ''}`.trim());

    items.sort((a, b) => b.changedAt - a.changedAt);
    return items;
  });

  const pendingCount = computed(() => pendingItems.value.length);
  const hasPendingChanges = computed(() => pendingCount.value > 0);

  return { pendingCount, hasPendingChanges, pendingItems };
}
