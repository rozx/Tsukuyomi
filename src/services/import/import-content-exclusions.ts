import type { ImportTextRange } from 'src/models/import-pattern';

/** 排除位置相对于该引用原本解析出的文本，保持原资源与原文位置可追溯。 */
export function retainedImportRanges(
  text: string,
  exclusions: ImportTextRange[] = [],
): ImportTextRange[] {
  if (!Array.isArray(exclusions) || exclusions.length > 10000)
    throw new Error('INVALID_RANGE: 排除范围数量无效');
  const kept: ImportTextRange[] = [];
  let cursor = 0;
  const splits = (i: number) =>
    i > 0 && /[\ud800-\udbff]/u.test(text[i - 1]!) && /[\udc00-\udfff]/u.test(text[i] ?? '');
  for (const range of exclusions) {
    if (
      !range ||
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < cursor ||
      range.end <= range.start ||
      range.end > text.length ||
      splits(range.start) ||
      splits(range.end)
    )
      throw new Error('INVALID_RANGE: 排除范围越界、重叠或拆开了字符');
    if (range.start > cursor) kept.push({ start: cursor, end: range.start });
    cursor = range.end;
  }
  if (cursor < text.length) kept.push({ start: cursor, end: text.length });
  return kept;
}

export function excludeImportText(text: string, exclusions?: ImportTextRange[]): string {
  return retainedImportRanges(text, exclusions)
    .map(({ start, end }) => text.slice(start, end))
    .join('');
}

/** 将本轮可见文本中的排除位置映射回原文，连续清理不会漂移。 */
export function extendImportExclusions(
  text: string,
  previous: ImportTextRange[] | undefined,
  added: ImportTextRange[],
): ImportTextRange[] {
  const kept = retainedImportRanges(text, previous);
  retainedImportRanges(kept.map((r) => text.slice(r.start, r.end)).join(''), added);
  const ranges = [...(previous ?? [])];
  let offset = 0;
  for (const segment of kept) {
    const length = segment.end - segment.start;
    for (const range of added) {
      const start = Math.max(offset, range.start);
      const end = Math.min(offset + length, range.end);
      if (start < end)
        ranges.push({ start: segment.start + start - offset, end: segment.start + end - offset });
    }
    offset += length;
  }
  return mergeImportRanges(ranges);
}

export function mergeImportRanges(ranges: ImportTextRange[]): ImportTextRange[] {
  const merged: ImportTextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
