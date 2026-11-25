import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelayLinkStatus } from 'src/services/agent-mcp/relay-link';
import { createRelayLinkMonitor } from 'src/services/agent-mcp/relay-monitor';

const NOT_FOUND: RelayLinkStatus = { state: 'not-found', port: null };
const NOT_LINKED: RelayLinkStatus = { state: 'not-linked', port: 9333 };
const CONNECTED: RelayLinkStatus = { state: 'connected', port: 9333 };

describe('中继连接监视：发现中继出现时叫醒页面上的中继组件', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: RelayLinkStatus = NOT_FOUND) {
    const probe = { status: initial };
    const wake = vi.fn();
    const changes: Array<RelayLinkStatus | null> = [];
    const check = vi.fn(() => Promise.resolve({ ...probe.status }));
    const monitor = createRelayLinkMonitor({
      origin: 'https://app.example',
      storage: { getItem: () => null },
      wake,
      onChange: (status) => changes.push(status),
      check,
    });
    return { probe, wake, changes, check, monitor };
  }

  it('开始后先等中继组件自己连接，再做第一次检查，之后定时复查', async () => {
    const { check, changes, monitor } = setup();
    monitor.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ origin: 'https://app.example' }));
    expect(changes).toEqual([NOT_FOUND]);

    await vi.advanceTimersByTimeAsync(15000);
    expect(check).toHaveBeenCalledTimes(2);
    // 重复开始不会多挂一组定时器
    monitor.start();
    await vi.advanceTimersByTimeAsync(15000);
    expect(check).toHaveBeenCalledTimes(3);
    monitor.stop();
  });

  it('页面开着、中继后来才启动：一发现中继就叫醒组件，不用等它自己两分钟后再探测', async () => {
    const { probe, wake, changes, monitor } = setup();
    monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(wake).not.toHaveBeenCalled();

    // Agent 客户端启动了中继，本页还没有接上
    probe.status = NOT_LINKED;
    await vi.advanceTimersByTimeAsync(15000);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(changes.at(-1)).toEqual(NOT_LINKED);

    // 接上之后中继一直在：不再重复叫醒
    probe.status = CONNECTED;
    await vi.advanceTimersByTimeAsync(45000);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(changes.at(-1)).toEqual(CONNECTED);
    monitor.stop();
  });

  it('中继停掉后重新启动时再叫醒一次；存储里留着上次的接入记录（看上去仍是已接入）也一样', async () => {
    const { probe, wake, monitor } = setup(CONNECTED);
    monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    // 第一次看到中继：组件已经连着时这条通知不起作用
    expect(wake).toHaveBeenCalledTimes(1);

    probe.status = NOT_FOUND;
    await vi.advanceTimersByTimeAsync(15000);
    probe.status = CONNECTED;
    await vi.advanceTimersByTimeAsync(15000);
    expect(wake).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('停止后不再检查，状态清空；停止时还没返回的检查结果作废', async () => {
    const wake = vi.fn();
    const changes: Array<RelayLinkStatus | null> = [];
    let finish: (status: RelayLinkStatus) => void = () => undefined;
    const check = vi.fn(
      () =>
        new Promise<RelayLinkStatus>((resolve) => {
          finish = resolve;
        }),
    );
    const monitor = createRelayLinkMonitor({
      origin: 'https://app.example',
      storage: { getItem: () => null },
      wake,
      onChange: (status) => changes.push(status),
      check,
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(check).toHaveBeenCalledTimes(1);

    monitor.stop();
    expect(changes).toEqual([null]);
    finish(NOT_LINKED);
    await vi.advanceTimersByTimeAsync(0);
    expect(wake).not.toHaveBeenCalled();
    expect(changes).toEqual([null]);

    await vi.advanceTimersByTimeAsync(60000);
    expect(check).toHaveBeenCalledTimes(1);
    // 没有开始时停止不重复上报
    monitor.stop();
    expect(changes).toEqual([null]);
  });

  it('上一次检查还没结束时不再发起新的检查（探测被浏览器限流时一次可能要十来秒）', async () => {
    const wake = vi.fn();
    let finish: (status: RelayLinkStatus) => void = () => undefined;
    const check = vi.fn(
      () =>
        new Promise<RelayLinkStatus>((resolve) => {
          finish = resolve;
        }),
    );
    const changes: Array<RelayLinkStatus | null> = [];
    const monitor = createRelayLinkMonitor({
      origin: 'https://app.example',
      storage: { getItem: () => null },
      wake,
      onChange: (status) => changes.push(status),
      check,
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(check).toHaveBeenCalledTimes(1);
    // 到了下一次检查的时间，上一次还在等：不叠加
    await vi.advanceTimersByTimeAsync(15000);
    expect(check).toHaveBeenCalledTimes(1);
    // 手动「重新检查」等的是同一次检查的结果
    const manual = monitor.checkNow();
    expect(check).toHaveBeenCalledTimes(1);
    finish(NOT_LINKED);
    expect(await manual).toEqual(NOT_LINKED);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([NOT_LINKED]);

    // 结束之后照常进行下一次
    await vi.advanceTimersByTimeAsync(15000);
    expect(check).toHaveBeenCalledTimes(2);
    monitor.stop();
  });

  it('可以立即检查一次；没有在检查时不探测', async () => {
    const { probe, wake, check, monitor } = setup();
    expect(await monitor.checkNow()).toBeNull();
    expect(check).not.toHaveBeenCalled();

    monitor.start();
    probe.status = NOT_LINKED;
    expect(await monitor.checkNow()).toEqual(NOT_LINKED);
    expect(wake).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it('某一次探测出错不影响之后的检查', async () => {
    const { check, changes, monitor } = setup();
    check.mockRejectedValueOnce(new Error('probe failed'));
    monitor.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(15000);
    expect(changes).toEqual([NOT_FOUND]);
    monitor.stop();
  });
});
