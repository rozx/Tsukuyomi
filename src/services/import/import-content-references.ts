import { importError } from './import-error';
import { excludeImportText, mergeImportRanges } from './import-content-exclusions';
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
  if (ref.resourceId !== resource.id)
    throw importError(
      'INVALID_CONTENT_REF',
      'invalidContentRefTheExtractionResultDoesNotMatch',
      {},
    );
  if (
    !ref.blockId &&
    (ref.endBlockId !== undefined || ref.start !== undefined || ref.end !== undefined)
  )
    throw importError('INVALID_RANGE', 'invalidRangeBlockOffsetsRequireAStartingBlock', {});
  const first = ref.blockId ? resource.blocks.findIndex((block) => block.id === ref.blockId) : 0;
  const last = ref.endBlockId
    ? resource.blocks.findIndex((block) => block.id === ref.endBlockId)
    : ref.blockId
      ? first
      : resource.blocks.length - 1;
  if (first < 0 || last < first)
    throw importError('INVALID_CONTENT_REF', 'invalidContentRefTheContentBlockIsMissingOr', {});
  const segments: ImportContentSegment[] = [];
  for (let index = first; index <= last; index++) {
    const block = resource.blocks[index]!;
    if (block.kind === 'metadata') {
      if (ref.blockId)
        throw importError('CONTENT_ROLE', 'contentRoleMetadataBlocksCannotBeNovelContent', {});
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
      throw importError('INVALID_RANGE', 'invalidRangeTheContentRangeIsOutOf', {});
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
    indexed.set(id, mergeImportRanges(ranges));
  }
  return indexed;
}

export function resolveImportText(resource: Extraction, ref: Reference): string {
  const text = resolveImportSegments(resource, ref)
    .map((segment) => segment.text)
    .join(resource.separator ?? '\n');
  return excludeImportText(text, ref.excludeRanges);
}
