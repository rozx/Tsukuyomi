/**
 * 同一浏览器多个标签页之间协调 lane：Web Locks 让同一 lane 跨标签页串行，
 * localStorage 记录上次请求开始时间与熔断状态（同源标签页共享、同步可读），
 * 任一标签页的被拒 / 熔断，其他标签页下次请求前即可读到。
 * 不支持 Web Locks 或 localStorage 的环境（如 jsdom）不创建，调用方退回单页行为。
 */

import { abortError } from './request-limiter';

/** navigator.locks 中用到的部分 */
export interface LockRequester {
  request<T>(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

export interface CrossTabLaneDeps {
  locks: LockRequester | undefined;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
}

/** 跨标签页共享的熔断状态 */
export interface SharedBreakerState {
  refusals: number;
  trippedUntil: number;
}

export interface CrossTabLanes {
  /** 跨标签页独占 lane 执行 task，且与上一次请求开始至少间隔 minIntervalMs */
  exclusive<T>(
    lane: string,
    minIntervalMs: number,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  /** 读取共享熔断状态；存储不可用时返回 undefined，调用方沿用本页状态 */
  readBreaker(lane: string): SharedBreakerState | undefined;
  writeBreaker(lane: string, state: SharedBreakerState): void;
  clear(lane: string): void;
}

interface StoredLane extends SharedBreakerState {
  lastStartAt: number;
}

const KEY_PREFIX = 'tsukuyomi:request-lane:';
const EMPTY: StoredLane = { refusals: 0, trippedUntil: 0, lastStartAt: 0 };

function defaultDeps(): CrossTabLaneDeps {
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return { locks: locks as LockRequester | undefined, storage };
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createCrossTabLanes(
  overrides: Partial<CrossTabLaneDeps> = {},
): CrossTabLanes | undefined {
  const { locks, storage } = { ...defaultDeps(), ...overrides };
  if (!locks || !storage) return undefined;
  // 写入失败过（写满 / 被禁用）就不再信任存储里的旧值，熔断改用本页状态
  let writable = true;

  /** 读取 lane 记录；存储不可用时返回 undefined，损坏数据按初始状态 */
  const read = (lane: string): StoredLane | undefined => {
    if (!writable) return undefined;
    let raw: string | null;
    try {
      raw = storage.getItem(KEY_PREFIX + lane);
    } catch {
      return undefined;
    }
    if (!raw) return { ...EMPTY };
    try {
      const parsed = JSON.parse(raw) as Partial<StoredLane> | null;
      return {
        refusals: finite(parsed?.refusals),
        trippedUntil: finite(parsed?.trippedUntil),
        lastStartAt: finite(parsed?.lastStartAt),
      };
    } catch {
      return { ...EMPTY };
    }
  };

  const write = (lane: string, patch: Partial<StoredLane>): void => {
    try {
      storage.setItem(KEY_PREFIX + lane, JSON.stringify({ ...EMPTY, ...read(lane), ...patch }));
    } catch {
      writable = false;
    }
  };

  return {
    exclusive(lane, minIntervalMs, task, signal) {
      return locks.request(`${KEY_PREFIX}${lane}`, { ...(signal && { signal }) }, async () => {
        const lastStartAt = read(lane)?.lastStartAt ?? 0;
        // 时钟回拨时 lastStartAt 可能在未来：最多等一个间隔
        const wait = Math.min(minIntervalMs, lastStartAt + minIntervalMs - Date.now());
        if (wait > 0) await delay(wait, signal);
        write(lane, { lastStartAt: Date.now() });
        return task();
      });
    },
    readBreaker(lane) {
      const stored = read(lane);
      return stored && { refusals: stored.refusals, trippedUntil: stored.trippedUntil };
    },
    writeBreaker(lane, state) {
      write(lane, state);
    },
    clear(lane) {
      try {
        storage.removeItem(KEY_PREFIX + lane);
      } catch {
        writable = false;
      }
    },
  };
}
