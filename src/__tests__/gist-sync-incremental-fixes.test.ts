import { describe, expect, it, afterEach, mock, spyOn } from 'bun:test';
import './setup';

import {
  uploadIncremental,
  conditionalGetGist,
  downloadWithManifest,
  type UploadPayload,
} from '../services/gist-sync-incremental';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';
import {
  novelEntryKey,
  memoriesEntryKey,
  MANIFEST_FILE_NAME,
  MANIFEST_SCHEMA_VERSION,
  type GistManifest,
} from '../models/manifest';
import { buildLocalManifest, manifestToHashes } from '../services/sync-manifest-builder';

function makeConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: 1000,
    syncInterval: 300000,
    syncType: SyncType.Gist,
    syncParams: { gistId: 'test-gist-id', token: 'test-token', username: 'test-user' },
    secret: 'test-secret',
    apiEndpoint: '',
    lastRemoteETag: 'etag-v1',
    knownRemoteHashes: {},
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeOctokit(onUpdate: (params: any) => void) {
  return {
    rest: {
      gists: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (params: any) => {
          onUpdate(params);
          return Promise.resolve({
            headers: { etag: 'etag-new' },
            data: { updated_at: '2026-07-09T00:00:00Z', html_url: 'https://gist.github.com/x' },
          });
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeNovel(id: string) {
  return {
    id,
    title: `书 ${id}`,
    cover: '',
    author: '',
    description: '',
    language: 'zh-CN',
    source: '',
    lastEdited: new Date(0),
    volumes: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makePayload(overrides: Partial<UploadPayload> = {}): UploadPayload {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appSettings: { lastEdited: new Date(0) } as any,
    aiModels: [],
    coverHistory: [],
    novels: [],
    memoriesByBook: {},
    ...overrides,
  };
}

afterEach(() => {
  mock.restore();
});

/** 用固定 JSON body 替换全局 fetch（200 响应，携带 etag 头） */
function mockFetchJson(body: unknown): void {
  const impl = () =>
    Promise.resolve({
      status: 200,
      ok: true,
      headers: { get: (name: string) => (name === 'etag' ? 'etag-x' : null) },
      json: () => Promise.resolve(body),
    } as unknown as Response);
  spyOn(globalThis, 'fetch').mockImplementation(impl as unknown as typeof fetch);
}

describe('uploadIncremental — 未上传条目的 chunks 元数据继承', () => {
  it('settings-only 同步时，未变化的分块小说条目在上传的 manifest 中保留 chunks 计数', async () => {
    // 场景：本地只有 settings 变化，novel:book-a 未变（hash 与 knownRemote 一致），
    // 但上次同步时它是分块布局（chunks=3）。buildLocalManifest 不输出 chunks，
    // 序列化阶段也只给 toUpload 中的条目补 chunks——若不从 knownRemoteEntries
    // 继承，写入远端的 manifest 会把该小说的 chunks 抹掉，后续无快照路径将按
    // 单文件名枚举删除目标，null 不存在的文件导致整个 PATCH 422。
    const payload = makePayload({ novels: [makeNovel('book-a')] });

    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const localHashes = manifestToHashes(localManifest);
    const novelKey = novelEntryKey('book-a');

    const config = makeConfig({
      knownRemoteHashes: {
        ...localHashes,
        // 仅 settings 变化，触发上传
        settings: 'different-remote-hash',
      },
      knownRemoteEntries: {
        [novelKey]: { hash: localHashes[novelKey]!, chunks: 3 },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    const result = await uploadIncremental(octokit, config, payload, {
      'tsukuyomi-settings.json': { content: 'old' },
      'novel-book-a.meta.json': { content: '{"chunks":3}' },
      'novel-chunk-book-a_0.json': { content: 'c0' },
      'novel-chunk-book-a_1.json': { content: 'c1' },
      'novel-chunk-book-a_2.json': { content: 'c2' },
    });

    // 只上传了 settings，小说条目未动
    expect(result.uploadedEntries).toEqual(['settings']);

    // 返回的 manifest（会被持久化为 knownRemoteEntries）必须保留 chunks=3
    expect(result.manifest.entries[novelKey]?.chunks).toBe(3);

    // 实际写入 Gist 的 manifest.json 同样必须保留 chunks=3
    const manifestPatch = patches
      .map((p) => p['manifest.json'])
      .find((f) => f && typeof f.content === 'string');
    expect(manifestPatch).toBeTruthy();
    const uploaded = JSON.parse(manifestPatch.content) as GistManifest;
    expect(uploaded.entries[novelKey]?.chunks).toBe(3);
  });

  it('本轮实际上传的条目 chunks 以实际布局为准，不被 knownRemoteEntries 覆盖', async () => {
    // 场景：novel:book-a 内容变化并以单文件布局上传（小内容不分块），
    // 即使 knownRemoteEntries 声称它以前是 chunks=3，manifest 也不应保留旧计数。
    const payload = makePayload({ novels: [makeNovel('book-a')] });

    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const localHashes = manifestToHashes(localManifest);
    const novelKey = novelEntryKey('book-a');

    const config = makeConfig({
      knownRemoteHashes: {
        ...localHashes,
        [novelKey]: 'different-remote-hash',
      },
      knownRemoteEntries: {
        [novelKey]: { hash: 'different-remote-hash', chunks: 3 },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    const result = await uploadIncremental(octokit, config, payload, {
      'novel-book-a.meta.json': { content: '{"chunks":3}' },
      'novel-chunk-book-a_0.json': { content: 'c0' },
      'novel-chunk-book-a_1.json': { content: 'c1' },
      'novel-chunk-book-a_2.json': { content: 'c2' },
    });

    // 单文件布局：chunks 字段应被移除，而不是继承旧的 3
    expect(result.manifest.entries[novelKey]?.chunks).toBeUndefined();
  });
});

describe('conditionalGetGist — gist 级 truncated 检查', () => {
  it('响应顶层 truncated=true 时抛出明确错误，而不是静默丢失文件', async () => {
    // 场景：Gist 超过 300 个文件时 GitHub 只返回前 300 个并置顶层 truncated=true。
    // 若不检查，窗口外的 entry 会静默反序列化为 null → 下载缺数据，
    // 新设备上传 diff 甚至会把"看不见"的远端文件当作已删除批量清空。
    mockFetchJson({
      truncated: true,
      files: { 'novel-a.json': { content: '{}' } },
      updated_at: '2026-07-09T00:00:00Z',
      html_url: 'https://gist.github.com/x',
    });

    let error: unknown;
    try {
      await conditionalGetGist('token', 'gist-id');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('300');
  });

  it('truncated 缺失或为 false 时正常返回文件列表', async () => {
    mockFetchJson({
      truncated: false,
      files: { 'novel-a.json': { content: '{}' } },
      updated_at: '2026-07-09T00:00:00Z',
    });

    const result = await conditionalGetGist('token', 'gist-id');
    expect(result.notModified).toBe(false);
    if (!result.notModified) {
      expect(Object.keys(result.files)).toEqual(['novel-a.json']);
    }
  });
});

describe('uploadIncremental — 纯删除同步也要清理远端文件', () => {
  it('无内容上传、仅删除时，最终批次包含存在于远端快照的 null 删除 + manifest', async () => {
    // 场景：本地删除了 book-a / book-b，其余条目 hash 与远端一致（无内容上传）。
    // 旧行为只写 manifest、跳过删除——被删小说的正文永远留在 Gist 上（隐私问题）。
    const payload = makePayload();

    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const localHashes = manifestToHashes(localManifest);

    const config = makeConfig({
      knownRemoteHashes: {
        ...localHashes,
        [novelEntryKey('book-a')]: 'phantom-a',
        [novelEntryKey('book-b')]: 'phantom-b',
        [memoriesEntryKey('book-a')]: 'phantom-mem-a',
      },
      knownRemoteEntries: {
        [novelEntryKey('book-a')]: { hash: 'phantom-a' },
        [novelEntryKey('book-b')]: { hash: 'phantom-b', chunks: 2 },
        [memoriesEntryKey('book-a')]: { hash: 'phantom-mem-a' },
      },
    });

    // 远端快照：book-a 单文件、book-b 分块布局都真实存在；
    // memories-book-a.json 已不在远端（不得对它发 null，否则 422）
    const remoteFilesSnapshot = {
      'novel-book-a.json': { content: 'x' },
      'novel-book-b.meta.json': { content: '{"chunks":2}' },
      'novel-chunk-book-b_0.json': { content: 'c0' },
      'novel-chunk-book-b_1.json': { content: 'c1' },
      'tsukuyomi-settings.json': { content: 's' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadIncremental(octokit, config, payload, remoteFilesSnapshot as any);

    // 单次 PATCH：manifest 内容 + 存在于快照中的 null 删除
    expect(patches.length).toBe(1);
    const only = patches[0]!;
    expect(only['manifest.json']).toBeTruthy();
    expect(only['novel-book-a.json']).toBeNull();
    expect(only['novel-book-b.meta.json']).toBeNull();
    expect(only['novel-chunk-book-b_0.json']).toBeNull();
    expect(only['novel-chunk-book-b_1.json']).toBeNull();
    // 快照里不存在的文件不得出现（避免 422 missing_field:files）
    expect(only['memories-book-a.json']).toBeUndefined();
    // 未被删除的远端文件不受影响
    expect(only['tsukuyomi-settings.json']).toBeUndefined();
  });

  it('纯删除且无远端快照时，按 knownRemoteEntries 枚举的文件名发出 null 删除', async () => {
    // 伪 CAS 命中等无快照路径：与"有内容批次"时的删除行为保持一致——
    // 信任 knownRemoteEntries 的布局枚举，不做存在性过滤。
    const payload = makePayload();

    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const localHashes = manifestToHashes(localManifest);

    const config = makeConfig({
      knownRemoteHashes: {
        ...localHashes,
        [novelEntryKey('book-a')]: 'phantom-a',
      },
      knownRemoteEntries: {
        [novelEntryKey('book-a')]: { hash: 'phantom-a' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    await uploadIncremental(octokit, config, payload, {});

    expect(patches.length).toBe(1);
    const only = patches[0]!;
    expect(only['manifest.json']).toBeTruthy();
    expect(only['novel-book-a.json']).toBeNull();
  });
});

describe('downloadWithManifest — 失败条目上报', () => {
  it('条目文件缺失导致反序列化失败时，应记录到 failedEntryKeys 而不是静默跳过', async () => {
    const manifest: GistManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-07-01T00:00:00.000Z',
      entries: {
        [novelEntryKey('bx')]: { hash: 'h1', lastEdited: '2026-07-01T00:00:00.000Z' },
      },
    };
    mockFetchJson({
      truncated: false,
      updated_at: '2026-07-01T00:00:00.000Z',
      html_url: 'https://gist.github.com/x',
      files: {
        [MANIFEST_FILE_NAME]: { content: JSON.stringify(manifest), truncated: false },
      },
    });

    const result = await downloadWithManifest(
      makeConfig({ lastRemoteETag: '', knownRemoteHashes: {} }),
    );

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(Object.keys(result.changedEntries)).toEqual([]);
      expect(result.failedEntryKeys).toContain(novelEntryKey('bx'));
    }
  });
});
