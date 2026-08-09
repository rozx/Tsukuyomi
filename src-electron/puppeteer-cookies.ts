export type PuppeteerCookieParam = {
  name: string;
  value: string;
  url: string;
};

/**
 * 将 HTTP Cookie 头解析为 Puppeteer page.setCookie() 参数。
 * Puppeteer 禁止通过 setExtraHTTPHeaders 发送 Cookie，必须单独设置。
 * targetUrl 非法时返回空数组（与 getFetchExtraHeaders 等同类函数的防御风格一致）。
 */
export function parseCookieHeader(cookieHeader: string, targetUrl: string): PuppeteerCookieParam[] {
  let cookieUrl: string;
  try {
    const base = new URL(targetUrl);
    cookieUrl = `${base.protocol}//${base.host}/`;
  } catch {
    return [];
  }

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

/** 大小写无关地读取请求头中的 Cookie 值（HTTP 头名不区分大小写） */
export function getCookieHeaderValue(
  headers: Record<string, string> | undefined,
): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'cookie') return value;
  }
  return undefined;
}

/** 从请求头中大小写无关地移除 Cookie（改由 page.setCookie 处理） */
export function omitCookieHeader(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'cookie'),
  );
}
