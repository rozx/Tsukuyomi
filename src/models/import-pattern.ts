/** 所有导入批量工具共用；正则不带 / 分隔符，flags 支持 g、i、m、s、u。 */
export interface ImportTextPattern {
  mode: 'literal' | 'regex';
  pattern: string;
  flags?: string;
}

export interface ImportTextRange {
  start: number;
  end: number;
}
export interface ImportPatternJob {
  kind: 'pattern';
  texts: string[];
  pattern: ImportTextPattern;
  action: 'test' | 'remove_matches' | 'remove_lines' | 'replace';
  replacement?: string;
}
export interface ImportPatternResult {
  text: string;
  matches: number;
  ranges: ImportTextRange[];
}
export interface ImportSourceFilter {
  name?: ImportTextPattern;
  locator?: ImportTextPattern;
}
