import { describe, expect, it } from 'bun:test';
import './setup';

import { uploadIncremental, type UploadPayload } from '../services/gist-sync-incremental';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';
import { novelEntryKey, memoriesEntryKey } from '../models/manifest';
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

function makeOctokit(onUpdate: (params: any) => void) {
  return {
    rest: {
      gists: {
        update: (params: any) => {
          onUpdate(params);
          return Promise.resolve({
            headers: { etag: 'etag-new' },
            data: { updated_at: '2026-04-16T17:32:10Z', html_url: 'https://gist.github.com/x' },
          });
        },
      },
    },
  } as any;
}

describe('uploadIncremental — batch payload structure', () => {
  it('pure-deletion scenario: single PATCH carries manifest + null deletions', async () => {
    // 场景：settings/ai-models/cover-history 与远端一致（hash 相同），但远端还有
    // 本地已删除的 novels/memories。删除必须与 manifest 同批发出——否则被删
    // 内容会永远留在 Gist 上（隐私问题）。manifest 是非 null 内容，PATCH 不会
    // 触发 GitHub 对"纯 null 请求"的 422；无远端快照时信任 knownRemoteEntries
    // 枚举的文件名（与有内容批次时的删除行为一致）。
    const payload: UploadPayload = {
      appSettings: { lastEdited: new Date(0) } as any,
      aiModels: [],
      coverHistory: [],
      novels: [],
      memoriesByBook: {},
    };

    // Compute what the LOCAL hashes would be, then use those same hashes as
    // knownRemote for settings/ai-models/cover-history (so no diff there).
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
        ...localHashes, // matches -> no change for settings/ai-models/cover-history
        [novelEntryKey('book-a')]: 'phantom-novel-a',
        [novelEntryKey('book-b')]: 'phantom-novel-b',
        [memoriesEntryKey('book-a')]: 'phantom-mem-a',
        [memoriesEntryKey('book-b')]: 'phantom-mem-b',
      },
      knownRemoteEntries: {
        [novelEntryKey('book-a')]: { hash: 'phantom-novel-a' },
        [novelEntryKey('book-b')]: { hash: 'phantom-novel-b' },
        [memoriesEntryKey('book-a')]: { hash: 'phantom-mem-a' },
        [memoriesEntryKey('book-b')]: { hash: 'phantom-mem-b' },
      },
    });

    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => {
      patches.push(params.files ?? {});
    });

    await uploadIncremental(octokit, config, payload, {});

    // 单次 PATCH：manifest 内容 + 按 knownRemoteEntries 枚举的 null 删除
    expect(patches.length).toBe(1);
    const only = patches[0]!;
    expect(only['manifest.json']).toBeTruthy();
    expect(only['novel-book-a.json']).toBeNull();
    expect(only['novel-book-b.json']).toBeNull();
    expect(only['memories-book-a.json']).toBeNull();
    expect(only['memories-book-b.json']).toBeNull();
  });

  it('single PATCH when there are neither uploads nor deletions (manifest only)', async () => {
    // Hash mismatch at useSyncExecutor level triggered upload, but by the time we
    // rebuild local manifest, nothing differs. Just write the manifest.
    const payload: UploadPayload = {
      appSettings: { lastEdited: new Date(0) } as any,
      aiModels: [],
      coverHistory: [],
      novels: [],
      memoriesByBook: {},
    };
    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const config = makeConfig({ knownRemoteHashes: manifestToHashes(localManifest) });

    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    await uploadIncremental(octokit, config, payload, {});

    expect(patches.length).toBe(1);
    expect(patches[0]!['manifest.json']).toBeTruthy();
  });

  it('content uploads + deletions + manifest all sent in a single atomic PATCH when they fit', async () => {
    // Mixed case: 1 novel added + 1 novel deleted. Everything fits under BATCH_SIZE,
    // so it should go out as a single atomic PATCH with content + nulls + manifest.
    const novel = {
      id: 'new-book',
      title: 'N',
      cover: '',
      author: '',
      description: '',
      language: 'zh-CN',
      source: '',
      lastEdited: new Date(0),
      volumes: [],
    };
    const payload: UploadPayload = {
      appSettings: { lastEdited: new Date(0) } as any,
      aiModels: [],
      coverHistory: [],
      novels: [novel as any],
      memoriesByBook: {},
    };
    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const config = makeConfig({
      knownRemoteHashes: {
        ...manifestToHashes(localManifest),
        // Pretend remote still has an old novel that the local deleted
        [novelEntryKey('old-book')]: 'phantom',
        // Force the new novel to be seen as a content change, not a no-op
        [novelEntryKey('new-book')]: 'different-old-hash',
      },
      knownRemoteEntries: {
        [novelEntryKey('old-book')]: { hash: 'phantom' },
      },
    });

    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    await uploadIncremental(octokit, config, payload, {});

    // Everything fits in one batch; merged into a single atomic PATCH
    expect(patches.length).toBe(1);
    const only = patches[0]!;
    expect(only['novel-new-book.json']).toBeTruthy();
    expect(only['manifest.json']).toBeTruthy();
    expect(only['novel-old-book.json']).toBeNull();
  });

  it('multiple content batches: only the LAST batch carries manifest + deletions (no standalone null batch)', async () => {
    // Create > BATCH_SIZE (10) novels so additions need multiple batches.
    // The final batch should be (remaining content + deletions + manifest).
    const novels = Array.from({ length: 12 }, (_, i) => ({
      id: `book-${i}`,
      title: `N${i}`,
      cover: '',
      author: '',
      description: '',
      language: 'zh-CN',
      source: '',
      lastEdited: new Date(0),
      volumes: [],
    }));
    const payload: UploadPayload = {
      appSettings: { lastEdited: new Date(0) } as any,
      aiModels: [],
      coverHistory: [],
      novels: novels as any,
      memoriesByBook: {},
    };
    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    // Force all entries to appear as changed vs known
    const known: Record<string, string> = {};
    for (const k of Object.keys(manifestToHashes(localManifest))) known[k] = 'different';
    known[novelEntryKey('phantom-book')] = 'phantom'; // forces a deletion too

    const config = makeConfig({
      knownRemoteHashes: known,
      knownRemoteEntries: { [novelEntryKey('phantom-book')]: { hash: 'phantom' } },
    });

    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    await uploadIncremental(octokit, config, payload, {});

    // There should be more than one batch since we have > 10 content files
    expect(patches.length).toBeGreaterThan(1);

    // No batch may be "nulls only" (would trigger 422 missing_field:files)
    for (const [idx, p] of patches.entries()) {
      const nonNull = Object.values(p).filter((v) => v !== null).length;
      expect(nonNull, `Batch #${idx} had no non-null entries`).toBeGreaterThan(0);
    }

    // First batch: pure content, no manifest, no deletions
    expect(patches[0]!['manifest.json']).toBeFalsy();
    expect(patches[0]!['novel-phantom-book.json']).toBeUndefined();

    // Last batch: contains manifest + phantom deletion + remaining content
    const last = patches[patches.length - 1]!;
    expect(last['manifest.json']).toBeTruthy();
    expect(last['novel-phantom-book.json']).toBeNull();
  });

  it('filters out deletions of files absent from remote snapshot (avoids GitHub 422)', async () => {
    // Reproduces the real-world bug: knownEntries claims a novel was chunked (chunks=5),
    // but those chunk files no longer exist on Gist (e.g., a partial prior sync wrote
    // the new single-file layout but failed before updating knownEntries). If we tried
    // to null those nonexistent chunks, GitHub rejects the entire PATCH with
    // 422 missing_field:files. Instead, we filter deletions by actual remote presence.
    const novel = {
      id: 'book-a',
      title: 'N',
      cover: '',
      author: '',
      description: '',
      language: 'zh-CN',
      source: '',
      lastEdited: new Date(0),
      volumes: [],
    };
    const payload: UploadPayload = {
      appSettings: { lastEdited: new Date(0) } as any,
      aiModels: [],
      coverHistory: [],
      novels: [novel as any],
      memoriesByBook: {},
    };
    const localManifest = await buildLocalManifest({
      appSettings: payload.appSettings,
      aiModels: payload.aiModels,
      coverHistory: payload.coverHistory,
      novels: payload.novels,
      memoriesByBook: payload.memoriesByBook,
    });
    const config = makeConfig({
      knownRemoteHashes: {
        ...manifestToHashes(localManifest),
        [novelEntryKey('book-a')]: 'force-upload',
      },
      // knownEntries says book-a was chunked=5 previously
      knownRemoteEntries: {
        [novelEntryKey('book-a')]: { hash: 'old', chunks: 5 },
      },
    });

    // Remote snapshot: only the new single-file layout exists, no chunk/meta files
    const remoteFilesSnapshot = {
      'novel-book-a.json': { content: '{"format":"gzip","data":"..."}' },
      // explicitly no 'novel-book-a.meta.json' nor 'novel-chunk-book-a_*.json'
    };

    const patches: Array<Record<string, any>> = [];
    const octokit = makeOctokit((params) => patches.push(params.files ?? {}));

    await uploadIncremental(octokit, config, payload, remoteFilesSnapshot as any);

    // None of the non-existent chunk/meta files should appear as deletions
    for (const batch of patches) {
      expect(batch['novel-book-a.meta.json']).toBeUndefined();
      for (let i = 0; i < 5; i++) {
        expect(batch[`novel-chunk-book-a_${i}.json`]).toBeUndefined();
      }
    }

    // The new content + manifest DOES go out
    const allKeys = patches.flatMap((p) => Object.keys(p));
    expect(allKeys).toContain('novel-book-a.json');
    expect(allKeys).toContain('manifest.json');
  });
});
