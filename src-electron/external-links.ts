/**
 * 外部链接交给系统默认浏览器打开。
 *
 * Electron 默认会把 `target="_blank"` 链接 / `window.open` 开成新的应用内窗口：
 * 用户在里面没有登录态（如在 GitHub 提交 Issue、点 Star），也拿不到浏览器的书签与扩展。
 * 这里拒绝所有新窗口请求，http(s) / mailto 改由系统打开；
 * 其余协议（file:、javascript:、自定义协议等）一律丢弃，避免渲染内容借 openExternal 启动本地程序。
 */

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };

export interface WindowOpenWebContents {
  setWindowOpenHandler(handler: WindowOpenHandler): void;
}

export function isExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function routeNewWindowsToSystemBrowser(
  webContents: WindowOpenWebContents,
  openExternal: (url: string) => Promise<void>,
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      openExternal(url).catch((error: unknown) => {
        console.warn('[Electron] Failed to open external link:', url, error);
      });
    }
    return { action: 'deny' };
  });
}
