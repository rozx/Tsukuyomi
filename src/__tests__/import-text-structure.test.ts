import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { processImportJob } from '../services/import/import-parsing-jobs';

afterEach(() => vi.unstubAllGlobals());

describe('文本结构预览', () => {
  it('正则一次拆卷拆章，保留卷首内容、独立相邻标题和末章原文', async () => {
    const text =
      '说明😀\r\n第1卷 春\r\n序言\r\n第1章 开始\r\n甲😀\r\n第2章 空\r\n第3章 末\r\n最后\r\n';
    const result = await processImportJob({
      kind: 'structure',
      text,
      format: 'text',
      rules: {
        mode: 'regex',
        chapter_pattern: { mode: 'regex', pattern: '^第\\d+章 (?<title>[^\\r\\n]+)', flags: 'm' },
        volume_pattern: { mode: 'regex', pattern: '^第\\d+卷 (?<title>[^\\r\\n]+)', flags: 'm' },
      },
    });
    expect(result.volumes.map((v) => v.title)).toEqual(['未分卷', '春']);
    expect(result.chapters.map((c) => c.title)).toEqual([
      '待归类内容',
      '待归类内容',
      '开始',
      '空',
      '末',
    ]);
    expect(result.chapters.map((c) => text.slice(c.start, c.end))).toEqual([
      '说明😀\r\n',
      '序言\r\n',
      '甲😀\r\n',
      '',
      '最后\r\n',
    ]);
    expect(result.chapters[3]?.warnings).toContain('章节正文为空');
    const spans = [...result.chapters, ...result.excluded]
      .filter((r) => r.end > r.start)
      .sort((a, b) => a.start - b.start);
    expect(spans[0]?.start).toBe(0);
    expect(spans.every((r, i) => !i || r.start === spans[i - 1]!.end)).toBe(true);
    expect(spans.at(-1)?.end).toBe(text.length);
  });
  it('Markdown 使用真实标题层级，代码与引用块中的伪标题不参与，保留 CR 原文', async () => {
    const text =
      '# 春\r\n卷首\r\n## 开始\r\n正文😀\r\n```md\r\n## 假标题\r\n```\r\n> ## 引用标题\r\n## 末章\r末尾';
    const result = await processImportJob({
      kind: 'structure',
      text,
      format: 'markdown',
      rules: { mode: 'markdown', volume_level: 1, chapter_level: 2 },
    });
    expect(result.volumes.map((v) => v.title)).toEqual(['春']);
    expect(result.chapters.map((c) => c.title)).toEqual(['待归类内容', '开始', '末章']);
    expect(text.slice(result.chapters[1]!.start, result.chapters[1]!.end)).toBe(
      '正文😀\r\n```md\r\n## 假标题\r\n```\r\n> ## 引用标题\r\n',
    );
    expect(text.slice(result.chapters[2]!.start)).toBe('末尾');
  });
  it('正文起止标记与 body 捕获组选择范围，偏移始终指向原文', async () => {
    const text = '说明😀[开始]第1章 开始\n正文😀\n[结束]版权';
    for (const selection of [
      {
        start: { mode: 'literal' as const, pattern: '[开始]' },
        end: { mode: 'literal' as const, pattern: '[结束]' },
      },
      { body: { mode: 'regex' as const, pattern: '\\[开始\\](?<body>[\\s\\S]+)\\[结束\\]' } },
    ]) {
      const result = await processImportJob({
        kind: 'structure',
        text,
        format: 'text',
        rules: { mode: 'single', selection },
      });
      expect(text.slice(result.selected.start, result.selected.end)).toBe('第1章 开始\n正文😀\n');
      expect(result.excluded.map((r) => text.slice(r.start, r.end))).toEqual([
        '说明😀[开始]',
        '[结束]版权',
      ]);
    }
  });
  it('无效、多命中、空匹配、倒置范围与过多章节明确失败', async () => {
    const literal = (pattern: string) => ({ mode: 'literal' as const, pattern });
    const cases = [
      { start: literal('不存在') },
      { start: literal('甲') },
      { start: literal('末'), end: literal('首') },
      { body: { mode: 'regex' as const, pattern: '(?<body>)' } },
      { body: { mode: 'regex' as const, pattern: '(正文)' } },
    ];
    for (const selection of cases)
      await expect(
        processImportJob({
          kind: 'structure',
          text: '首甲甲正文末',
          format: 'text',
          rules: { mode: 'single', selection },
        }),
      ).rejects.toThrow('INVALID_SELECTION');
    await expect(
      processImportJob({
        kind: 'structure',
        text: '正文',
        format: 'text',
        rules: { mode: 'regex', chapter_pattern: literal('不存在') },
      }),
    ).rejects.toThrow('NO_CHAPTERS');
    await expect(
      processImportJob({
        kind: 'structure',
        text: '第1章\n正文\n'.repeat(501),
        format: 'text',
        rules: { mode: 'regex', chapter_pattern: { mode: 'regex', pattern: '^第1章', flags: 'm' } },
      }),
    ).rejects.toThrow('PROCESSING_LIMIT');
  });
  it('可保留章标题；重复、极短和异常长章节可检查', async () => {
    const text = '第1章\n短\n第1章\n' + '长'.repeat(30000);
    const result = await processImportJob({
      kind: 'structure',
      text,
      format: 'text',
      rules: {
        mode: 'regex',
        include_headings: true,
        chapter_pattern: { mode: 'regex', pattern: '^第1章', flags: 'm' },
      },
    });
    expect(result.chapters[0]?.start).toBe(0);
    expect(result.chapters[0]?.warnings).toContain('同卷章节标题重复，请检查是否匹配了目录');
    expect(result.chapters[0]?.warnings).toContain('章节正文较短，请检查边界');
    expect(result.chapters[1]?.warnings).toContain('章节正文异常长，请检查是否漏掉标题');
  });

  it('带正则的拆章不能降级主线程；纯 Markdown 与字面量选择仍可有界回退', async () => {
    const parser = new ImportParsingClient(() => undefined);
    await expect(
      parser.run({
        kind: 'structure',
        text: '章\n正文',
        format: 'text',
        rules: { mode: 'regex', chapter_pattern: { mode: 'regex', pattern: '^章' } },
      }),
    ).rejects.toThrow('REGEX_WORKER_REQUIRED');
    await expect(
      parser.run({
        kind: 'structure',
        text: '正文',
        format: 'text',
        rules: { mode: 'single', selection: { body: { mode: 'regex', pattern: '(?<body>.+)' } } },
      }),
    ).rejects.toThrow('REGEX_WORKER_REQUIRED');
    expect(
      (
        await parser.run({
          kind: 'structure',
          text: '## 章\n正文',
          format: 'markdown',
          rules: { mode: 'markdown', chapter_level: 2 },
        })
      ).value.chapters,
    ).toHaveLength(1);
  });
  it('旧运行环境的起止标记不依赖捕获组索引，body 不可用时返回明确错误', async () => {
    const NativeRegExp = RegExp;
    vi.stubGlobal(
      'RegExp',
      class extends NativeRegExp {
        constructor(pattern: string | RegExp, flags?: string) {
          if (flags?.includes('d')) throw new SyntaxError('unsupported d');
          super(pattern, flags);
        }
      },
    );
    const text = '开始正文结束';
    const result = await processImportJob({
      kind: 'structure',
      text,
      format: 'text',
      rules: {
        mode: 'single',
        selection: {
          start: { mode: 'literal', pattern: '开始' },
          end: { mode: 'literal', pattern: '结束' },
        },
      },
    });
    expect(text.slice(result.selected.start, result.selected.end)).toBe('正文');
    await expect(
      processImportJob({
        kind: 'structure',
        text,
        format: 'text',
        rules: {
          mode: 'single',
          selection: { body: { mode: 'regex', pattern: '开始(?<body>.+)结束' } },
        },
      }),
    ).rejects.toThrow('REGEX_INDICES_REQUIRED');
  });
  it('Markdown 超长卷名与空章名不能进入草稿结构', async () => {
    for (const text of ['# ' + '卷'.repeat(501) + '\n## 章\n正文', '## \n正文']) {
      await expect(
        processImportJob({
          kind: 'structure',
          text,
          format: 'markdown',
          rules: { mode: 'markdown', volume_level: 1, chapter_level: 2 },
        }),
      ).rejects.toThrow('INVALID_BOUNDARY');
    }
  });
});
