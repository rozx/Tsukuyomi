import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import type { BrowserWindow } from 'electron';
import { registerDesktopUpdates } from '../../src-electron/desktop-update-ipc';

const mocks = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, callback: (event: unknown) => Promise<unknown>) => void>(),
  on: vi.fn<(channel: string, callback: (event: unknown, value: unknown) => void) => void>(),
  removeListener: vi.fn(),
  quit: vi.fn(),
  once: vi.fn<(event: string, callback: () => void) => void>(),
  install: vi.fn(),
  send: vi.fn(),
  environment: { isPackaged: true },
}));
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.environment.isPackaged;
    },
    getVersion: () => '0.16.0',
    once: mocks.once,
    quit: mocks.quit,
  },
  dialog: { showMessageBox: () => Promise.resolve({ response: 1 }) },
  ipcMain: { handle: mocks.handle, on: mocks.on, removeListener: mocks.removeListener },
}));
vi.mock('velopack', () => ({
  GithubSource: class {},
  UpdateManager: class {
    getCurrentVersion() {
      return '0.16.0';
    }
    checkForUpdatesAsync() {
      return Promise.resolve({ TargetFullRelease: { Version: '0.16.1' } });
    }
    downloadUpdateAsync() {
      return Promise.resolve();
    }
    waitExitThenApplyUpdate = mocks.install;
  },
}));

function fixture(url = 'file:///app/index.html') {
  const frame = { url };
  const contents = { mainFrame: frame, send: mocks.send };
  const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
  registerDesktopUpdates(() => window);
  const event = { sender: contents, senderFrame: frame };
  const invoke = (action: string, sender: unknown = event) => {
    const callback = mocks.handle.mock.calls.find(
      ([name]) => name === `desktop-update:${action}`,
    )?.[1];
    if (!callback) throw new Error('缺少 IPC handler');
    return callback(sender);
  };
  return { event, invoke };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.environment.isPackaged = true;
  vi.useFakeTimers();
});
afterEach(() => {
  mocks.once.mock.calls.find(([event]) => event === 'will-quit')?.[1]();
  vi.useRealTimers();
});

describe('更新 IPC 边界', () => {
  it('开发主窗口可读取不可更新状态，但不运行更新', async () => {
    mocks.environment.isPackaged = false;
    const { invoke } = fixture('http://localhost:9000/');
    await expect(invoke('getState')).resolves.toMatchObject({ phase: 'unavailable' });
    await invoke('check');
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it('拒绝子窗口和子 frame 请求', async () => {
    const { invoke, event } = fixture();
    await expect(invoke('check', { ...event, sender: {} })).rejects.toThrow('来源');
    await expect(
      invoke('restart', { ...event, senderFrame: { url: 'file:///app/index.html' } }),
    ).rejects.toThrow('来源');
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('无响应或过期准备回复不能安装，并通知界面恢复', async () => {
    const { invoke, event } = fixture();
    await invoke('check');
    const restart = invoke('restart');
    await vi.advanceTimersByTimeAsync(10_001);
    await restart;
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith('desktop-update:release', undefined);
    const callback = mocks.on.mock.calls.find(
      ([channel]) => channel === 'desktop-update:prepared',
    )?.[1];
    callback?.(event, { id: 'expired' });
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('只接受本次主窗口准备回复并安装已下载包', async () => {
    const { invoke, event } = fixture();
    await invoke('check');
    const restart = invoke('restart');
    await vi.advanceTimersByTimeAsync(0);
    const id: unknown = mocks.send.mock.calls.find(
      ([channel]) => channel === 'desktop-update:prepare',
    )?.[1];
    const callback = mocks.on.mock.calls.find(
      ([channel]) => channel === 'desktop-update:prepared',
    )?.[1];
    callback?.(event, { id });
    await restart;
    expect(mocks.install).toHaveBeenCalledTimes(1);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });
});
