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
  it('reproduces user error: deletion-only batches trigger 422 missing_field:files', async () => {
    // Scenario: local + remote agree on settings/ai-models/cover-history
    // (hashes match), but remote has novels/memories that local has deleted.
    // Diff produces only `deleted` entries → batch is 100% nulls → GitHub rejects.
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

    // Each batch must contain at least one non-null file entry, otherwise GitHub returns
    // 422 missing_field: files
    for (const [idx, batch] of patches.entries()) {
      const keys = Object.keys(batch);
      const nonNullKeys = keys.filter((k) => batch[k] !== null);
      expect(
        nonNullKeys.length,
        `Batch #${idx} sent only null deletions: ${JSON.stringify(batch)}`,
      ).toBeGreaterThan(0);
    }

    // The final PATCH must contain the manifest and all deletion tombstones
    // atomically together, so the old manifest never references deleted files.
    const finalPatch = patches[patches.length - 1]!;
    expect(finalPatch['manifest.json']).toBeTruthy();
    expect(finalPatch['novel-book-a.json']).toBeNull();
    expect(finalPatch['novel-book-b.json']).toBeNull();
    expect(finalPatch['memories-book-a.json']).toBeNull();
    expect(finalPatch['memories-book-b.json']).toBeNull();
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

  it('content uploads happen before manifest/deletion atomic batch', async () => {
    // Mixed case: 1 novel added + 1 novel deleted. Non-null content must go out
    // before the final batch that combines manifest + null deletion.
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

    // At least two PATCHes — first is content, last is manifest + deletion
    expect(patches.length).toBeGreaterThanOrEqual(2);

    const firstPatch = patches[0]!;
    expect(firstPatch['novel-new-book.json']).toBeTruthy();
    expect(firstPatch['manifest.json']).toBeFalsy();

    const finalPatch = patches[patches.length - 1]!;
    expect(finalPatch['manifest.json']).toBeTruthy();
    expect(finalPatch['novel-old-book.json']).toBeNull();
  });
});
