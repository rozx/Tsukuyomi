import { describe, expect, it } from 'bun:test';
import './setup';

import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem, Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { AIModel } from 'src/services/ai/types/ai-model';
import {
  ENTRY_KEYS,
  MANIFEST_SCHEMA_VERSION,
  TOMBSTONE_TTL_DAYS,
  TOMBSTONE_TTL_MS,
  memoriesEntryKey,
  novelEntryKey,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
} from 'src/models/manifest';
import {
  buildLocalManifest,
  buildMemoriesPayload,
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

  it('hashes chunks deterministically regardless of input order', async () => {
    const a = await rebuildManifestFromFiles({
      'novel-chunk-abc_0.json': 'chunk0',
      'novel-chunk-abc_1.json': 'chunk1',
      'novel-chunk-abc_2.json': 'chunk2',
    });
    const b = await rebuildManifestFromFiles({
      'novel-chunk-abc_2.json': 'chunk2',
      'novel-chunk-abc_0.json': 'chunk0',
      'novel-chunk-abc_1.json': 'chunk1',
    });
    expect(a.entries[novelEntryKey('abc')]!.hash).toEqual(
      b.entries[novelEntryKey('abc')]!.hash,
    );
  });

  it('ignores meta sidecar files and does not mix them into entry hash', async () => {
    const withMeta = await rebuildManifestFromFiles({
      'novel-chunk-abc_0.json': 'chunk0',
      'novel-chunk-abc_1.json': 'chunk1',
      'novel-abc.meta.json': '{"chunks":2,"totalSize":123}',
    });
    const withoutMeta = await rebuildManifestFromFiles({
      'novel-chunk-abc_0.json': 'chunk0',
      'novel-chunk-abc_1.json': 'chunk1',
    });
    expect(withMeta.entries[novelEntryKey('abc')]!.hash).toEqual(
      withoutMeta.entries[novelEntryKey('abc')]!.hash,
    );
    // memories meta sidecars should also be ignored
    const m = await rebuildManifestFromFiles({
      'memories-xyz.json': '[]',
      'memories-xyz.meta.json': '{"chunks":1}',
    });
    expect(Object.keys(m.entries)).toEqual([memoriesEntryKey('xyz')]);
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

// ─────────────────────────────────────────────────────────────────────────────
// Tombstone TTL constants & schema version (Phase A — TTL bump to 90 days)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest TTL constants', () => {
  it('TOMBSTONE_TTL_MS equals 90 days (cross-device offline coverage)', () => {
    expect(TOMBSTONE_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('TOMBSTONE_TTL_DAYS derives from TOMBSTONE_TTL_MS (single source of truth)', () => {
    expect(TOMBSTONE_TTL_DAYS).toBe(90);
  });

  it('MANIFEST_SCHEMA_VERSION is 3 (memories envelope + memories tombstones)', () => {
    expect(MANIFEST_SCHEMA_VERSION).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLocalManifest tombstone behavior (revival rule + TTL boundary)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLocalManifest: tombstones', () => {
  it('preserves a tombstone whose entry is absent from local data', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        novels: [],
        tombstones: { [novelEntryKey('gone')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('gone')]).toEqual({
      deletedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('drops tombstone when the entry is genuinely revived (entry.lastEdited >= deletedAt)', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        // Entry edited AFTER the tombstone → real revival, drop tombstone
        novels: [makeNovel('abc', '2026-05-01T00:00:00Z')],
        tombstones: { [novelEntryKey('abc')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('abc')]).toBeUndefined();
  });

  it('keeps tombstone when an entry exists but lastEdited is older than deletedAt (id reuse / clock drift)', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        // Entry edited BEFORE the tombstone → stale residue, keep tombstone
        novels: [makeNovel('abc', '2026-03-01T00:00:00Z')],
        tombstones: { [novelEntryKey('abc')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('abc')]).toEqual({
      deletedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('drops tombstone exactly at the TTL boundary (>= TTL) [edge alignment]', async () => {
    const now = Date.now();
    const exactlyAtTTL = new Date(now - TOMBSTONE_TTL_MS).toISOString();
    const oneMsBefore = new Date(now - TOMBSTONE_TTL_MS + 60_000).toISOString();
    const m = await buildLocalManifest(
      emptyInput({
        tombstones: {
          [novelEntryKey('expired')]: exactlyAtTTL, // == TTL → dropped
          [novelEntryKey('alive')]: oneMsBefore, // < TTL → kept
        },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('expired')]).toBeUndefined();
    expect(m.tombstones?.[novelEntryKey('alive')]).toBeDefined();
  });

  it('accepts memories:<bookId> tombstones (v3+: collection-level memory tombstones)', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        tombstones: { [memoriesEntryKey('book-x')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    expect(m.tombstones?.[memoriesEntryKey('book-x')]).toEqual({
      deletedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('drops invalid deletedAt strings (NaN guard)', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        tombstones: { [novelEntryKey('weird')]: 'not-a-date' },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('weird')]).toBeUndefined();
  });

  it('omits tombstones field entirely when none survive', async () => {
    const m = await buildLocalManifest(emptyInput());
    expect(m.tombstones).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLocalManifest: memories envelope (v3 — payload includes per-memory tombstones)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLocalManifest: memories envelope', () => {
  it('emits a memories entry when only tombstones are present (no live memories)', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: {},
        memoryTombstonesByBook: {
          'book-1': [{ id: 'mem-deleted', deletedAt: 1_000_000 }],
        },
      }),
    );
    expect(m.entries[memoriesEntryKey('book-1')]).toBeDefined();
  });

  it('skips memories entry when both memories and tombstones are empty', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: { 'book-1': [] },
        memoryTombstonesByBook: { 'book-1': [] },
      }),
    );
    expect(m.entries[memoriesEntryKey('book-1')]).toBeUndefined();
  });

  it('hash differs when tombstones differ (envelope is hashed, not just live memories)', async () => {
    const memories = [makeMemory('m1', 'book-1')];
    const m1 = await buildLocalManifest(
      emptyInput({
        memoriesByBook: { 'book-1': memories },
        memoryTombstonesByBook: { 'book-1': [] },
      }),
    );
    const m2 = await buildLocalManifest(
      emptyInput({
        memoriesByBook: { 'book-1': memories },
        memoryTombstonesByBook: {
          'book-1': [{ id: 'old-mem', deletedAt: 1_000_000 }],
        },
      }),
    );
    expect(m1.entries[memoriesEntryKey('book-1')]!.hash).not.toBe(
      m2.entries[memoriesEntryKey('book-1')]!.hash,
    );
  });

  it('tombstone insertion order does not affect hash (sorted by id)', () => {
    const a = buildMemoriesPayload([], [
      { id: 'b', deletedAt: 2 },
      { id: 'a', deletedAt: 1 },
    ]);
    const b = buildMemoriesPayload([], [
      { id: 'a', deletedAt: 1 },
      { id: 'b', deletedAt: 2 },
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('omits empty tombstones field for hash stability with pre-tombstone state', () => {
    const env = buildMemoriesPayload([], []);
    expect('tombstones' in env).toBe(false);
  });

  it('memoryTombstonesByBook tombstone with non-finite deletedAt is filtered', () => {
    const env = buildMemoriesPayload([], [
      { id: 'good', deletedAt: 1_000_000 },
      { id: 'bad', deletedAt: NaN as unknown as number },
    ]);
    expect(env.tombstones).toEqual([{ id: 'good', deletedAt: 1_000_000 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 更深层的边界 / 损坏数据场景（root-cause fix 之后的回归保护带）
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLocalManifest: tombstones — additional edge cases', () => {
  it('复活规则：entry.lastEdited 与墓碑 deletedAt 完全相等时丢弃墓碑（>= 闭区间）', async () => {
    const t = '2026-04-01T00:00:00.000Z';
    const m = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('abc', t)],
        tombstones: { [novelEntryKey('abc')]: t },
      }),
    );
    // lastEdited === deletedAt → 用户在墓碑同一时刻编辑过 → 视为复活
    expect(m.tombstones?.[novelEntryKey('abc')]).toBeUndefined();
  });

  it('复活规则：entry.lastEdited 比墓碑早 1ms 时仍保留墓碑（防 id 复用静默掩盖删除）', async () => {
    const t = '2026-04-01T00:00:00.000Z';
    const oneMsEarlier = new Date(new Date(t).getTime() - 1).toISOString();
    const m = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('abc', oneMsEarlier)],
        tombstones: { [novelEntryKey('abc')]: t },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('abc')]).toEqual({ deletedAt: t });
  });

  it('混合 novel:/memories: 两种墓碑都被正确保留', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        tombstones: {
          [novelEntryKey('book-1')]: '2026-04-01T00:00:00.000Z',
          [memoriesEntryKey('book-2')]: '2026-04-02T00:00:00.000Z',
        },
      }),
    );
    expect(m.tombstones?.[novelEntryKey('book-1')]).toBeDefined();
    expect(m.tombstones?.[memoriesEntryKey('book-2')]).toBeDefined();
  });

  it('memories:<id> 墓碑也参与复活规则（同一书的 memories entry 复活时丢墓碑）', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        // 用 memoryTombstonesByBook 触发 entry 创建（envelope 里有内容）
        memoryTombstonesByBook: {
          'book-x': [{ id: 'mem-1', deletedAt: 2_000_000 }],
        },
        // collection 级墓碑标记 book-x 在更早被整体删除
        tombstones: { [memoriesEntryKey('book-x')]: new Date(1_000_000).toISOString() },
      }),
    );
    // entry.lastEdited（来自 tombstone deletedAt 2_000_000）>= collection 墓碑 1_000_000
    // → 复活，drop collection 级墓碑；保留 entry 自身（含单条 memory 墓碑）
    expect(m.tombstones?.[memoriesEntryKey('book-x')]).toBeUndefined();
    expect(m.entries[memoriesEntryKey('book-x')]).toBeDefined();
  });
});

describe('buildMemoriesPayload — additional edge cases', () => {
  it('过滤 id 为空字符串的墓碑（防御性）', () => {
    const env = buildMemoriesPayload([], [
      { id: '', deletedAt: 1 },
      { id: 'real', deletedAt: 2 },
    ]);
    expect(env.tombstones?.map((t) => t.id)).toEqual(['real']);
  });

  it('过滤 id 为非字符串的墓碑（运行时健壮性）', () => {
    const env = buildMemoriesPayload([], [
      { id: 'real', deletedAt: 1 },
      { id: 123 as unknown as string, deletedAt: 2 },
      { id: null as unknown as string, deletedAt: 3 },
    ]);
    expect(env.tombstones).toEqual([{ id: 'real', deletedAt: 1 }]);
  });

  it('memories 数组与 tombstones 同 id（重新创建后又删，corrupt 状态）—— 不去重，调用方决定语义', () => {
    // 恢复或合并冲突期间可能短暂出现：让数据如实保留，由 apply 端按 deletedAt 比较。
    const env = buildMemoriesPayload(
      [
        {
          id: 'm1',
          bookId: 'b1',
          content: 'live',
          summary: '',
          createdAt: 100,
          lastAccessedAt: 100,
        },
      ],
      [{ id: 'm1', deletedAt: 50 }],
    );
    expect(env.memories).toHaveLength(1);
    expect(env.tombstones).toEqual([{ id: 'm1', deletedAt: 50 }]);
  });

  it('null / undefined 墓碑条目被过滤', () => {
    const env = buildMemoriesPayload(
      [],
      [
        null as unknown as { id: string; deletedAt: number },
        undefined as unknown as { id: string; deletedAt: number },
        { id: 'good', deletedAt: 1 },
      ],
    );
    expect(env.tombstones).toEqual([{ id: 'good', deletedAt: 1 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffManifests — 含墓碑 / 极端 / 混合场景
// ─────────────────────────────────────────────────────────────────────────────

describe('diffManifests: tombstones do not pollute diff buckets', () => {
  it('墓碑只出现在 tombstones 字段，不会被算到 added/changed/deleted 任意桶里', async () => {
    const local = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('a', '2026-01-01')],
        tombstones: { [novelEntryKey('deleted-x')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    const remote = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('a', '2026-01-01')],
      }),
    );
    const diff = diffManifests(local, remote);
    // 完全相同的 entries → 三桶皆空；墓碑独立通道
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.deleted).toEqual([]);
    expect(local.tombstones?.[novelEntryKey('deleted-x')]).toBeDefined();
  });

  it('两 manifest 都为空时 diff 三桶全空', async () => {
    const m1 = await buildLocalManifest(emptyInput());
    const m2 = await buildLocalManifest(emptyInput());
    const diff = diffManifests(m1, m2);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.deleted).toEqual([]);
  });

  it('local 满 / remote 空 → 所有非 baseline entry 算 added', async () => {
    const local = await buildLocalManifest(
      emptyInput({ novels: [makeNovel('a', '2026-01-01'), makeNovel('b', '2026-02-01')] }),
    );
    // 远端只有 baseline (settings/ai-models/cover-history) 但内容相同
    const remote = await buildLocalManifest(emptyInput());
    const diff = diffManifests(local, remote);
    expect(diff.added.sort()).toEqual([novelEntryKey('a'), novelEntryKey('b')]);
    expect(diff.deleted).toEqual([]);
    // baseline hash 一致 → 不应该出现在 changed
    expect(diff.changed).toEqual([]);
  });

  it('local 空 / remote 满 → 所有非 baseline entry 算 deleted', async () => {
    const local = await buildLocalManifest(emptyInput());
    const remote = await buildLocalManifest(
      emptyInput({ novels: [makeNovel('a', '2026-01-01'), makeNovel('b', '2026-02-01')] }),
    );
    const diff = diffManifests(local, remote);
    expect(diff.added).toEqual([]);
    expect(diff.deleted.sort()).toEqual([novelEntryKey('a'), novelEntryKey('b')]);
  });

  it('memories entry diff：live 与 tombstone-only 都参与 diff', async () => {
    const local = await buildLocalManifest(
      emptyInput({
        memoriesByBook: {
          alive: [makeMemory('m1', 'alive')],
        },
        memoryTombstonesByBook: {
          'tombstone-only': [{ id: 'mem-deleted', deletedAt: 1_000_000 }],
        },
      }),
    );
    const remote = await buildLocalManifest(emptyInput());
    const diff = diffManifests(local, remote);
    // 两本书都应该作为新增条目
    expect(diff.added.sort()).toEqual([
      memoriesEntryKey('alive'),
      memoriesEntryKey('tombstone-only'),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLocalManifest — baseline / 多书路由 / 一致性
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLocalManifest: baseline & routing', () => {
  it('完全空输入：仍生成 3 个聚合 baseline entry，且 schema 与时间戳齐全', async () => {
    const m = await buildLocalManifest(emptyInput());
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(typeof m.updatedAt).toBe('string');
    expect(Object.keys(m.entries).sort()).toEqual([
      ENTRY_KEYS.AI_MODELS,
      ENTRY_KEYS.COVER_HISTORY,
      ENTRY_KEYS.SETTINGS,
    ]);
    // 空集合的聚合仍然有合法的（确定性）hash
    expect(m.entries[ENTRY_KEYS.AI_MODELS]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.entries[ENTRY_KEYS.COVER_HISTORY]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.entries[ENTRY_KEYS.SETTINGS]!.hash).toMatch(/^[0-9a-f]{64}$/);
    // 没有 tombstones / 没有书条目
    expect(m.tombstones).toBeUndefined();
    expect(m.entries[novelEntryKey('any')]).toBeUndefined();
  });

  it('多书路由：每本书的 memories envelope 按 bookId 独立，不串扰', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: {
          'book-A': [makeMemory('a1', 'book-A')],
          'book-B': [makeMemory('b1', 'book-B'), makeMemory('b2', 'book-B')],
        },
        memoryTombstonesByBook: {
          'book-A': [{ id: 'a-deleted', deletedAt: 100 }],
          'book-C': [{ id: 'c-deleted', deletedAt: 200 }], // C 没有 live memory，仅墓碑
        },
      }),
    );
    expect(m.entries[memoriesEntryKey('book-A')]).toBeDefined();
    expect(m.entries[memoriesEntryKey('book-B')]).toBeDefined();
    expect(m.entries[memoriesEntryKey('book-C')]).toBeDefined();
    // 三本书 hash 互不相同
    const hashA = m.entries[memoriesEntryKey('book-A')]!.hash;
    const hashB = m.entries[memoriesEntryKey('book-B')]!.hash;
    const hashC = m.entries[memoriesEntryKey('book-C')]!.hash;
    expect(new Set([hashA, hashB, hashC]).size).toBe(3);
  });

  it('memoriesByBook 与 memoryTombstonesByBook 的 bookId 取并集（避免漏 entry）', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: { 'book-A': [makeMemory('a1', 'book-A')] },
        memoryTombstonesByBook: { 'book-B': [{ id: 'mem-x', deletedAt: 100 }] },
      }),
    );
    // A 在 memoriesByBook，B 在 memoryTombstonesByBook，两者都应写 entry
    expect(m.entries[memoriesEntryKey('book-A')]).toBeDefined();
    expect(m.entries[memoriesEntryKey('book-B')]).toBeDefined();
  });

  it('memoryTombstonesByBook 为 undefined 时退化为传统行为（无墓碑、无 entry 当 memories 空）', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: { 'book-A': [] },
        // memoryTombstonesByBook 未传
      }),
    );
    expect(m.entries[memoriesEntryKey('book-A')]).toBeUndefined();
  });

  it('lastEdited 取 memories 与 tombstones deletedAt 的最大值', async () => {
    const memTime = 1_000_000_000;
    const tombTime = 2_000_000_000;
    const m = await buildLocalManifest(
      emptyInput({
        memoriesByBook: {
          'book-A': [
            {
              id: 'm1',
              bookId: 'book-A',
              content: 'c',
              summary: '',
              createdAt: memTime,
              lastAccessedAt: memTime,
            },
          ],
        },
        memoryTombstonesByBook: {
          'book-A': [{ id: 'm-old', deletedAt: tombTime }], // tombstone 比 memory 新
        },
      }),
    );
    expect(m.entries[memoriesEntryKey('book-A')]!.lastEdited).toBe(
      new Date(tombTime).toISOString(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hashesToManifest / manifestToHashes 边界
// ─────────────────────────────────────────────────────────────────────────────

describe('hashesToManifest / manifestToHashes — additional edges', () => {
  it('hashesToManifest 空 map → 空 entries', () => {
    const m = hashesToManifest({});
    expect(m.entries).toEqual({});
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it('manifestToHashes 跳过 tombstones 字段，仅返回 entries 哈希', async () => {
    const m = await buildLocalManifest(
      emptyInput({
        novels: [makeNovel('a', '2026-01-01')],
        tombstones: { [novelEntryKey('deleted')]: '2026-04-01T00:00:00.000Z' },
      }),
    );
    const hashes = manifestToHashes(m);
    expect(hashes[novelEntryKey('deleted')]).toBeUndefined();
    expect(hashes[novelEntryKey('a')]).toBeDefined();
  });
});
