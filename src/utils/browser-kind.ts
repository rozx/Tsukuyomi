export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';

/**
 * 按 User-Agent 粗略区分浏览器，仅用于挑选对应的使用说明，不要用它做功能判断。
 * iOS 上的各家浏览器都是 Safari 内核，统一归为 safari；Opera 等其他 Chromium 浏览器归为 other。
 */
export function detectBrowserKind(userAgent: string): BrowserKind {
  if (/\b(CriOS|FxiOS|EdgiOS)\//.test(userAgent)) return 'safari';
  if (/\bEdg\//.test(userAgent)) return 'edge';
  if (/\b(OPR|Opera|Vivaldi|SamsungBrowser)\//.test(userAgent)) return 'other';
  if (/\bFirefox\//.test(userAgent)) return 'firefox';
  if (/\bChrome\//.test(userAgent)) return 'chrome';
  if (/\bSafari\//.test(userAgent)) return 'safari';
  return 'other';
}
