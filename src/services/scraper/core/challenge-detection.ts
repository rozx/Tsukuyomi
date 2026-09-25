/**
 * 反爬质询页识别（保守）：只看 <title> 与质询专属脚本 / 容器标记，不看正文，
 * 避免把正文提到 "challenge" 的小说页误判而白白消耗 Firecrawl 额度。
 *
 * 注意：Cloudflare 会向普通页面注入 `/cdn-cgi/challenge-platform/scripts/jsd/main.js`，
 * 因此 `challenge-platform` 路径本身不能作为判定依据。
 */

const CHALLENGE_TITLES: readonly RegExp[] = [
  /^just a moment\.{0,3}$/i,
  /^attention required! \| cloudflare$/i,
  /^please wait\.{0,3} \| cloudflare$/i,
  /^しばらくお待ちください[.…]*$/,
];

const CHALLENGE_MARKERS: readonly RegExp[] = [
  /window\._cf_chl_opt\s*=/,
  /id=["']cf-browser-verification["']/,
];

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? '';
}

export function isChallengePage(html: string): boolean {
  if (!html) return false;
  const title = extractTitle(html);
  if (title && CHALLENGE_TITLES.some((pattern) => pattern.test(title))) return true;
  return CHALLENGE_MARKERS.some((pattern) => pattern.test(html));
}
