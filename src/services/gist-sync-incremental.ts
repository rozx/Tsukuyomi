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
  memoriesEntryKey,
  novelEntryKey,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
  type GistManifest,
  type ManifestEntry,
} from 'src/models/manifest';
import { buildLocalManifest, diffManifests } from 'src/services/sync-manifest-builder';
import { compressString, decompressString } from 'src/utils/compression';
import { serializeDates, deserializeDates } from 'src/utils/serialize-dates';

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
      /** 由 entry key 索引的反序列化后数据（仅包含 diff 中变化的条目） */
      changedEntries: Record<string, EntryValue>;
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
  const serialized = serializeDates(payload);
  const json = JSON.stringify(serialized);
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

  if (file.content && !file.truncated) {
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
 * 根据 entry key 与可能的 chunk 数计算所有匹配的文件名，用于删除 Gist 上的文件。
 * 用于：entry 在本地被删除时，将对应远端文件置为 null。
 */
export function filenamesForEntry(
  entryKey: string,
  knownRemoteFiles: string[],
): string[] {
  if (entryKey === ENTRY_KEYS.SETTINGS) return [FILE_NAMES.SETTINGS];
  if (entryKey === ENTRY_KEYS.AI_MODELS) return [FILE_NAMES.AI_MODELS];
  if (entryKey === ENTRY_KEYS.COVER_HISTORY) return [FILE_NAMES.COVER_HISTORY];

  const novelBookId = parseNovelEntryKey(entryKey);
  const memoryBookId = parseMemoriesEntryKey(entryKey);
  const bookId = novelBookId ?? memoryBookId;
  if (!bookId) return [];

  const prefixes = novelBookId
    ? [FILE_NAMES.NOVEL_PREFIX, FILE_NAMES.NOVEL_CHUNK_PREFIX]
    : [FILE_NAMES.MEMORIES_PREFIX, FILE_NAMES.MEMORIES_CHUNK_PREFIX];

  return knownRemoteFiles.filter((f) => {
    // 精确前缀 + bookId 匹配，避免误删其他书籍
    return prefixes.some((p) => f.startsWith(`${p}${bookId}`));
  });
}

/**
 * 条件 GET：使用 `If-None-Match` 头检查远端是否有变化
 * @returns 包含响应与 `notModified` 标志的结果
 */
export async function conditionalGetGist(
  octokit: Octokit,
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
  const headers: Record<string, string> = {};
  if (lastETag) headers['If-None-Match'] = lastETag;

  try {
    const response = await octokit.rest.gists.get({
      gist_id: gistId,
      headers,
    });
    const etag = (response.headers?.etag as string | undefined) ?? '';
    return {
      notModified: false,
      etag,
      updatedAt: response.data.updated_at ?? '',
      files: (response.data.files ?? {}) as Record<string, GistFileLike>,
      ...(response.data.html_url ? { htmlUrl: response.data.html_url } : {}),
    };
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (error as any)?.status ?? (error as any)?.response?.status;
    if (status === 304) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const etagHeader = (error as any)?.response?.headers?.etag as string | undefined;
      return { notModified: true, etag: etagHeader ?? lastETag ?? '' };
    }
    throw error;
  }
}

/**
 * 下载：基于 manifest 的选择性拉取
 */
export async function downloadWithManifest(
  octokit: Octokit,
  config: SyncConfig,
  onProgress?: (progress: { current: number; total: number; message: string }) => void,
): Promise<IncrementalDownloadResult> {
  const gistId = config.syncParams.gistId;
  if (!gistId) {
    throw new Error('Gist ID 未配置');
  }

  onProgress?.({ current: 0, total: 1, message: '正在检查远程变更...' });

  const result = await conditionalGetGist(octokit, gistId, config.lastRemoteETag);
  if (result.notModified) {
    return { success: true, skipped: true, remoteETag: result.etag };
  }

  const { files, etag, updatedAt } = result;

  // 读取 manifest
  const manifestFile = files[MANIFEST_FILE_NAME];
  if (!manifestFile) {
    // 远端缺少 manifest，触发迁移
    return {
      success: true,
      skipped: false,
      remoteETag: etag,
      remoteUpdatedAt: updatedAt,
      manifest: null,
      needsMigration: true,
      changedEntries: {},
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
      remoteEntryKeys: Object.keys(remoteManifest.entries),
    };
  }

  // 计算 diff：remote vs knownRemote
  const knownHashes = config.knownRemoteHashes ?? {};
  const knownAsManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: '',
    entries: Object.fromEntries(
      Object.entries(knownHashes).map(([k, h]) => [
        k,
        { hash: h, lastEdited: '' } as ManifestEntry,
      ]),
    ),
  };
  const diff = diffManifests(remoteManifest, knownAsManifest);

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

  return {
    success: true,
    skipped: false,
    remoteETag: etag,
    remoteUpdatedAt: updatedAt,
    manifest: remoteManifest,
    changedEntries,
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

  onProgress?.({ current: 0, total: 1, message: '正在计算本地 manifest...' });

  const localManifest = await buildLocalManifest({
    appSettings: payload.appSettings,
    aiModels: payload.aiModels,
    coverHistory: payload.coverHistory,
    novels: payload.novels,
    memoriesByBook: payload.memoriesByBook,
  });

  const knownHashes = config.knownRemoteHashes ?? {};
  const knownAsManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: '',
    entries: Object.fromEntries(
      Object.entries(knownHashes).map(([k, h]) => [
        k,
        { hash: h, lastEdited: '' } as ManifestEntry,
      ]),
    ),
  };
  const diff = diffManifests(localManifest, knownAsManifest);
  const toUpload = [...diff.changed, ...diff.added];
  const toDelete = diff.deleted;

  // 按 entry key 序列化文件
  const allFiles: Record<string, { content: string } | null> = {};
  const remoteFilenames = Object.keys(remoteFilesSnapshot);
  const uploadedEntries: string[] = [];

  for (let i = 0; i < toUpload.length; i++) {
    const entryKey = toUpload[i]!;
    const payloadValue = getPayloadForEntry(entryKey, payload);
    if (payloadValue === null) continue;
    onProgress?.({
      current: i,
      total: toUpload.length,
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
    const potentiallyStale = filenamesForEntry(entryKey, remoteFilenames);
    for (const stale of potentiallyStale) {
      if (!expectedFilenames.has(stale)) {
        allFiles[stale] = null;
      }
    }
  }

  // 处理删除的 entry
  for (const entryKey of toDelete) {
    const toNull = filenamesForEntry(entryKey, remoteFilenames);
    for (const name of toNull) {
      allFiles[name] = null;
    }
  }

  // 始终写入最新的 manifest
  allFiles[MANIFEST_FILE_NAME] = {
    content: JSON.stringify(localManifest),
  };

  uploadedEntries.push(...toUpload);

  onProgress?.({
    current: 0,
    total: Object.keys(allFiles).length,
    message: '正在上传...',
  });

  // 批量上传（复用现有批处理 + 重试思路）
  const BATCH_SIZE = 10;
  const entries = Object.entries(allFiles);
  let newETag = '';
  let htmlUrl: string | undefined;
  let newUpdatedAt = '';

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const slice = entries.slice(i, i + BATCH_SIZE);
    const batch: Record<string, { content: string } | null> = {};
    for (const [name, f] of slice) batch[name] = f;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await octokit.rest.gists.update({
      gist_id: gistId,
      description: 'Tsukuyomi - Moonlit Translator - Manifest-Driven Sync',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: batch as any,
    });

    if (i === 0) {
      newETag = (response.headers?.etag as string | undefined) ?? '';
      newUpdatedAt = response.data?.updated_at ?? '';
      htmlUrl = response.data?.html_url ?? undefined;
    } else {
      // 后续批次覆盖 ETag（最后一次的为准）
      if (response.headers?.etag) newETag = response.headers.etag as string;
      if (response.data?.updated_at) newUpdatedAt = response.data.updated_at;
    }

    onProgress?.({
      current: Math.min(i + BATCH_SIZE, entries.length),
      total: entries.length,
      message: `已上传 ${Math.min(i + BATCH_SIZE, entries.length)} / ${entries.length}`,
    });
  }

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

/**
 * 将 remote manifest 的 entries 表达为平面 hash 字典，供 SyncConfig 持久化
 */
export function remoteManifestToHashes(manifest: GistManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(manifest.entries)) {
    out[k] = v.hash;
  }
  return out;
}

// 重新导出便于测试
export { ENTRY_KEYS, FILE_NAMES };
