import { describe, expect, it, vi } from 'vitest';
import {
  claimSingleInstance,
  type SingleInstanceApp,
  type SingleInstanceWindow,
} from '../../src-electron/single-instance';

function createFakeApp(gotLock: boolean) {
  const listeners = new Map<string, () => void>();
  const quit = vi.fn();
  const on = vi.fn((event: 'second-instance', listener: () => void) => {
    listeners.set(event, listener);
  });
  const app: SingleInstanceApp = { requestSingleInstanceLock: () => gotLock, quit, on };
  return { app, quit, on, emitSecondInstance: () => listeners.get('second-instance')?.() };
}

function createFakeWindow(state: { minimized?: boolean; destroyed?: boolean } = {}) {
  const spies = { restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
  const window: SingleInstanceWindow = {
    isDestroyed: () => state.destroyed ?? false,
    isMinimized: () => state.minimized ?? false,
    ...spies,
  };
  return { window, ...spies };
}

describe('claimSingleInstance', () => {
  it('未取得单实例锁时退出当前进程且不注册唤醒监听', () => {
    const { app, quit, on } = createFakeApp(false);
    const createWindow = vi.fn();

    const isPrimary = claimSingleInstance(app, { getWindow: () => null, createWindow });

    expect(isPrimary).toBe(false);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(on).not.toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('取得单实例锁时继续启动并监听第二实例', () => {
    const { app, quit, on } = createFakeApp(true);

    const isPrimary = claimSingleInstance(app, {
      getWindow: () => null,
      createWindow: vi.fn(),
    });

    expect(isPrimary).toBe(true);
    expect(quit).not.toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith('second-instance', expect.any(Function));
  });

  it('第二实例启动时还原并聚焦最小化的现有工作台', () => {
    const { app, emitSecondInstance } = createFakeApp(true);
    const { window, restore, show, focus } = createFakeWindow({ minimized: true });
    const createWindow = vi.fn();
    claimSingleInstance(app, { getWindow: () => window, createWindow });

    emitSecondInstance();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('现有工作台未最小化时只显示并聚焦，不调用还原', () => {
    const { app, emitSecondInstance } = createFakeApp(true);
    const { window, restore, show, focus } = createFakeWindow();
    claimSingleInstance(app, { getWindow: () => window, createWindow: vi.fn() });

    emitSecondInstance();

    expect(restore).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('工作台已关闭或已销毁时由主实例重新创建，而不是另起进程', () => {
    const { app, emitSecondInstance } = createFakeApp(true);
    const { window: destroyed, focus } = createFakeWindow({ destroyed: true });
    let current: SingleInstanceWindow | null = null;
    const createWindow = vi.fn();
    claimSingleInstance(app, { getWindow: () => current, createWindow });

    emitSecondInstance();
    current = destroyed;
    emitSecondInstance();

    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(focus).not.toHaveBeenCalled();
  });
});
