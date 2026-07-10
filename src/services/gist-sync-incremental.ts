import type { Octokit } from '@octokit/rest';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel, CoverHistoryItem } from 'src/models/novel';
import type { AppSettings } from 'src/models/settings';
import type { Memory } from 'src/models/memory';
import type { SyncConfig } from 'src/models/sync';
import {
  MANIFEST_FILE_NAME,
  MANIFEST_SCHEMA_VERSION,
  ENTRY_KEYS,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
  type GistManifest,
  type ManifestDiff,
  type ManifestEntry,
  type MemoriesPayload,
  type MemoryTombstone,
} from 'src/models/manifest';
import { buildLocalManifest, buildMemoriesPayload, diffManifests } from 'src/services/sync-manifest-builder';
import { compressString, decompressString } from 'src/utils/compression';
import { deserializeDates } from 'src/utils/serialize-dates';
import { canonicalStringify } from 'src/utils/canonical-json';

/**
 * 单文件大小上限（压缩后字节）。超出需要分块。GitHub 实际 1MB，留 100KB 余量。
 */
const MAX_FILE_SIZE = 900 * 1024;
const CHUNK_SIZE = MAX_FILE_SIZE;

/**
 * 文件名常量（模块内使用；与 GistSyncService 中的 GIST_FILE_NAMES 保持一致）
 */
const FILE_NAMES = {
  SETTINGS: 'tsukuyomi-settings.json',
  AI_MODELS: 'ai-models.json',
  COVER_HISTORY: 'cover-history.json',
  NOVEL_PREFIX: 'novel-',
  NOVEL_CHUNK_PREFIX: 'novel-chunk-',
  MEMORIES_PREFIX: 'memories-',
  MEMORIES_CHUNK_PREFIX: 'memories-chunk-',
} as const;

/**
 * 压缩后的 Gist 文件体格式
 */
interface CompressedWrapper {
  format: 'gzip';
  data: string;
}

/**
 * 要上传的数据 payload（全量本地状态，diff 计算在函数内完成）
 */
export interface UploadPayload {
  appSettings: AppSettings;
  aiModels: AIModel[];
  coverHistory: CoverHistoryItem[];
  novels: Novel[]; // 已加载完整章节内容
  memoriesByBook: Record<string, Memory[]>;
  /**
   * 单条 memory 的墓碑（按 bookId 分组），与 `memoriesByBook` 一同写入
   * `memories:<bookId>` 的 envelope payload。空集合可省略。
   */
  memoryTombstonesByBook?: Record<string, MemoryTombstone[]>;
  /**
   * Manifest 级 collection 墓碑：entryKey -> deletedAt ISO。
   * 支持 `novel:<id>` 与 `memories:<id>` 两种形式（v3+）。
   */
  tombstones?: Record<string, string>;
}

/**
 * 增量上传结果
 */
export interface IncrementalUploadResult {
  success: true;
  gistId: string;
  gistUrl?: string;
  remoteETag: string;
  remoteUpdatedAt: string;
  manifest: GistManifest;
  uploadedEntries: string[];
  deletedEntries: string[];
}

/**
 * 下载结果的变体
 */
export type IncrementalDownloadResult =
  | {
      success: true;
      skipped: true;
      remoteETag: string;
    }
  | {
      success: true;
      skipped: false;
      remoteETag: string;
      remoteUpdatedAt: string;
      manifest: GistManifest | null; // null 表示远端缺少 manifest，触发迁移
      /** 需要迁移（远端无 manifest） */
      needsMigration?: boolean;
      /** 客户端版本落后于远端 schemaVersion */
      schemaVersionTooNew?: boolean;
      /**
       * 远端文件快照：uploadIncremental 用来判断清理 null 目标是否真的存在于 Gist 上。
       * 在所有非 skipped 的下载路径（常规 diff、迁移、schemaVersionTooNew）都会填充；
       * 伪 CAS 命中后复用上次 verify 的 files 时也会填。
       */
      remoteFilesSnapshot?: Record<string, GistFileLike>;
      /** 由 entry key 索引的反序列化后数据（仅包含 diff 中变化/新增的条目） */
      changedEntries: Record<string, EntryValue>;
      /**
       * 下载/反序列化失败的条目 key（文件缺失、raw 拉取失败、解析异常）。
       * 调用方不得把这些条目的新远端哈希记为已知，否则它们永远不会被重新拉取，
       * 且下一轮上传会用陈旧的本地副本覆盖远端较新的数据。
       */
      failedEntryKeys?: string[];
      /**
       * 远端已删除的条目（合并两种来源：
       * 1. 在 knownRemote 中但不在远端 manifest.entries 中
       * 2. 在远端 manifest.tombstones 中
       * `deletedAt` 来自墓碑，没有墓碑时为 undefined（调用方将回退到 lastSyncTime 比较）
       */
      deletedEntries: Array<{ key: string; deletedAt?: string }>;
      /** 远端 manifest 中的完整墓碑表（用于持久化到 SyncConfig 并在下次上传时合并） */
      remoteTombstones: Record<string, string>;
      /** 远端仍然存在的 entry keys（用于识别远端删除） */
      remoteEntryKeys: string[];
    };

/**
 * 条目值的判别式联合
 *
 * memories 条目从 v3 起以 envelope 形式上传/下载（`MemoriesPayload`），
 * 其中包含活动 memories 列表与单条删除墓碑。
 */
export type EntryValue =
  | { kind: 'settings'; value: AppSettings }
  | { kind: 'ai-models'; value: AIModel[] }
  | { kind: 'cover-history'; value: CoverHistoryItem[] }
  | { kind: 'novel'; bookId: string; value: Novel }
  | { kind: 'memories'; bookId: string; value: MemoriesPayload };

/**
 * 将 JSON 字符串压缩并封装为 Gist 写入内容
 */
async function compressForUpload(json: string): Promise<string> {
  try {
    const compressed = await compressString(json);
    const wrapper: CompressedWrapper = { format: 'gzip', data: compressed };
    return JSON.stringify(wrapper);
  } catch (e) {
    console.warn('[gist-sync-incremental] 压缩失败，使用未压缩格式', e);
    return json;
  }
}

/**
 * 解析从 Gist 读取的文件内容，自动处理 gzip 解压。
 */
async function parseStoredContent(content: string): Promise<unknown> {
  const parsed = JSON.parse(content);
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as CompressedWrapper).format === 'gzip' &&
    (parsed as CompressedWrapper).data
  ) {
    const decompressed = await decompressString((parsed as CompressedWrapper).data);
    return JSON.parse(decompressed);
  }
  return parsed;
}

/**
 * 把 `knownRemoteHashes` 包装成一个只有 hash 的伪 manifest，用于 `diffManifests` 的对照输入。
 * 被 download / upload 两处 diff 前置共用。
 */
function buildKnownAsManifest(knownHashes: Record<string, string> | undefined): {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  updatedAt: string;
  entries: Record<string, ManifestEntry>;
} {
  const hashes = knownHashes ?? {};
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: '',
    entries: Object.fromEntries(
      Object.entries(hashes).map(([k, h]) => [k, { hash: h, lastEdited: '' } as ManifestEntry]),
    ),
  };
}

/**
 * 按字节安全分块（不在多字节字符中间切断）
 */
function splitIntoChunks(content: string): string[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content).length;
  if (bytes <= CHUNK_SIZE) return [content];

  const chunks: string[] = [];
  let position = 0;
  while (position < content.length) {
    const remaining = content.length - position;
    let left = 1;
    let right = Math.min(remaining, CHUNK_SIZE);
    let best = 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cand = content.substring(position, position + mid);
      if (encoder.encode(cand).length <= CHUNK_SIZE) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    chunks.push(content.substring(position, position + best));
    position += best;
  }
  return chunks;
}

/**
 * 将条目 payload 序列化为 Gist 文件。
 * 返回：要写入的文件字典 + 实际 chunk 数（0 表示单文件）
 */
async function serializeEntry(
  entryKey: string,
  payload: unknown,
): Promise<{
  files: Record<string, { content: string }>;
  chunks: number;
  filenamesForCleanup: string[]; // 该 entry 的全部文件名（用于替换旧 chunk 数时删除多余文件）
}> {
  // 用 canonicalStringify：键按字典序排序 + Date → ISO，确保上传字节与
  // `hashJson` 计算哈希时使用的字节完全一致——否则一旦接收方读回 JSON
  // 时键顺序不同，就会无限触发空转上传
  const json = canonicalStringify(payload);
  const compressed = await compressForUpload(json);

  const files: Record<string, { content: string }> = {};
  const filenamesForCleanup: string[] = [];

  // 决定文件名基础
  const bookIdForNovel = parseNovelEntryKey(entryKey);
  const bookIdForMemory = parseMemoriesEntryKey(entryKey);

  if (entryKey === ENTRY_KEYS.SETTINGS) {
    files[FILE_NAMES.SETTINGS] = { content: compressed };
    filenamesForCleanup.push(FILE_NAMES.SETTINGS);
    return { files, chunks: 0, filenamesForCleanup };
  }
  if (entryKey === ENTRY_KEYS.AI_MODELS) {
    files[FILE_NAMES.AI_MODELS] = { content: compressed };
    filenamesForCleanup.push(FILE_NAMES.AI_MODELS);
    return { files, chunks: 0, filenamesForCleanup };
  }
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) {
    files[FILE_NAMES.COVER_HISTORY] = { content: compressed };
    filenamesForCleanup.push(FILE_NAMES.COVER_HISTORY);
    return { files, chunks: 0, filenamesForCleanup };
  }

  // novel 与 memories 同构：超过单文件上限时分块
  const prefix = bookIdForNovel
    ? FILE_NAMES.NOVEL_PREFIX
    : bookIdForMemory
      ? FILE_NAMES.MEMORIES_PREFIX
      : null;
  const chunkPrefix = bookIdForNovel
    ? FILE_NAMES.NOVEL_CHUNK_PREFIX
    : bookIdForMemory
      ? FILE_NAMES.MEMORIES_CHUNK_PREFIX
      : null;
  const bookId = bookIdForNovel ?? bookIdForMemory;

  if (!prefix || !chunkPrefix || !bookId) {
    throw new Error(`未知的 entry key: ${entryKey}`);
  }

  const singleName = `${prefix}${bookId}.json`;
  const metaName = `${prefix}${bookId}.meta.json`;

  const encoder = new TextEncoder();
  const size = encoder.encode(compressed).length;

  if (size <= MAX_FILE_SIZE) {
    files[singleName] = { content: compressed };
    filenamesForCleanup.push(singleName);
    return { files, chunks: 0, filenamesForCleanup };
  }

  // 分块
  const chunks = splitIntoChunks(compressed);
  chunks.forEach((chunk, i) => {
    const name = `${chunkPrefix}${bookId}_${i}.json`;
    files[name] = { content: chunk };
    filenamesForCleanup.push(name);
  });
  const metadata = { chunks: chunks.length, totalSize: size };
  files[metaName] = { content: JSON.stringify(metadata) };
  filenamesForCleanup.push(metaName);

  return { files, chunks: chunks.length, filenamesForCleanup };
}

/**
 * 读取单个扁平文件并解压反序列化；content 缺失时返回 null
 */
async function readAndParseSingleFile(
  filename: string,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<unknown> {
  const content = await readFile(filename, gistFiles, fetchRaw);
  if (content === null) return null;
  return parseStoredContent(content);
}

/**
 * 兼容多代分块分隔符：最新为 `_`,老版本曾用 `#`/`-`。
 * 从 gistFiles 里找到第 i 块 chunk 的实际文件名;任何分隔符命中即返回。
 */
function locateChunkFilename(
  chunkPrefix: string,
  bookId: string,
  index: number,
  gistFiles: Record<string, GistFileLike>,
): string | null {
  for (const sep of ['_', '#', '-']) {
    const name = `${chunkPrefix}${bookId}${sep}${index}.json`;
    if (gistFiles[name]) return name;
  }
  return null;
}

/**
 * 依次读取所有 chunk 文件并拼接；任意一块缺失返回 null
 */
async function readChunkedContent(
  chunkPrefix: string,
  bookId: string,
  chunks: number,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<string | null> {
  const pieces: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const resolvedName = locateChunkFilename(chunkPrefix, bookId, i, gistFiles);
    const name = resolvedName ?? `${chunkPrefix}${bookId}_${i}.json`;
    const content = await readFile(name, gistFiles, fetchRaw);
    if (content === null) {
      console.warn(`[gist-sync-incremental] 分块缺失或读取失败: ${name}`);
      return null;
    }
    pieces.push(content);
  }
  return pieces.join('');
}

/**
 * 读取并解析 novel / memories 型条目（按 chunk 数决定单文件 / 分块路径）
 *
 * 容错路径：若 manifest 标记为分块但实际只上传了单文件（或相反），会尝试另一种布局作为兜底。
 * 这对恢复老 revision 特别关键——老版本的 chunk 计数可能与当前 manifest 不一致。
 */
async function readBookEntryContent(
  bookId: string,
  prefix: string,
  chunkPrefix: string,
  chunks: number,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<unknown> {
  const singleName = `${prefix}${bookId}.json`;
  let combined: string | null;

  if (chunks === 0) {
    combined = await readFile(singleName, gistFiles, fetchRaw);
  } else {
    combined = await readChunkedContent(chunkPrefix, bookId, chunks, gistFiles, fetchRaw);
    // 兜底：manifest 声明分块但实际是单文件布局
    if (combined === null && gistFiles[singleName]) {
      combined = await readFile(singleName, gistFiles, fetchRaw);
    }
  }

  // 兜底：manifest chunks=0 但实际是分块布局（扫描 chunkPrefix 下存在的块数）
  if (combined === null && chunks === 0) {
    let guessed = 0;
    while (locateChunkFilename(chunkPrefix, bookId, guessed, gistFiles)) {
      guessed += 1;
    }
    if (guessed > 0) {
      combined = await readChunkedContent(chunkPrefix, bookId, guessed, gistFiles, fetchRaw);
    }
  }

  if (combined === null) return null;
  return parseStoredContent(combined);
}

/**
 * 从 Gist 文件集中读取并反序列化一个条目的内容
 * @param entryKey 条目键
 * @param manifestEntry manifest 中该条目的元数据（用于获取 chunk 数）
 * @param gistFiles Gist `gists.get` 响应中的 files 对象
 * @param fetchRaw 当 inline content 被截断时用于从 raw_url 获取完整内容的函数
 */
export async function deserializeEntry(
  entryKey: string,
  manifestEntry: ManifestEntry,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<EntryValue | null> {
  if (entryKey === ENTRY_KEYS.SETTINGS) {
    const raw = await readAndParseSingleFile(FILE_NAMES.SETTINGS, gistFiles, fetchRaw);
    if (raw === null) return null;
    return { kind: 'settings', value: deserializeDates(raw) as AppSettings };
  }
  if (entryKey === ENTRY_KEYS.AI_MODELS) {
    const raw = await readAndParseSingleFile(FILE_NAMES.AI_MODELS, gistFiles, fetchRaw);
    if (raw === null) return null;
    return { kind: 'ai-models', value: deserializeDates(raw) as AIModel[] };
  }
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) {
    const raw = await readAndParseSingleFile(FILE_NAMES.COVER_HISTORY, gistFiles, fetchRaw);
    if (raw === null) return null;
    return { kind: 'cover-history', value: deserializeDates(raw) as CoverHistoryItem[] };
  }

  const novelBookId = parseNovelEntryKey(entryKey);
  if (novelBookId) {
    const raw = await readBookEntryContent(
      novelBookId,
      FILE_NAMES.NOVEL_PREFIX,
      FILE_NAMES.NOVEL_CHUNK_PREFIX,
      manifestEntry.chunks ?? 0,
      gistFiles,
      fetchRaw,
    );
    if (raw === null) return null;
    return { kind: 'novel', bookId: novelBookId, value: deserializeDates(raw) as Novel };
  }

  const memoryBookId = parseMemoriesEntryKey(entryKey);
  if (memoryBookId) {
    const raw = await readBookEntryContent(
      memoryBookId,
      FILE_NAMES.MEMORIES_PREFIX,
      FILE_NAMES.MEMORIES_CHUNK_PREFIX,
      manifestEntry.chunks ?? 0,
      gistFiles,
      fetchRaw,
    );
    if (raw === null) return null;
    const envelope = parseMemoriesEnvelope(raw);
    if (!envelope) return null;
    return { kind: 'memories', bookId: memoryBookId, value: envelope };
  }

  return null;
}

/**
 * 解析 memories 条目的 raw payload。
 *
 * 兼容两种形态：
 *  - v3+ envelope：`{ memories: Memory[]; tombstones?: MemoryTombstone[] }`
 *  - v2 旧扁平数组：`Memory[]`（schemaVersionTooNew 前的客户端写入）
 *
 * 返回 null 表示无法识别（损坏 / 类型不符）；调用方应跳过该 entry。
 * Date 反序列化只对 memories 字段生效——tombstone 的 deletedAt 是 number。
 */
export function parseMemoriesEnvelope(raw: unknown): MemoriesPayload | null {
  if (Array.isArray(raw)) {
    return { memories: deserializeDates(raw) as Memory[] };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { memories?: unknown; tombstones?: unknown };
    if (Array.isArray(obj.memories)) {
      const memories = deserializeDates(obj.memories) as Memory[];
      const tombstones = Array.isArray(obj.tombstones)
        ? (obj.tombstones as MemoryTombstone[]).filter(
            (t) =>
              t &&
              typeof t.id === 'string' &&
              t.id.length > 0 &&
              typeof t.deletedAt === 'number' &&
              Number.isFinite(t.deletedAt),
          )
        : undefined;
      return tombstones && tombstones.length > 0 ? { memories, tombstones } : { memories };
    }
  }
  return null;
}

/** 单文件型条目(settings/ai-models/cover-history 或 chunks=0 的 novel/memories)的失败原因 */
function describeSingleFileFailure(
  name: string,
  gistFiles: Record<string, GistFileLike>,
): string {
  const file = gistFiles[name];
  if (!file) return `文件 ${name} 缺失`;
  if (file.truncated && !file.raw_url) return `文件 ${name} 被截断且无 raw_url`;
  if (file.truncated) return `文件 ${name} 被截断,从 raw_url 获取失败`;
  if (file.content == null) return `文件 ${name} 内容为空`;
  return `文件 ${name} 内容解析失败`;
}

/** 扫 gistFiles 里属于给定 bookId 的所有分块文件(宽松匹配,用于布局一致性检查) */
function collectBookChunkFilenames(
  chunkPrefix: string,
  bookId: string,
  gistFiles: Record<string, GistFileLike>,
): string[] {
  const names: string[] = [];
  for (const key of Object.keys(gistFiles)) {
    if (!key.startsWith(chunkPrefix)) continue;
    if (!key.endsWith('.json')) continue;
    if (!key.includes(bookId)) continue;
    names.push(key);
  }
  return names;
}

/** chunks=0 声明下的 book 条目失败原因:优先单文件,否则汇报布局不一致 */
function describeBookSingleFileFailure(
  bookId: string,
  prefix: string,
  chunkPrefix: string,
  gistFiles: Record<string, GistFileLike>,
): string {
  const singleName = `${prefix}${bookId}.json`;
  if (gistFiles[singleName]) return describeSingleFileFailure(singleName, gistFiles);

  const actualChunks = collectBookChunkFilenames(chunkPrefix, bookId, gistFiles);
  if (actualChunks.length > 0) {
    return `manifest 声明为单文件,但实际存在 ${actualChunks.length} 个分块文件,布局不一致`;
  }
  return `${singleName} 缺失,也没有找到对应分块`;
}

/** 按 chunk 索引扫描分块分布(三种分隔符都查),返回每块的存在/截断状态 */
function scanChunkIndices(
  bookId: string,
  chunkPrefix: string,
  chunks: number,
  gistFiles: Record<string, GistFileLike>,
): { missing: number[]; truncated: number[] } {
  const missing: number[] = [];
  const truncated: number[] = [];
  for (let i = 0; i < chunks; i++) {
    const file = findChunkFileInGist(chunkPrefix, bookId, i, gistFiles);
    if (!file) {
      missing.push(i);
      continue;
    }
    if (file.truncated && !file.raw_url) truncated.push(i);
  }
  return { missing, truncated };
}

function findChunkFileInGist(
  chunkPrefix: string,
  bookId: string,
  index: number,
  gistFiles: Record<string, GistFileLike>,
): GistFileLike | null {
  for (const sep of ['_', '#', '-']) {
    const name = `${chunkPrefix}${bookId}${sep}${index}.json`;
    const file = gistFiles[name];
    if (file) return file;
  }
  return null;
}

/** chunks>0 声明下的 book 条目失败原因:按 missing / truncated 优先级报一条最相关的 */
function describeBookChunkedFailure(
  bookId: string,
  prefix: string,
  chunkPrefix: string,
  chunks: number,
  gistFiles: Record<string, GistFileLike>,
): string {
  const singleName = `${prefix}${bookId}.json`;
  const { missing, truncated } = scanChunkIndices(bookId, chunkPrefix, chunks, gistFiles);

  if (missing.length === chunks) {
    if (gistFiles[singleName]) {
      return `manifest 声明 ${chunks} 块但实际为单文件布局,且单文件也读取失败`;
    }
    return `manifest 声明 ${chunks} 块分块文件全部缺失`;
  }
  if (missing.length > 0) {
    const sample = missing.slice(0, 3).join(', ');
    const suffix = missing.length > 3 ? ` 等 ${missing.length} 块` : '';
    return `缺失分块索引 ${sample}${suffix}（共 ${chunks} 块）`;
  }
  if (truncated.length > 0) {
    const sample = truncated.slice(0, 3).join(', ');
    return `分块 ${sample} 被截断且无 raw_url（共 ${chunks} 块）`;
  }
  return `分块完整但 raw_url 获取或解析失败（共 ${chunks} 块）`;
}

/**
 * 在反序列化失败后,人工推断具体原因用于错误提示。
 * 只读 gistFiles 的元信息,不做任何网络请求——被调用时 deserializeEntry 已经尝试过完整解析。
 */
export function diagnoseRevisionEntryFailure(
  entryKey: string,
  manifestEntry: ManifestEntry,
  gistFiles: Record<string, GistFileLike>,
): string {
  if (entryKey === ENTRY_KEYS.SETTINGS) {
    return describeSingleFileFailure(FILE_NAMES.SETTINGS, gistFiles);
  }
  if (entryKey === ENTRY_KEYS.AI_MODELS) {
    return describeSingleFileFailure(FILE_NAMES.AI_MODELS, gistFiles);
  }
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) {
    return describeSingleFileFailure(FILE_NAMES.COVER_HISTORY, gistFiles);
  }

  const novelBookId = parseNovelEntryKey(entryKey);
  const memoryBookId = parseMemoriesEntryKey(entryKey);
  const bookId = novelBookId ?? memoryBookId;
  if (!bookId) return '未知条目类型';

  const prefix = novelBookId ? FILE_NAMES.NOVEL_PREFIX : FILE_NAMES.MEMORIES_PREFIX;
  const chunkPrefix = novelBookId
    ? FILE_NAMES.NOVEL_CHUNK_PREFIX
    : FILE_NAMES.MEMORIES_CHUNK_PREFIX;
  const chunks = manifestEntry.chunks ?? 0;

  return chunks === 0
    ? describeBookSingleFileFailure(bookId, prefix, chunkPrefix, gistFiles)
    : describeBookChunkedFailure(bookId, prefix, chunkPrefix, chunks, gistFiles);
}

/**
 * Gist API 文件对象的最小接口（兼容 Octokit 返回与测试用 mock）
 */
export interface GistFileLike {
  content?: string | null;
  truncated?: boolean | null;
  raw_url?: string | null;
  size?: number | null;
}

export async function readFile(
  filename: string,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<string | null> {
  const file = gistFiles[filename];
  if (!file) return null;

  if (file.content != null && !file.truncated) {
    return file.content;
  }

  if (file.raw_url) {
    try {
      return await fetchRaw(file.raw_url);
    } catch (e) {
      console.warn(`[gist-sync-incremental] 从 raw_url 获取 ${filename} 失败:`, e);
      return null;
    }
  }

  // 有 inline content 但被截断，没有 raw_url——返回已有内容，调用方将识别不一致
  return file.content ?? null;
}

/**
 * 根据 entry key 与已知 chunk 数枚举一个 entry 在 Gist 上的所有文件名。
 * 用于：entry 在本地被删除时、或 chunk 数变化时，精确知道哪些远端文件需要置为 null。
 *
 * 不再依赖远端的实时文件列表——在无法获取 remoteFilesSnapshot 的路径（伪 CAS 命中、
 * 首次迁移后的立即上传等）下也能正确枚举所有文件名。
 *
 * @param entryKey 条目键
 * @param chunks 上次已知的 chunk 数（来自 `config.knownRemoteEntries`）；0/undefined 表示单文件布局
 */
export function filenamesForEntry(entryKey: string, chunks?: number): string[] {
  if (entryKey === ENTRY_KEYS.SETTINGS) return [FILE_NAMES.SETTINGS];
  if (entryKey === ENTRY_KEYS.AI_MODELS) return [FILE_NAMES.AI_MODELS];
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) return [FILE_NAMES.COVER_HISTORY];

  const novelBookId = parseNovelEntryKey(entryKey);
  const memoryBookId = parseMemoriesEntryKey(entryKey);
  const bookId = novelBookId ?? memoryBookId;
  if (!bookId) return [];

  const prefix = novelBookId ? FILE_NAMES.NOVEL_PREFIX : FILE_NAMES.MEMORIES_PREFIX;
  const chunkPrefix = novelBookId
    ? FILE_NAMES.NOVEL_CHUNK_PREFIX
    : FILE_NAMES.MEMORIES_CHUNK_PREFIX;

  if (!chunks || chunks === 0) {
    return [`${prefix}${bookId}.json`];
  }

  const names: string[] = [`${prefix}${bookId}.meta.json`];
  for (let i = 0; i < chunks; i++) {
    names.push(`${chunkPrefix}${bookId}_${i}.json`);
  }
  return names;
}

/**
 * 兜底：扫描 remote snapshot 中与 entry 匹配的文件名。
 * 用在迁移场景或 `knownRemoteEntries` 不可用时，发现被持久化状态遗漏的遗留文件。
 */
export function matchFilenamesInSnapshot(entryKey: string, remoteFilenames: string[]): string[] {
  if (entryKey === ENTRY_KEYS.SETTINGS) {
    return remoteFilenames.filter((f) => f === FILE_NAMES.SETTINGS);
  }
  if (entryKey === ENTRY_KEYS.AI_MODELS) {
    return remoteFilenames.filter((f) => f === FILE_NAMES.AI_MODELS);
  }
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) {
    return remoteFilenames.filter((f) => f === FILE_NAMES.COVER_HISTORY);
  }
  const novelBookId = parseNovelEntryKey(entryKey);
  const memoryBookId = parseMemoriesEntryKey(entryKey);
  const bookId = novelBookId ?? memoryBookId;
  if (!bookId) return [];

  const prefixes = novelBookId
    ? [FILE_NAMES.NOVEL_PREFIX, FILE_NAMES.NOVEL_CHUNK_PREFIX]
    : [FILE_NAMES.MEMORIES_PREFIX, FILE_NAMES.MEMORIES_CHUNK_PREFIX];

  return remoteFilenames.filter((f) => prefixes.some((p) => f.startsWith(`${p}${bookId}`)));
}

/** 构造 GitHub Gist API 请求头（lastETag 存在时附带条件请求头） */
function buildGistRequestHeaders(token: string, lastETag?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (lastETag) headers['If-None-Match'] = lastETag;
  return headers;
}

/** 304 未修改时的返回值：优先用响应 etag，其次上次已知的，最后空串 */
function buildNotModifiedResult(
  etag: string,
  lastETag: string | undefined,
): { notModified: true; etag: string } {
  return { notModified: true, etag: etag || lastETag || '' };
}

/** 200 响应解析后的返回值：携带 updatedAt / files / 可选 htmlUrl */
function buildGistDataResult(
  data: { files?: Record<string, GistFileLike>; updated_at?: string; html_url?: string },
  etag: string,
): {
  notModified: false;
  etag: string;
  updatedAt: string;
  files: Record<string, GistFileLike>;
  htmlUrl?: string;
} {
  return {
    notModified: false,
    etag,
    updatedAt: data.updated_at ?? '',
    files: data.files ?? {},
    ...(data.html_url ? { htmlUrl: data.html_url } : {}),
  };
}

/**
 * 条件 GET：使用 `If-None-Match` 头检查远端是否有变化
 *
 * 不使用 Octokit 的包装，直接走 `fetch`——Octokit 对非 2xx 状态码一律抛异常，
 * 会把 304（期望的"未修改"路径）也当作错误输出到 DevTools。
 * 直接 fetch 可以干净地处理 304，无 console 噪音。
 *
 * @param token GitHub Personal Access Token
 * @param gistId Gist ID
 * @param lastETag 上次已知的 ETag（可选），用于条件请求
 */
export async function conditionalGetGist(
  token: string,
  gistId: string,
  lastETag?: string,
): Promise<
  | { notModified: true; etag: string }
  | {
      notModified: false;
      etag: string;
      updatedAt: string;
      files: Record<string, GistFileLike>;
      htmlUrl?: string;
    }
> {
  const headers = buildGistRequestHeaders(token, lastETag);

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers,
  });

  const etag = response.headers.get('etag') ?? '';

  if (response.status === 304) {
    return buildNotModifiedResult(etag, lastETag);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub Gist API 错误 ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    files?: Record<string, GistFileLike>;
    updated_at?: string;
    html_url?: string;
    truncated?: boolean;
  };

  // Gist 级 truncated：文件数超过 GitHub API 单次返回上限（300 个）时，
  // 响应只包含前 300 个文件。若继续同步，窗口外的条目会静默反序列化为 null
  // → 下载缺数据；新设备的上传 diff 甚至会把"看不见"的远端文件当作已删除
  // 批量清空。必须在这里响亮地中止。
  if (data.truncated === true) {
    throw new Error(
      'Gist 文件数超过 GitHub API 单次返回上限（300 个），文件列表被截断，无法安全同步。' +
        '请清理该 Gist 中的冗余文件，或改用新的 Gist 重新同步。',
    );
  }

  return buildGistDataResult(data, etag);
}

/** 从 SyncConfig 解析用于 Gist API 的 token（优先 secret，其次 syncParams.token） */
function resolveGistToken(config: SyncConfig): string {
  return config.secret || config.syncParams.token || '';
}

/** 构造 raw_url 拉取函数（非 2xx 抛错） */
function createFetchRaw(): (url: string) => Promise<string> {
  return async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
  };
}

/** 解析 manifest.json 内容，解析失败时抛出带原因的错误 */
function parseRemoteManifest(manifestContent: string): GistManifest {
  try {
    return JSON.parse(manifestContent) as GistManifest;
  } catch (e) {
    throw new Error(`manifest.json 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 远端缺少 manifest 时的返回值：携带文件快照以便后续迁移清理遗留文件 */
function buildDownloadMigrationResult(
  etag: string,
  updatedAt: string,
  files: Record<string, GistFileLike>,
): IncrementalDownloadResult {
  return {
    success: true,
    skipped: false,
    remoteETag: etag,
    remoteUpdatedAt: updatedAt,
    manifest: null,
    needsMigration: true,
    remoteFilesSnapshot: files,
    changedEntries: {},
    deletedEntries: [],
    remoteTombstones: {},
    remoteEntryKeys: [],
  };
}

/** 客户端版本落后于远端 schemaVersion 时的返回值 */
function buildSchemaTooNewResult(
  remoteManifest: GistManifest,
  etag: string,
  updatedAt: string,
): IncrementalDownloadResult {
  return {
    success: true,
    skipped: false,
    remoteETag: etag,
    remoteUpdatedAt: updatedAt,
    manifest: remoteManifest,
    schemaVersionTooNew: true,
    changedEntries: {},
    deletedEntries: [],
    remoteTombstones: extractRemoteTombstoneMap(remoteManifest),
    remoteEntryKeys: Object.keys(remoteManifest.entries),
  };
}

/** 把远端 manifest 的 tombstones（{ deletedAt }）压扁为 entryKey -> deletedAt 映射 */
function extractRemoteTombstoneMap(remoteManifest: GistManifest): Record<string, string> {
  return Object.fromEntries(
    Object.entries(remoteManifest.tombstones ?? {}).map(([k, v]) => [k, v.deletedAt]),
  );
}

/** 合并两种删除来源（隐式 diff.deleted + 显式 tombstones），返回带 deletedAt 的条目列表 */
function buildDeletedEntries(
  diff: ManifestDiff,
  remoteTombstoneMap: Record<string, string>,
): Array<{ key: string; deletedAt?: string }> {
  const deletionKeys = new Set<string>(diff.deleted);
  for (const tk of Object.keys(remoteTombstoneMap)) deletionKeys.add(tk);

  const deletedEntries: Array<{ key: string; deletedAt?: string }> = [];
  for (const key of deletionKeys) {
    const ds = remoteTombstoneMap[key];
    deletedEntries.push(ds !== undefined ? { key, deletedAt: ds } : { key });
  }
  return deletedEntries;
}

/**
 * 仅反序列化 changed + added 条目（远端有而本地尚未见过的）。
 *
 * 失败的条目（文件缺失 / raw 拉取失败 / 解析异常）必须记入 `failedEntryKeys`
 * 而不是静默跳过：调用方要据此避免把这些条目的新远端哈希记为"已知"，
 * 否则该条目永远不会被重新拉取，且下一轮上传会用陈旧的本地副本覆盖远端。
 */
async function readChangedEntries(
  toRead: string[],
  remoteManifest: GistManifest,
  files: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
  onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
): Promise<{ changedEntries: Record<string, EntryValue>; failedEntryKeys: string[] }> {
  const changedEntries: Record<string, EntryValue> = {};
  const failedEntryKeys: string[] = [];
  const total = toRead.length;

  for (let i = 0; i < toRead.length; i++) {
    const key = toRead[i]!;
    const entry = remoteManifest.entries[key];
    if (!entry) continue;
    onProgress?.({ current: i, total, message: `正在下载: ${key}` });
    let value: EntryValue | null = null;
    try {
      value = await deserializeEntry(key, entry, files, fetchRaw);
    } catch (error) {
      console.error(`[gist-sync-incremental] 反序列化条目 ${key} 失败:`, error);
    }
    if (value) {
      changedEntries[key] = value;
    } else {
      failedEntryKeys.push(key);
    }
  }

  return { changedEntries, failedEntryKeys };
}

/**
 * 下载：基于 manifest 的选择性拉取
 */
export async function downloadWithManifest(
  config: SyncConfig,
  onProgress?: (progress: { current: number; total: number; message: string }) => void,
): Promise<IncrementalDownloadResult> {
  const gistId = config.syncParams.gistId;
  if (!gistId) {
    throw new Error('Gist ID 未配置');
  }

  onProgress?.({ current: 0, total: 1, message: '正在检查远程变更...' });

  const token = resolveGistToken(config);
  const result = await conditionalGetGist(token, gistId, config.lastRemoteETag);
  if (result.notModified) {
    return { success: true, skipped: true, remoteETag: result.etag };
  }

  const { files, etag, updatedAt } = result;

  // 读取 manifest
  const manifestFile = files[MANIFEST_FILE_NAME];
  if (!manifestFile) {
    // 远端缺少 manifest，触发迁移
    return buildDownloadMigrationResult(etag, updatedAt, files);
  }

  const fetchRaw = createFetchRaw();

  const manifestContent = await readFile(MANIFEST_FILE_NAME, files, fetchRaw);
  if (!manifestContent) {
    throw new Error('manifest.json 内容为空');
  }

  const remoteManifest = parseRemoteManifest(manifestContent);

  if (remoteManifest.schemaVersion > MANIFEST_SCHEMA_VERSION) {
    return buildSchemaTooNewResult(remoteManifest, etag, updatedAt);
  }

  // 计算 diff：remote vs knownRemote
  const diff = diffManifests(remoteManifest, buildKnownAsManifest(config.knownRemoteHashes));

  // 仅需要反序列化 changed + added（即远端有而本地尚未见过的）
  const toRead = [...diff.changed, ...diff.added];
  const { changedEntries, failedEntryKeys } = await readChangedEntries(
    toRead,
    remoteManifest,
    files,
    fetchRaw,
    onProgress,
  );

  onProgress?.({ current: toRead.length, total: toRead.length, message: '下载完成' });

  // 合并两种"删除"来源：
  // 1. 隐式：knownRemote 中有，但远端 manifest.entries 中没有（diff.deleted）
  // 2. 显式：远端 manifest.tombstones 中的记录
  const remoteTombstoneMap = extractRemoteTombstoneMap(remoteManifest);
  const deletedEntries = buildDeletedEntries(diff, remoteTombstoneMap);

  return {
    success: true,
    skipped: false,
    remoteETag: etag,
    remoteUpdatedAt: updatedAt,
    manifest: remoteManifest,
    // 携带远端文件快照：uploadIncremental 用它来判断某个"待删除"的文件名是否
    // 真的在 Gist 上，避免 PATCH 中出现 "null 删除不存在的文件"——这会被
    // GitHub 以 422 missing_field:files 拒绝整个请求，连带丢掉其它合法的内容写入。
    remoteFilesSnapshot: files,
    changedEntries,
    failedEntryKeys,
    deletedEntries,
    remoteTombstones: remoteTombstoneMap,
    remoteEntryKeys: Object.keys(remoteManifest.entries),
  };
}

/**
 * 增量上传：基于 local manifest 与 knownRemoteHashes 的 diff，仅上传变化的 entry
 */
export async function uploadIncremental(
  octokit: Octokit,
  config: SyncConfig,
  payload: UploadPayload,
  remoteFilesSnapshot: Record<string, GistFileLike>,
  onProgress?: (progress: { current: number; total: number; message: string }) => void,
): Promise<IncrementalUploadResult> {
  const gistId = config.syncParams.gistId;
  if (!gistId) throw new Error('Gist ID 未配置');

  // 整个 uploadIncremental 对外以统一的 0-100 进度标度输出——executor 把它
  // 线性映射到整条进度条的 upload 区段（60-100）。
  // 三段分配：
  // - 0-5%    计算 manifest
  // - 5-20%   序列化 + 压缩（CPU，随 entry 数量线性走）
  // - 20-100% 实际 PATCH 批次（网络等待，按 batch 均分）
  const PROGRESS_TOTAL = 100;
  const PREP_END = 20; // 序列化阶段结束时的百分比
  onProgress?.({ current: 0, total: PROGRESS_TOTAL, message: '正在计算本地 manifest...' });

  const localManifest = await buildLocalManifest({
    appSettings: payload.appSettings,
    aiModels: payload.aiModels,
    coverHistory: payload.coverHistory,
    novels: payload.novels,
    memoriesByBook: payload.memoriesByBook,
    ...(payload.memoryTombstonesByBook
      ? { memoryTombstonesByBook: payload.memoryTombstonesByBook }
      : {}),
    ...(payload.tombstones ? { tombstones: payload.tombstones } : {}),
  });

  const knownEntries = config.knownRemoteEntries ?? {};
  const diff = diffManifests(localManifest, buildKnownAsManifest(config.knownRemoteHashes));
  const toUpload = [...diff.changed, ...diff.added];
  const toDelete = diff.deleted;

  // buildLocalManifest 不输出 chunks，序列化阶段也只会给本轮上传的条目补 chunks。
  // 未变化的条目必须从上次已知的远端布局（knownRemoteEntries）继承 chunks——
  // 否则 settings-only 同步写出的 manifest 会抹掉未变化分块小说的 chunks 计数，
  // 消费方把它持久化为 knownRemoteEntries 后，后续无快照路径会按单文件名枚举
  // 删除目标，对不存在的文件发 null 导致整个 PATCH 被 GitHub 以 422 拒绝。
  const toUploadSet = new Set(toUpload);
  for (const [entryKey, entry] of Object.entries(localManifest.entries)) {
    if (toUploadSet.has(entryKey)) continue;
    const knownChunks = knownEntries[entryKey]?.chunks;
    if (knownChunks && knownChunks > 0) entry.chunks = knownChunks;
  }

  // 按 entry key 序列化文件
  const allFiles: Record<string, { content: string } | null> = {};
  const remoteFilenames = Object.keys(remoteFilesSnapshot);
  // 用于过滤"删除不存在的文件"：GitHub 对这种 PATCH 会返回 422 拒绝整个请求。
  // 当 remoteFilesSnapshot 为空（伪 CAS 命中、无下载阶段），我们保守选择信任
  // knownEntries 而不做过滤；正常下载路径上这个集合总是填充的。
  const remoteFilenameSet = new Set(remoteFilenames);
  const hasRemoteSnapshot = remoteFilenames.length > 0;
  const uploadedEntries: string[] = [];

  // 合并"已知布局"与"实时快照"两个来源，确保孤儿文件一定被清理：
  // - knownEntries 给出上次成功同步时每个 entry 的 chunk 布局（权威，伪 CAS 路径也可用）
  // - remoteFilenames 扫描可能发现被持久化状态遗漏的遗留文件（迁移、外部编辑等）
  const resolveStaleFilenames = (entryKey: string): string[] => {
    const known = knownEntries[entryKey];
    const fromKnown = filenamesForEntry(entryKey, known?.chunks);
    const fromSnapshot = matchFilenamesInSnapshot(entryKey, remoteFilenames);
    const merged = Array.from(new Set([...fromKnown, ...fromSnapshot]));
    // 若有远端文件快照，仅保留确实存在于 Gist 上的文件；其它过时的 knownEntries
    // 条目（例如指向已被先前同步写走的 chunk）会被过滤，避免产生必然失败的 null 删除
    if (hasRemoteSnapshot) {
      return merged.filter((name) => remoteFilenameSet.has(name));
    }
    return merged;
  };

  await serializeEntriesIntoFiles(
    toUpload,
    payload,
    allFiles,
    localManifest,
    resolveStaleFilenames,
    PREP_END,
    PROGRESS_TOTAL,
    onProgress,
  );

  // 处理删除的 entry
  for (const entryKey of toDelete) {
    const toNull = resolveStaleFilenames(entryKey);
    for (const name of toNull) {
      allFiles[name] = null;
    }
  }

  uploadedEntries.push(...toUpload);

  onProgress?.({
    current: PREP_END,
    total: PROGRESS_TOTAL,
    message: '正在上传...',
  });

  const additionBatches = buildAdditionBatches(allFiles);
  appendDeletionsAndManifestToFinalBatch(additionBatches, allFiles, localManifest);

  const {
    etag: newETag,
    htmlUrl,
    updatedAt: newUpdatedAt,
  } = await executePatchBatches(
    octokit,
    gistId,
    additionBatches,
    PREP_END,
    PROGRESS_TOTAL,
    onProgress,
  );

  onProgress?.({
    current: PROGRESS_TOTAL,
    total: PROGRESS_TOTAL,
    message: '上传完成',
  });

  return {
    success: true,
    gistId,
    ...(htmlUrl ? { gistUrl: htmlUrl } : {}),
    remoteETag: newETag,
    remoteUpdatedAt: newUpdatedAt,
    manifest: localManifest,
    uploadedEntries,
    deletedEntries: toDelete,
  };
}

/**
 * 序列化 toUpload 中的每个 entry 到 allFiles，并把孤儿文件（旧布局）标为 null 删除。
 * 同步更新 manifest 条目的 chunks 字段反映实际布局。
 */
async function serializeEntriesIntoFiles(
  toUpload: string[],
  payload: UploadPayload,
  allFiles: Record<string, { content: string } | null>,
  localManifest: GistManifest,
  resolveStaleFilenames: (entryKey: string) => string[],
  PREP_END: number,
  PROGRESS_TOTAL: number,
  onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
): Promise<void> {
  for (let i = 0; i < toUpload.length; i++) {
    const entryKey = toUpload[i]!;
    const payloadValue = getPayloadForEntry(entryKey, payload);
    if (payloadValue === null) continue;

    // manifest 阶段占 5%；序列化线性占 5→PREP_END
    const serializeFraction = toUpload.length > 0 ? i / toUpload.length : 1;
    onProgress?.({
      current: Math.round(5 + (PREP_END - 5) * serializeFraction),
      total: PROGRESS_TOTAL,
      message: `正在准备: ${entryKey}`,
    });
    const { files, chunks } = await serializeEntry(entryKey, payloadValue);

    // 更新 manifest 中该 entry 的 chunks 字段（反映实际上传布局）
    const entry = localManifest.entries[entryKey];
    if (entry) {
      if (chunks > 0) entry.chunks = chunks;
      else delete entry.chunks;
    }

    for (const [name, file] of Object.entries(files)) {
      allFiles[name] = file;
    }

    // 清理：远端可能有旧的 chunk 文件（chunk 数减少时）或旧单文件/分块格式切换
    const expectedFilenames = new Set(Object.keys(files));
    const potentiallyStale = resolveStaleFilenames(entryKey);
    for (const stale of potentiallyStale) {
      if (!expectedFilenames.has(stale)) {
        allFiles[stale] = null;
      }
    }
  }
}

/**
 * 把 allFiles 中的新增/变更按字节预算 + 文件数双重上限切分为多个 PATCH 批次。
 *
 * 大 chunk 文件（接近 MAX_FILE_SIZE）单靠文件数截断容易凑出 ~9 MB 的巨型 PATCH 触发 409，
 * 所以必须加字节预算上限。
 */
function buildAdditionBatches(
  allFiles: Record<string, { content: string } | null>,
): Array<Record<string, { content: string } | null>> {
  const BATCH_SIZE = 10;
  // 单批请求体字节预算：GitHub Gist PATCH 的有效请求上限经验值约为 8-10 MB，我们取 4 MB 留足余量
  const BATCH_BYTE_BUDGET = 4 * 1024 * 1024;
  const additions = Object.entries(allFiles).filter(
    (kv): kv is [string, { content: string }] => kv[1] !== null,
  );

  const additionBatches: Array<Record<string, { content: string } | null>> = [];
  let current: Record<string, { content: string } | null> = {};
  let currentBytes = 0;
  let currentCount = 0;

  for (const [name, file] of additions) {
    const itemBytes = file.content.length + name.length;
    const wouldOverflowBytes = currentBytes + itemBytes > BATCH_BYTE_BUDGET;
    const wouldOverflowCount = currentCount >= BATCH_SIZE;
    if (currentCount > 0 && (wouldOverflowBytes || wouldOverflowCount)) {
      additionBatches.push(current);
      current = {};
      currentBytes = 0;
      currentCount = 0;
    }
    current[name] = file;
    currentBytes += itemBytes;
    currentCount += 1;
  }
  if (currentCount > 0) additionBatches.push(current);

  // 纯删除场景保底：没有 additions 时留一个空批次，最后一步会把
  // deletions + manifest 一起写入（manifest 内容保证 PATCH 非纯 null）
  if (additionBatches.length === 0) additionBatches.push({});

  return additionBatches;
}

/**
 * 向最后一批追加 deletions 与 manifest，保证"指针切换"是一次原子 PATCH。
 *
 * 纯删除场景（没有任何内容批次）同样携带 null 删除——否则被删小说/记忆的
 * 正文会永远留在 Gist 上（隐私问题）。manifest 本身是非 null 内容，足以避开
 * GitHub 对"纯 null PATCH"的 422 missing_field:files 拒绝；422 的真正风险在于
 * null 一个远端不存在的文件，这由 resolveStaleFilenames 的存在性过滤保证
 *（有远端快照时仅 null 快照中确实存在的文件）。
 */
function appendDeletionsAndManifestToFinalBatch(
  additionBatches: Array<Record<string, { content: string } | null>>,
  allFiles: Record<string, { content: string } | null>,
  localManifest: GistManifest,
): void {
  const deletions = Object.entries(allFiles).filter((kv): kv is [string, null] => kv[1] === null);
  const finalBatch = additionBatches[additionBatches.length - 1]!;
  for (const [name, f] of deletions) finalBatch[name] = f;
  finalBatch[MANIFEST_FILE_NAME] = { content: JSON.stringify(localManifest) };
}

/**
 * 顺序 PATCH 所有批次，返回最终的 etag / htmlUrl / updatedAt
 */
async function executePatchBatches(
  octokit: Octokit,
  gistId: string,
  additionBatches: Array<Record<string, { content: string } | null>>,
  PREP_END: number,
  PROGRESS_TOTAL: number,
  onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
): Promise<{ etag: string; htmlUrl: string | undefined; updatedAt: string }> {
  let newETag = '';
  let htmlUrl: string | undefined;
  let newUpdatedAt = '';

  const runBatch = async (
    batch: Record<string, { content: string } | null>,
    isFirst: boolean,
  ): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await octokit.rest.gists.update({
      gist_id: gistId,
      description: 'Tsukuyomi - Moonlit Translator - Manifest-Driven Sync',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: batch as any,
    });
    if (isFirst) {
      newETag = (response.headers?.etag as string | undefined) ?? '';
      newUpdatedAt = response.data?.updated_at ?? '';
      htmlUrl = response.data?.html_url ?? undefined;
    } else {
      if (response.headers?.etag) newETag = response.headers.etag as string;
      if (response.data?.updated_at) newUpdatedAt = response.data.updated_at;
    }
  };

  const totalBatches = additionBatches.length;
  const uploadSpan = PROGRESS_TOTAL - PREP_END;
  let firstBatch = true;

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = additionBatches[bi]!;
    // 批次开始时先把进度推到该批的起点——否则在网络等待期间进度条不动
    onProgress?.({
      current: PREP_END + Math.round((bi / totalBatches) * uploadSpan),
      total: PROGRESS_TOTAL,
      message: `正在上传批次 ${bi + 1} / ${totalBatches} (${Object.keys(batch).length} 个文件)...`,
    });
    await runBatch(batch, firstBatch);
    firstBatch = false;
    onProgress?.({
      current: PREP_END + Math.round(((bi + 1) / totalBatches) * uploadSpan),
      total: PROGRESS_TOTAL,
      message: `已上传批次 ${bi + 1} / ${totalBatches}`,
    });
  }

  return { etag: newETag, htmlUrl, updatedAt: newUpdatedAt };
}

/**
 * 从 UploadPayload 中取出指定 entry key 对应的原始数据。
 *
 * memories 条目以 envelope 形式上传（`MemoriesPayload`），由 `buildMemoriesPayload`
 * 规范化（tombstones 排序、空数组省略），保证与 manifest 中的 hash 一致。
 */
function getPayloadForEntry(entryKey: string, payload: UploadPayload): unknown {
  if (entryKey === ENTRY_KEYS.SETTINGS) return payload.appSettings;
  if (entryKey === ENTRY_KEYS.AI_MODELS) return payload.aiModels;
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) return payload.coverHistory;

  const novelId = parseNovelEntryKey(entryKey);
  if (novelId) {
    return payload.novels.find((n) => n.id === novelId) ?? null;
  }

  const memBookId = parseMemoriesEntryKey(entryKey);
  if (memBookId) {
    return buildMemoriesPayload(
      payload.memoriesByBook[memBookId] ?? [],
      payload.memoryTombstonesByBook?.[memBookId],
    );
  }

  return null;
}
