import type { ImportStructureRules } from 'src/models/import-text-structure';
import type { ImportTextPattern, ImportTextRange } from 'src/models/import-pattern';
import { importExpression } from './import-expression';

function uniqueMatch(text: string, pattern: ImportTextPattern, indices = false): RegExpExecArray {
  const expression = importExpression(pattern);
  let regex = expression;
  if (indices) {
    try {
      regex = new RegExp(expression.source, expression.flags + 'd');
    } catch {
      throw new Error(
        'REGEX_INDICES_REQUIRED: 当前环境不支持捕获组位置，请改用 start/end 标记选择正文',
      );
    }
  }
  const match = regex.exec(text);
  if (!match || !match[0].length || regex.exec(text))
    throw new Error('INVALID_SELECTION: 范围标记必须恰好命中一处非空文本');
  return match;
}

export function selectStructureRange(
  text: string,
  selection?: ImportStructureRules['selection'],
): ImportTextRange {
  let start = 0;
  let end = text.length;
  if (selection?.body) {
    if (selection.start || selection.end)
      throw new Error('INVALID_SELECTION: body 与起止标记不能同时使用');
    const match = uniqueMatch(text, selection.body, true);
    const range = match.indices?.groups?.body;
    if (!range) throw new Error('INVALID_SELECTION: 模式必须包含命名 body 捕获组');
    [start, end] = range;
    if (start < match.index || end > match.index + match[0].length)
      throw new Error('INVALID_SELECTION: body 必须位于实际命中范围内');
  } else {
    if (selection?.start) {
      const match = uniqueMatch(text, selection.start);
      start = match.index + match[0].length;
    }
    if (selection?.end) end = uniqueMatch(text, selection.end).index;
  }
  if (end <= start || !text.slice(start, end).trim())
    throw new Error('INVALID_SELECTION: 正文范围为空或起止顺序错误');
  return { start, end };
}
