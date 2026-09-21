import type { ImportContentRef, ImportResource, ImportTextBlock } from 'src/models/import';

type Extraction = Extract<ImportResource, { kind: 'extraction' }>;
type Reference = Extract<ImportContentRef, { kind: 'extraction' }>;
export interface ImportContentSegment {
  block: ImportTextBlock;
  ref: Reference;
  text: string;
}

/** 整份结果、连续块或块内范围共用同一种原文引用，不接收模型生成的正文。 */
export function resolveImportSegments(
  resource: Extraction,
  ref: Reference,
): ImportContentSegment[] {
  if (ref.resourceId !== resource.id) throw new Error('INVALID_CONTENT_REF: 提取结果不匹配');
  if (
    !ref.blockId &&
    (ref.endBlockId !== undefined || ref.start !== undefined || ref.end !== undefined)
  )
    throw new Error('INVALID_RANGE: 块内偏移必须指定起始块');
  const first = ref.blockId ? resource.blocks.findIndex((block) => block.id === ref.blockId) : 0;
  const last = ref.endBlockId
    ? resource.blocks.findIndex((block) => block.id === ref.endBlockId)
    : ref.blockId
      ? first
      : resource.blocks.length - 1;
  if (first < 0 || last < first) throw new Error('INVALID_CONTENT_REF: 正文块不存在或顺序无效');
  const segments: ImportContentSegment[] = [];
  for (let index = first; index <= last; index++) {
    const block = resource.blocks[index]!;
    if (block.kind === 'metadata') {
      if (ref.blockId) throw new Error('CONTENT_ROLE: 元信息块不能作为正文');
      continue;
    }
    const start = index === first ? (ref.start ?? 0) : 0;
    const end = index === last ? (ref.end ?? block.text.length) : block.text.length;
    const splits = (position: number) =>
      position > 0 &&
      /[\ud800-\udbff]/u.test(block.text[position - 1]!) &&
      /[\udc00-\udfff]/u.test(block.text[position] ?? '');
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > block.text.length ||
      splits(start) ||
      splits(end)
    )
      throw new Error('INVALID_RANGE: 正文范围越界或拆开了字符');
    segments.push({
      block,
      ref: { kind: 'extraction', resourceId: resource.id, blockId: block.id, start, end },
      text: block.text.slice(start, end),
    });
  }
  return segments;
}

export function indexImportReferenceRanges(
  resource: Extraction,
  refs: ImportContentRef[],
): Map<string, { start: number; end: number }[]> {
  const indexed = new Map<string, { start: number; end: number }[]>();
  for (const ref of refs) {
    if (ref.kind !== 'extraction' || ref.resourceId !== resource.id) continue;
    for (const segment of resolveImportSegments(resource, ref)) {
      const ranges = indexed.get(segment.block.id) ?? [];
      ranges.push({ start: segment.ref.start!, end: segment.ref.end! });
      indexed.set(segment.block.id, ranges);
    }
  }
  for (const [id, ranges] of indexed) {
    const merged: { start: number; end: number }[] = [];
    for (const range of ranges.sort((a, b) => a.start - b.start)) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push(range);
    }
    indexed.set(id, merged);
  }
  return indexed;
}
