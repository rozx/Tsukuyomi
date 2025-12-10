/**
 * 测试环境设置
 * 为测试环境提供 IndexedDB 和 localStorage 的 polyfill
 *
 * 注意：此文件必须在任何使用 IndexedDB 的模块导入之前被导入
 *
 * 使用 fake-indexeddb 提供完整的 IndexedDB 实现
 */

// 导入 fake-indexeddb，它会自动在全局范围内提供 indexedDB
// 这必须在 idb 库导入之前执行
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - fake-indexeddb/auto 的类型定义可能不完整，但运行时可用
// import 'fake-indexeddb/auto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// 确保 indexedDB 在全局范围内可用（针对某些环境）
if (typeof globalThis.indexedDB === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).indexedDB = indexedDB;
}

if (typeof globalThis.IDBKeyRange === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IDBKeyRange = IDBKeyRange;
}

// Polyfill for localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    get length() {
      return storage.size;
    },
    key: (index: number) => {
      const keys = Array.from(storage.keys());
      return keys[index] ?? null;
    },
  };
}
