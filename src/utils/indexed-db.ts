import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem } from 'src/models/novel';
import type { SyncConfig } from 'src/models/sync';
import type { ToastHistoryItem } from 'src/stores/toast-history';
import type { AIProcessingTask } from 'src/stores/ai-processing';

/**
 * 书籍详情页面 UI 状态
 */
interface BookDetailsUiState {
  expandedVolumes: Record<string, string[]>;
  selectedChapter: Record<string, string | null>;
}

/**
 * UI 状态
 */
interface UiState {
  sideMenuOpen: boolean;
}

/**
 * 章节内容存储结构
 */
interface ChapterContent {
  chapterId: string;
  content: string; // 序列化为 JSON 字符串的段落数组
  lastModified: string; // ISO 日期字符串
}

/**
 * IndexedDB 数据库架构定义
 */
interface LunaAIDB extends DBSchema {
  books: {
    key: string;
    value: Novel;
    indexes: { 'by-lastEdited': Date; 'by-createdAt': Date };
  };
  'ai-models': {
    key: string;
    value: AIModel;
  };
  settings: {
    key: string;
    value: AppSettings & { key: string };
  };
  'sync-configs': {
    key: string;
    value: SyncConfig & { id: string };
  };
  'cover-history': {
    key: string;
    value: CoverHistoryItem;
    indexes: { 'by-addedAt': Date };
  };
  'toast-history': {
    key: string;
    value: ToastHistoryItem;
  };
  'toast-last-viewed': {
    key: string;
    value: { key: string; timestamp: number };
  };
  'book-details-ui': {
    key: string;
    value: BookDetailsUiState & { key: string };
  };
  'ui-state': {
    key: string;
    value: UiState & { key: string };
  };
  'thinking-processes': {
    key: string;
    value: AIProcessingTask;
    indexes: { 'by-startTime': number };
  };
  'chapter-contents': {
    key: string;
    value: ChapterContent;
    indexes: { 'by-lastModified': string };
  };
  memories: {
    key: string;
    value: {
      id: string;
      bookId: string;
      content: string;
      summary: string;
      createdAt: number;
      lastAccessedAt: number;
    };
    indexes: { 'by-bookId': string; 'by-lastAccessedAt': number };
  };
  'full-text-indexes': {
    key: string;
    value: {
      bookId: string;
      indexData: string; // 序列化的 Fuse.js 索引数据
      lastUpdated: string; // ISO 日期字符串
    };
  };
}

const DB_NAME = 'luna-ai';
const DB_VERSION = 7; // 升级到版本 7 以支持 full-text-indexes 存储的 lastUpdated 字段

let dbPromise: Promise<IDBPDatabase<LunaAIDB>> | null = null;

/**
 * 初始化并获取 IndexedDB 数据库实例
 */
export async function getDB(): Promise<IDBPDatabase<LunaAIDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LunaAIDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, _transaction) {
        // 创建 books 存储
        if (!db.objectStoreNames.contains('books')) {
          const booksStore = db.createObjectStore('books', { keyPath: 'id' });
          booksStore.createIndex('by-lastEdited', 'lastEdited');
          booksStore.createIndex('by-createdAt', 'createdAt');
        }

        // 创建 ai-models 存储
        if (!db.objectStoreNames.contains('ai-models')) {
          db.createObjectStore('ai-models', { keyPath: 'id' });
        }

        // 创建 settings 存储
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 创建 sync-configs 存储（版本 2 新增）
        if (!db.objectStoreNames.contains('sync-configs')) {
          db.createObjectStore('sync-configs', { keyPath: 'id' });
        }

        // 创建 cover-history 存储
        if (!db.objectStoreNames.contains('cover-history')) {
          const coverStore = db.createObjectStore('cover-history', {
            keyPath: 'id',
          });
          coverStore.createIndex('by-addedAt', 'addedAt', { unique: false });
        }

        // 创建 toast-history 存储
        if (!db.objectStoreNames.contains('toast-history')) {
          db.createObjectStore('toast-history', { keyPath: 'id' });
        }

        // 创建 toast-last-viewed 存储（版本 2 新增）
        if (!db.objectStoreNames.contains('toast-last-viewed')) {
          db.createObjectStore('toast-last-viewed', { keyPath: 'key' });
        }

        // 创建 book-details-ui 存储（版本 2 新增）
        if (!db.objectStoreNames.contains('book-details-ui')) {
          db.createObjectStore('book-details-ui', { keyPath: 'key' });
        }

        // 创建 ui-state 存储（版本 2 新增）
        if (!db.objectStoreNames.contains('ui-state')) {
          db.createObjectStore('ui-state', { keyPath: 'key' });
        }

        // 创建 thinking-processes 存储（版本 3 新增）
        if (!db.objectStoreNames.contains('thinking-processes')) {
          const thinkingStore = db.createObjectStore('thinking-processes', {
            keyPath: 'id',
          });
          thinkingStore.createIndex('by-startTime', 'startTime', { unique: false });
        }

        // 创建 chapter-contents 存储（版本 4 新增）
        if (!db.objectStoreNames.contains('chapter-contents')) {
          const chapterContentStore = db.createObjectStore('chapter-contents', {
            keyPath: 'chapterId',
          });
          chapterContentStore.createIndex('by-lastModified', 'lastModified', { unique: false });
        }

        // 创建 memories 存储（版本 5 新增）
        if (!db.objectStoreNames.contains('memories')) {
          const memoriesStore = db.createObjectStore('memories', {
            keyPath: 'id',
          });
          memoriesStore.createIndex('by-bookId', 'bookId', { unique: false });
          memoriesStore.createIndex('by-lastAccessedAt', 'lastAccessedAt', { unique: false });
        }

        // 创建 full-text-indexes 存储（版本 6 新增）
        if (!db.objectStoreNames.contains('full-text-indexes')) {
          db.createObjectStore('full-text-indexes', { keyPath: 'bookId' });
        }
      },
      blocked() {
        // IndexedDB 被阻止升级
      },
      blocking() {
        // 此标签页正在阻止 IndexedDB 升级
      },
    });
  }

  return dbPromise;
}

/**
 * 从 localStorage 迁移数据到 IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const db = await getDB();

  // 迁移 books
  try {
    const booksData = localStorage.getItem('luna-ai-books');
    if (booksData) {
      const books = JSON.parse(booksData) as Novel[];

      const tx = db.transaction('books', 'readwrite');
      const store = tx.objectStore('books');

      for (const book of books) {
        // 确保日期字段是 Date 对象
        const migratedBook = {
          ...book,
          lastEdited: new Date(book.lastEdited),
          createdAt: new Date(book.createdAt),
        };
        await store.put(migratedBook);
      }

      await tx.done;
      localStorage.removeItem('luna-ai-books');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 ai-models
  try {
    const modelsData = localStorage.getItem('luna-ai-models');
    if (modelsData) {
      const models = JSON.parse(modelsData) as AIModel[];

      const tx = db.transaction('ai-models', 'readwrite');
      const store = tx.objectStore('ai-models');

      for (const model of models) {
        await store.put(model);
      }

      await tx.done;
      localStorage.removeItem('luna-ai-models');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 settings
  try {
    const settingsData = localStorage.getItem('luna-ai-settings');
    if (settingsData) {
      const settings = JSON.parse(settingsData) as AppSettings;

      await db.put('settings', { key: 'app', ...settings } as AppSettings & {
        key: string;
      });

      localStorage.removeItem('luna-ai-settings');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 cover-history
  try {
    const coverHistoryData = localStorage.getItem('luna-ai-cover-history');
    if (coverHistoryData) {
      const coverHistory = JSON.parse(coverHistoryData) as CoverHistoryItem[];

      const tx = db.transaction('cover-history', 'readwrite');
      const store = tx.objectStore('cover-history');

      for (const cover of coverHistory) {
        const migratedCover = {
          ...cover,
          addedAt: cover.addedAt instanceof Date ? cover.addedAt : new Date(cover.addedAt),
        };
        await store.put(migratedCover);
      }

      await tx.done;
      localStorage.removeItem('luna-ai-cover-history');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 sync-configs
  try {
    const syncData = localStorage.getItem('luna-ai-sync');
    if (syncData) {
      const syncs = JSON.parse(syncData) as SyncConfig[];

      const tx = db.transaction('sync-configs', 'readwrite');
      const store = tx.objectStore('sync-configs');

      for (let i = 0; i < syncs.length; i++) {
        const sync = syncs[i];
        if (!sync) continue;
        await store.put({
          id: `sync-${i}`,
          enabled: sync.enabled,
          lastSyncTime: sync.lastSyncTime,
          syncInterval: sync.syncInterval,
          syncType: sync.syncType,
          syncParams: sync.syncParams,
          secret: sync.secret,
          apiEndpoint: sync.apiEndpoint,
          ...(sync.lastSyncedModelIds !== undefined
            ? { lastSyncedModelIds: sync.lastSyncedModelIds }
            : {}),
        });
      }

      await tx.done;
      localStorage.removeItem('luna-ai-sync');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 toast-history
  try {
    const toastHistoryData = localStorage.getItem('luna-toast-history');
    if (toastHistoryData) {
      const toastHistory = JSON.parse(toastHistoryData) as ToastHistoryItem[];

      const tx = db.transaction('toast-history', 'readwrite');
      const store = tx.objectStore('toast-history');

      for (const item of toastHistory) {
        await store.put(item);
      }

      await tx.done;
      localStorage.removeItem('luna-toast-history');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 toast-last-viewed
  try {
    const lastViewedData = localStorage.getItem('luna-toast-last-viewed');
    if (lastViewedData) {
      const timestamp = parseInt(lastViewedData, 10);
      if (!isNaN(timestamp)) {
        await db.put('toast-last-viewed', {
          key: 'last-viewed',
          timestamp,
        });
      }
      localStorage.removeItem('luna-toast-last-viewed');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 book-details-ui：从 IndexedDB 迁移回 localStorage（如果存在）
  try {
    const stored = await db.get('book-details-ui', 'state');
    if (stored) {
      const { key: _key, ...state } = stored;
      localStorage.setItem('luna-ai-book-details-ui', JSON.stringify(state));
      // 可选：从 IndexedDB 删除，因为现在使用 localStorage
      // await db.delete('book-details-ui', 'state');
    }
  } catch {
    // 忽略迁移错误
  }

  // 迁移 ui-state：从 IndexedDB 迁移回 localStorage（如果存在）
  try {
    const stored = await db.get('ui-state', 'state');
    if (stored) {
      const { key: _key, ...state } = stored;
      localStorage.setItem('luna-ai-ui-state', JSON.stringify(state));
      // 可选：从 IndexedDB 删除，因为现在使用 localStorage
      // await db.delete('ui-state', 'state');
    }
  } catch {
    // 忽略迁移错误
  }
}

/**
 * 清空所有 IndexedDB 数据（用于测试/重置）
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const storeNames = [
    'books',
    'ai-models',
    'settings',
    'sync-configs',
    'cover-history',
    'toast-history',
    'toast-last-viewed',
    'book-details-ui',
    'ui-state',
    'thinking-processes',
    'chapter-contents',
    'memories',
    'full-text-indexes',
  ] as const;

  for (const storeName of storeNames) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.objectStore(storeName).clear();
    await tx.done;
  }
}
