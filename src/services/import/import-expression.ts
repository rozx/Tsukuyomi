import { importError } from './import-error';
import type { ImportTextPattern } from 'src/models/import-pattern';

export function importExpression(input: ImportTextPattern): RegExp {
  const { mode, pattern, flags = '' } = input;
  if (
    !['literal', 'regex'].includes(mode) ||
    typeof pattern !== 'string' ||
    !pattern.length ||
    pattern.length > 1000
  )
    throw importError('INVALID_PATTERN', 'invalidPatternPatternsMustContainCharacters', {});
  if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length)
    throw importError('INVALID_PATTERN', 'invalidPatternFlagsSupportOnlyGIM', {});
  const source = mode === 'literal' ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
  try {
    // 全部批量操作默认全局匹配，Unicode 模式避免拆开代理对。
    return new RegExp(source, [...new Set(`${flags}gu`)].join(''));
  } catch {
    throw importError('INVALID_PATTERN', 'invalidPatternInvalidRegularExpression', {});
  }
}
