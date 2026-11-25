import { checkRelayLink, type RelayLinkStatus } from './relay-link';

/**
 * 浏览器端开启 WebMCP 期间，持续留意本机中继是否在运行，并在它出现时叫醒页面上的中继组件。
 *
 * 中继是 Agent 客户端启动的，常常比页面晚。随应用分发的中继组件连不上中继时只重试一分钟左右，
 * 之后进入休眠：每两分钟才探测一次，或者等用户切回这个标签页。结果是 Agent 启动后最长两分钟
 * 看不到页面，而用户回到页面（多半是去看「外部 Agent」页）时又恰好连上，像是只有那一页才有效。
 * 这里每隔一段时间自己探测一次，发现中继从无到有就通知组件立即重连，在哪个页面都一样。
 */

/** 开启后隔多久做第一次检查（给中继组件留出自己连接的时间），以及之后的复查间隔 */
const RELAY_LINK_FIRST_CHECK_MS = 2500;
const RELAY_LINK_POLL_MS = 15000;

export interface RelayLinkMonitor {
  /** 开始定时检查；已经在检查时不重复开始 */
  start: () => void;
  /** 停止检查并把状态清空 */
  stop: () => void;
  /** 立即检查一次；没有在检查（开关没开）时返回 null */
  checkNow: () => Promise<RelayLinkStatus | null>;
}

export interface CreateRelayLinkMonitorOptions {
  /** 页面来源，中继按它记录接入状态 */
  origin: string;
  storage: Pick<Storage, 'getItem'>;
  /** 通知中继组件立即重新寻找中继 */
  wake: () => void;
  /** 状态变化（含停止后的 null）；每次检查后都会调用 */
  onChange?: (status: RelayLinkStatus | null) => void;
  /** 探测中继的实现，测试时替换 */
  check?: typeof checkRelayLink;
}

export function createRelayLinkMonitor(options: CreateRelayLinkMonitorOptions): RelayLinkMonitor {
  const check = options.check ?? checkRelayLink;
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let running = false;
  /** 每次停止加一：检查途中发现它变了，说明结果已经过时 */
  let generation = 0;
  /** 上一次检查时中继是否在运行；只在「从无到有」时叫醒组件 */
  let relaySeen = false;

  const performCheck = async (): Promise<RelayLinkStatus | null> => {
    const startedAt = generation;
    const status = await check({ origin: options.origin, storage: options.storage });
    if (!running || startedAt !== generation) return null;
    const relayRunning = status.state !== 'not-found';
    // 组件已经连着时这条通知不起作用；它正在休眠或等待重试时会立即重新寻找中继
    if (relayRunning && !relaySeen) options.wake();
    relaySeen = relayRunning;
    options.onChange?.(status);
    return status;
  };

  /** 进行中的检查。探测被浏览器限流时一次可能要十来秒，期间再要检查就等这一次的结果 */
  let inFlight: Promise<RelayLinkStatus | null> | null = null;
  const runCheck = (): Promise<RelayLinkStatus | null> => {
    if (!running) return Promise.resolve(null);
    if (inFlight) return inFlight;
    const run = performCheck().finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  };

  const runScheduledCheck = (): void => {
    // 探测失败只是这一次没有结果，下一次照常检查
    void runCheck().catch(() => undefined);
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      timers = [
        setTimeout(runScheduledCheck, RELAY_LINK_FIRST_CHECK_MS),
        setInterval(runScheduledCheck, RELAY_LINK_POLL_MS),
      ];
    },
    stop: () => {
      if (!running) return;
      running = false;
      generation += 1;
      relaySeen = false;
      // 还没返回的检查已经作废，重新开始后不等它
      inFlight = null;
      for (const timer of timers) clearTimeout(timer);
      timers = [];
      options.onChange?.(null);
    },
    checkNow: runCheck,
  };
}
