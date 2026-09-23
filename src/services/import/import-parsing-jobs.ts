import { parseImportStructure } from './import-structure-parser';
import { mergeImportRanges } from './import-content-exclusions';
import { processImportPattern } from './import-pattern-job';
import type {
  ImportParsedContent,
  ImportParseRequest,
  ImportParseResponse,
} from 'src/models/import-parsing';
import type { ImportExtractionRules } from 'src/models/import';
import { createImportWork } from './import-work-limits';
import type { ImportWorkOptions } from './import-work-limits';
import { decodeImportText, parseImportMarkdown, parseImportText } from './import-text-parser';
import { parseImportHtml } from './import-html-parser';
import { parseImportEpub } from './import-epub-parser';
import { matchImportParagraphs } from './import-paragraph-matching';

function validateRange(text: string, start: number, end: number): void {
  const splitsSurrogate = (position: number) =>
    position > 0 &&
    /[\ud800-\udbff]/u.test(text[position - 1]!) &&
    /[\udc00-\udfff]/u.test(text[position] ?? '');
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end > text.length ||
    end <= start ||
    splitsSurrogate(start) ||
    splitsSurrogate(end)
  )
    throw new Error('INVALID_RANGE: 范围越界或拆开了字符');
}

function selectedRanges(
  text: string,
  rules: ImportExtractionRules,
): { start: number; end: number }[] {
  const ranges = rules.ranges ?? (text.length ? [{ start: 0, end: text.length }] : []);
  let previousEnd = -1;
  for (const range of ranges) {
    validateRange(text, range.start, range.end);
    if (range.start < previousEnd) throw new Error('INVALID_RANGE: 选择范围重叠或顺序无效');
    previousEnd = range.end;
  }
  for (const range of rules.excludeRanges ?? []) validateRange(text, range.start, range.end);
  return ranges;
}

type Range = { start: number; end: number };

function firstOverlap(ranges: Range[], start: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ranges[middle]!.end <= start) low = middle + 1;
    else high = middle;
  }
  return low;
}

function retainedRanges(start: number, end: number, exclusions: Range[]): Range[] {
  const kept: Range[] = [];
  let cursor = start;
  for (
    let index = firstOverlap(exclusions, start);
    index < exclusions.length && exclusions[index]!.start < end;
    index++
  ) {
    const range = exclusions[index]!;
    if (range.start > cursor) kept.push({ start: cursor, end: Math.min(end, range.start) });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < end) kept.push({ start: cursor, end });
  return kept;
}

function applyRanges(text: string, parsed: ImportParsedContent): ImportParsedContent {
  const ranges = selectedRanges(text, parsed.rules);
  const exclusions = parsed.rules.excludeRanges ?? [];
  const excludedRanges = mergeImportRanges(exclusions);
  const blocks: ImportParsedContent['blocks'] = [];
  for (const block of parsed.blocks) {
    for (
      let index = firstOverlap(ranges, block.start);
      index < ranges.length && ranges[index]!.start < block.end;
      index++
    ) {
      const range = ranges[index]!;
      const start = Math.max(block.start, range.start);
      const end = Math.min(block.end, range.end);
      const pieces = retainedRanges(start, end, excludedRanges);
      for (const piece of pieces) {
        if (parsed.format === 'html' && (piece.start !== block.start || piece.end !== block.end))
          throw new Error(
            'INVALID_RANGE: HTML 范围须覆盖完整正文块；块内切分请使用提取后的内容引用',
          );
        const value = parsed.format === 'html' ? block.text : text.slice(piece.start, piece.end);
        blocks.push({
          ...block,
          ...piece,
          text: value,
          kind: value.trim() ? block.kind : 'whitespace',
        });
      }
    }
  }
  return {
    ...parsed,
    blocks,
    excluded: [
      ...parsed.excluded,
      ...exclusions.map((range) => ({ ...range, text: text.slice(range.start, range.end) })),
    ],
    kind:
      parsed.kind === 'content' &&
      !blocks.some(
        (block) => block.text.trim() && !['metadata', 'heading', 'whitespace'].includes(block.kind),
      )
        ? 'empty'
        : parsed.kind,
  };
}

export async function processImportJob<T extends ImportParseRequest>(
  request: T,
  options: ImportWorkOptions = {},
): Promise<ImportParseResponse<T>> {
  const work = createImportWork(options);
  await work.checkpoint(true);
  if (request.kind === 'structure') {
    if (request.text.length > work.limits.textCharacters)
      throw new Error('PROCESSING_LIMIT: 拆章文本超过上限');
    const structure = parseImportStructure(request);
    await work.checkpoint(true);
    return structure as ImportParseResponse<T>;
  }
  if (request.kind === 'pattern')
    return (await processImportPattern(request, options)) as ImportParseResponse<T>;
  if (request.kind === 'match')
    return (await matchImportParagraphs(request.input, options)) as ImportParseResponse<T>;
  if ('bytes' in request && request.bytes.byteLength > work.limits.inputBytes)
    throw new Error('PROCESSING_LIMIT: 输入超过当前解析环境的上限');
  if (request.kind === 'epub')
    return (await parseImportEpub(request.bytes, options)) as ImportParseResponse<T>;
  if (request.kind === 'decode') {
    const decoded = decodeImportText(request.bytes, request.encoding);
    work.check();
    if (decoded.text.length > work.limits.textCharacters)
      throw new Error('PROCESSING_LIMIT: 解码文本超过上限');
    return decoded as ImportParseResponse<T>;
  }
  if (request.text.length > work.limits.textCharacters)
    throw new Error('PROCESSING_LIMIT: 文本超过当前解析环境的上限');
  const rules = request.rules ?? {};
  const parsed: ImportParsedContent =
    request.format === 'html'
      ? parseImportHtml(request.text, rules, request.baseUrl)
      : {
          format: request.format,
          kind: 'content',
          rules,
          blocks:
            request.format === 'markdown'
              ? parseImportMarkdown(request.text)
              : parseImportText(request.text),
          excluded: [],
          metadata: {},
          links: [],
          warnings: [],
        };
  const result = applyRanges(request.text, parsed);
  await work.checkpoint(true);
  return result as ImportParseResponse<T>;
}
