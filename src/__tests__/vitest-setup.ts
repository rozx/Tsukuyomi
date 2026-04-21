/**
 * Vitest 全局 setup：
 * - 沿用 bun 测试体系的 IndexedDB / localStorage / FileReader polyfill
 * - 自动初始化 Pinia（每个 test 前重置）
 * - 全局 mock PrimeVue useToast，避免 "No PrimeVue Toast provided" 错误
 * - 在 jsdom 下补齐 globalThis.dispatchEvent 与 navigator.userAgent 可写语义
 */

import { beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// localStorage polyfill 必须在 setup（IndexedDB 初始化）之前装好，否则
// stores / services 在模块加载阶段读 localStorage 就已经炸了
const storage = new Map<string, string>();
const localStorageShim: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => {
    storage.clear();
  },
  getItem: (key: string) => storage.get(key) ?? null,
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  removeItem: (key: string) => {
    storage.delete(key);
  },
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageShim,
});

await import('./setup');

beforeEach(() => {
  storage.clear();
  setActivePinia(createPinia());
});

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
    remove: vi.fn(),
    removeGroup: vi.fn(),
    removeAllGroups: vi.fn(),
  }),
}));

if (typeof globalThis.dispatchEvent !== 'function') {
  (globalThis as unknown as { dispatchEvent: typeof window.dispatchEvent }).dispatchEvent =
    typeof window !== 'undefined'
      ? window.dispatchEvent.bind(window)
      : () => true;
}
