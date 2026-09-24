import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import { Worker as NodeWorker } from 'node:worker_threads';
import './setup';
import type { BookUpdateRecipe } from '../models/book-sync';
import { normalizeChapterText } from '../services/book-sync/normalize';
import { ImportParsingClient } from '../services/import/import-parsing-client';

const recipe: BookUpdateRecipe = {
  version: 1,
  engine: { kind: 'html', content: {} },
  catalogUrls: ['https://example.com'],
  verifiedChapterCount: 0,
  recordedAt: 0,
};

// 使用真正可终止的线程，灾难性正则不能占住测试进程。
function regexClient() {
  return new ImportParsingClient(() => {
    const thread = new NodeWorker(
      `const { parentPort } = require('node:worker_threads');
      parentPort.on('message', ({id, request}) => {
        try {
          const regex = new RegExp(request.pattern.pattern, 'gmu');
          const value = request.texts.map(text => ({ text: text.replace(regex, ''), matches: 1, ranges: [] }));
          parentPort.postMessage({id, success: true, value});
        } catch (e) { parentPort.postMessage({id, success: false, error: {message: e.message, name: e.name}}); }
      });`,
      { eval: true },
    );
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      postMessage: (message: unknown) => thread.postMessage(message),
      terminate: () => {
        void thread.terminate();
      },
    };
    thread.on('message', (data: unknown) => worker.onmessage?.({ data } as MessageEvent));
    thread.on('error', () => worker.onerror?.());
    return worker as unknown as Worker;
  });
}

describe('同步正文清理', () => {
  it('按顺序清理、剥离精确标题，保留缩进和空行且结果确定', async () => {
    const configured = {
      ...recipe,
      stripHeading: true,
      cleanup: [
        {
          pattern: { mode: 'literal' as const, pattern: '次の話へ' },
          action: 'remove_lines' as const,
        },
        {
          pattern: { mode: 'literal' as const, pattern: '[広告]' },
          action: 'remove_matches' as const,
        },
      ],
    };
    const raw = '第一话\r\n　本文[広告]\r\n\r\n続き\r\n次の話へ\r\n';
    const first = await normalizeChapterText(raw, configured, { title: '第一话' });
    expect(first).toEqual(['　本文', '', '続き', '']);
    expect(await normalizeChapterText(raw, configured, { title: '第一话' })).toEqual(first);
    expect(await normalizeChapterText('正文第一行\n続き', configured, { title: '第一话' })).toEqual(
      ['正文第一行', '続き'],
    );
  });
  it('在 Worker 中执行正则', async () => {
    expect(
      await normalizeChapterText(
        '本文123\n続き',
        {
          ...recipe,
          cleanup: [{ pattern: { mode: 'regex', pattern: '\\d+' }, action: 'remove_matches' }],
        },
        { parser: regexClient() },
      ),
    ).toEqual(['本文', '続き']);
  });
  it('无效正则明确返回 CLEANUP_INVALID', async () => {
    await expect(
      normalizeChapterText(
        '本文',
        {
          ...recipe,
          cleanup: [{ pattern: { mode: 'regex', pattern: '[' }, action: 'remove_matches' }],
        },
        { parser: regexClient() },
      ),
    ).rejects.toThrow('CLEANUP_INVALID');
  });
  it('灾难性回溯在时限内终止并返回 CLEANUP_TIMEOUT', async () => {
    const started = Date.now();
    await expect(
      normalizeChapterText(
        'a'.repeat(100) + '!',
        {
          ...recipe,
          cleanup: [{ pattern: { mode: 'regex', pattern: '(a+)+$' }, action: 'remove_matches' }],
        },
        { parser: regexClient(), timeoutMs: 100 },
      ),
    ).rejects.toThrow('CLEANUP_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

it('正则整行删除复用导入器规则且不删除相邻缩进和空行', async () => {
  const { ImportWorkerFixture } = await import('./import-worker-fixture');
  const parser = new ImportParsingClient(() => new ImportWorkerFixture() as unknown as Worker);
  expect(
    await normalizeChapterText(
      '　本文\n\n次の話へ123\n続き',
      {
        ...recipe,
        cleanup: [
          {
            pattern: { mode: 'regex', pattern: '^次の話へ\\d+$', flags: 'm' },
            action: 'remove_lines',
          },
        ],
      },
      { parser },
    ),
  ).toEqual(['　本文', '', '続き']);
});
