import type { ImportContentRef, ImportResource } from 'src/models/import';
import type { ImportStructureResult } from 'src/models/import-text-structure';
import type { ImportTextRange } from 'src/models/import-pattern';

type Extraction = Extract<ImportResource, { kind: 'extraction' }>;

/** 以提取结果的块顺序定位，避免把拼接偏移错当成源文件偏移。 */
export function structureContent(resource: Extraction) {
  let position = 0;
  const blocks = resource.blocks.map((block) => {
    const start = position;
    position += block.text.length;
    return { block, start, end: position };
  });
  const text = resource.blocks.map((b) => b.text).join('');
  function slice(range: ImportTextRange) {
    const refs: ImportContentRef[] = [];
    const excluded: ImportStructureResult['excluded'] = [];
    let pending: Extract<ImportContentRef, { kind: 'extraction' }> | undefined;
    let original = '';
    let low = 0;
    let high = blocks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (blocks[middle]!.end <= range.start) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < blocks.length; index++) {
      const { block, start, end } = blocks[index]!;
      if (start >= range.end) break;
      const from = Math.max(start, range.start);
      const to = Math.min(end, range.end);
      if (block.kind === 'metadata') {
        if (pending) refs.push(pending);
        pending = undefined;
        excluded.push({ start: from, end: to, reason: 'Markdown 元信息定义' });
        continue;
      }
      original += block.text.slice(from - start, to - start);
      if (!pending)
        pending = {
          kind: 'extraction',
          resourceId: resource.id,
          blockId: block.id,
          start: from - start,
          end: to - start,
        };
      else {
        pending.endBlockId = block.id;
        pending.end = to - start;
      }
    }
    if (pending) refs.push(pending);
    return { refs, excluded, text: original };
  }
  return { text, slice };
}
