import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { processImportJob } from '../services/import/import-parsing-jobs';

describe('有界解析执行与内容范围', () => {
  it('大量不连续范围能够在解析预算内完成', async () => {
    const text = '原\n'.repeat(100000);
    const ranges = Array.from({ length: 10000 }, (_, index) => ({
      start: index * 20,
      end: index * 20 + 1,
    }));
    const result = await processImportJob(
      { kind: 'content', format: 'text', text, rules: { ranges } },
      { limits: { timeoutMs: 1000 } },
    );
    expect(result.blocks).toHaveLength(10000);
    expect(result.blocks.every((block) => block.text === '原')).toBe(true);
  });
  it('多范围提取与重叠排除不重复文本，也不拆开 Unicode 字符', async () => {
    const result = await processImportJob({
      kind: 'content',
      format: 'text',
      text: '甲乙丙丁戊己庚辛',
      rules: {
        ranges: [
          { start: 0, end: 4 },
          { start: 5, end: 8 },
        ],
        excludeRanges: [
          { start: 2, end: 4, reason: '后半' },
          { start: 1, end: 3, reason: '中段' },
          { start: 6, end: 7, reason: '单字' },
        ],
      },
    });
    expect(result.blocks.map((block) => block.text).join('')).toBe('甲己辛');
    await expect(
      processImportJob({
        kind: 'content',
        format: 'text',
        text: '😀正文',
        rules: { ranges: [{ start: 1, end: 3 }] },
      }),
    ).rejects.toThrow('INVALID_RANGE');
  });
  it('文本范围和排除保留原文与绝对位置，空正文明确标识', async () => {
    const result = await processImportJob({
      kind: 'content',
      format: 'text',
      text: '导航\n　正文一\r\n正文二\n尾部',
      rules: {
        ranges: [{ start: 3, end: 14 }],
        excludeRanges: [{ start: 10, end: 13, reason: '用户排除第二段' }],
      },
    });
    expect(result.blocks.map((b) => b.text).join('')).toBe('　正文一\r\n正尾');
    expect(result.excluded).toContainEqual({
      start: 10,
      end: 13,
      text: '文二\n',
      reason: '用户排除第二段',
    });
    const empty = await processImportJob({
      kind: 'content',
      format: 'text',
      text: '正文',
      rules: { excludeRanges: [{ start: 0, end: 2, reason: '全排除' }] },
    });
    expect(empty.kind).toBe('empty');
    await expect(
      processImportJob({
        kind: 'content',
        format: 'text',
        text: '短',
        rules: { ranges: [{ start: 0, end: 100 }] },
      }),
    ).rejects.toThrow('INVALID_RANGE');
  });

  it('受限主线程路径会让出和响应取消，大文本不会在回退时无界执行', async () => {
    const client = new ImportParsingClient(() => undefined);
    const controller = new AbortController();
    let yielded = false;
    await expect(
      client.run(
        { kind: 'content', format: 'text', text: '待取消' },
        {
          signal: controller.signal,
          yieldControl: () => {
            yielded = true;
            controller.abort();
            return Promise.resolve();
          },
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(yielded).toBe(true);
    await expect(
      client.run({ kind: 'content', format: 'text', text: 'x'.repeat(300000) }),
    ).rejects.toThrow('PROCESSING_LIMIT');
    expect(
      (await client.run({ kind: 'content', format: 'html', text: '<p>正文</p>' })).value.blocks[0]
        ?.text,
    ).toBe('正文');
  });

  it('Worker 完成后关闭，取消会立即终止且忽略迟到结果', async () => {
    let posted: { id: string } | undefined;
    let terminated = false;
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage(message: { id: string }) {
        posted = message;
      },
      terminate() {
        terminated = true;
      },
    };
    const client = new ImportParsingClient(() => worker as unknown as Worker);
    const run = client.run({ kind: 'decode', bytes: new Uint8Array([65]) });
    worker.onmessage?.({
      data: {
        id: posted!.id,
        success: true,
        value: { text: 'A', encoding: 'utf-8', bomBytes: 0, warnings: [] },
      },
    } as MessageEvent);
    expect((await run).execution).toBe('worker');
    expect(terminated).toBe(true);
    terminated = false;
    const controller = new AbortController();
    const cancelled = client.run(
      { kind: 'decode', bytes: new Uint8Array([66]) },
      { signal: controller.signal },
    );
    const late = worker.onmessage;
    controller.abort();
    late?.({ data: { id: posted!.id, success: true, value: { text: '迟到' } } } as MessageEvent);
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminated).toBe(true);
  });
});
