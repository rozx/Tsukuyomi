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
    knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION,
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
function mockFetchJson(body: unknown) {
  const impl = () =>
    Promise.resolve({
      status: 200,
      ok: true,
      headers: { get: (name: string) => (name === 'etag' ? 'etag-x' : null) },
      json: () => Promise.resolve(body),
    } as unknown as Response);
  return spyOn(globalThis, 'fetch').mockImplementation(impl as unknown as typeof fetch);
}

describe('uploadIncremental — 未上传条目的 chunks 元数据继承', () => {
  it('另一设备在批次之间写入时停止上传，不发布最终 manifest', async () => {
    const patches: Record<string, unknown>[] = [];
    const octokit = makeOctokit((params) => patches.push(params.files));
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: 'etag-v1' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: {} }), {
          status: 200,
          headers: { etag: 'another-device' },
        }),
      );
    let failure: unknown;
    try {
      await uploadIncremental(
        octokit,
        makeConfig(),
        makePayload({
          novels: Array.from({ length: 11 }, (_, i) => makeNovel(`batch-${i}`)),
        }),
        {},
        undefined,
        'zh-CN',
        { checkConcurrency: true },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.[MANIFEST_FILE_NAME]).toBeUndefined();
  });
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
  it('条目正文与 manifest 哈希不一致时拒绝应用', async () => {
    const novel = makeNovel('mismatch');
    const manifest: GistManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '',
      entries: { 'novel:mismatch': { hash: '0'.repeat(64), lastEdited: '' } },
    };
    mockFetchJson({
      files: {
        'manifest.json': { content: JSON.stringify(manifest) },
        'novel-mismatch.json': { content: JSON.stringify(novel) },
      },
    });
    const result = await downloadWithManifest(makeConfig());
    if (result.skipped) throw new Error('unexpected skipped');
    expect(result.failedEntryKeys).toEqual(['novel:mismatch']);
    expect(result.changedEntries).toEqual({});
  });
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

describe('v4 实体协议发布', () => {
  it('v5 升级围栏中的 v4 正文仍按旧协议读取，不能用新格式哈希拒绝迁移', async () => {
    mockFetchJson({
      files: {
        'manifest.json': {
          content: JSON.stringify({
            schemaVersion: MANIFEST_SCHEMA_VERSION,
            pendingUpgradeFrom: 4,
            updatedAt: '',
            entries: { 'novel:old-layout': { hash: 'legacy-hash', lastEdited: '' } },
          }),
        },
        'novel-old-layout.json': { content: JSON.stringify(makeNovel('old-layout')) },
      },
    });
    const result = await downloadWithManifest(makeConfig());
    if (result.skipped) throw new Error('unexpected skipped');
    expect(result.failedEntryKeys).toEqual([]);
    expect(result.changedEntries['novel:old-layout']).toBeDefined();
  });
  it('v4 远端需要升级，以隔离旧客户端的 Memory 访问同步语义', async () => {
    mockFetchJson({
      files: {
        'manifest.json': {
          content: JSON.stringify({
            schemaVersion: 4,
            updatedAt: '',
            entries: {},
          }),
        },
      },
    });
    const result = await downloadWithManifest(makeConfig());
    if (result.skipped) throw new Error('unexpected skipped');
    expect(result.needsSchemaUpgrade).toBe(true);
  });
  it('旧协议 hash 相同仍将必需文件和 v4 manifest 一次发布，未来协议不 PATCH', async () => {
    const payload = makePayload({
      novels: Array.from({ length: 32 }, (_, i) => makeNovel(`b${i}`)),
    });
    const manifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: [],
      coverHistory: [],
      novels: payload.novels,
      memoriesByBook: {},
    });
    const config = makeConfig({ knownRemoteHashes: manifestToHashes(manifest) });
    const old = { ...manifest, schemaVersion: 3 };
    const patches: Record<string, unknown>[] = [];
    const octokit = makeOctokit((params) => patches.push(params.files));
    const result = await uploadIncremental(octokit, config, payload, {
      'manifest.json': { content: JSON.stringify(old) },
    });
    expect(result.manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(patches).toHaveLength(1);
    expect(patches[0]!['novel-b0.json']).toBeDefined();
    expect(patches[0]!['novel-b31.json']).toBeDefined();
    const future = { ...manifest, schemaVersion: 99 };
    let error: unknown;
    try {
      await uploadIncremental(octokit, config, payload, {
        'manifest.json': { content: JSON.stringify(future) },
      });
    } catch (value) {
      error = value;
    }
    expect(error).toBeInstanceOf(Error);
    expect(patches).toHaveLength(1);
  });

  it('旧协议下载忽略已知 hash，读取并验证所有迁移条目', async () => {
    const novel = makeNovel('old');
    const manifest: GistManifest = {
      schemaVersion: 3,
      updatedAt: new Date(0).toISOString(),
      entries: { 'novel:old': { hash: 'same', lastEdited: new Date(0).toISOString() } },
    };
    mockFetchJson({
      files: {
        'manifest.json': { content: JSON.stringify(manifest) },
        'novel-old.json': { content: JSON.stringify(novel) },
      },
      updated_at: '',
    });
    const result = await downloadWithManifest(
      makeConfig({ knownRemoteHashes: { 'novel:old': 'same' } }),
    );
    if (result.skipped) throw new Error('unexpected skipped');
    expect(result.changedEntries['novel:old']).toBeDefined();
    expect(result.needsSchemaUpgrade).toBe(true);
  });
});

it('读取到未来书籍实体协议时整体中止，不降级为可覆盖的旧格式', async () => {
  const { expect: check } = await import('vitest');
  const manifest: GistManifest = {
    schemaVersion: 4,
    updatedAt: new Date(0).toISOString(),
    entries: { 'novel:future': { hash: 'future', lastEdited: new Date(0).toISOString() } },
  };
  mockFetchJson({
    files: {
      'manifest.json': { content: JSON.stringify(manifest) },
      'novel-future.json': {
        content: JSON.stringify({ ...makeNovel('future'), entitySyncVersion: 2 }),
      },
    },
  });
  await check(downloadWithManifest(makeConfig())).rejects.toThrow(
    'UNSUPPORTED_ENTITY_SYNC_VERSION',
  );
});

it('协议未知或旧版时不能用 304 跳过升级检查，确认 v4 后才发送条件 ETag', async () => {
  const manifest: GistManifest = {
    schemaVersion: 3,
    updatedAt: new Date(0).toISOString(),
    entries: {},
  };
  const fetch = mockFetchJson({
    files: { 'manifest.json': { content: JSON.stringify(manifest) } },
  });
  await downloadWithManifest(makeConfig({ knownRemoteSchemaVersion: 3 }));
  expect(new Headers(fetch.mock.calls[0]![1]?.headers).has('If-None-Match')).toBe(false);
  fetch.mockClear();
  await downloadWithManifest(makeConfig({ knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION }));
  expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('If-None-Match')).toBe('etag-v1');
});

it('缺少 manifest 的旧布局迁移也必须一次发布全部文件与 v4 指针', async () => {
  const payload = makePayload({
    novels: Array.from({ length: 25 }, (_, i) => makeNovel(`legacy${i}`)),
  });
  const patches: Record<string, unknown>[] = [];
  await uploadIncremental(
    makeOctokit((params) => patches.push(params.files)),
    Object.fromEntries(
      Object.entries(makeConfig()).filter(([key]) => key !== 'knownRemoteSchemaVersion'),
    ) as unknown as SyncConfig,
    payload,
    { 'novel-old.json': { content: '{}' } },
  );
  expect(patches).toHaveLength(1);
  expect(patches[0]!['manifest.json']).toBeDefined();
  expect(patches[0]!['novel-legacy24.json']).toBeDefined();
});

it('已知未来协议但缺少远端快照时不能重建低版本 manifest', async () => {
  const { expect: check } = await import('vitest');
  const patches: unknown[] = [];
  await check(
    uploadIncremental(
      makeOctokit((params) => patches.push(params)),
      makeConfig({ knownRemoteSchemaVersion: 99 }),
      makePayload(),
      {},
    ),
  ).rejects.toThrow('较新版本');
  expect(patches).toEqual([]);
});

describe('大书库 v4 升级：先写围栏 manifest 再分批', () => {
  const BUDGET = 4 * 1024 * 1024;
  // 随机内容抵消压缩，让序列化后的总量超过单批字节预算
  function bigNovel(id: string, bytes: number) {
    const random = new Uint8Array(bytes / 2);
    for (let i = 0; i < random.length; i += 65536)
      crypto.getRandomValues(random.subarray(i, Math.min(i + 65536, random.length)));
    const text = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
    return { ...makeNovel(id), description: text };
  }
  function batchBytes(files: Record<string, { content: string } | null>): number {
    return Object.entries(files).reduce(
      (sum, [name, file]) => sum + name.length + (file?.content.length ?? 0),
      0,
    );
  }

  it('超过单批预算时第一批只写 schemaVersion 4 的围栏 manifest，内容分批，最后写正式 manifest', async () => {
    const payload = makePayload({
      novels: [bigNovel('a', 3_000_000), bigNovel('b', 3_000_000)],
    });
    const local = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: [],
      coverHistory: [],
      novels: payload.novels,
      memoriesByBook: {},
    });
    const old: GistManifest = { ...local, schemaVersion: 3 };
    const patches: Record<string, { content: string } | null>[] = [];
    const result = await uploadIncremental(
      makeOctokit((params) => patches.push(params.files)),
      makeConfig({ knownRemoteHashes: manifestToHashes(local), knownRemoteSchemaVersion: 3 }),
      payload,
      { 'manifest.json': { content: JSON.stringify(old) } },
    );

    expect(patches.length).toBeGreaterThan(2);
    expect(Object.keys(patches[0]!)).toEqual([MANIFEST_FILE_NAME]);
    const fence = JSON.parse(patches[0]![MANIFEST_FILE_NAME]!.content) as GistManifest;
    expect(fence.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(fence.pendingUpgradeFrom).toBe(3);
    expect(fence.entries).toEqual(old.entries);
    for (const batch of patches.slice(1))
      expect(batchBytes(batch)).toBeLessThanOrEqual(BUDGET * 1.1);
    const last = patches[patches.length - 1]!;
    const final = JSON.parse(last[MANIFEST_FILE_NAME]!.content) as GistManifest;
    expect(final.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(final.pendingUpgradeFrom).toBeUndefined();
    expect(patches.slice(1, -1).every((batch) => !(MANIFEST_FILE_NAME in batch))).toBe(true);
    expect(result.manifest.pendingUpgradeFrom).toBeUndefined();
  });

  it('远端是未完成升级的围栏且内容装得下一批时，一次 PATCH 完成升级', async () => {
    const payload = makePayload({ novels: [makeNovel('small')] });
    const local = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: [],
      coverHistory: [],
      novels: payload.novels,
      memoriesByBook: {},
    });
    const fence: GistManifest = { ...local, schemaVersion: 4, pendingUpgradeFrom: 3 };
    const patches: Record<string, { content: string } | null>[] = [];
    await uploadIncremental(
      makeOctokit((params) => patches.push(params.files)),
      makeConfig({
        knownRemoteHashes: manifestToHashes(local),
        knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION,
      }),
      payload,
      { 'manifest.json': { content: JSON.stringify(fence) } },
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]!['novel-small.json']).toBeDefined();
    const final = JSON.parse(patches[0]![MANIFEST_FILE_NAME]!.content) as GistManifest;
    expect(final.pendingUpgradeFrom).toBeUndefined();
  });

  it('远端缺少 manifest 且超过预算时按普通分批上传，manifest 在最后一批', async () => {
    const payload = makePayload({
      novels: [bigNovel('x', 3_000_000), bigNovel('y', 3_000_000)],
    });
    const patches: Record<string, { content: string } | null>[] = [];
    await uploadIncremental(
      makeOctokit((params) => patches.push(params.files)),
      Object.fromEntries(
        Object.entries(makeConfig()).filter(([key]) => key !== 'knownRemoteSchemaVersion'),
      ) as unknown as SyncConfig,
      payload,
      { 'novel-old.json': { content: '{}' } },
    );
    expect(patches.length).toBeGreaterThan(1);
    for (const batch of patches) expect(batchBytes(batch)).toBeLessThanOrEqual(BUDGET * 1.1);
    expect(patches.slice(0, -1).every((batch) => !(MANIFEST_FILE_NAME in batch))).toBe(true);
    expect(patches[patches.length - 1]![MANIFEST_FILE_NAME]).toBeDefined();
  });

  it('下载到围栏 manifest 时视为仍需升级，忽略已知 hash 读取全部条目', async () => {
    const novel = makeNovel('fenced');
    const manifest: GistManifest = {
      schemaVersion: 4,
      pendingUpgradeFrom: 3,
      updatedAt: new Date(0).toISOString(),
      entries: { 'novel:fenced': { hash: 'same', lastEdited: new Date(0).toISOString() } },
    };
    mockFetchJson({
      files: {
        'manifest.json': { content: JSON.stringify(manifest) },
        'novel-fenced.json': { content: JSON.stringify(novel) },
      },
      updated_at: '',
    });
    const result = await downloadWithManifest(
      makeConfig({ knownRemoteHashes: { 'novel:fenced': 'same' } }),
    );
    if (result.skipped) throw new Error('unexpected skipped');
    expect(result.needsSchemaUpgrade).toBe(true);
    expect(result.changedEntries['novel:fenced']).toBeDefined();
  });
});
