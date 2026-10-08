import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Octokit } from '@octokit/rest';
import { executeGistCleanup, scanGistCleanup } from '../services/gist-file-cleanup';
import type { GistFileLike } from '../services/gist-sync-incremental';

const revision = 'a'.repeat(40);
const entry = { hash: 'a'.repeat(64), lastEdited: '2026-10-07T00:00:00.000Z' };

function fixture() {
  return {
    history: [{ version: revision }],
    truncated: false,
    files: {
      'manifest.json': {
        content: JSON.stringify({
          schemaVersion: 6,
          entries: {
            'novel:kept': entry,
            'chapters:kept:a': { ...entry, chunks: 2 },
            'memories:kept': entry,
            settings: entry,
          },
        }),
      },
      'book-kept.json': { size: 50 },
      'chapters-kept_a.meta.json': { size: 10 },
      'chapters-chunk-kept_a_0.json': { size: 100 },
      'chapters-chunk-kept_a_1.json': { size: 100 },
      'v6-memories-kept.json': { size: 50 },
      'v6-tsukuyomi-settings.json': { size: 50 },
      'novel-kept.json': { size: 200 },
      'novel-gone.json': { size: 300 },
      'memories-gone.json': { size: 40 },
      'chapters-chunk-kept_a_2.json': { size: 60 },
      'notes.json': { size: 20 },
    } as Record<string, GistFileLike>,
  };
}

function api(data = fixture(), beforeRequest?: (method: string) => void) {
  const requests: Array<{ method: string; body: unknown }> = [];
  const octokit = new Octokit({
    request: {
      fetch: (url: string, init: RequestInit) => {
        beforeRequest?.(init.method ?? 'GET');
        requests.push({
          method: init.method ?? 'GET',
          body: init.body ? JSON.parse(typeof init.body === 'string' ? init.body : '') : undefined,
        });
        if (init.method === 'PATCH') {
          const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as {
            files: Record<string, null>;
          };
          for (const name of Object.keys(body.files)) delete data.files[name];
          data.history = [{ version: 'b'.repeat(40) }];
        }
        return Promise.resolve(
          new Response(JSON.stringify(url.includes('/commits') ? data.history : data), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    },
  });
  return { octokit, requests };
}

describe('远端遗留文件扫描', () => {
  afterEach(() => vi.restoreAllMocks());
  it('仅预览未引用的旧布局、孤立文件和多余分片，保留有效资料与第三方文件', async () => {
    const { octokit, requests } = api();
    const plan = await scanGistCleanup(octokit, 'test-gist');
    expect(plan).toMatchObject({ gistId: 'test-gist', revision, partial: false, totalBytes: 600 });
    expect(plan.files.map((file) => file.filename)).toEqual([
      'chapters-chunk-kept_a_2.json',
      'memories-gone.json',
      'novel-gone.json',
      'novel-kept.json',
    ]);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it.each([
    null,
    { schemaVersion: 99, entries: {} },
    { schemaVersion: 6, pendingUpgradeFrom: 5, entries: {} },
    { schemaVersion: 6, entries: { 'novel:kept': null } },
    { schemaVersion: 6, entries: { 'novel:kept': { ...entry, hash: '' } } },
    { schemaVersion: 6, entries: { 'novel:kept': { ...entry, chunks: -1 } } },
    { schemaVersion: 6, entries: { 'novel:kept': { ...entry, chunks: 1.5 } } },
    { schemaVersion: 6, entries: { 'novel:kept': { ...entry, chunks: 1000000000 } } },
    { schemaVersion: 6, entries: { 'future-entry': entry } },
  ])('清单损坏、未来格式或迁移未完成时拒绝清理：%j', async (manifest) => {
    const data = fixture();
    data.files['manifest.json'] = { content: JSON.stringify(manifest) };
    await expect(scanGistCleanup(api(data).octokit, 'test-gist')).rejects.toThrow();
  });

  it('完整列表缺少清单引用的正文时拒绝清理，保留可能用于修复的旧文件', async () => {
    const data = fixture();
    delete data.files['book-kept.json'];
    await expect(scanGistCleanup(api(data).octokit, 'test-gist')).rejects.toThrow();
  });

  it('空清单允许清理已识别文件，空文件列表不产生删除请求', async () => {
    const data = fixture();
    data.files = {
      'manifest.json': { content: JSON.stringify({ schemaVersion: 6, entries: {} }) },
    };
    expect((await scanGistCleanup(api(data).octokit, 'test-gist')).files).toEqual([]);
    data.files['novel-old.meta.json'] = { size: 30 };
    expect((await scanGistCleanup(api(data).octokit, 'test-gist')).files).toEqual([
      { filename: 'novel-old.meta.json', size: 30 },
    ]);
  });

  it('兼容旧协议的分片分隔符，不删除仍被读取的正文', async () => {
    const data = fixture();
    data.files = {
      'manifest.json': {
        content: JSON.stringify({
          schemaVersion: 5,
          entries: { 'novel:kept': { ...entry, chunks: 1 } },
        }),
      },
      'novel-kept.meta.json': { size: 10 },
      'novel-chunk-kept#0.json': { size: 100 },
      'novel-chunk-kept-0.json': { size: 100 },
      'novel-chunk-kept_1.json': { size: 20 },
    };
    expect((await scanGistCleanup(api(data).octokit, 'test-gist')).files).toEqual([
      { filename: 'novel-chunk-kept_1.json', size: 20 },
    ]);
  });

  it('API 截断时仅列出实际返回的孤立文件，不把推算的文件当作候选', async () => {
    const data = fixture();
    const manifest = data.files['manifest.json']!.content!;
    data.truncated = true;
    data.files = {
      'novel-gone.json': {
        size: 300,
        raw_url: `https://gist.githubusercontent.com/owner/test-gist/raw/${revision}/novel-gone.json`,
      } as { size: number },
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(manifest));
    const plan = await scanGistCleanup(api(data).octokit, 'test-gist');
    expect(plan.partial).toBe(true);
    expect(plan.files).toEqual([{ filename: 'novel-gone.json', size: 300 }]);
    expect(fetch).toHaveBeenCalledWith(
      `https://gist.githubusercontent.com/owner/test-gist/raw/${revision}/manifest.json`,
    );
  });
});

describe('远端遗留文件清理', () => {
  afterEach(() => vi.restoreAllMocks());
  it('执行前重新扫描，仅一次提交删除预览文件，清单与有效数据不改写', async () => {
    const data = fixture();
    const manifest = data.files['manifest.json'];
    const { octokit, requests } = api(data);
    const plan = await scanGistCleanup(octokit, 'test-gist');
    expect(await executeGistCleanup(octokit, 'test-gist', plan)).toMatchObject({ deletedCount: 4 });
    expect(requests.filter((request) => request.method === 'PATCH')).toEqual([
      {
        method: 'PATCH',
        body: {
          files: {
            'chapters-chunk-kept_a_2.json': null,
            'memories-gone.json': null,
            'novel-gone.json': null,
            'novel-kept.json': null,
          },
        },
      },
    ]);
    expect(data.files['manifest.json']).toEqual(manifest);
    expect(data.files['book-kept.json']).toBeDefined();
    expect((await scanGistCleanup(octokit, 'test-gist')).files).toEqual([]);
  });

  it.each(['revision', 'gist', 'files', 'lastCheck'])(
    '预览过期或清理范围变化时拒绝写入：%s',
    async (change) => {
      const data = fixture();
      let reads = 0;
      const { octokit, requests } = api(data, (method) => {
        if (method === 'GET' && ++reads === 3 && change === 'lastCheck')
          data.history = [{ version: 'c'.repeat(40) }];
      });
      const plan = await scanGistCleanup(octokit, 'test-gist');
      if (change === 'revision') data.history = [{ version: 'c'.repeat(40) }];
      if (change === 'gist') plan.gistId = 'other-gist';
      if (change === 'files') plan.files.push({ filename: 'book-kept.json' });
      await expect(executeGistCleanup(octokit, 'test-gist', plan)).rejects.toThrow();
      expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
    },
  );

  it('空预览无需写入', async () => {
    const data = fixture();
    data.files = {
      'manifest.json': { content: JSON.stringify({ schemaVersion: 6, entries: {} }) },
    };
    const { octokit, requests } = api(data);
    const plan = await scanGistCleanup(octokit, 'test-gist');
    expect(await executeGistCleanup(octokit, 'test-gist', plan)).toMatchObject({ deletedCount: 0 });
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it.each([404, 200, 500])(
    '清理响应仍被截断时，在新修订上核对删除结果：HTTP %s',
    async (status) => {
      const data = fixture();
      data.files['manifest.json']!.raw_url =
        `https://gist.githubusercontent.com/owner/test-gist/raw/${revision}/manifest.json`;
      const { octokit } = api(data, (method) => {
        if (method === 'PATCH') data.truncated = true;
      });
      const plan = await scanGistCleanup(octokit, 'test-gist');
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
      const cleanup = executeGistCleanup(octokit, 'test-gist', plan);
      if (status === 404) await expect(cleanup).resolves.toEqual({ deletedCount: 4 });
      else await expect(cleanup).rejects.toMatchObject({ code: 'GIST_CLEANUP_UNVERIFIED' });
      expect(fetch).toHaveBeenCalledWith(
        `https://gist.githubusercontent.com/owner/test-gist/raw/${'b'.repeat(40)}/chapters-chunk-kept_a_2.json`,
        { method: 'HEAD' },
      );
    },
  );

  it('请求失败时不报告清理成功', async () => {
    const { octokit } = api(fixture(), (method) => {
      if (method === 'PATCH') throw new Error('Network unavailable');
    });
    const plan = await scanGistCleanup(octokit, 'test-gist');
    await expect(executeGistCleanup(octokit, 'test-gist', plan)).rejects.toThrow(
      'Network unavailable',
    );
  });
});
