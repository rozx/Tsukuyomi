import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import messages from '../i18n';

const SRC = join(process.cwd(), 'src');
// 只匹配字面量 key：t('a.b') / $t("a.b") / i18n.t(`a.b`)；动态拼接的 key 不在此检查范围
const KEY_CALL = /(?<![\w$.])(?:\$t|t)\(\s*(['"`])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ['__tests__', 'i18n'].includes(entry.name) ? [] : sourceFiles(path);
    return /\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

function resolve(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      catalog,
    );
}

describe('源码引用的界面文案 key', () => {
  it('每个字面量 t() key 在三种语言里都解析为字符串', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(KEY_CALL)) {
        const key = match[2]!;
        for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
          if (typeof resolve(messages[locale], key) !== 'string')
            missing.push(`${relative(SRC, file)}: ${key} (${locale})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
