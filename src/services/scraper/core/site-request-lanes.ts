import { createCrossTabLanes } from 'src/services/network/cross-tab-lanes';
import type { CrossTabLanes } from 'src/services/network/cross-tab-lanes';
import { networkQueue } from 'src/services/network/request-queue';
import type { LanePolicy } from 'src/services/network/request-queue';
import { isSiteRefusal, SiteRateLimitedError } from 'src/services/proxy-fetch-plan';
import { isElectron } from 'src/utils/platform';

/**
 * 网页抓取按目标站点分道排队：同站请求串行并保持间隔，连续被拒后熔断。
 * 小说站按出口 IP 限流（Web 端所有用户共用 CORS 代理出口），突发并发很快就会让代理被封；
 * 被拒后继续请求只会延长封禁，因此熔断期间不再发请求。
 * Web 端同一浏览器的多个标签页共用这些限制（排队、间隔、熔断）；桌面版单窗口，只在本页计算。
 */

const SITE_LANE_PREFIX = 'site:';

interface SiteLaneOptions {
  minIntervalMs: number;
  tripAfter: number;
  cooldownMs: number;
}

const DEFAULT_SITE_LANE: SiteLaneOptions = {
  minIntervalMs: 1_000,
  tripAfter: 3,
  cooldownMs: 5 * 60_000,
};

export function createSiteLanePolicy(
  options: Partial<SiteLaneOptions> & { crossTab?: CrossTabLanes | undefined } = {},
): LanePolicy {
  const { minIntervalMs, tripAfter, cooldownMs, crossTab } = { ...DEFAULT_SITE_LANE, ...options };
  return {
    concurrency: 1,
    minIntervalMs,
    ...(crossTab && { crossTab }),
    breaker: {
      tripAfter,
      cooldownMs,
      isRefusal: isSiteRefusal,
      trippedError: (lane, remainingMs) =>
        new SiteRateLimitedError(
          lane.slice(SITE_LANE_PREFIX.length),
          Math.ceil(remainingMs / 60_000),
          isElectron(),
        ),
    },
  };
}

/** 按目标主机名划分 lane（与经过哪个代理无关：被限流的是目标站看到的出口 IP） */
export function siteLane(url: string): string {
  try {
    return `${SITE_LANE_PREFIX}${new URL(url).hostname || 'unknown'}`;
  } catch {
    return `${SITE_LANE_PREFIX}unknown`;
  }
}

networkQueue.define(
  SITE_LANE_PREFIX,
  createSiteLanePolicy(isElectron() ? {} : { crossTab: createCrossTabLanes() }),
);

/** 经目标站点的 lane 发送一次请求 */
export function runSiteRequest<T>(
  url: string,
  request: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return networkQueue.run(siteLane(url), request, signal);
}
