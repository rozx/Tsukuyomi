/** 同一实例代表同源浏览器锁管理器，供不同执行宿主共享。 */
export function webLocksFixture(): LockManager {
  const held: { name: string; mode: LockMode; clientId: string }[] = [];
  return {
    query: () => Promise.resolve({ held: [...held], pending: [] }),
    request: async (
      name: string,
      options: LockOptions,
      callback: (lock: Lock | null) => unknown,
    ) => {
      if (!options.ifAvailable || options.steal) throw new Error('预期立即尝试，不允许排队或抢占');
      const mode = options.mode ?? 'exclusive';
      const busy = held.some(
        (entry) => entry.name === name && (mode === 'exclusive' || entry.mode === 'exclusive'),
      );
      if (busy) return callback(null);
      const lock = { name, mode, clientId: 'test-context' };
      held.push(lock);
      try {
        return await callback(lock);
      } finally {
        held.splice(held.indexOf(lock), 1);
      }
    },
  } as unknown as LockManager;
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
