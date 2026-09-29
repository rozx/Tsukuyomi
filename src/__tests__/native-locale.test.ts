import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { registerNativeLocale } from '../../src-electron/native-locale';
import { nativeText } from '../../src-electron/native-text';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), changed: vi.fn() }));
vi.mock('electron', () => ({
  app: { isPackaged: true, getPreferredSystemLanguages: () => ['en-GB'] },
  ipcMain: { handle: mocks.handle },
}));

describe('桌面语言 IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('启动按系统语言，只有主窗口顶层页面可提交有效语言', () => {
    const frame = { url: 'file:///app/index.html' };
    const contents = { mainFrame: frame };
    const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
    registerNativeLocale(() => window, mocks.changed);
    const handler = mocks.handle.mock.calls.find(
      ([key]) => key === 'interface-locale:set',
    )?.[1] as (event: IpcMainInvokeEvent, value: unknown) => void;
    const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
    expect(nativeText('native.file')).toBe('File');
    expect(() => handler({ ...event, sender: {} } as IpcMainInvokeEvent, 'zh-TW')).toThrow();
    expect(() => handler(event, 'fr-FR')).toThrow();
    expect(nativeText('native.file')).toBe('File');
    handler(event, 'zh-TW');
    expect(nativeText('native.file')).toBe('檔案');
    expect(mocks.changed).toHaveBeenCalledTimes(1);
  });
});
