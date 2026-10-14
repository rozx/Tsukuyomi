/**
 * 请求限流器：同时限制并发数与滑动窗口内的请求数。
 * acquire() 在拿到名额后返回 release 函数；等待期间可通过 AbortSignal 取消并移出队列。
 */

interface LimiterOptions {
  concurrency: number;
  windowMs: number;
  maxPerWindow: number;
}

interface Waiter {
  grant: (release: () => void) => void;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('操作已取消', 'AbortError');
}

export class RequestLimiter {
  private active = 0;
  private starts: number[] = [];
  private waiters: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pausedUntil = 0;

  constructor(private readonly options: LimiterOptions) {}

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(abortError(signal!));
      };
      const waiter: Waiter = {
        grant: (release) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(release);
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
      this.pump();
    });
  }

  /** 暂停放行（如收到 429）：期间即使有空闲名额也不放行；只延长、不缩短已有暂停 */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  /** 剩余暂停时间（毫秒），未暂停时为 0 */
  pauseRemainingMs(): number {
    return Math.max(0, this.pausedUntil - Date.now());
  }

  private pump(): void {
    const now = Date.now();
    if (now < this.pausedUntil) {
      if (this.waiters.length > 0) this.wake(this.pausedUntil - now);
      return;
    }
    this.starts = this.starts.filter((t) => now - t < this.options.windowMs);
    while (
      this.waiters.length > 0 &&
      this.active < this.options.concurrency &&
      this.starts.length < this.options.maxPerWindow
    ) {
      const waiter = this.waiters.shift()!;
      this.active++;
      this.starts.push(now);
      waiter.grant(this.createRelease());
    }
    this.scheduleWindowWake(now);
  }

  /** 窗口已满且仍有等待者时，在最早一次请求滑出窗口的时刻再次调度 */
  private scheduleWindowWake(now: number): void {
    if (this.waiters.length === 0) return;
    if (this.active >= this.options.concurrency) return;
    const oldest = this.starts[0];
    if (oldest === undefined) return;
    this.wake(oldest + this.options.windowMs - now);
  }

  private wake(delay: number): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, delay);
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.pump();
    };
  }
}
