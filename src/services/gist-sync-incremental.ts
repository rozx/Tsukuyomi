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
  type ManifestEntry,
} from 'src/models/manifest';
import { buildLocalManifest, diffManifests } from 'src/services/sync-manifest-builder';
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
  /** 墓碑：entryKey -> deletedAt ISO（仅 `novel:<id>` 形式） */
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
 */
export type EntryValue =
  | { kind: 'settings'; value: AppSettings }
  | { kind: 'ai-models'; value: AIModel[] }
  | { kind: 'cover-history'; value: CoverHistoryItem[] }
  | { kind: 'novel'; bookId: string; value: Novel }
  | { kind: 'memories'; bookId: string; value: Memory[] };

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
 * 把 `knownRemoteHashes`（仅含 hash）包装为一个"最小 manifest"供 diffManifests 使用。
 * 下载 diff 与上传 diff 都要走一遍这个转换，因此抽成独立 helper。
 */
function buildKnownAsManifest(
  knownHashes: Record<string, string> | undefined,
): { schemaVersion: typeof MANIFEST_SCHEMA_VERSION; updatedAt: string; entries: Record<string, ManifestEntry> } {
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
 * 从 Gist 文件集中读取并反序列化一个条目的内容
 * @param entryKey 条目键
 * @param manifestEntry manifest 中该条目的元数据（用于获取 chunk 数）
 * @param gistFiles Gist `gists.get` 响应中的 files 对象
 * @param fetchRaw 当 inline content 被截断时用于从 raw_url 获取完整内容的函数
 */
async function deserializeEntry(
  entryKey: string,
  manifestEntry: ManifestEntry,
  gistFiles: Record<string, GistFileLike>,
  fetchRaw: (url: string) => Promise<string>,
): Promise<EntryValue | null> {
  if (entryKey === ENTRY_KEYS.SETTINGS) {
    const content = await readFile(FILE_NAMES.SETTINGS, gistFiles, fetchRaw);
    if (content === null) return null;
    const raw = await parseStoredContent(content);
    return { kind: 'settings', value: deserializeDates(raw) as AppSettings };
  }
  if (entryKey === ENTRY_KEYS.AI_MODELS) {
    const content = await readFile(FILE_NAMES.AI_MODELS, gistFiles, fetchRaw);
    if (content === null) return null;
    const raw = await parseStoredContent(content);
    return { kind: 'ai-models', value: deserializeDates(raw) as AIModel[] };
  }
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) {
    const content = await readFile(FILE_NAMES.COVER_HISTORY, gistFiles, fetchRaw);
    if (content === null) return null;
    const raw = await parseStoredContent(content);
    return { kind: 'cover-history', value: deserializeDates(raw) as CoverHistoryItem[] };
  }

  const novelBookId = parseNovelEntryKey(entryKey);
  const memoryBookId = parseMemoriesEntryKey(entryKey);
  const bookId = novelBookId ?? memoryBookId;
  const prefix = novelBookId
    ? FILE_NAMES.NOVEL_PREFIX
    : memoryBookId
      ? FILE_NAMES.MEMORIES_PREFIX
      : null;
  const chunkPrefix = novelBookId
    ? FILE_NAMES.NOVEL_CHUNK_PREFIX
    : memoryBookId
      ? FILE_NAMES.MEMORIES_CHUNK_PREFIX
      : null;

  if (!bookId || !prefix || !chunkPrefix) {
    return null;
  }

  const chunks = manifestEntry.chunks ?? 0;
  let combined: string | null = null;
  if (chunks === 0) {
    combined = await readFile(`${prefix}${bookId}.json`, gistFiles, fetchRaw);
  } else {
    const pieces: string[] = [];
    for (let i = 0; i < chunks; i++) {
      const name = `${chunkPrefix}${bookId}_${i}.json`;
      const content = await readFile(name, gistFiles, fetchRaw);
      if (content === null) {
        console.warn(`[gist-sync-incremental] 分块缺失或读取失败: ${name}`);
        return null;
      }
      pieces.push(content);
    }
    combined = pieces.join('');
  }

  if (combined === null) return null;

  const raw = await parseStoredContent(combined);
  if (novelBookId) {
    return { kind: 'novel', bookId: novelBookId, value: deserializeDates(raw) as Novel };
  }
  if (memoryBookId) {
    return { kind: 'memories', bookId: memoryBookId, value: deserializeDates(raw) as Memory[] };
  }
  return null;
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

async function readFile(
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
export function matchFilenamesInSnapshot(
  entryKey: string,
  remoteFilenames: string[],
): string[] {
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

  return remoteFilenames.filter((f) =>
    prefixes.some((p) => f.startsWith(`${p}${bookId}`)),
  );
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
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (lastETag) headers['If-None-Match'] = lastETag;

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers,
  });

  const etag = response.headers.get('etag') ?? '';

  if (response.status === 304) {
    return { notModified: true, etag: etag || lastETag || '' };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GitHub Gist API 错误 ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    files?: Record<string, GistFileLike>;
    updated_at?: string;
    html_url?: string;
  };

  return {
    notModified: false,
    etag,
    updatedAt: data.updated_at ?? '',
    files: (data.files ?? {}),
    ...(data.html_url ? { htmlUrl: data.html_url } : {}),
  };
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

  const token = config.secret || config.syncParams.token || '';
  const result = await conditionalGetGist(token, gistId, config.lastRemoteETag);
  if (result.notModified) {
    return { success: true, skipped: true, remoteETag: result.etag };
  }

  const { files, etag, updatedAt } = result;

  // 读取 manifest
  const manifestFile = files[MANIFEST_FILE_NAME];
  if (!manifestFile) {
    // 远端缺少 manifest，触发迁移
    // 携带远端文件快照，便于后续 uploadIncremental 清理遗留文件（如旧 chunk / 旧分块布局）
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

  const fetchRaw = async (url: string): Promise<string> => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
  };

  const manifestContent = await readFile(MANIFEST_FILE_NAME, files, fetchRaw);
  if (!manifestContent) {
    throw new Error('manifest.json 内容为空');
  }

  let remoteManifest: GistManifest;
  try {
    remoteManifest = JSON.parse(manifestContent) as GistManifest;
  } catch (e) {
    throw new Error(`manifest.json 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (remoteManifest.schemaVersion > MANIFEST_SCHEMA_VERSION) {
    return {
      success: true,
      skipped: false,
      remoteETag: etag,
      remoteUpdatedAt: updatedAt,
      manifest: remoteManifest,
      schemaVersionTooNew: true,
      changedEntries: {},
      deletedEntries: [],
      remoteTombstones: Object.fromEntries(
        Object.entries(remoteManifest.tombstones ?? {}).map(([k, v]) => [k, v.deletedAt]),
      ),
      remoteEntryKeys: Object.keys(remoteManifest.entries),
    };
  }

  // 计算 diff：remote vs knownRemote
  const diff = diffManifests(remoteManifest, buildKnownAsManifest(config.knownRemoteHashes));

  // 仅需要反序列化 changed + added（即远端有而本地尚未见过的）
  const toRead = [...diff.changed, ...diff.added];
  const total = toRead.length;
  const changedEntries: Record<string, EntryValue> = {};

  for (let i = 0; i < toRead.length; i++) {
    const key = toRead[i]!;
    const entry = remoteManifest.entries[key];
    if (!entry) continue;
    onProgress?.({ current: i, total, message: `正在下载: ${key}` });
    const value = await deserializeEntry(key, entry, files, fetchRaw);
    if (value) changedEntries[key] = value;
  }

  onProgress?.({ current: total, total, message: '下载完成' });

  // 合并两种"删除"来源：
  // 1. 隐式：knownRemote 中有，但远端 manifest.entries 中没有（diff.deleted）
  // 2. 显式：远端 manifest.tombstones 中的记录
  const remoteTombstoneMap: Record<string, string> = Object.fromEntries(
    Object.entries(remoteManifest.tombstones ?? {}).map(([k, v]) => [k, v.deletedAt]),
  );

  const deletionKeys = new Set<string>(diff.deleted);
  for (const tk of Object.keys(remoteTombstoneMap)) {
    deletionKeys.add(tk);
  }
  const deletedEntries: Array<{ key: string; deletedAt?: string }> = [];
  for (const key of deletionKeys) {
    const ds = remoteTombstoneMap[key];
    deletedEntries.push(ds !== undefined ? { key, deletedAt: ds } : { key });
  }

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
    ...(payload.tombstones ? { tombstones: payload.tombstones } : {}),
  });

  const knownEntries = config.knownRemoteEntries ?? {};
  const diff = diffManifests(localManifest, buildKnownAsManifest(config.knownRemoteHashes));
  const toUpload = [...diff.changed, ...diff.added];
  const toDelete = diff.deleted;

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

  // 排序：先分批上传新增/变更内容（非 null），然后在最后一个原子 PATCH 里
  // 同时写入 manifest 与所有删除标记（null）。
  //
  // 为什么删除必须与 manifest 同批：
  // - 若先单独 PATCH 删除、再 PATCH manifest，中间任一失败都会留下
  //   "旧 manifest 引用已被删除的文件"的坏状态，下次下载会读空。
  // - 合并在一个 PATCH 里，GitHub 保证该请求要么全部生效要么全部回滚。
  //
  // 为什么 GitHub 不能接受"全 null"的 PATCH：
  // - 只含 null 条目的 files 对象会被视作空，返回 422 missing_field:files。
  //   把 manifest（非 null）和删除放一起顺带消除这个陷阱。
  const BATCH_SIZE = 10;
  // 单批请求体字节预算：GitHub Gist PATCH 的有效请求上限经验值约为 8-10 MB
  // （超出会返回 `409 Gist cannot be updated`，并无具体错误信息）。
  // 我们用 4 MB 留足 JSON 包裹 / header / base64 膨胀余量。
  const BATCH_BYTE_BUDGET = 4 * 1024 * 1024;
  const nonManifestEntries = Object.entries(allFiles);
  const additions = nonManifestEntries.filter(
    (kv): kv is [string, { content: string }] => kv[1] !== null,
  );
  const deletions = nonManifestEntries.filter(
    (kv): kv is [string, null] => kv[1] === null,
  );
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

  // 分批策略：把所有 additions 按 BATCH_SIZE 切块上传；最后一块额外附加
  // 所有 deletions 与 manifest，保证"指针切换"是一次原子 PATCH。
  //
  // 为什么把 manifest + deletions 并入最后一个 additions 批次而不是单独一批：
  // GitHub 的 Gist PATCH 在遇到"只有 manifest 内容 + 若干 null 删除"的请求时会
  // 返回 422 missing_field:files（推测为空有效变更的启发式）。把它与真实的
  // 内容写入同批，既避免触发这个陷阱，又保持 manifest 最后写入的原子语义——
  // 前面的 N-1 批都是纯内容上传（若失败，旧 manifest 仍然指向旧布局，无害）。
  const additionBatches: Array<Record<string, { content: string } | null>> = [];
  {
    // 按字节预算 + 文件数双重上限切分；大 chunk 文件（接近 MAX_FILE_SIZE）
    // 单靠文件数截断容易凑出 ~9 MB 的巨型 PATCH，触发 409。
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
  }

  // 纯删除场景：没有任何 additions，只有 deletions + manifest
  // GitHub 对 "N null + 1 content (manifest)" 这种形状会返回 422 missing_field:files。
  // 解决：只写 manifest，跳过删除——被删条目因不在 manifest.entries 里，下载时不会被读取；
  // Gist 上留下的旧文件成为孤儿，无害。下一次有 additions 的同步会在 last batch 里顺带清理。
  if (additionBatches.length === 0) {
    additionBatches.push({});
  }

  // 向最后一批追加 deletions 与 manifest（仅当该批已含非 null 内容时才追加 deletions）
  const finalBatch = additionBatches[additionBatches.length - 1]!;
  const lastBatchHasContent = Object.values(finalBatch).some((v) => v !== null);
  if (lastBatchHasContent) {
    for (const [name, f] of deletions) finalBatch[name] = f;
  }
  finalBatch[MANIFEST_FILE_NAME] = { content: JSON.stringify(localManifest) };

  const totalBatches = additionBatches.length;
  const uploadSpan = PROGRESS_TOTAL - PREP_END; // 80
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
 * 从 UploadPayload 中取出指定 entry key 对应的原始数据
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
    return payload.memoriesByBook[memBookId] ?? [];
  }

  return null;
}

// 重新导出便于测试
