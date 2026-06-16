export type PuppeteerCookieParam = {
  name: string;
  value: string;
  url: string;
};

/**
 * 将 HTTP Cookie 头解析为 Puppeteer page.setCookie() 参数。
 * Puppeteer 禁止通过 setExtraHTTPHeaders 发送 Cookie，必须单独设置。
 */
export function parseCookieHeader(cookieHeader: string, targetUrl: string): PuppeteerCookieParam[] {
  const base = new URL(targetUrl);
  const cookieUrl = `${base.protocol}//${base.host}/`;

  return cookieHeader
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) return null;
      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!name) return null;
      return { name, value, url: cookieUrl };
    })
    .filter((cookie): cookie is PuppeteerCookieParam => cookie !== null);
}

/** 从请求头中移除 Cookie（改由 page.setCookie 处理） */
export function omitCookieHeader(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const result = { ...headers };
  delete result.Cookie;
  delete result.cookie;
  return result;
}
