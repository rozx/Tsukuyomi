import { LibraryPersistence } from 'src/services/library-persistence';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem } from 'src/models/novel';
import type { SyncConfig } from 'src/models/sync';
import type { ToastHistoryItem } from 'src/stores/toast-history';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { ChapterEmbedding, ChapterEmbeddingKind } from 'src/models/chapter-embedding';
import type {
  BookRevision,
  ImportEvent,
  ImportOperation,
  ImportResource,
  ImportSource,
  ImportTask,
} from 'src/models/import';

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
  bookId?: string;
  content: string; // 序列化为 JSON 字符串的段落数组
  lastModified: string; // ISO 日期字符串
}

/**
 * IndexedDB 数据库架构定义
 */
export interface TsukuyomiDB extends DBSchema {
  'import-tasks': {
    key: string;
    value: ImportTask;
    indexes: { 'by-updatedAt': number };
  };
  'import-sources': {
    key: string;
    value: ImportSource;
    indexes: { 'by-task': string; 'by-task-parent': [string, string] };
  };
  'import-resources': {
    key: string;
    value: ImportResource;
    indexes: { 'by-task': string; 'by-task-source': [string, string] };
  };
  'import-events': {
    key: string;
    value: ImportEvent;
    indexes: {
      'by-task': string;
      'by-task-sequence': [string, number];
      'by-task-call': [string, string];
    };
  };
  'import-operations': {
    key: string;
    value: ImportOperation;
    indexes: { 'by-task': string };
  };
  'book-revisions': {
    key: string;
    value: BookRevision;
  };
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
      embeddings?: number[][];
      embeddingModel?: string;
    };
    indexes: {
      'by-bookId': string;
      'by-lastAccessedAt': number;
    };
  };
  'full-text-indexes': {
    key: string;
    value: {
      bookId: string;
      indexData: string; // 序列化的 Fuse.js 索引数据
      lastUpdated: string; // ISO 日期字符串
    };
  };
  'chapter-embeddings': {
    key: string; // `${chapterId}:${kind}:${chunkIndex}` (v11+);v10 旧 key 为 `${chapterId}:${chunkIndex}`
    value: ChapterEmbedding;
    indexes: {
      'by-chapterId': string;
      'by-bookId': string;
    };
  };
}

const DB_NAME = 'tsukuyomi';
// v12 增量创建导入任务和书籍修改序号，不重写现有书籍或正文。
const DB_VERSION = 12;

let dbPromise: Promise<IDBPDatabase<TsukuyomiDB>> | null = null;
let dbBlocked = false;

/**
 * 检查数据库是否被阻塞升级
 */
export function isDbBlocked(): boolean {
  return dbBlocked;
}

export async function resetDbForTests(): Promise<void> {
  try {
    await clearAllData();
  } catch {
    // 忽略测试环境清理错误
  }
}

/**
 * 测试专用：重置模块内缓存的 dbPromise，使得下次 getDB() 调用会重新打开数据库。
 * 用于需要测试 schema upgrade 路径的场景。
 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function ensureObjectStores(db: IDBPDatabase<TsukuyomiDB>): void {
  ensureImportStores(db);
  if (!db.objectStoreNames.contains('books')) {
    const booksStore = db.createObjectStore('books', { keyPath: 'id' });
    booksStore.createIndex('by-lastEdited', 'lastEdited');
    booksStore.createIndex('by-createdAt', 'createdAt');
  }
  if (!db.objectStoreNames.contains('ai-models')) {
    db.createObjectStore('ai-models', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('sync-configs')) {
    db.createObjectStore('sync-configs', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('cover-history')) {
    const coverStore = db.createObjectStore('cover-history', { keyPath: 'id' });
    coverStore.createIndex('by-addedAt', 'addedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains('toast-history')) {
    db.createObjectStore('toast-history', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('toast-last-viewed')) {
    db.createObjectStore('toast-last-viewed', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('book-details-ui')) {
    db.createObjectStore('book-details-ui', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('ui-state')) {
    db.createObjectStore('ui-state', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('thinking-processes')) {
    const thinkingStore = db.createObjectStore('thinking-processes', { keyPath: 'id' });
    thinkingStore.createIndex('by-startTime', 'startTime', { unique: false });
  }
  if (!db.objectStoreNames.contains('chapter-contents')) {
    const chapterContentStore = db.createObjectStore('chapter-contents', {
      keyPath: 'chapterId',
    });
    chapterContentStore.createIndex('by-lastModified', 'lastModified', { unique: false });
  }
  if (!db.objectStoreNames.contains('memories')) {
    const memoriesStore = db.createObjectStore('memories', { keyPath: 'id' });
    memoriesStore.createIndex('by-bookId', 'bookId', { unique: false });
    memoriesStore.createIndex('by-lastAccessedAt', 'lastAccessedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains('full-text-indexes')) {
    db.createObjectStore('full-text-indexes', { keyPath: 'bookId' });
  }
  if (!db.objectStoreNames.contains('chapter-embeddings')) {
    const chapterEmbeddingsStore = db.createObjectStore('chapter-embeddings');
    chapterEmbeddingsStore.createIndex('by-chapterId', 'chapterId', { unique: false });
    chapterEmbeddingsStore.createIndex('by-bookId', 'bookId', { unique: false });
  }
}

function ensureImportStores(db: IDBPDatabase<TsukuyomiDB>): void {
  if (!db.objectStoreNames.contains('import-tasks')) {
    const store = db.createObjectStore('import-tasks', { keyPath: 'id' });
    store.createIndex('by-updatedAt', 'updatedAt');
  }
  if (!db.objectStoreNames.contains('import-sources')) {
    const store = db.createObjectStore('import-sources', { keyPath: 'id' });
    store.createIndex('by-task', 'taskId');
    store.createIndex('by-task-parent', ['taskId', 'parentSourceId']);
  }
  if (!db.objectStoreNames.contains('import-resources')) {
    const store = db.createObjectStore('import-resources', { keyPath: 'id' });
    store.createIndex('by-task', 'taskId');
    store.createIndex('by-task-source', ['taskId', 'sourceId']);
  }
  if (!db.objectStoreNames.contains('import-events')) {
    const store = db.createObjectStore('import-events', { keyPath: 'id' });
    store.createIndex('by-task', 'taskId');
    store.createIndex('by-task-sequence', ['taskId', 'sequence'], { unique: true });
    store.createIndex('by-task-call', ['taskId', 'callId']);
  }
  if (!db.objectStoreNames.contains('import-operations')) {
    const store = db.createObjectStore('import-operations', { keyPath: 'id' });
    store.createIndex('by-task', 'taskId');
  }
  if (!db.objectStoreNames.contains('book-revisions')) {
    db.createObjectStore('book-revisions', { keyPath: 'bookId' });
  }
}

async function migrateChapterEmbeddingsToV11(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any,
): Promise<void> {
  const startedAt = nowMs();
  const store = transaction.objectStore('chapter-embeddings');
  type MigrationOp = { oldKey: string; newKey: string; value: ChapterEmbedding };
  const ops: MigrationOp[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = await (store as any).openCursor();
  while (cursor) {
    const oldKey = cursor.key as string;
    const record = cursor.value as ChapterEmbedding & { kind?: ChapterEmbeddingKind };
    const value: ChapterEmbedding = {
      chapterId: record.chapterId,
      bookId: record.bookId,
      kind: 'content',
      chunkIndex: record.chunkIndex,
      vector: record.vector,
      textSnippet: record.textSnippet,
      model: record.model,
      updatedAt: record.updatedAt,
    };
    ops.push({ oldKey, newKey: `${value.chapterId}:content:${value.chunkIndex}`, value });
    cursor = await cursor.continue();
  }
  let migrated = 0;
  for (const op of ops) {
    await store.delete(op.oldKey);
    await store.put(op.value, op.newKey);
    migrated += 1;
  }
  console.info(
    `[indexed-db] v11 迁移完成:回填 ${migrated} 条 chapter-embeddings 的 kind 字段并重写 key,耗时 ${Math.round(
      nowMs() - startedAt,
    )} ms`,
  );
}

async function migrateMemoriesToV9(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any,
): Promise<void> {
  const startedAt = nowMs();
  const memoriesStore = transaction.objectStore('memories');
  let migrated = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = await (memoriesStore as any).openCursor();
  while (cursor) {
    const record = cursor.value as Record<string, unknown> | undefined;
    if (record && 'attachedTo' in record) {
      delete record.attachedTo;
      await cursor.update(record);
      migrated += 1;
    }
    cursor = await cursor.continue();
  }
  console.info(
    `[indexed-db] v9 迁移完成:清理 ${migrated} 条 memory 记录的 attachedTo 字段,耗时 ${Math.round(
      nowMs() - startedAt,
    )} ms`,
  );
}

export async function __resetDbPromiseForTesting(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
}

/**
 * 初始化并获取 IndexedDB 数据库实例
 */
export async function getDB(): Promise<IDBPDatabase<TsukuyomiDB>> {
  if (!dbPromise) {
    dbBlocked = false;
    console.info(`[indexed-db] 正在打开数据库 ${DB_NAME} v${DB_VERSION}...`);
    dbPromise = openDB<TsukuyomiDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        console.info(`[indexed-db] 执行升级: v${oldVersion} → v${_newVersion}`);
        ensureObjectStores(db);
        if (oldVersion < 11 && db.objectStoreNames.contains('chapter-embeddings')) {
          await migrateChapterEmbeddingsToV11(transaction);
        }
        if (oldVersion < 9 && db.objectStoreNames.contains('memories')) {
          await migrateMemoriesToV9(transaction);
        }
      },
      blocked() {
        dbBlocked = true;
        console.warn('[indexed-db] 数据库升级被阻塞，请关闭其他使用本应用的标签页后刷新');
      },
      blocking() {
        console.warn('[indexed-db] 当前标签页正在阻止其他标签页的数据库升级，建议刷新此页面');
      },
    })
      .then((db) => {
        dbBlocked = false;
        console.info('[indexed-db] 数据库打开成功');
        return db;
      })
      .catch((error) => {
        console.error('[indexed-db] 数据库打开失败:', error);
        // 重置缓存，允许后续重试
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
}

/**
 * 从 localStorage 迁移数据到 IndexedDB
 */
async function migrateBooks(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const booksData =
    localStorage.getItem('luna-ai-books') || localStorage.getItem('tsukuyomi-books');
  if (!booksData) return;
  const books = JSON.parse(booksData) as Novel[];
  await LibraryPersistence.saveBooks(
    db,
    books.map((book) => ({
      ...book,
      lastEdited: new Date(book.lastEdited),
      createdAt: new Date(book.createdAt),
    })),
  );
  localStorage.removeItem('luna-ai-books');
  localStorage.removeItem('tsukuyomi-books');
}

async function migrateAiModels(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const modelsData =
    localStorage.getItem('luna-ai-models') || localStorage.getItem('tsukuyomi-models');
  if (!modelsData) return;
  const models = JSON.parse(modelsData) as AIModel[];
  const tx = db.transaction('ai-models', 'readwrite');
  const store = tx.objectStore('ai-models');
  for (const model of models) {
    await store.put(model);
  }
  await tx.done;
  localStorage.removeItem('luna-ai-models');
  localStorage.removeItem('tsukuyomi-models');
}

async function migrateSettings(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const settingsData =
    localStorage.getItem('luna-ai-settings') || localStorage.getItem('tsukuyomi-settings');
  if (!settingsData) return;
  const settings = JSON.parse(settingsData) as AppSettings;
  await db.put('settings', { key: 'app', ...settings } as AppSettings & { key: string });
  localStorage.removeItem('luna-ai-settings');
  localStorage.removeItem('tsukuyomi-settings');
}

async function migrateCoverHistory(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const coverHistoryData =
    localStorage.getItem('luna-ai-cover-history') ||
    localStorage.getItem('tsukuyomi-cover-history');
  if (!coverHistoryData) return;
  const coverHistory = JSON.parse(coverHistoryData) as CoverHistoryItem[];
  const tx = db.transaction('cover-history', 'readwrite');
  const store = tx.objectStore('cover-history');
  for (const cover of coverHistory) {
    await store.put({
      ...cover,
      addedAt: cover.addedAt instanceof Date ? cover.addedAt : new Date(cover.addedAt),
    });
  }
  await tx.done;
  localStorage.removeItem('luna-ai-cover-history');
  localStorage.removeItem('tsukuyomi-cover-history');
}

async function migrateSyncConfigs(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const syncData = localStorage.getItem('luna-ai-sync') || localStorage.getItem('tsukuyomi-sync');
  if (!syncData) return;
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
  localStorage.removeItem('tsukuyomi-sync');
}

async function migrateToastHistory(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const toastHistoryData =
    localStorage.getItem('luna-toast-history') ||
    localStorage.getItem('luna-ai-toast-history') ||
    localStorage.getItem('tsukuyomi-toast-history');
  if (!toastHistoryData) return;
  const toastHistory = JSON.parse(toastHistoryData) as ToastHistoryItem[];
  const tx = db.transaction('toast-history', 'readwrite');
  const store = tx.objectStore('toast-history');
  for (const item of toastHistory) {
    await store.put(item);
  }
  await tx.done;
  localStorage.removeItem('luna-toast-history');
  localStorage.removeItem('luna-ai-toast-history');
  localStorage.removeItem('tsukuyomi-toast-history');
}

async function migrateToastLastViewed(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const lastViewedData =
    localStorage.getItem('luna-toast-last-viewed') ||
    localStorage.getItem('luna-ai-toast-last-viewed') ||
    localStorage.getItem('tsukuyomi-toast-last-viewed');
  if (!lastViewedData) return;
  const timestamp = parseInt(lastViewedData, 10);
  if (!isNaN(timestamp)) {
    await db.put('toast-last-viewed', { key: 'last-viewed', timestamp });
  }
  localStorage.removeItem('luna-toast-last-viewed');
  localStorage.removeItem('luna-ai-toast-last-viewed');
  localStorage.removeItem('tsukuyomi-toast-last-viewed');
}

async function migrateBookDetailsUiBackToLocalStorage(
  db: IDBPDatabase<TsukuyomiDB>,
): Promise<void> {
  const stored = await db.get('book-details-ui', 'state');
  if (!stored) return;
  const { key: _key, ...state } = stored;
  localStorage.setItem('tsukuyomi-book-details-ui', JSON.stringify(state));
}

async function migrateUiStateBackToLocalStorage(db: IDBPDatabase<TsukuyomiDB>): Promise<void> {
  const stored = await db.get('ui-state', 'state');
  if (!stored) return;
  const { key: _key, ...state } = stored;
  localStorage.setItem('tsukuyomi-ui-state', JSON.stringify(state));
}

async function runMigrationStep(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch {
    // 忽略迁移错误
  }
}

export async function migrateFromLocalStorage(): Promise<void> {
  const db = await getDB();
  await runMigrationStep(() => migrateBooks(db));
  await runMigrationStep(() => migrateAiModels(db));
  await runMigrationStep(() => migrateSettings(db));
  await runMigrationStep(() => migrateCoverHistory(db));
  await runMigrationStep(() => migrateSyncConfigs(db));
  await runMigrationStep(() => migrateToastHistory(db));
  await runMigrationStep(() => migrateToastLastViewed(db));
  await runMigrationStep(() => migrateBookDetailsUiBackToLocalStorage(db));
  await runMigrationStep(() => migrateUiStateBackToLocalStorage(db));
}

/**
 * 清空所有 IndexedDB 数据（用于测试/重置）
 */
async function clearAllData(): Promise<void> {
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
    'chapter-embeddings',
    'import-tasks',
    'import-sources',
    'import-resources',
    'import-events',
    'import-operations',
    'book-revisions',
  ] as const;

  for (const storeName of storeNames) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.objectStore(storeName).clear();
    await tx.done;
  }
}
