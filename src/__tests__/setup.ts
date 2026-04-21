/**
 * 测试环境设置
 * 为测试环境提供 IndexedDB 和 localStorage 的 polyfill
 *
 * 注意：此文件必须在任何使用 IndexedDB 的模块导入之前被导入
 *
 * 使用 fake-indexeddb 提供完整的 IndexedDB 实现
 */

import { beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { IDBKeyRange, IDBRequest } from 'fake-indexeddb';
import { resetDbForTests } from 'src/utils/indexed-db';

if (typeof globalThis.IDBKeyRange === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IDBKeyRange = IDBKeyRange;
}

// idb 库会使用全局 IDBRequest 做 instanceof 判断，fake-indexeddb 需要显式挂载
if (typeof (globalThis as any).IDBRequest === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IDBRequest = IDBRequest;
}

beforeEach(async () => {
  await resetDbForTests();
});

import { installLocalStoragePolyfill } from './local-storage-polyfill';

installLocalStoragePolyfill();

// Polyfill for FileReader
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsText(file: File) {
    file
      .text()
      .then((text) => {
        if (this.onload) {
          this.onload({ target: { result: text } });
        }
      })
      .catch((e) => {
        if (this.onerror) {
          this.onerror(e);
        }
      });
  }
}

console.log('Setting up global.FileReader');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).FileReader = MockFileReader;
