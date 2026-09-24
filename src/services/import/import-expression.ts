import type { ImportTextPattern } from 'src/models/import-pattern';

export function importExpression(input: ImportTextPattern): RegExp {
  const { mode, pattern, flags = '' } = input;
  if (
    !['literal', 'regex'].includes(mode) ||
    typeof pattern !== 'string' ||
    !pattern.length ||
    pattern.length > 1000
  )
    throw new Error('INVALID_PATTERN: 匹配规则须为 1–1000 字符');
  if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length)
    throw new Error('INVALID_PATTERN: flags 仅支持 g、i、m、s、u，不能重复');
  const source = mode === 'literal' ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
  try {
    // 全部批量操作默认全局匹配，Unicode 模式避免拆开代理对。
    return new RegExp(source, [...new Set(`${flags}gu`)].join(''));
  } catch {
    throw new Error('INVALID_PATTERN: 正则表达式无效');
  }
}
