/**
 * 远端章节正文的短期缓存（跨检查会话、仅内存）：同一配方、同一网址在 30 分钟内
 * 再次检查（重新检查、快速检查后深度检查、应用）时复用已抓取的正文，避免重复抓取与额度消耗。
 */

const TTL_MS = 30 * 60_000;
/** 容量上限：长时间运行时检查多本大书也不会无限增长（Map 保持插入顺序，超出时淘汰最早写入的） */
const MAX_ENTRIES = 500;

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
  const now = Date.now();
  // 写入时顺带清理过期条目：只访问过一次的章节不会永久留在内存中
  for (const [k, hit] of entries) {
    if (now - hit.at > TTL_MS) entries.delete(k);
  }
  entries.delete(key);
  entries.set(key, { paragraphs, at: now });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function remoteChapterCacheSize(): number {
  return entries.size;
}

export function clearRemoteChapterCache(): void {
  entries.clear();
}
