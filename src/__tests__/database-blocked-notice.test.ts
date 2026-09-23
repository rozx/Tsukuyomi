import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchDatabaseBlocked } from 'src/composables/useDatabaseBlockedNotice';

describe('watchDatabaseBlocked', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('升级被阻塞时只提示一次，解除后提示恢复并停止检查', () => {
    let blocked = false;
    const notify = vi.fn();
    watchDatabaseBlocked(() => blocked, notify, 1000);

    vi.advanceTimersByTime(1000);
    expect(notify).not.toHaveBeenCalled();

    blocked = true;
    vi.advanceTimersByTime(3000);
    expect(notify.mock.calls).toEqual([['blocked']]);

    blocked = false;
    vi.advanceTimersByTime(1000);
    expect(notify.mock.calls).toEqual([['blocked'], ['resolved']]);

    blocked = true;
    vi.advanceTimersByTime(5000);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('已提示阻塞后在下次检查前停止，补发恢复提示且只发一次', () => {
    let blocked = true;
    const notify = vi.fn();
    const stop = watchDatabaseBlocked(() => blocked, notify, 1000);
    vi.advanceTimersByTime(1000);
    blocked = false;
    stop();
    stop();
    vi.advanceTimersByTime(5000);
    expect(notify.mock.calls).toEqual([['blocked'], ['resolved']]);
  });

  it('停止后不再检查，从未阻塞时不提示恢复', () => {
    let blocked = false;
    const notify = vi.fn();
    const stop = watchDatabaseBlocked(() => blocked, notify, 1000);
    vi.advanceTimersByTime(2000);
    stop();
    blocked = true;
    vi.advanceTimersByTime(5000);
    expect(notify).not.toHaveBeenCalled();
  });
});
