import { describe, expect, it, vi } from 'vitest';
import {
  isExternalUrl,
  routeNewWindowsToSystemBrowser,
  type WindowOpenHandler,
} from '../../src-electron/external-links';

function setup(openExternal = vi.fn(() => Promise.resolve())) {
  let handler: WindowOpenHandler | undefined;
  const webContents = {
    setWindowOpenHandler: vi.fn((h: WindowOpenHandler) => {
      handler = h;
    }),
  };
  routeNewWindowsToSystemBrowser(webContents, openExternal);
  return { webContents, openExternal, open: (url: string) => handler!({ url }) };
}

describe('isExternalUrl', () => {
  it('http / https / mailto 视为外部链接', () => {
    expect(isExternalUrl('https://github.com/rozx/Tsukuyomi/issues/new?body=a%20b')).toBe(true);
    expect(isExternalUrl('http://example.com')).toBe(true);
    expect(isExternalUrl('mailto:someone@example.com')).toBe(true);
  });

  it('本地文件、脚本、自定义协议与非法地址不交给系统打开', () => {
    expect(isExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('smb://host/share')).toBe(false);
    expect(isExternalUrl('about:blank')).toBe(false);
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl('not a url')).toBe(false);
  });
});

describe('routeNewWindowsToSystemBrowser', () => {
  it('注册新窗口拦截', () => {
    const { webContents } = setup();
    expect(webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
  });

  it('外部链接交给系统默认浏览器打开，且不创建应用内窗口', () => {
    const { open, openExternal } = setup();
    const url = 'https://github.com/rozx/Tsukuyomi';
    expect(open(url)).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it('非外部链接直接拒绝，不调用系统打开', () => {
    const { open, openExternal } = setup();
    expect(open('file:///C:/Windows/System32/calc.exe')).toEqual({ action: 'deny' });
    expect(open('about:blank')).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('系统打开失败时只记录警告，不抛出未处理的 Promise 拒绝', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { open } = setup(vi.fn(() => Promise.reject(new Error('no handler'))));
    expect(open('https://example.com')).toEqual({ action: 'deny' });
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
