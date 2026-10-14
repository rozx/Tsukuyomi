import { RequestLimiter } from './request-limiter';

/**
 * 网络请求队列：按 lane（如 `site:kakuyomu.jp`、`firecrawl`）分道排队，每条 lane 各自限流。
 * 策略按 lane 前缀定义（最长前缀优先），未匹配时用默认策略；同一前缀下的不同 lane 互不阻塞。
 *
 * - 并发上限与相邻请求的最小间隔
 * - 暂停整条 lane（如收到 429 按 Retry-After 等待）
 * - 熔断：连续被拒达到阈值时，该次请求即抛出策略给出的错误，冷却期内不再发请求；
 *   冷却结束后放行一次试探，再被拒立即重新熔断，成功则恢复
 */

export interface LaneBreaker {
  /** 连续被拒多少次后熔断 */
  tripAfter: number;
  /** 熔断持续时间 */
  cooldownMs: number;
  /** 该错误是否计为「被拒」；其余错误既不计数也不清零 */
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
      // 排队期间其它请求可能已触发熔断：获准后再检查一次
      this.throwIfTripped(lane, state);
      const value = await request();
      state.refusals = 0;
      state.trippedUntil = 0;
      return value;
    } catch (error) {
      // 触发熔断的这次请求直接报熔断，调用方（如批次）可立即停止
      if (this.recordFailure(state, error)) throw this.trippedError(lane, state);
      throw error;
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

  /** 清空运行状态（排队、暂停、熔断），保留已定义的策略；指定 lane 时只清该 lane */
  reset(lane?: string): void {
    if (lane === undefined) this.lanes = new Map();
    else this.lanes.delete(lane);
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
    if (lane.policy.breaker && lane.trippedUntil > Date.now()) throw this.trippedError(name, lane);
  }

  private trippedError(name: string, lane: Lane): Error {
    return lane.policy.breaker!.trippedError(name, lane.trippedUntil - Date.now());
  }

  /** 记录一次失败；本次失败触发熔断时返回 true */
  private recordFailure(lane: Lane, error: unknown): boolean {
    const breaker = lane.policy.breaker;
    if (!breaker?.isRefusal(error)) return false;
    lane.refusals++;
    if (lane.refusals < breaker.tripAfter) return false;
    lane.trippedUntil = Date.now() + breaker.cooldownMs;
    return true;
  }
}

/** 全局共用的请求队列：各访问层按需 define 自己的 lane 策略 */
export const networkQueue = new RequestQueue({ concurrency: 4 });
