import { describe, expect, it } from 'vitest';
import './setup';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
// 只传卷章对象时标题固定按简中槽解析；调用方必须同时传入所属书籍（及执行语言）
const BARE_CALL =
  /\b(getChapterDisplayTitle|getVolumeDisplayTitle)\(\s*[^,()]+(?:\([^()]*\))?[^,()]*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

describe('卷章展示标题必须带书籍上下文', () => {
  it('源码中没有只传卷章对象的 getChapterDisplayTitle / getVolumeDisplayTitle 调用', () => {
    const bare = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(BARE_CALL)].map(
        (match) => `${relative(SRC, file)}: ${match[0]}`,
      ),
    );
    expect(bare).toEqual([]);
  });
});
