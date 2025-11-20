import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Novel } from 'src/types/novel';
import type { AIModel } from 'src/types/ai/ai-model';
import type { AppSettings } from 'src/types/settings';
import type { CoverHistoryItem } from 'src/types/novel';

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
    value: AppSettings;
  };
  'cover-history': {
    key: string;
    value: CoverHistoryItem;
    indexes: { 'by-timestamp': number };
  };
  'toast-history': {
    key: string;
    value: unknown; // Toast 消息类型
  };
}

const DB_NAME = 'luna-ai';
const DB_VERSION = 1;

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

        // 创建 cover-history 存储
        if (!db.objectStoreNames.contains('cover-history')) {
          const coverStore = db.createObjectStore('cover-history', {
            keyPath: 'id',
          });
          coverStore.createIndex('by-timestamp', 'timestamp');
        }

        // 创建 toast-history 存储
        if (!db.objectStoreNames.contains('toast-history')) {
          db.createObjectStore('toast-history', { keyPath: 'id' });
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
        await store.put(cover);
      }

      await tx.done;
      localStorage.removeItem('luna-ai-cover-history');
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
  const storeNames = ['books', 'ai-models', 'settings', 'cover-history', 'toast-history'] as const;

  for (const storeName of storeNames) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.objectStore(storeName).clear();
    await tx.done;
  }
}

