import { isCancelledError } from 'src/utils/is-cancelled-error';
import type { CrossTabLanes } from './cross-tab-lanes';
import { RequestLimiter } from './request-limiter';

/**
 * 网络请求队列：按 lane（如 `site:kakuyomu.jp`、`firecrawl`）分道排队，每条 lane 各自限流。
 * 策略按 lane 前缀定义（最长前缀优先），未匹配时用默认策略；同一前缀下的不同 lane 互不阻塞。
 *
 * - 并发上限与相邻请求的最小间隔
 * - 暂停整条 lane（如收到 429 按 Retry-After 等待）
 * - 熔断：连续被拒达到阈值时，该次请求即抛出策略给出的错误，冷却期内不再发请求；
 *   冷却结束后放行一次试探，再被拒立即重新熔断，成功则恢复。
 *   「连续」指中间没有夹着其它结果：成功或非拒绝类错误（如网络错误、404）都会清零计数，
 *   取消不是站点的响应，既不计数也不清零
 */

export interface LaneBreaker {
  /** 连续被拒多少次后熔断 */
  tripAfter: number;
  /** 熔断持续时间 */
  cooldownMs: number;
  /** 该错误是否计为「被拒」；其余错误（取消除外）清零连续拒绝计数 */
  isRefusal: (error: unknown) => boolean;
  /** 熔断期间抛出的错误 */
  trippedError: (lane: string, remainingMs: number) => Error;
}

export interface LanePolicy {
  /** 同时进行的请求数 */
  concurrency: number;
  /** 相邻两次请求开始的最小间隔 */
  minIntervalMs?: number;
  breaker?: LaneBreaker;
  /** 跨标签页协调：run 的请求跨标签页串行并保持间隔，熔断状态跨标签页共享 */
  crossTab?: CrossTabLanes;
}

interface Lane {
  policy: LanePolicy;
  limiter: RequestLimiter;
  refusals: number;
  trippedUntil: number;
}

export class RequestQueue {
  private readonly policies = new Map<string, LanePolicy>();
  private lanes = new Map<string, Lane>();

  constructor(private readonly defaultPolicy: LanePolicy) {}

  /** 为以 prefix 开头的 lane 定义策略；已创建的 lane 在下次 reset 后生效 */
  define(prefix: string, policy: LanePolicy): void {
    this.policies.set(prefix, policy);
  }

  /** 排队执行一次请求：遵守并发、间隔、暂停与熔断 */
  async run<T>(lane: string, request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const state = this.lane(lane);
    this.throwIfTripped(lane, state);
    const release = await state.limiter.acquire(signal);
    try {
      const crossTab = state.policy.crossTab;
      const attempt = () => this.attempt(lane, state, request);
      return await (crossTab
        ? crossTab.exclusive(lane, state.policy.minIntervalMs ?? 0, attempt, signal)
        : attempt());
    } finally {
      release();
    }
  }

  /** 只取得名额（不含熔断），供自带重试 / 锁存策略的调用方使用；用完须调用 release */
  acquire(lane: string, signal?: AbortSignal): Promise<() => void> {
    return this.lane(lane).limiter.acquire(signal);
  }

  /** 暂停整条 lane；只延长、不缩短已有暂停 */
  pause(lane: string, ms: number): void {
    this.lane(lane).limiter.pauseFor(ms);
  }

  /** lane 剩余暂停时间（毫秒），未暂停时为 0 */
  pauseRemainingMs(lane: string): number {
    return this.lanes.get(lane)?.limiter.pauseRemainingMs() ?? 0;
  }

  /** 清空运行状态（排队、暂停、熔断，含跨标签页共享的熔断），保留已定义的策略；指定 lane 时只清该 lane */
  reset(lane?: string): void {
    for (const [name, state] of this.lanes) {
      if (lane === undefined || name === lane) state.policy.crossTab?.clear(name);
    }
    if (lane === undefined) this.lanes = new Map();
    else this.lanes.delete(lane);
  }

  /**
   * 获准后发送并记录结果。跨标签页时整个过程都在锁内：
   * 排队期间其它请求（含其它标签页）可能已触发熔断，发送前再检查一次
   * （熔断错误不经 recordFailure，不清零计数）；
   * 结果在释放锁前写入共享状态，下一个拿到锁的标签页才能读到
   */
  private async attempt<T>(name: string, lane: Lane, request: () => Promise<T>): Promise<T> {
    this.throwIfTripped(name, lane);
    try {
      const value = await request();
      this.saveBreaker(name, lane, 0, 0);
      return value;
    } catch (error) {
      // 触发熔断的这次请求直接报熔断，调用方（如批次）可立即停止
      if (this.recordFailure(name, lane, error)) throw this.trippedError(name, lane);
      throw error;
    }
  }

  private lane(name: string): Lane {
    let lane = this.lanes.get(name);
    if (!lane) {
      const policy = this.policyFor(name);
      const interval = policy.minIntervalMs ?? 0;
      lane = {
        policy,
        limiter: new RequestLimiter({
          concurrency: policy.concurrency,
          windowMs: interval,
          maxPerWindow: interval > 0 ? 1 : Number.POSITIVE_INFINITY,
        }),
        refusals: 0,
        trippedUntil: 0,
      };
      this.lanes.set(name, lane);
    }
    return lane;
  }

  private policyFor(lane: string): LanePolicy {
    let matched: [string, LanePolicy] | undefined;
    for (const entry of this.policies) {
      if (lane.startsWith(entry[0]) && (!matched || entry[0].length > matched[0].length))
        matched = entry;
    }
    return matched?.[1] ?? this.defaultPolicy;
  }

  private throwIfTripped(name: string, lane: Lane): void {
    if (!lane.policy.breaker) return;
    this.loadBreaker(name, lane);
    if (lane.trippedUntil > Date.now()) throw this.trippedError(name, lane);
  }

  /** 读入其它标签页写下的熔断状态；无跨标签页或存储不可用时沿用本页状态 */
  private loadBreaker(name: string, lane: Lane): void {
    const shared = lane.policy.crossTab?.readBreaker(name);
    if (!shared) return;
    lane.refusals = shared.refusals;
    lane.trippedUntil = shared.trippedUntil;
  }

  private saveBreaker(name: string, lane: Lane, refusals: number, trippedUntil: number): void {
    lane.refusals = refusals;
    lane.trippedUntil = trippedUntil;
    if (lane.policy.breaker) lane.policy.crossTab?.writeBreaker(name, { refusals, trippedUntil });
  }

  private trippedError(name: string, lane: Lane): Error {
    return lane.policy.breaker!.trippedError(name, lane.trippedUntil - Date.now());
  }

  /** 记录一次失败；本次失败触发熔断时返回 true */
  private recordFailure(name: string, lane: Lane, error: unknown): boolean {
    const breaker = lane.policy.breaker;
    if (!breaker || isCancelled(error)) return false;
    // 请求期间不会有其它标签页写入（锁内），这里读到的就是最新计数
    this.loadBreaker(name, lane);
    if (!breaker.isRefusal(error)) {
      this.saveBreaker(name, lane, 0, lane.trippedUntil);
      return false;
    }
    const refusals = lane.refusals + 1;
    const tripped = refusals >= breaker.tripAfter;
    this.saveBreaker(
      name,
      lane,
      refusals,
      tripped ? Date.now() + breaker.cooldownMs : lane.trippedUntil,
    );
    return tripped;
  }
}

/** 调用方取消；部分环境（如 jsdom）的 DOMException 不继承 Error，单独判定 */
function isCancelled(error: unknown): boolean {
  return isCancelledError(error) || (error instanceof DOMException && error.name === 'AbortError');
}

/** 全局共用的请求队列：各访问层按需 define 自己的 lane 策略 */
export const networkQueue = new RequestQueue({ concurrency: 4 });
