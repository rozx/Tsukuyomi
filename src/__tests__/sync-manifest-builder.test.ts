import { describe, expect, it } from 'bun:test';
import './setup';

import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem, Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { AIModel } from 'src/services/ai/types/ai-model';
import {
  ENTRY_KEYS,
  MANIFEST_SCHEMA_VERSION,
  memoriesEntryKey,
  novelEntryKey,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
} from 'src/models/manifest';
import {
  buildLocalManifest,
  diffManifests,
  hashesToManifest,
  manifestToHashes,
  rebuildManifestFromFiles,
  type LocalManifestInput,
} from 'src/services/sync-manifest-builder';

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    lastEdited: new Date('2026-01-01T00:00:00.000Z'),
    scraperConcurrencyLimit: 3,
    taskDefaultModels: {},
    lastOpenedSettingsTab: 0,
    proxyEnabled: false,
    proxyUrl: '',
    proxyAutoSwitch: false,
    proxyAutoAddMapping: false,
    proxyList: [],
    proxySiteMapping: {},
    booksSortOption: 'default',
    quickStartDismissed: false,
    memoryInjection: {
      charBudget: 2000,
      enableSemantic: true,
      minScoreThreshold: 0.38,
      hasSeenIntro: false,
      embeddingModelCached: false,
    },
    ...overrides,
  } as AppSettings;
}

function makeNovel(id: string, lastEditedIso: string): Novel {
  return {
    id,
    title: `Book ${id}`,
    author: '',
    volumes: [],
    lastEdited: new Date(lastEditedIso),
  } as unknown as Novel;
}

function makeModel(id: string): AIModel {
  return {
    id,
    name: `Model ${id}`,
    provider: 'openai',
    lastEdited: new Date('2026-03-01T00:00:00Z'),
  } as unknown as AIModel;
}

function makeCover(id: string, url: string): CoverHistoryItem {
  return { id, url, addedAt: new Date('2026-02-15T00:00:00Z') } as CoverHistoryItem;
}

function makeMemory(id: string, bookId: string): Memory {
  return {
    id,
    bookId,
    content: `content ${id}`,
    summary: '',
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
}

function emptyInput(overrides: Partial<LocalManifestInput> = {}): LocalManifestInput {
  return {
    appSettings: makeSettings(),
    aiModels: [],
    coverHistory: [],
    novels: [],
    memoriesByBook: {},
    ...overrides,
  };
}

describe('manifest entry key helpers', () => {
  it('novelEntryKey / parseNovelEntryKey round-trip', () => {
    const key = novelEntryKey('abc12345');
    expect(key).toBe('novel:abc12345');
    expect(parseNovelEntryKey(key)).toBe('abc12345');
    expect(parseNovelEntryKey('memories:x')).toBeNull();
  });

  it('memoriesEntryKey / parseMemoriesEntryKey round-trip', () => {
    const key = memoriesEntryKey('abc');
    expect(key).toBe('memories:abc');
    expect(parseMemoriesEntryKey(key)).toBe('abc');
    expect(parseMemoriesEntryKey('novel:x')).toBeNull();
  });
});

describe('buildLocalManifest', () => {
  it('produces a manifest with the current schema version', async () => {
    const m = await buildLocalManifest(emptyInput());
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(m.entries[ENTRY_KEYS.SETTINGS]).toBeDefined();
    expect(m.entries[ENTRY_KEYS.AI_MODELS]).toBeDefined();
    expect(m.entries[ENTRY_KEYS.COVER_HISTORY]).toBeDefined();
  });

  it('creates one novel entry per book', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('a', '2026-01-01'), makeNovel('b', '2026-02-02')],
      }),
    );
    expect(m.entries[novelEntryKey('a')]).toBeDefined();
    expect(m.entries[novelEntryKey('b')]).toBeDefined();
  });

  it('creates one memories entry per book with non-empty memories', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: {
          a: [makeMemory('m1', 'a')],
          b: [], // empty — should be skipped
          c: [makeMemory('m2', 'c'), makeMemory('m3', 'c')],
        },
      }),
    );
    expect(m.entries[memoriesEntryKey('a')]).toBeDefined();
    expect(m.entries[memoriesEntryKey('b')]).toBeUndefined();
    expect(m.entries[memoriesEntryKey('c')]).toBeDefined();
  });

  it('is deterministic: identical input → identical hashes', async () => {
    const input = emptyInput({
      aiModels: [makeModel('m1')],
      coverHistory: [makeCover('c1', 'https://example.com/1.jpg')],
      novels: [makeNovel('n1', '2026-01-01')],
    });
    const m1 = await buildLocalManifest(input);
    const m2 = await buildLocalManifest(input);
    expect(manifestToHashes(m1)).toEqual(manifestToHashes(m2));
  });

  it('hash changes when content changes', async () => {
    const m1 = await buildLocalManifest(
      emptyInput({ novels: [makeNovel('n1', '2026-01-01')] }),
    );
    const m2 = await buildLocalManifest(
      emptyInput({ novels: [makeNovel('n1', '2026-02-02')] }),
    );
    expect(m1.entries[novelEntryKey('n1')]!.hash).not.toBe(m2.entries[novelEntryKey('n1')]!.hash);
  });
});

describe('diffManifests', () => {
  it('classifies changed / added / deleted correctly', async () => {
    const oldManifest = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('a', '2026-01-01'), makeNovel('b', '2026-01-01')],
      }),
    );
    const newManifest = await buildLocalManifest(
      emptyInput({
        novels: [
          makeNovel('a', '2026-02-02'), // changed
          // b removed
          makeNovel('c', '2026-01-01'), // added
        ],
      }),
    );
    const diff = diffManifests(newManifest, oldManifest);
    expect(diff.changed.sort()).toEqual([novelEntryKey('a')]);
    expect(diff.added.sort()).toEqual([novelEntryKey('c')]);
    expect(diff.deleted.sort()).toEqual([novelEntryKey('b')]);
  });

  it('returns empty diff for identical manifests', async () => {
    const input = emptyInput({ novels: [makeNovel('a', '2026-01-01')] });
    const m1 = await buildLocalManifest(input);
    const m2 = await buildLocalManifest(input);
    const diff = diffManifests(m1, m2);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.deleted).toEqual([]);
  });
});

describe('hashesToManifest / manifestToHashes', () => {
  it('round-trips the hash map', async () => {
    const manifest = await buildLocalManifest(
      emptyInput({ novels: [makeNovel('a', '2026-01-01')] }),
    );
    const hashes = manifestToHashes(manifest);
    const reconstructed = hashesToManifest(hashes);
    expect(manifestToHashes(reconstructed)).toEqual(hashes);
  });
});

describe('rebuildManifestFromFiles', () => {
  it('infers entry keys from filenames', async () => {
    const m = await rebuildManifestFromFiles({
      'settings.json': '{"a":1}',
      'ai-models.json': '[]',
      'novel-abc.json': '{"id":"abc"}',
      'memories-abc.json': '[]',
      'not-ours.txt': 'ignore me',
    });
    expect(m.entries[ENTRY_KEYS.SETTINGS]).toBeDefined();
    expect(m.entries[ENTRY_KEYS.AI_MODELS]).toBeDefined();
    expect(m.entries[novelEntryKey('abc')]).toBeDefined();
    expect(m.entries[memoriesEntryKey('abc')]).toBeDefined();
    expect(Object.keys(m.entries)).toHaveLength(4);
  });

  it('merges chunk files under the same entry', async () => {
    const m = await rebuildManifestFromFiles({
      'novel-chunk-abc_0.json': 'chunk0',
      'novel-chunk-abc_1.json': 'chunk1',
    });
    expect(Object.keys(m.entries)).toEqual([novelEntryKey('abc')]);
  });

  it('ignores manifest.json itself', async () => {
    const m = await rebuildManifestFromFiles({
      'manifest.json': '{"schemaVersion":2}',
      'novel-abc.json': '{}',
    });
    expect(m.entries[ENTRY_KEYS.SETTINGS]).toBeUndefined();
    expect(Object.keys(m.entries)).toEqual([novelEntryKey('abc')]);
  });
});
