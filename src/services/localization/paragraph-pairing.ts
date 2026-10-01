import type { Paragraph } from 'src/models/novel';

/**
 * 同步合并与覆盖准备共用的段落配对规则：先按 id，找不到再按原文回退。
 *
 * 文本回退用于同段落在不同设备 ID 不同（例如重新抓取）的匹配。用 FIFO 队列而非单值映射——
 * 否则小说里常见的重复文本（分隔符、「……」、重复台词等）会让多个主方段落同时吃到同一个副方
 * 段落。每条文本按顺序只消费一次；按主方段落顺序逐个调用 `match`，结果是确定的。
 *
 * 返回的副方段落原文可能与主方不同（id 相同但一方修订过原文），由调用方决定如何处理。
 */
export function createParagraphMatcher(secondary: readonly Paragraph[]) {
  const byId = new Map<string, Paragraph>();
  for (const paragraph of secondary) byId.set(paragraph.id, paragraph);
  const byText = new Map<string, Paragraph[]>();
  for (const paragraph of secondary) {
    const queue = byText.get(paragraph.text);
    if (queue) queue.push(paragraph);
    else byText.set(paragraph.text, [paragraph]);
  }
  const consumed = new Set<string>();

  function match(primary: Paragraph): Paragraph | undefined {
    let found = byId.get(primary.id);
    if (!found) {
      const queue = byText.get(primary.text);
      // 队列里可能放着已经通过 id 匹配被消费过的段落；跳过它们，保证不被双重消费
      while (queue && queue.length > 0) {
        const candidate = queue.shift();
        if (candidate && !consumed.has(candidate.id)) {
          found = candidate;
          break;
        }
      }
    }
    if (found) consumed.add(found.id);
    return found;
  }

  return { match, consumed };
}
