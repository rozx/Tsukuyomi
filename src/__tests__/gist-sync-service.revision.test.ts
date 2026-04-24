import './setup';

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { compressString } from 'src/utils/compression';
import { serializeDates } from 'src/utils/serialize-dates';
import { GistSyncService } from 'src/services/gist-sync-service';
import { MANIFEST_SCHEMA_VERSION } from 'src/models/manifest';
import { SyncType, type SyncConfig } from 'src/models/sync';

function makeConfig(): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: 0,
    syncInterval: 0,
    syncType: SyncType.Gist,
    syncParams: { gistId: 'test-gist-id', token: 'test-token', username: 'test-user' },
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

interface MockRevisionCommit {
  version: string;
  committed_at: string;
  change_status?: {
    total?: number;
    additions?: number;
    deletions?: number;
  };
}

interface MockRevisionFile {
  filename?: string;
  size?: number;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface MockRevisionResponse {
  data: {
    files: Record<string, MockRevisionFile>;
  };
}

function makeRevisionResponse(files: Record<string, MockRevisionFile>): MockRevisionResponse {
  return { data: { files } };
}

function mockRevisionApi(
  service: GistSyncService,
  commits: MockRevisionCommit[],
  getRevision: (sha: string) => Promise<MockRevisionResponse>,
): void {
  const octokit = {
    rest: {
      gists: {
        listCommits: () => Promise.resolve({ data: commits }),
        getRevision: ({ sha }: { gist_id: string; sha: string }) => getRevision(sha),
      },
    },
  };

  (service as unknown as { octokit: typeof octokit }).octokit = octokit;
  spyOn(service as never, 'prepareGistClient' as never).mockReturnValue({
    octokit,
    gistId: 'test-gist-id',
  } as never);
}

describe('GistSyncService.downloadFromGistRevision', () => {
  afterEach(() => {
    mock.restore();
  });

  it('应读取 manifest 新布局中的独立 settings 与 ai-models 文件', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const appSettings = {
      lastEdited: new Date('2026-04-22T10:00:00.000Z'),
      scraperConcurrencyLimit: 3,
      taskDefaultModels: {
        translation: 'model-1',
        assistant: 'model-1',
      },
      quickStartDismissed: true,
    };
    const aiModels = [
      {
        id: 'model-1',
        name: 'OpenAI Main',
        provider: 'openai',
        model: 'gpt-4.1',
        temperature: 0.7,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        isDefault: {
          translation: { enabled: true, temperature: 0.7 },
          proofreading: { enabled: false, temperature: 0.7 },
          termsTranslation: { enabled: false, temperature: 0.7 },
          assistant: { enabled: true, temperature: 0.7 },
        },
        enabled: true,
        lastEdited: new Date('2026-04-22T10:01:00.000Z'),
      },
    ];
    const coverHistory = [
      {
        id: 'cover-1',
        url: 'https://example.com/cover.jpg',
        addedAt: new Date('2026-04-22T10:02:00.000Z'),
      },
    ];
    const novel = {
      id: 'book-1',
      title: 'Book One',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };

    const settingsContent = await gzipJson(appSettings);
    const aiModelsContent = await gzipJson(aiModels);
    const coverHistoryContent = await gzipJson(coverHistory);
    const novelContent = await gzipJson(novel);
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        settings: {
          hash: 'hash-settings',
          lastEdited: '2026-04-22T10:00:00.000Z',
        },
        'ai-models': {
          hash: 'hash-models',
          lastEdited: '2026-04-22T10:01:00.000Z',
        },
        'cover-history': {
          hash: 'hash-covers',
          lastEdited: '2026-04-22T10:02:00.000Z',
        },
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:03:00.000Z',
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'tsukuyomi-settings.json': {
            filename: 'tsukuyomi-settings.json',
            content: settingsContent,
            truncated: false,
          },
          'ai-models.json': {
            filename: 'ai-models.json',
            content: aiModelsContent,
            truncated: false,
          },
          'cover-history.json': {
            filename: 'cover-history.json',
            content: coverHistoryContent,
            truncated: false,
          },
          'novel-book-1.json': {
            filename: 'novel-book-1.json',
            content: novelContent,
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.appSettings).toMatchObject({
      quickStartDismissed: true,
      taskDefaultModels: {
        translation: 'model-1',
        assistant: 'model-1',
      },
    });
    expect(result.data?.aiModels).toHaveLength(1);
    expect(result.data?.aiModels?.[0]).toMatchObject({
      id: 'model-1',
      name: 'OpenAI Main',
      enabled: true,
    });
    expect(result.data?.coverHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cover-1' })]),
    );
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'book-1', title: 'Book One' })]),
    );
  });

  it('manifest 被截断时应通过 raw_url 继续按新布局恢复 settings 与 ai-models', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        settings: {
          hash: 'hash-settings',
          lastEdited: '2026-04-22T10:00:00.000Z',
        },
        'ai-models': {
          hash: 'hash-models',
          lastEdited: '2026-04-22T10:01:00.000Z',
        },
      },
    };
    const appSettings = {
      lastEdited: new Date('2026-04-22T10:00:00.000Z'),
      scraperConcurrencyLimit: 3,
      taskDefaultModels: { translation: 'model-1' },
    };
    const aiModels = [
      {
        id: 'model-1',
        name: 'OpenAI Main',
        provider: 'openai',
        model: 'gpt-4.1',
        temperature: 0.7,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        isDefault: {
          translation: { enabled: true, temperature: 0.7 },
          proofreading: { enabled: false, temperature: 0.7 },
          termsTranslation: { enabled: false, temperature: 0.7 },
          assistant: { enabled: false, temperature: 0.7 },
        },
        enabled: true,
        lastEdited: new Date('2026-04-22T10:01:00.000Z'),
      },
    ];

    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(manifest), { status: 200 }) as unknown as Response,
    );
    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            truncated: true,
            raw_url: 'https://example.com/manifest.json',
          },
          'tsukuyomi-settings.json': {
            filename: 'tsukuyomi-settings.json',
            content: await gzipJson(appSettings),
            truncated: false,
          },
          'ai-models.json': {
            filename: 'ai-models.json',
            content: await gzipJson(aiModels),
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.appSettings).toMatchObject({
      taskDefaultModels: { translation: 'model-1' },
    });
    expect(result.data?.aiModels?.[0]).toMatchObject({ id: 'model-1', name: 'OpenAI Main' });
  });

  it('manifest 存在但损坏时应返回错误，而不是静默回退到旧布局解析', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: '{not-valid-json',
            truncated: false,
          },
          'tsukuyomi-settings.json': {
            filename: 'tsukuyomi-settings.json',
            content: await gzipJson({
              lastEdited: new Date('2026-04-22T10:00:00.000Z'),
              scraperConcurrencyLimit: 3,
              taskDefaultModels: { translation: 'model-1' },
            }),
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(false);
    expect(result.error).toContain('manifest.json');
  });

  it('manifest 缺少有效 entries 字段时应返回错误', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify({
              schemaVersion: MANIFEST_SCHEMA_VERSION,
              updatedAt: '2026-04-22T10:05:00.000Z',
            }),
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(false);
    expect(result.error).toContain('entries');
  });

  it('manifest 声明的条目文件缺失时应中止恢复，防止本地被不完整快照覆盖', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const appSettings = {
      lastEdited: new Date('2026-04-22T10:00:00.000Z'),
      scraperConcurrencyLimit: 5,
      taskDefaultModels: { translation: 'model-1' },
    };
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        settings: {
          hash: 'hash-settings',
          lastEdited: '2026-04-22T10:00:00.000Z',
        },
        'ai-models': {
          hash: 'hash-models',
          lastEdited: '2026-04-22T10:01:00.000Z',
        },
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:02:00.000Z',
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'tsukuyomi-settings.json': {
            filename: 'tsukuyomi-settings.json',
            content: await gzipJson(appSettings),
            truncated: false,
          },
          // ai-models.json 与 novel-book-1.json 都缺失，应整体中止恢复
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(false);
    expect(result.error).toContain('ai-models');
    expect(result.error).toContain('novel:book-1');
    expect(result.error).toContain('已中止恢复');
  });

  it('manifest 声明为单文件但实际是分块布局时应通过扫描兜底恢复', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const novel = {
      id: 'book-1',
      title: 'Chunked Book',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };
    const novelContent = await gzipJson(novel);
    const half = Math.ceil(novelContent.length / 2);
    const chunk0 = novelContent.slice(0, half);
    const chunk1 = novelContent.slice(half);

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      // manifest 声明 chunks 未知(旧 revision),实际有 2 个 chunk 文件
      entries: {
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:03:00.000Z',
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'novel-chunk-book-1_0.json': {
            filename: 'novel-chunk-book-1_0.json',
            content: chunk0,
            truncated: false,
          },
          'novel-chunk-book-1_1.json': {
            filename: 'novel-chunk-book-1_1.json',
            content: chunk1,
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'book-1', title: 'Chunked Book' })]),
    );
  });

  it('旧版 `#` 分隔符的分块文件也能在恢复时拼回来', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const novel = {
      id: 'book-1',
      title: 'Legacy Chunked',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };
    const novelContent = await gzipJson(novel);
    const half = Math.ceil(novelContent.length / 2);

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:03:00.000Z',
          chunks: 2,
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          // 老版本用 `#` 分隔 chunk 索引
          'novel-chunk-book-1#0.json': {
            filename: 'novel-chunk-book-1#0.json',
            content: novelContent.slice(0, half),
            truncated: false,
          },
          'novel-chunk-book-1#1.json': {
            filename: 'novel-chunk-book-1#1.json',
            content: novelContent.slice(half),
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'book-1', title: 'Legacy Chunked' })]),
    );
  });

  it('小说分块缺失时错误信息应指出缺失的块索引', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:03:00.000Z',
          chunks: 3,
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'novel-chunk-book-1_0.json': {
            filename: 'novel-chunk-book-1_0.json',
            content: 'partial',
            truncated: false,
          },
          // chunk 1, 2 缺失
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(false);
    expect(result.error).toContain('novel:book-1');
    expect(result.error).toContain('缺失分块索引');
    expect(result.error).toMatch(/1.*2|2.*1/);
  });

  it('manifest 条目文件损坏时应返回错误', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        'ai-models': {
          hash: 'hash-models',
          lastEdited: '2026-04-22T10:01:00.000Z',
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'ai-models.json': {
            filename: 'ai-models.json',
            content: '{broken-json',
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('应按稳定顺序合并 manifest 新布局中的多个 memories 条目', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const memoriesBook1 = [
      {
        id: 'memory-1',
        bookId: 'book-1',
        content: '记忆一',
        summary: '摘要一',
        createdAt: 1,
        lastAccessedAt: 2,
      },
    ];
    const memoriesBook2 = [
      {
        id: 'memory-2',
        bookId: 'book-2',
        content: '记忆二',
        summary: '摘要二',
        createdAt: 3,
        lastAccessedAt: 4,
      },
    ];
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        'memories:book-2': {
          hash: 'hash-book-2',
          lastEdited: '2026-04-22T10:02:00.000Z',
        },
        'memories:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:01:00.000Z',
        },
      },
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'memories-book-1.json': {
            filename: 'memories-book-1.json',
            content: await gzipJson(memoriesBook1),
            truncated: false,
          },
          'memories-book-2.json': {
            filename: 'memories-book-2.json',
            content: await gzipJson(memoriesBook2),
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.memories?.map((memory) => memory.id)).toEqual(['memory-1', 'memory-2']);
  });

  it('manifest 中 chunked novel 条目被截断时应通过 raw_url 恢复', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const novel = {
      id: 'book-1',
      title: 'Chunked Book',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };
    const novelContent = await gzipJson(novel);
    const splitIndex = Math.floor(novelContent.length / 2);
    const firstChunk = novelContent.slice(0, splitIndex);
    const secondChunk = novelContent.slice(splitIndex);
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-22T10:05:00.000Z',
      entries: {
        'novel:book-1': {
          hash: 'hash-book-1',
          lastEdited: '2026-04-22T10:03:00.000Z',
          chunks: 2,
        },
      },
    };

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
      ...args: Parameters<typeof fetch>
    ): ReturnType<typeof fetch> => {
      const [input] = args;
      const url = input instanceof Request ? input.url : input.toString();
      if (url === 'https://example.com/novel-chunk-book-1_0.json') {
        return Promise.resolve(new Response(firstChunk, { status: 200 }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch);

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'manifest.json': {
            filename: 'manifest.json',
            content: JSON.stringify(manifest),
            truncated: false,
          },
          'novel-chunk-book-1_0.json': {
            filename: 'novel-chunk-book-1_0.json',
            truncated: true,
            raw_url: 'https://example.com/novel-chunk-book-1_0.json',
          },
          'novel-chunk-book-1_1.json': {
            filename: 'novel-chunk-book-1_1.json',
            content: secondChunk,
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'book-1', title: 'Chunked Book' })]),
    );
  });

  it('无 manifest 时应回退旧布局，并在 chunk 解析失败后回退单文件', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const appSettings = {
      lastEdited: new Date('2026-04-22T10:00:00.000Z'),
      scraperConcurrencyLimit: 4,
      taskDefaultModels: { translation: 'model-legacy' },
    };
    const aiModels = [
      {
        id: 'model-legacy',
        name: 'Legacy Model',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        maxInputTokens: 64000,
        maxOutputTokens: 4096,
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        isDefault: {
          translation: { enabled: true, temperature: 0.4 },
          proofreading: { enabled: false, temperature: 0.4 },
          termsTranslation: { enabled: false, temperature: 0.4 },
          assistant: { enabled: false, temperature: 0.4 },
        },
        enabled: true,
        lastEdited: new Date('2026-04-22T10:01:00.000Z'),
      },
    ];
    const coverHistory = [
      {
        id: 'cover-legacy',
        url: 'https://example.com/legacy-cover.jpg',
        addedAt: new Date('2026-04-22T10:02:00.000Z'),
      },
    ];
    const memories = [
      {
        id: 'memory-legacy',
        bookId: 'legacy-book',
        content: '旧布局记忆',
        summary: '旧布局摘要',
        createdAt: 1,
        lastAccessedAt: 2,
      },
    ];
    const novel = {
      id: 'legacy-book',
      title: 'Legacy Book',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };
    const novelContent = await gzipJson(novel);
    const partialChunk = novelContent.slice(0, Math.floor(novelContent.length / 2));

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'tsukuyomi-settings.json': {
            filename: 'tsukuyomi-settings.json',
            content: await gzipJson({ appSettings, aiModels, coverHistory, memories }),
            truncated: false,
          },
          'novel-legacy-book.meta.json': {
            filename: 'novel-legacy-book.meta.json',
            content: JSON.stringify({ chunks: 2, totalSize: novelContent.length }),
            truncated: false,
          },
          'novel-chunk-legacy-book#0.json': {
            filename: 'novel-chunk-legacy-book#0.json',
            content: partialChunk,
            truncated: false,
          },
          'novel-legacy-book.json': {
            filename: 'novel-legacy-book.json',
            content: novelContent,
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.appSettings).toMatchObject({
      scraperConcurrencyLimit: 4,
      taskDefaultModels: { translation: 'model-legacy' },
    });
    expect(result.data?.aiModels?.[0]).toMatchObject({ id: 'model-legacy', name: 'Legacy Model' });
    expect(result.data?.coverHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cover-legacy' })]),
    );
    expect(result.data?.memories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'memory-legacy' })]),
    );
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'legacy-book', title: 'Legacy Book' }),
      ]),
    );
  });

  it('旧布局下单本书解析失败时不应影响其他书籍恢复', async () => {
    const service = new GistSyncService();
    const config = makeConfig();

    const goodNovel = {
      id: 'good-book',
      title: 'Good Book',
      author: 'Author',
      volumes: [],
      lastEdited: new Date('2026-04-22T10:03:00.000Z'),
    };

    spyOn(service as any, 'fetchGistRevisionRaw').mockResolvedValue({
      data: {
        files: {
          'novel-good-book.json': {
            filename: 'novel-good-book.json',
            content: await gzipJson(goodNovel),
            truncated: false,
          },
          'novel-bad-book.json': {
            filename: 'novel-bad-book.json',
            content: '{bad-json',
            truncated: false,
          },
        },
      },
    } as any);

    const result = await service.downloadFromGistRevision(config, 'revision-sha');

    expect(result.success).toBe(true);
    expect(result.data?.novels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'good-book', title: 'Good Book' })]),
    );
    expect(result.data?.novels).toHaveLength(1);
  });
});

describe('GistSyncService.getGistRevisions', () => {
  afterEach(() => {
    mock.restore();
  });

  it('应在修订历史中区分 added removed 和 modified 文件', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const commits: MockRevisionCommit[] = [
      {
        version: 'sha-1',
        committed_at: '2026-04-22T10:00:00.000Z',
        change_status: { total: 2, additions: 2, deletions: 0 },
      },
      {
        version: 'sha-2',
        committed_at: '2026-04-22T10:10:00.000Z',
        change_status: { total: 3, additions: 2, deletions: 1 },
      },
    ];

    mockRevisionApi(service, commits, (sha) => {
      switch (sha) {
        case 'sha-1':
          return Promise.resolve(
            makeRevisionResponse({
              'removed.txt': { filename: 'removed.txt', size: 7, content: 'before' },
              'changed.txt': { filename: 'changed.txt', size: 4, content: 'same' },
            }),
          );
        case 'sha-2':
          return Promise.resolve(
            makeRevisionResponse({
              'added.txt': { filename: 'added.txt', size: 5, content: 'after' },
              'changed.txt': { filename: 'changed.txt', size: 4, content: 'diff' },
            }),
          );
        default:
          return Promise.reject(new Error(`Unexpected sha: ${sha}`));
      }
    });

    const result = await service.getGistRevisions(config);

    expect(result.success).toBe(true);
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions?.[0]?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'removed.txt', status: 'added' }),
        expect.objectContaining({ filename: 'changed.txt', status: 'added' }),
      ]),
    );
    expect(result.revisions?.[1]?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'added.txt', status: 'added' }),
        expect.objectContaining({ filename: 'removed.txt', status: 'removed' }),
        expect.objectContaining({ filename: 'changed.txt', status: 'modified' }),
      ]),
    );
  });

  it('截断文件在 change_status 显示有变化时应补判为 modified', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const commits: MockRevisionCommit[] = [
      {
        version: 'sha-1',
        committed_at: '2026-04-22T10:00:00.000Z',
        change_status: { total: 1, additions: 1, deletions: 0 },
      },
      {
        version: 'sha-2',
        committed_at: '2026-04-22T10:10:00.000Z',
        change_status: { total: 1, additions: 1, deletions: 0 },
      },
    ];

    mockRevisionApi(service, commits, (sha) => {
      if (sha === 'sha-1' || sha === 'sha-2') {
        return Promise.resolve(
          makeRevisionResponse({
            'novel-book-1.json': { filename: 'novel-book-1.json', size: 120, truncated: true },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected sha: ${sha}`));
    });

    const result = await service.getGistRevisions(config);

    expect(result.success).toBe(true);
    expect(result.revisions?.[1]?.files).toEqual([
      expect.objectContaining({ filename: 'novel-book-1.json', status: 'modified' }),
    ]);
  });

  it('上一修订读取失败时应退化为将当前文件全部标记为 modified', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const commits: MockRevisionCommit[] = [
      {
        version: 'sha-base',
        committed_at: '2026-04-22T10:00:00.000Z',
        change_status: { total: 1, additions: 1, deletions: 0 },
      },
      {
        version: 'sha-next',
        committed_at: '2026-04-22T10:10:00.000Z',
        change_status: { total: 2, additions: 2, deletions: 0 },
      },
    ];
    let baseRevisionCalls = 0;

    mockRevisionApi(service, commits, (sha) => {
      switch (sha) {
        case 'sha-base':
          baseRevisionCalls += 1;
          if (baseRevisionCalls === 1) {
            return Promise.resolve(
              makeRevisionResponse({
                'base.txt': { filename: 'base.txt', size: 4, content: 'base' },
              }),
            );
          }
          return Promise.reject(new Error('Failed to fetch previous revision'));
        case 'sha-next':
          return Promise.resolve(
            makeRevisionResponse({
              'base.txt': { filename: 'base.txt', size: 4, content: 'next' },
              'new.txt': { filename: 'new.txt', size: 3, content: 'new' },
            }),
          );
        default:
          return Promise.reject(new Error(`Unexpected sha: ${sha}`));
      }
    });

    const result = await service.getGistRevisions(config);

    expect(result.success).toBe(true);
    expect(result.revisions?.[1]?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'base.txt', status: 'modified' }),
        expect.objectContaining({ filename: 'new.txt', status: 'modified' }),
      ]),
    );
    expect(result.revisions?.[1]?.files).toHaveLength(2);
  });

  it('当前修订读取失败时应返回空文件列表，而不是让整个历史加载失败', async () => {
    const service = new GistSyncService();
    const config = makeConfig();
    const commits: MockRevisionCommit[] = [
      {
        version: 'broken-sha',
        committed_at: '2026-04-22T10:00:00.000Z',
        change_status: { total: 1, additions: 1, deletions: 0 },
      },
    ];

    mockRevisionApi(service, commits, () =>
      Promise.reject(new Error('Failed to fetch current revision')),
    );

    const result = await service.getGistRevisions(config);

    expect(result.success).toBe(true);
    expect(result.revisions?.[0]?.files).toEqual([]);
  });
});
