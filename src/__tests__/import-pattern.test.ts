import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { processImportJob } from '../services/import/import-parsing-jobs';
import { ImportParsingClient } from '../services/import/import-parsing-client';

afterEach(() => vi.useRealTimers());

describe('导入通用文本规则', () => {
  it('正则支持 Unicode、多行、捕获组；逐项匹配不会遗留 lastIndex', async () => {
    const result = await processImportJob({
      kind: 'pattern',
      texts: ['第12章 标题', '第13章 标题', '不匹配'],
      pattern: { mode: 'regex', pattern: '^第(\\d+)章', flags: 'gu' },
      action: 'replace',
      replacement: 'Chapter $1',
    });
    expect(result.map((item) => item.text)).toEqual([
      'Chapter 12 标题',
      'Chapter 13 标题',
      '不匹配',
    ]);
    expect(result.map((item) => item.matches)).toEqual([1, 1, 0]);
    const removed = await processImportJob({
      kind: 'pattern',
      texts: ['正文😀\n广告123\n続き'],
      pattern: { mode: 'regex', pattern: '^广告\\d+$', flags: 'm' },
      action: 'remove_lines',
    });
    expect(removed[0]?.text).toBe('正文😀\n続き');
  });
  it('无效表达式、空匹配会明确失败，字面量不会被当成正则', async () => {
    const job = {
      kind: 'pattern' as const,
      texts: ['a.b😀正文'],
      action: 'remove_matches' as const,
    };
    expect(
      (await processImportJob({ ...job, pattern: { mode: 'literal', pattern: 'a.b' } }))[0]?.text,
    ).toBe('😀正文');
    for (const pattern of ['[', '^', '(?=正文)']) {
      await expect(
        processImportJob({ ...job, pattern: { mode: 'regex', pattern } }),
      ).rejects.toThrow(/INVALID_PATTERN|EMPTY_MATCH/);
    }
    await expect(
      processImportJob({ ...job, pattern: { mode: 'regex', pattern: '.', flags: 'gg' } }),
    ).rejects.toThrow('INVALID_PATTERN');
    expect(
      (await processImportJob({ ...job, pattern: { mode: 'regex', pattern: '😀' } }))[0]?.text,
    ).toBe('a.b正文');
  });

  it('正则无 Worker 时明确失败；超时会终止 Worker，启动失败也不转到主线程', async () => {
    const job = {
      kind: 'pattern' as const,
      texts: ['a'.repeat(100)],
      pattern: { mode: 'regex' as const, pattern: '(a+)+$' },
      action: 'test' as const,
    };
    await expect(new ImportParsingClient(() => undefined).run(job)).rejects.toThrow(
      'REGEX_WORKER_REQUIRED',
    );
    const worker = {
      onmessage: null,
      onerror: null as null | (() => void),
      postMessage() {},
      terminate: vi.fn(),
    };
    const client = new ImportParsingClient(() => worker as unknown as Worker);
    vi.useFakeTimers();
    const pending = client.run(job, { limits: { timeoutMs: 50 } });
    const assertion = expect(pending).rejects.toThrow('PROCESSING_LIMIT');
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const failed = client.run(job);
    worker.onerror?.();
    await expect(failed).rejects.toThrow('REGEX_WORKER_REQUIRED');
  });
  it('整行删除统一识别 LF、CRLF 和 CR，不误删相邻正文', async () => {
    for (const newline of ['\n', '\r\n', '\r']) {
      const result = await processImportJob({
        kind: 'pattern',
        texts: [`正文${newline}广告${newline}続き`],
        pattern: { mode: 'literal', pattern: '广告' },
        action: 'remove_lines',
      });
      expect(result[0]?.text).toBe(`正文${newline}続き`);
    }
  });
});
