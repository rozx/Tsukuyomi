import { defineStore, acceptHMRUpdate } from 'pinia';
import type { CoverHistoryItem, CoverImage } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { useSettingsStore } from 'src/stores/settings';

/**
 * 从 IndexedDB 加载封面历史
 */
async function loadCoverHistoryFromDB(): Promise<CoverHistoryItem[]> {
  try {
    const db = await getDB();
    const history = await db.getAll('cover-history');
    // 将日期字符串转换回 Date 对象
    return history.map((item) => ({
      ...item,
      addedAt: item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt),
    }));
  } catch (error) {
    console.error('Failed to load cover history from DB:', error);
    return [];
  }
}

/**
 * 创建一个纯净的对象以避免 Proxy 相关的克隆错误（手动构建，不依赖 structuredClone）
 */
function plainCoverItem(item: CoverHistoryItem): CoverHistoryItem {
  return {
    id: item.id,
    url: item.url,
    addedAt: item.addedAt,
    ...(item.deleteUrl ? { deleteUrl: item.deleteUrl } : {}),
  };
}

/** 同步载荷里的封面记录：addedAt 可能是字符串，极旧载荷可能缺 id */
export type CoverRecordInput = Omit<CoverHistoryItem, 'id' | 'addedAt'> & {
  id?: string | undefined;
  addedAt?: Date | string | number | undefined;
};

/** FNV-1a 32 位哈希：为缺 id 的旧记录从 URL 派生稳定 id，各设备结果一致 */
function stableUrlHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 规范化同步 / 导入来的封面记录：保留原 id 与添加时间（字符串转 Date，无效时间回落到纪元 0），
 * 缺 id 时按 URL 派生确定性 id，保证同一条记录每次同步得到同一身份
 */
export function normalizeCoverRecord(item: CoverRecordInput): CoverHistoryItem {
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  const addedAt = item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt ?? 0);
  return {
    ...item,
    url,
    id: item.id || `cover-${stableUrlHash(url)}`,
    addedAt: Number.isNaN(addedAt.getTime()) ? new Date(0) : addedAt,
  };
}

/** 找出被传入记录按 URL 取代、但 id 不同的本地记录 id（需要从库中移除，且不记删除墓碑） */
function collectDisplacedIds(
  incoming: readonly CoverHistoryItem[],
  existing: readonly CoverHistoryItem[],
): Set<string> {
  const incomingIds = new Set(incoming.map((item) => item.id));
  const incomingUrls = new Set(incoming.map((item) => item.url));
  return new Set(
    existing
      .filter((item) => !incomingIds.has(item.id) && incomingUrls.has(item.url.trim()))
      .map((item) => item.id),
  );
}

/** 按给定键去重：addedAt 较新者胜，相同时后出现者胜 */
function keepLatestBy(
  items: readonly CoverHistoryItem[],
  key: (item: CoverHistoryItem) => string,
): CoverHistoryItem[] {
  const byKey = new Map<string, CoverHistoryItem>();
  for (const item of items) {
    const existing = byKey.get(key(item));
    if (!existing || item.addedAt.getTime() >= existing.addedAt.getTime()) {
      byKey.set(key(item), item);
    }
  }
  return [...byKey.values()];
}

/**
 * 规范化并去重一批封面记录：同 URL 或同 id 只留 addedAt 最新的一条。
 * IndexedDB 以 id 为主键，若同 id 两条都进内存，库与内存会立即分叉
 */
function normalizeCoverBatch(items: readonly CoverRecordInput[]): CoverHistoryItem[] {
  return dedupeCoverBatch(items.map(normalizeCoverRecord));
}

function dedupeCoverBatch(items: readonly CoverHistoryItem[]): CoverHistoryItem[] {
  return keepLatestBy(
    keepLatestBy(items, (item) => item.url),
    (item) => item.id,
  );
}

/**
 * 与对应的本地记录（同 id 或同 URL）合并，身份始终取传入记录：
 * 本地较新（如刚重新添加过）时沿用完整本地记录，避免丢失 deleteUrl 等字段；
 * 否则在传入记录缺 deleteUrl 时补回同 URL 本地记录的删除凭据
 */
function mergeWithLocal(
  item: CoverHistoryItem,
  existing: readonly CoverHistoryItem[],
): CoverHistoryItem {
  const matches = existing.filter((local) => local.id === item.id || local.url.trim() === item.url);
  const newest = keepLatestBy(matches, () => '')[0];
  if (newest && newest.addedAt.getTime() > item.addedAt.getTime()) {
    return { ...newest, url: newest.url.trim(), id: item.id };
  }
  const deleteUrl =
    item.deleteUrl ?? matches.find((local) => local.url.trim() === item.url)?.deleteUrl;
  return deleteUrl ? { ...item, deleteUrl } : item;
}

/**
 * 在单个事务内删除 removeIds 并写入 items；任一写入失败整体回滚并向上抛出
 */
async function writeCoversAtomically(
  items: readonly CoverHistoryItem[],
  options: { clear?: boolean; removeIds?: ReadonlySet<string> },
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cover-history', 'readwrite');
  try {
    if (options.clear) await tx.store.clear();
    for (const id of options.removeIds ?? []) await tx.store.delete(id);
    for (const item of items) await tx.store.put(plainCoverItem(item));
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* 事务已因错误自动中止 */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/**
 * 保存单个封面历史到 IndexedDB
 */
async function saveCoverHistoryItemToDB(item: CoverHistoryItem): Promise<void> {
  try {
    const db = await getDB();
    await db.put('cover-history', plainCoverItem(item));
  } catch (error) {
    console.error('Failed to save cover history item to DB:', error);
  }
}

/**
 * 从 IndexedDB 删除封面历史
 */
async function deleteCoverHistoryItemFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('cover-history', id);
  } catch (error) {
    console.error('Failed to delete cover history item from DB:', error);
  }
}

export const useCoverHistoryStore = defineStore('coverHistory', {
  state: () => ({
    covers: [] as CoverHistoryItem[],
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取所有封面（按添加时间倒序）
     */
    allCovers: (state): CoverHistoryItem[] => {
      return [...state.covers].sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载封面历史
     */
    async loadCoverHistory(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.covers = await loadCoverHistoryFromDB();
      this.isLoaded = true;
    },

    /**
     * 添加封面到历史记录
     */
    async addCover(cover: CoverImage): Promise<void> {
      // 检查是否已存在（通过 URL）
      const existingIndex = this.covers.findIndex((c) => c.url === cover.url);

      if (existingIndex > -1) {
        // 如果已存在，更新添加时间
        const existingCover = this.covers[existingIndex];
        if (existingCover) {
          existingCover.addedAt = new Date();
          await saveCoverHistoryItemToDB(existingCover);
        }
      } else {
        // 如果不存在，添加新记录
        const newItem: CoverHistoryItem = {
          ...cover,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          addedAt: new Date(),
        };
        this.covers.push(newItem);
        await saveCoverHistoryItemToDB(newItem);
      }
    },

    /**
     * 从历史记录中删除封面
     */
    async removeCover(id: string): Promise<void> {
      const index = this.covers.findIndex((c) => c.id === id);
      if (index > -1) {
        const coverUrl = this.covers[index]?.url;
        this.covers.splice(index, 1);
        await deleteCoverHistoryItemFromDB(id);

        // 记录到删除列表
        const settingsStore = useSettingsStore();
        const gistSync = settingsStore.gistSync;
        const deletedCoverIds = gistSync.deletedCoverIds || [];
        const deletedCoverUrls = gistSync.deletedCoverUrls || [];

        // 检查是否已存在（避免重复）
        if (!deletedCoverIds.find((record) => record.id === id)) {
          deletedCoverIds.push({
            id,
            deletedAt: Date.now(),
          });
          await settingsStore.updateGistSync({
            deletedCoverIds,
          });
        }

        // 同时按 URL 记录删除（跨设备：同一 URL 可能拥有不同的 id）
        const normalizedUrl = typeof coverUrl === 'string' ? coverUrl.trim() : '';
        if (normalizedUrl.length > 0) {
          if (!deletedCoverUrls.find((record) => record.url === normalizedUrl)) {
            deletedCoverUrls.push({
              url: normalizedUrl,
              deletedAt: Date.now(),
            });
            await settingsStore.updateGistSync({
              deletedCoverUrls,
            });
          }
        }
      }
    },

    /**
     * 按给定记录原样替换封面历史（保留 id 与添加时间），用于回滚、导入与同步重建。
     * addCover 会重新生成身份，同步若走它会让同步身份与删除记录失配。
     * 清空与写入在同一事务内，提交成功后才更新内存。
     */
    async replaceHistory(items: readonly CoverRecordInput[]): Promise<void> {
      const restored = normalizeCoverBatch(items);
      await writeCoversAtomically(restored, { clear: true });
      this.covers = restored;
    },

    /**
     * 按给定记录原样合并进封面历史（保留 id 与添加时间），用于增量同步与恢复删除项。
     * 同 id 直接覆盖；同 URL 但 id 不同的本地记录被取代（不写删除墓碑，避免跨设备误删）。
     * 被取代 / 覆盖的本地记录更新时保留本地记录内容（含 deleteUrl），与其他合并路径「较新者胜」一致。
     */
    async upsertCovers(items: readonly CoverRecordInput[]): Promise<void> {
      const incoming = dedupeCoverBatch(
        normalizeCoverBatch(items).map((item) => mergeWithLocal(item, this.covers)),
      );
      if (incoming.length === 0) return;
      const displaced = collectDisplacedIds(incoming, this.covers);
      await writeCoversAtomically(incoming, { removeIds: displaced });
      const incomingIds = new Set(incoming.map((item) => item.id));
      this.covers = [
        ...this.covers.filter((item) => !displaced.has(item.id) && !incomingIds.has(item.id)),
        ...incoming,
      ];
    },

    /**
     * 清空所有封面历史
     */
    async clearHistory(): Promise<void> {
      const db = await getDB();
      await db.clear('cover-history');
      this.covers = [];
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCoverHistoryStore, import.meta.hot));
}
