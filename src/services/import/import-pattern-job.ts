import { importExpression } from './import-expression';
import { excludeImportText } from './import-content-exclusions';
import type {
  ImportPatternJob,
  ImportPatternResult,
  ImportTextRange,
} from 'src/models/import-pattern';
import { createImportWork } from './import-work-limits';
import type { ImportWorkOptions } from './import-work-limits';

function lineRange(text: string, start: number, end: number): ImportTextRange {
  if (text[start] === '\n' && text[start - 1] === '\r') start--;
  const from = Math.max(text.lastIndexOf('\n', start - 1), text.lastIndexOf('\r', start - 1)) + 1;
  const breaks = [text.indexOf('\n', end - 1), text.indexOf('\r', end - 1)].filter((i) => i >= 0);
  const newline = breaks.length ? Math.min(...breaks) : text.length;
  const width = text[newline] === '\r' && text[newline + 1] === '\n' ? 2 : 1;
  return { start: from, end: Math.min(text.length, newline + width) };
}

/** 仅在可终止的 Worker 中执行用户正则；字面量可在有界主线程回退。 */
export async function processImportPattern(
  input: ImportPatternJob,
  options: ImportWorkOptions,
): Promise<ImportPatternResult[]> {
  const work = createImportWork(options);
  const regex = importExpression(input.pattern);
  if (
    input.texts.length > 10000 ||
    input.texts.reduce((sum, text) => sum + text.length, 0) > work.limits.textCharacters
  )
    throw new Error('PROCESSING_LIMIT: 批量匹配文本过多，请缩小范围');
  const results: ImportPatternResult[] = [];
  for (const text of input.texts) {
    await work.checkpoint();
    regex.lastIndex = 0;
    if (input.action === 'test') {
      results.push({ text: '', matches: regex.test(text) ? 1 : 0, ranges: [] });
      continue;
    }
    const result = editText(input, regex, text);
    if (result.text.length > work.limits.textCharacters)
      throw new Error('PROCESSING_LIMIT: 替换结果过长');
    results.push(result);
  }
  return results;
}

function editText(input: ImportPatternJob, regex: RegExp, text: string): ImportPatternResult {
  const ranges: ImportTextRange[] = [];
  let matches = 0;
  for (const match of text.matchAll(regex)) {
    if (!match[0].length) throw new Error('EMPTY_MATCH: 编辑规则不能匹配空字符串');
    if (++matches > 10000) throw new Error('PROCESSING_LIMIT: 匹配次数超过上限');
    const range =
      input.action === 'remove_lines'
        ? lineRange(text, match.index, match.index + match[0].length)
        : { start: match.index, end: match.index + match[0].length };
    const last = ranges.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else ranges.push(range);
  }
  let result = '';
  if (input.action === 'replace') {
    if (typeof input.replacement !== 'string' || input.replacement.length > 500)
      throw new Error('INVALID_PATTERN: 标题替换文本不能超过 500 字符');
    result = text.replace(regex, input.replacement);
  } else {
    result = excludeImportText(text, ranges);
  }
  return { text: result, matches, ranges };
}
