import { importError } from './import-error';
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
      throw importError(
        'REGEX_INDICES_REQUIRED',
        'regexIndicesRequiredCaptureGroupPositionsAreUnsupportedSelect',
        {},
      );
    }
  }
  const match = regex.exec(text);
  if (!match || !match[0].length || regex.exec(text))
    throw importError('INVALID_SELECTION', 'invalidSelectionRangeMarkersMustEachMatchExactly', {});
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
      throw importError('INVALID_SELECTION', 'invalidSelectionBodyAndStartEndMarkersCannot', {});
    const match = uniqueMatch(text, selection.body, true);
    const range = match.indices?.groups?.body;
    if (!range)
      throw importError('INVALID_SELECTION', 'invalidSelectionThePatternRequiresANamedBody', {});
    [start, end] = range;
    if (start < match.index || end > match.index + match[0].length)
      throw importError('INVALID_SELECTION', 'invalidSelectionBodyMustLieInsideTheActual', {});
  } else {
    if (selection?.start) {
      const match = uniqueMatch(text, selection.start);
      start = match.index + match[0].length;
    }
    if (selection?.end) end = uniqueMatch(text, selection.end).index;
  }
  if (end <= start || !text.slice(start, end).trim())
    throw importError('INVALID_SELECTION', 'invalidSelectionTheBodyRangeIsEmptyOr', {});
  return { start, end };
}
