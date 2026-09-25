/**
 * 远端章节正文的短期缓存（跨检查会话、仅内存）：同一配方、同一网址在 30 分钟内
 * 再次检查（重新检查、快速检查后深度检查、应用）时复用已抓取的正文，避免重复抓取与额度消耗。
 */

const TTL_MS = 30 * 60_000;

const entries = new Map<string, { paragraphs: string[]; at: number }>();

export function getCachedRemoteChapter(key: string): string[] | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  return hit.paragraphs;
}

export function setCachedRemoteChapter(key: string, paragraphs: string[]): void {
  entries.set(key, { paragraphs, at: Date.now() });
}

export function clearRemoteChapterCache(): void {
  entries.clear();
}
