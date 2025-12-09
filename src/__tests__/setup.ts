/**
 * 测试环境设置
 * 为测试环境提供 IndexedDB 和 localStorage 的 polyfill
 * 
 * 注意：此文件必须在任何使用 IndexedDB 的模块导入之前被导入
 */

// Polyfill for IndexedDB - 必须在 idb 库导入之前设置
if (typeof globalThis.indexedDB === 'undefined') {
  // 创建一个基本的 IndexedDB mock，满足 idb 库的检查
  (globalThis as any).indexedDB = {
    open: (_name: string, _version?: number) => {
      // 返回一个基本的 IDBOpenDBRequest mock
      const request = {
        onerror: null,
        onsuccess: null,
        onblocked: null,
        onupgradeneeded: null,
        result: null,
        error: null,
        readyState: 'done' as IDBRequestReadyState,
        source: null,
        transaction: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as IDBOpenDBRequest;
      
      // 立即失败，因为实际使用应该通过 mock.module 来模拟
      setTimeout(() => {
        if (request.onerror) {
          request.onerror(new Event('error') as any);
        }
      }, 0);
      
      return request;
    },
    deleteDatabase: (_name: string) => {
      const request = {
        onerror: null,
        onsuccess: null,
        onblocked: null,
        result: null,
        error: null,
        readyState: 'done' as IDBRequestReadyState,
        source: null,
        transaction: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as IDBRequest;
      
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess(new Event('success') as any);
        }
      }, 0);
      
      return request;
    },
    cmp: () => 0,
  };
}

// Polyfill for localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map<string, string>();
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

