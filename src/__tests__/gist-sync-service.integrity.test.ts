import './setup';

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { compressString } from 'src/utils/compression';
import { serializeDates } from 'src/utils/serialize-dates';
import { GistSyncService } from 'src/services/gist-sync-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import { SyncType, type SyncConfig } from 'src/models/sync';

function makeConfig(options?: { gistId?: string }): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: 0,
    syncInterval: 0,
    syncType: SyncType.Gist,
    syncParams: {
      token: 'test-token',
      username: 'test-user',
      ...(options?.gistId ? { gistId: options.gistId } : {}),
    },
    secret: 'test-secret',
    apiEndpoint: '',
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedCoverIds: [],
    deletedCoverUrls: [],
    deletedMemoryIds: [],
  };
}

async function gzipJson(value: unknown): Promise<string> {
  return JSON.stringify({
    format: 'gzip',
    data: await compressString(JSON.stringify(serializeDates(value))),
  });
}

/** 用给定的假 octokit 替换 initializeOctokit，绕过真实的 Octokit 构造 */
function stubOctokit(service: GistSyncService, fakeOctokit: unknown): void {
  spyOn(service as never, 'initializeOctokit' as never).mockImplementation((() => {
    (service as unknown as { octokit: unknown }).octokit = fakeOctokit;
  }) as never);
}

function makeNovel(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    author: 'Author',
    volumes: [],
    lastEdited: new Date('2026-04-22T10:03:00.000Z'),
  };
}

describe('GistSyncService.uploadToGist 上传后验证失败', () => {
  afterEach(() => {
    mock.restore();
  });

  it('首次上传创建 Gist 后验证不可恢复地失败时，失败结果应带回已创建的 gistId', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const novel = makeNovel('book-1', 'Book One');

    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockResolvedValue([
      novel,
    ] as never);
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);

    const fakeOctokit = {
      rest: {
        gists: {
          create: () =>
            Promise.resolve({
              data: { id: 'created-gist-id', html_url: 'https://gist.github.com/created-gist-id' },
            }),
          // 验证 GET 返回 404（不可重试），模拟创建成功但验证失败
          get: () => Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })),
        },
      },
    };
    stubOctokit(service, fakeOctokit);

    const result = await service.uploadToGist(config, {
      aiModels: [],
      appSettings: { lastEdited: new Date('2026-04-22T10:00:00.000Z') } as never,
      novels: [novel] as never,
    });

    // Gist 已经创建成功，失败结果必须带回 gistId，
    // 否则调用方无从持久化，重试会创建重复 Gist 并留下孤儿
    expect(result.success).toBe(false);
    expect(result.gistId).toBe('created-gist-id');
  });

  it('验证 GET 遇到瞬时 5xx 错误时应重试并最终成功', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const novel = makeNovel('book-1', 'Book One');

    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockResolvedValue([
      novel,
    ] as never);
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);

    // 捕获 create 收到的文件，构造大小匹配的验证响应
    let uploadedFiles: Record<string, { size: number; content: string }> = {};
    let getCalls = 0;
    const fakeOctokit = {
      rest: {
        gists: {
          create: (args: { files: Record<string, { content: string }> }) => {
            uploadedFiles = Object.fromEntries(
              Object.entries(args.files).map(([name, file]) => [
                name,
                { size: new Blob([file.content]).size, content: file.content },
              ]),
            );
            return Promise.resolve({
              data: { id: 'created-gist-id', html_url: 'https://gist.github.com/created-gist-id' },
            });
          },
          get: () => {
            getCalls += 1;
            if (getCalls === 1) {
              return Promise.reject(Object.assign(new Error('Server Error'), { status: 500 }));
            }
            return Promise.resolve({
              data: { updated_at: '2026-04-22T10:05:00.000Z', files: uploadedFiles },
            });
          },
        },
      },
    };
    stubOctokit(service, fakeOctokit);

    const result = await service.uploadToGist(config, {
      aiModels: [],
      appSettings: { lastEdited: new Date('2026-04-22T10:00:00.000Z') } as never,
      novels: [novel] as never,
    });

    expect(result.success).toBe(true);
    expect(result.gistId).toBe('created-gist-id');
    expect(result.remoteUpdatedAt).toBe('2026-04-22T10:05:00.000Z');
    expect(getCalls).toBe(2);
  }, 10000);
});

describe('GistSyncService.downloadFromGist 完整性', () => {
  afterEach(() => {
    mock.restore();
  });

  /** 构造带指定 files 的 gists.get 假 octokit */
  function makeDownloadOctokit(files: Record<string, unknown>): unknown {
    return {
      rest: {
        gists: {
          get: () =>
            Promise.resolve({
              data: {
                updated_at: '2026-04-22T10:05:00.000Z',
                html_url: 'https://gist.github.com/test-gist-id',
                files,
              },
            }),
        },
      },
    };
  }

  it('任一本书下载或解析失败时应返回失败并在 failedEntries 中列出', async () => {
    const service = new GistSyncService();
    const config = makeConfig({ gistId: 'test-gist-id' });

    stubOctokit(
      service,
      makeDownloadOctokit({
        'novel-good-book.json': {
          filename: 'novel-good-book.json',
          content: await gzipJson(makeNovel('good-book', 'Good Book')),
          truncated: false,
        },
        'novel-bad-book.json': {
          filename: 'novel-bad-book.json',
          content: '{bad-json',
          truncated: false,
        },
      }),
    );

    const result = await service.downloadFromGist(config);

    // 迁移消费方只检查 success：静默丢书会导致远端书籍永远从新布局中消失
    expect(result.success).toBe(false);
    expect(result.failedEntries).toEqual(['novel:bad-book']);
    expect(result.error).toContain('novel:bad-book');
  });

  it('settings 文件解析失败时应返回失败并在 failedEntries 中列出 settings', async () => {
    const service = new GistSyncService();
    const config = makeConfig({ gistId: 'test-gist-id' });

    stubOctokit(
      service,
      makeDownloadOctokit({
        'tsukuyomi-settings.json': {
          filename: 'tsukuyomi-settings.json',
          content: '{broken-settings',
          truncated: false,
        },
        'novel-good-book.json': {
          filename: 'novel-good-book.json',
          content: await gzipJson(makeNovel('good-book', 'Good Book')),
          truncated: false,
        },
      }),
    );

    const result = await service.downloadFromGist(config);

    expect(result.success).toBe(false);
    expect(result.failedEntries).toEqual(['settings']);
    expect(result.error).toContain('settings');
  });

  it('所有条目均可读时应保持成功且不携带 failedEntries', async () => {
    const service = new GistSyncService();
    const config = makeConfig({ gistId: 'test-gist-id' });

    stubOctokit(
      service,
      makeDownloadOctokit({
        'tsukuyomi-settings.json': {
          filename: 'tsukuyomi-settings.json',
          content: await gzipJson({
            appSettings: { lastEdited: new Date('2026-04-22T10:00:00.000Z') },
            aiModels: [],
          }),
          truncated: false,
        },
        'novel-good-book.json': {
          filename: 'novel-good-book.json',
          content: await gzipJson(makeNovel('good-book', 'Good Book')),
          truncated: false,
        },
      }),
    );

    const result = await service.downloadFromGist(config);

    expect(result.success).toBe(true);
    expect(result.failedEntries).toBeUndefined();
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'good-book', title: 'Good Book' })]),
    );
  });
});
