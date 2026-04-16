import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem, Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { AIModel } from 'src/services/ai/types/ai-model';
import {
  ENTRY_KEYS,
  MANIFEST_SCHEMA_VERSION,
  TOMBSTONE_TTL_MS,
  memoriesEntryKey,
  novelEntryKey,
  type GistManifest,
  type ManifestDiff,
  type ManifestEntry,
  type Tombstone,
} from 'src/models/manifest';
import { hashJson } from 'src/utils/content-hash';

/**
 * 构造本地 manifest 时需要的全部数据输入
 * 注意：novels 应该是已加载完整章节内容的版本（即上传路径使用的数据），
 * memoriesByBook 是按 bookId 分组的 Memory 列表。
 */
export interface LocalManifestInput {
  appSettings: AppSettings;
  aiModels: AIModel[];
  coverHistory: CoverHistoryItem[];
  novels: Novel[];
  memoriesByBook: Record<string, Memory[]>;
  /**
   * 墓碑：entryKey -> deletedAt ISO。
   * 由调用方合并"本地删除记录 + 上次已知的远端墓碑"后传入。
   * 超过 TTL 的墓碑会在此函数中被修剪。
   * 当前仅支持 `novel:<bookId>` 形式的墓碑。
   */
  tombstones?: Record<string, string>;
}

/**
 * 计算聚合条目的 lastEdited：取子元素中最大的时间戳。
 * 空集合返回 epoch（1970-01-01T00:00:00Z）。
 */
function maxDate(dates: Array<Date | number | string | undefined>): string {
  let maxMs = 0;
  for (const d of dates) {
    if (d === undefined || d === null) continue;
    const ms = typeof d === 'number' ? d : new Date(d).getTime();
    if (!Number.isNaN(ms) && ms > maxMs) {
      maxMs = ms;
    }
  }
  return new Date(maxMs).toISOString();
}

/**
 * 基于本地数据构造 manifest。
 * 每个条目的哈希基于压缩前的 JSON 字符串计算（经 serializeDates 规范化）。
 * `chunks` 字段由上传路径在决定实际文件布局时补齐，builder 输出不包含。
 */
export async function buildLocalManifest(input: LocalManifestInput): Promise<GistManifest> {
  const entries: Record<string, ManifestEntry> = {};

  // settings
  entries[ENTRY_KEYS.SETTINGS] = {
    hash: await hashJson(input.appSettings),
    lastEdited: new Date(input.appSettings.lastEdited ?? 0).toISOString(),
  };

  // ai-models（聚合条目）
  entries[ENTRY_KEYS.AI_MODELS] = {
    hash: await hashJson(input.aiModels),
    lastEdited: maxDate(input.aiModels.map((m) => m.lastEdited)),
  };

  // cover-history（聚合条目）
  entries[ENTRY_KEYS.COVER_HISTORY] = {
    hash: await hashJson(input.coverHistory),
    lastEdited: maxDate(input.coverHistory.map((c) => c.addedAt)),
  };

  // 每本书
  for (const novel of input.novels) {
    entries[novelEntryKey(novel.id)] = {
      hash: await hashJson(novel),
      lastEdited: new Date(novel.lastEdited ?? 0).toISOString(),
    };
  }

  // 每本书的 memories
  for (const [bookId, memories] of Object.entries(input.memoriesByBook)) {
    if (!memories || memories.length === 0) {
      // 空集合不写入 manifest——下载端不会尝试读取不存在的 memories 文件
      continue;
    }
    entries[memoriesEntryKey(bookId)] = {
      hash: await hashJson(memories),
      lastEdited: maxDate(memories.map((m) => m.lastAccessedAt)),
    };
  }

  // 构造墓碑：过滤掉已在 entries 中复活的键，以及超过 TTL 的旧墓碑
  const liveKeys = new Set(Object.keys(entries));
  const now = Date.now();
  const tombstones: Record<string, Tombstone> = {};
  for (const [key, deletedAtIso] of Object.entries(input.tombstones ?? {})) {
    if (liveKeys.has(key)) continue; // 条目已复活，墓碑失效
    const t = new Date(deletedAtIso).getTime();
    if (!Number.isFinite(t)) continue;
    if (now - t > TOMBSTONE_TTL_MS) continue; // 超过 TTL，修剪
    tombstones[key] = { deletedAt: deletedAtIso };
  }

  const manifest: GistManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    entries,
  };
  if (Object.keys(tombstones).length > 0) {
    manifest.tombstones = tombstones;
  }
  return manifest;
}

/**
 * 比较两个 manifest，返回三组 entry key。
 *
 * 语义（站在"本地视角"）：
 * - `changed`：两边都存在但 hash 不同——需要在本地 apply 远端版本（或上传本地版本）
 * - `added`：本地独有（远端缺失）——需要上传
 * - `deleted`：远端独有（本地缺失）——需要应用远端（或在反向 diff 中删除远端）
 *
 * 注意：两个 manifest 对象可以是"本地 vs 远端"，也可以是"当前 vs 上次已知远端"。
 * 上传路径使用 local vs knownRemote，下载路径使用 remote vs knownRemote。
 */
export function diffManifests(local: GistManifest, remote: GistManifest): ManifestDiff {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];

  const localKeys = new Set(Object.keys(local.entries));
  const remoteKeys = new Set(Object.keys(remote.entries));

  for (const key of localKeys) {
    if (!remoteKeys.has(key)) {
      added.push(key);
    } else if (local.entries[key]!.hash !== remote.entries[key]!.hash) {
      changed.push(key);
    }
  }

  for (const key of remoteKeys) {
    if (!localKeys.has(key)) {
      deleted.push(key);
    }
  }

  return { changed, added, deleted };
}

/**
 * 将 `knownRemoteHashes` 压扁成一个 pseudo-manifest，方便用 `diffManifests` 比较。
 * 用于判断"本地状态与上次已知远端状态"的差异（= 本地有哪些改动需要上传）。
 */
export function hashesToManifest(hashes: Record<string, string>): GistManifest {
  const entries: Record<string, ManifestEntry> = {};
  for (const [key, hash] of Object.entries(hashes)) {
    entries[key] = { hash, lastEdited: new Date(0).toISOString() };
  }
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    entries,
  };
}

/**
 * 从 manifest 中提取所有条目的哈希为平面 map，便于持久化到 SyncConfig。
 */
export function manifestToHashes(manifest: GistManifest): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(manifest.entries)) {
    result[key] = entry.hash;
  }
  return result;
}

/**
 * 从 manifest 提取完整条目元数据（hash + chunks），便于持久化到 SyncConfig。
 * 上传路径使用它枚举每个 entry 对应的 Gist 文件名，避免删除/chunk 迁移留下孤儿文件。
 */
export function manifestToEntries(
  manifest: GistManifest,
): Record<string, { hash: string; chunks?: number }> {
  const result: Record<string, { hash: string; chunks?: number }> = {};
  for (const [key, entry] of Object.entries(manifest.entries)) {
    result[key] = entry.chunks !== undefined
      ? { hash: entry.hash, chunks: entry.chunks }
      : { hash: entry.hash };
  }
  return result;
}

/**
 * 当远端 manifest.json 缺失、损坏或被第三方编辑时的回退重建。
 * 根据实际文件列表的命名约定推断 entry key，哈希值基于文件原始内容（压缩后字节）计算。
 * 返回的 manifest 是"最佳猜测"，可能与权威版本略有差异；仅用于降级同步。
 *
 * @param rawFiles 文件名 -> 原始 JSON 字符串（解压后的数据）
 */
export async function rebuildManifestFromFiles(
  rawFiles: Record<string, string>,
): Promise<GistManifest> {
  const entries: Record<string, ManifestEntry> = {};
  const nowIso = new Date(0).toISOString();

  for (const [filename, content] of Object.entries(rawFiles)) {
    const entryKey = filenameToEntryKey(filename);
    if (!entryKey) continue;

    // 若同一 entry 由多个文件组成（如分块），先拼接再哈希
    const prev = entries[entryKey];
    if (prev) {
      prev.hash = await hashJsonString(`${prev.hash}|${content}`);
    } else {
      entries[entryKey] = {
        hash: await hashJsonString(content),
        lastEdited: nowIso,
      };
    }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    entries,
  };
}

async function hashJsonString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 根据文件名约定推断 entry key。
 * 返回 null 表示这不是我们识别的 Tsukuyomi 文件（如第三方文件，忽略）。
 */
function filenameToEntryKey(filename: string): string | null {
  if (filename === 'manifest.json') return null; // manifest 本身不记录自己
  if (filename === 'settings.json' || filename === 'tsukuyomi-settings.json') {
    return ENTRY_KEYS.SETTINGS;
  }
  if (filename === 'ai-models.json') return ENTRY_KEYS.AI_MODELS;
  if (filename === 'cover-history.json') return ENTRY_KEYS.COVER_HISTORY;

  // novel-chunk-<id>_N.json (or _/#/- separator variants) — must check before plain novel-
  if (filename.startsWith('novel-chunk-')) {
    const novelChunkMatch = filename.match(/^novel-chunk-(.+?)[_#-]\d+\.json$/);
    if (novelChunkMatch && novelChunkMatch[1]) return novelEntryKey(novelChunkMatch[1]);
    return null;
  }

  // memories-chunk-<id>_N.json — must check before plain memories-
  if (filename.startsWith('memories-chunk-')) {
    const memChunkMatch = filename.match(/^memories-chunk-(.+?)[_#-]\d+\.json$/);
    if (memChunkMatch && memChunkMatch[1]) return memoriesEntryKey(memChunkMatch[1]);
    return null;
  }

  // novel-<id>.json or novel-<id>.meta.json
  const novelMatch = filename.match(/^novel-([^/]+?)(?:\.meta)?\.json$/);
  if (novelMatch && novelMatch[1]) return novelEntryKey(novelMatch[1]);

  // memories-<id>.json or memories-<id>.meta.json
  const memMatch = filename.match(/^memories-([^/]+?)(?:\.meta)?\.json$/);
  if (memMatch && memMatch[1]) return memoriesEntryKey(memMatch[1]);

  return null;
}
