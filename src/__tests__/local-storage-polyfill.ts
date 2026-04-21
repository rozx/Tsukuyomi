// 共享 localStorage polyfill。vitest 的 jsdom env 会装一个没有方法的空对象，
// bun test 完全没有 localStorage，所以一律用可配置 descriptor 覆盖成内存 shim。
export function installLocalStoragePolyfill(): void {
  const storage = new Map<string, string>();
  const shim: Storage = {
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
    value: shim,
  });
}
