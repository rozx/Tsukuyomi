import type { Chapter, Paragraph, Volume } from 'src/models/novel';

/**
 * 同步合并与覆盖准备共用的配对规则：先按 id，找不到再按跨设备稳定的键回退（卷：原文标题；
 * 章节：webUrl；段落：原文）。两台设备各自抓取同一内容会生成不同 id，稳定键才能把它们对上。
 *
 * - 已与某个主方同 id 的副方不进回退索引，先为全部主方预留精确 id 配对，避免排在前面的
 *   新 id 主方按键回退时抢走它，导致同一副方被配对两次。
 * - 回退用 FIFO 队列：小说里常见的重复原文（分隔符、「……」、重复台词等）按顺序各消费一次。
 * - 键为 undefined 的项不参与回退。
 *
 * 返回与主方等长的配对数组（同 id 配对时双方内容可能不同，由调用方决定如何处理）以及
 * 已消费的副方 id。
 */
export function pairByIdThenKey<T extends { id: string }>(
  primary: readonly T[],
  secondary: readonly T[],
  key: (value: T) => string | undefined,
): { pairs: (T | undefined)[]; consumed: Set<string> } {
  const primaryIds = new Set(primary.map((value) => value.id));
  const byId = new Map<string, T>();
  const byKey = new Map<string, T[]>();
  for (const value of secondary) {
    byId.set(value.id, value);
    const stable = key(value);
    if (stable === undefined || primaryIds.has(value.id)) continue;
    const queue = byKey.get(stable);
    if (queue) queue.push(value);
    else byKey.set(stable, [value]);
  }
  const consumed = new Set<string>();
  const pairs = primary.map((value) => {
    let found = byId.get(value.id);
    const stable = found ? undefined : key(value);
    const queue = stable === undefined ? undefined : byKey.get(stable);
    while (!found && queue?.length) {
      const candidate = queue.shift()!;
      if (!consumed.has(candidate.id)) found = candidate;
    }
    if (found) consumed.add(found.id);
    return found;
  });
  return { pairs, consumed };
}

export function volumePairKey(volume: Volume): string {
  return typeof volume.title === 'string' ? volume.title : (volume.title?.original ?? '');
}

export function chapterPairKey(chapter: Chapter): string | undefined {
  return chapter.webUrl || undefined;
}

export function paragraphPairKey(paragraph: Paragraph): string {
  return paragraph.text;
}
