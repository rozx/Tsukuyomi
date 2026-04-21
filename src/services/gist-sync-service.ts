import { Octokit } from '@octokit/rest';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel } from 'src/models/novel';
import type { AppSettings } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import type { CoverHistoryItem } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import { compressString, decompressString } from 'src/utils/compression';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import { MANIFEST_FILE_NAME } from 'src/models/manifest';
import {
  downloadWithManifest,
  uploadIncremental,
  conditionalGetGist,
  remoteManifestToHashes,
  type IncrementalDownloadResult,
  type IncrementalUploadResult,
  type UploadPayload,
} from 'src/services/gist-sync-incremental';

/**
 * Gist 文件名称常量
 */
export const GIST_FILE_NAMES = {
  SETTINGS: 'tsukuyomi-settings.json',
  NOVEL_PREFIX: 'novel-',
  NOVEL_CHUNK_PREFIX: 'novel-chunk-',
  MANIFEST: MANIFEST_FILE_NAME,
  AI_MODELS: 'ai-models.json',
  COVER_HISTORY: 'cover-history.json',
  MEMORIES_PREFIX: 'memories-',
  MEMORIES_CHUNK_PREFIX: 'memories-chunk-',
} as const;

/**
 * 从分块文件名中提取书籍 ID
 * 支持两种格式：
 * - 新格式：novel-chunk-{id}#{index}.json（使用 # 作为分隔符）
 * - 旧格式：novel-chunk-{id}-{index}.json（向后兼容）
 * @param fileName 文件名
 * @returns 书籍 ID，如果不是分块文件则返回 null
 */
export function extractNovelIdFromChunkFileName(fileName: string): string | null {
  if (!fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
    return null;
  }

  const prefix = GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX;
  const prefixLength = prefix.length;
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex <= prefixLength) {
    return null;
  }

  const beforeDot = fileName.substring(0, dotIndex);

  // 优先尝试最新格式（使用 _ 作为分隔符，为了兼容 Gist 文件名限制）
  const underscoreIndex = beforeDot.lastIndexOf('_');
  if (
    underscoreIndex !== -1 &&
    underscoreIndex > prefixLength &&
    underscoreIndex < beforeDot.length - 1
  ) {
    const indexPart = beforeDot.substring(underscoreIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, underscoreIndex);
      if (novelId && novelId.length > 0 && !novelId.includes('#') && !novelId.endsWith('-')) {
        return novelId;
      }
    }
  }

  // 尝试旧格式（使用 # 分隔符）
  const hashIndex = beforeDot.lastIndexOf('#');
  if (hashIndex !== -1 && hashIndex > prefixLength && hashIndex < beforeDot.length - 1) {
    const indexPart = beforeDot.substring(hashIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, hashIndex);
      if (novelId && novelId.length > 0 && !novelId.includes('#') && !novelId.endsWith('-')) {
        return novelId;
      }
    }
  }

  // 向后兼容：尝试旧格式（使用 - 分隔符）
  const lastDashIndex = beforeDot.lastIndexOf('-');
  if (
    lastDashIndex !== -1 &&
    lastDashIndex > prefixLength &&
    lastDashIndex < beforeDot.length - 1
  ) {
    const indexPart = beforeDot.substring(lastDashIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, lastDashIndex);
      if (novelId && novelId.length > 0) {
        return novelId;
      }
    }
  }

  return null;
}

/**
 * 从普通文件名中提取书籍 ID（用于检测是否与分块文件对应）
 * @param fileName 文件名
 * @returns 书籍 ID，如果不是 novel-{id}.json 格式则返回 null
 */
function extractNovelIdFromRegularFileName(fileName: string): string | null {
  if (!fileName.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX)) {
    return null;
  }
  if (!fileName.endsWith('.json')) {
    return null;
  }
  // 格式: novel-{id}.json
  const match = fileName.match(/^novel-(.+)\.json$/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * 分组文件，将分块文件合并显示
 * @param files 文件列表，每个文件包含 filename 和 size
 * @returns 分组后的文件列表，分块文件合并为单个文件显示
 */
export function groupChunkFiles<T extends { filename: string; size?: number; sizeDiff?: number }>(
  files: T[],
): Array<T & { filename: string; size?: number; sizeDiff?: number }> {
  const chunkGroups = new Map<
    string,
    { filename: string; size: number; sizeDiff: number; originalFile: T }
  >();
  const regularFiles: T[] = [];
  const regularFilesToMerge = new Map<string, T>();

  // 第一遍：处理所有文件，识别分块文件和普通文件
  for (const file of files) {
    const novelIdFromChunk = extractNovelIdFromChunkFileName(file.filename);
    if (novelIdFromChunk) {
      // 这是分块文件
      const groupKey = `novel-${novelIdFromChunk}`;
      if (!chunkGroups.has(groupKey)) {
        chunkGroups.set(groupKey, {
          filename: `novel-${novelIdFromChunk}.json`,
          size: 0,
          sizeDiff: 0,
          originalFile: file,
        });
      }
      const group = chunkGroups.get(groupKey)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
    } else {
      // 普通文件 - 检查是否是 novel-{id}.json 格式
      const novelIdFromRegular = extractNovelIdFromRegularFileName(file.filename);
      if (novelIdFromRegular) {
        // 可能是需要合并的文件，先暂存
        regularFilesToMerge.set(file.filename, file);
      } else {
        // 不是小说文件，直接添加到普通文件列表
        regularFiles.push(file);
      }
    }
  }

  // 第二遍：将匹配的普通文件合并到分块组中
  for (const [filename, file] of regularFilesToMerge.entries()) {
    const novelIdFromRegular = extractNovelIdFromRegularFileName(filename);
    if (novelIdFromRegular && chunkGroups.has(`novel-${novelIdFromRegular}`)) {
      // 存在对应的分块组，合并到分块组中
      const groupKey = `novel-${novelIdFromRegular}`;
      const group = chunkGroups.get(groupKey)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
      // 不添加到 regularFiles，因为已经合并
    } else {
      // 没有对应的分块组，作为普通文件处理
      regularFiles.push(file);
    }
  }

  // 合并分块组和普通文件
  const groupedFiles: Array<T & { filename: string; size?: number; sizeDiff?: number }> = [
    ...Array.from(chunkGroups.values()).map((group) => ({
      ...group.originalFile,
      filename: group.filename,
      size: group.size,
      sizeDiff: group.sizeDiff !== 0 ? group.sizeDiff : undefined,
    })),
    ...regularFiles,
  ];

  return groupedFiles;
}

/**
 * GitHub Gist 单个文件大小限制（字节）
 * 实际限制约为 1MB，我们使用 900KB 作为安全边界
 */
const MAX_FILE_SIZE = 900 * 1024; // 900KB

/**
 * 分块大小（字节）
 */
const CHUNK_SIZE = MAX_FILE_SIZE;

/**
 * 创建 Gist 时每批文件数量
 */
const CREATE_BATCH_SIZE = 10;

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * 检查错误是否可重试
 * @param error 错误对象
 * @returns 是否可重试
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errorObj = error as any;
  const status = errorObj?.status || errorObj?.response?.status;

  // 网络错误（无状态码）
  if (!status) return true;

  // 5xx 服务器错误
  if (status >= 500 && status < 600) return true;

  // 429 Too Many Requests（速率限制）
  if (status === 429) return true;

  // 408 Request Timeout
  if (status === 408) return true;

  return false;
}

/**
 * 带重试的异步操作执行器
 * @param operation 要执行的异步操作
 * @param operationName 操作名称（用于日志）
 * @param config 重试配置
 * @returns 操作结果
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config = RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        // 不可重试的错误，立即抛出
        throw lastError;
      }

      if (attempt < config.maxRetries - 1) {
        // 计算延迟（指数退避 + 抖动）
        const baseDelay = config.baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * baseDelay; // 添加 30% 的抖动
        const delay = Math.min(baseDelay + jitter, config.maxDelayMs);

        console.warn(
          `[GistSyncService] ${operationName} 失败（尝试 ${attempt + 1}/${config.maxRetries}），` +
            `${Math.round(delay)}ms 后重试:`,
          lastError.message,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 所有重试都失败了
  throw lastError || new Error(`${operationName} 失败: 未知错误`);
}

/**
 * 同步结果接口
 */
export interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  gistId?: string;
  gistUrl?: string;
  isRecreated?: boolean; // 是否重新创建了 Gist
  remoteUpdatedAt?: string; // 远程 Gist 的 updated_at 时间戳（ISO 8601）
  skipped?: boolean; // 是否因远程无变更而跳过了下载解析
}

/**
 * 从 Gist 下载的数据接口
 */
export interface GistSyncData {
  aiModels: AIModel[];
  appSettings?: AppSettings;
  novels: Novel[];
  coverHistory?: CoverHistoryItem[];
  memories?: Memory[];
}

/**
 * Gist 同步服务
 * 用于将应用设置和书籍数据同步到 GitHub Gist
 */
export class GistSyncService {
  private octokit: Octokit | null = null;
  private config: SyncConfig | null = null;

  /**
   * 从 SyncConfig 获取 Gist 配置参数
   */
  private getGistParams(config: SyncConfig): {
    username: string;
    token: string;
    gistId?: string;
  } {
    const username = config.syncParams.username;
    const token = config.secret || config.syncParams.token;
    const gistId = config.syncParams.gistId;

    if (!username || !username.trim()) {
      throw new Error('GitHub 用户名不能为空');
    }
    if (!token || !token.trim()) {
      throw new Error('GitHub token 不能为空');
    }

    return {
      username,
      token,
      ...(gistId ? { gistId } : {}),
    };
  }

  /**
   * 初始化 Octokit 客户端
   */
  private initializeOctokit(config: SyncConfig): void {
    const params = this.getGistParams(config);
    this.octokit = new Octokit({
      auth: params.token,
    });
    this.config = config;
  }

  /**
   * 验证配置是否有效
   */
  private validateConfig(config: SyncConfig): void {
    if (config.syncType !== SyncType.Gist) {
      throw new Error('同步类型必须是 gist');
    }
    this.getGistParams(config); // 这会验证参数
  }

  /**
   * 解析 Gist 内容（支持 gzip 压缩）
   */
  private async parseGistContent(content: string): Promise<any> {
    // eslint-disable-next-line no-useless-catch
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && parsed.format === 'gzip' && parsed.data) {
        const decompressed = await decompressString(parsed.data);
        return JSON.parse(decompressed);
      }
      return parsed;
    } catch (error) {
      // 如果不是 JSON 或解压失败，抛出错误
      throw error;
    }
  }

  /**
   * 将 Date 对象转换为可序列化的格式
   */
  private serializeDates<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (obj instanceof Date) {
      return obj.toISOString() as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.serializeDates(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const serialized = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (serialized as Record<string, unknown>)[key] = this.serializeDates(value);
      }
      return serialized;
    }

    return obj;
  }

  /**
   * 需要从 ISO 字符串反序列化为 Date 对象的字段名白名单。
   * 只有这些字段中的 ISO 日期字符串会被转换，避免误将小说内容中的日期字符串转换为 Date 对象。
   */
  private static readonly DATE_FIELD_NAMES = new Set([
    'lastEdited',
    'createdAt',
    'addedAt',
    'lastUpdated',
  ]);

  /**
   * 将序列化的日期字符串转换回 Date 对象（仅限白名单字段）
   */
  private deserializeDates<T>(obj: T, parentKey?: string): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 只在白名单字段中将 ISO 日期字符串转换为 Date 对象
    if (
      typeof obj === 'string' &&
      parentKey &&
      GistSyncService.DATE_FIELD_NAMES.has(parentKey) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)
    ) {
      return new Date(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deserializeDates(item, parentKey)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const deserialized = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (deserialized as Record<string, unknown>)[key] = this.deserializeDates(value, key);
      }
      return deserialized;
    }

    return obj;
  }

  /**
   * 验证上传的文件
   *
   * 注意：GitHub Gist API 对于大文件（通常 > 1MB）会在 GET 响应中设置 truncated=true
   * 并且不返回完整的 content 字段。这是 GitHub API 的正常行为，不代表文件损坏。
   * 文件本身在 GitHub 服务器上是完整的，只是 API 响应被截断了。
   * 因此我们只验证文件是否存在以及大小是否匹配，不验证被截断的内容。
   *
   * @throws {Error} 如果验证失败
   */
  private async verifyUploadedFiles(
    gistId: string,
    expectedFiles: Record<string, { content: string }>,
    uploadStats: Array<{
      novelId: string;
      title: string;
      size: number;
      chunked: boolean;
      chunkCount?: number;
    }>,
  ): Promise<string | undefined> {
    if (!this.octokit) {
      throw new Error('Octokit 客户端未初始化，无法验证上传');
    }

    const response = await this.octokit.rest.gists.get({ gist_id: gistId });
    const remoteUpdatedAt = response.data.updated_at ?? undefined;
    const uploadedFiles = response.data.files;
    if (!uploadedFiles) {
      throw new Error('无法获取上传的文件信息');
    }

    const errors: string[] = [];
    this.collectFileSizeMismatches(expectedFiles, uploadedFiles, errors);
    this.collectChunkIntegrityErrors(uploadStats, uploadedFiles, errors);

    if (errors.length > 0) {
      throw new Error(`文件验证失败:\n${errors.join('\n')}`);
    }

    return remoteUpdatedAt;
  }

  /** 检查每个期望文件是否存在且大小在允许偏差内（>5% 视为异常） */
  private collectFileSizeMismatches(
    expectedFiles: Record<string, { content: string }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uploadedFiles: Record<string, any>,
    errors: string[],
  ): void {
    for (const [fileName, expectedFile] of Object.entries(expectedFiles)) {
      const uploadedFile = uploadedFiles[fileName];
      if (!uploadedFile) {
        errors.push(`文件缺失: ${fileName}`);
        continue;
      }
      const expectedSize = new Blob([expectedFile.content]).size;
      const uploadedSize = uploadedFile.size || 0;
      const sizeDiff = Math.abs(uploadedSize - expectedSize);
      const sizeDiffPercent = expectedSize > 0 ? (sizeDiff / expectedSize) * 100 : 0;
      if (sizeDiffPercent > 5) {
        errors.push(
          `文件大小不匹配: ${fileName} (期望: ${(expectedSize / 1024).toFixed(2)} KB, 实际: ${(uploadedSize / 1024).toFixed(2)} KB, 差异: ${sizeDiffPercent.toFixed(2)}%)`,
        );
      }
    }
  }

  /** 检查每本分块书的所有 chunk + metadata 文件存在且 chunks 数量匹配 */
  private collectChunkIntegrityErrors(
    uploadStats: Array<{
      novelId: string;
      title: string;
      size: number;
      chunked: boolean;
      chunkCount?: number;
    }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uploadedFiles: Record<string, any>,
    errors: string[],
  ): void {
    for (const stat of uploadStats) {
      if (!stat.chunked || !stat.chunkCount) continue;

      for (let i = 0; i < stat.chunkCount; i++) {
        const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${stat.novelId}_${i}.json`;
        if (!uploadedFiles[chunkFileName]) {
          errors.push(`书籍 "${stat.title}" 的分块 ${i} 缺失: ${chunkFileName}`);
        }
      }

      const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${stat.novelId}.meta.json`;
      const metadataFile = uploadedFiles[metadataFileName];
      if (!metadataFile) {
        errors.push(`书籍 "${stat.title}" 的元数据文件缺失: ${metadataFileName}`);
        continue;
      }
      if (!metadataFile.content) continue;

      try {
        const metadata = JSON.parse(metadataFile.content) as {
          chunks: number;
          totalSize: number;
        };
        if (metadata.chunks !== stat.chunkCount) {
          errors.push(
            `书籍 "${stat.title}" 的元数据块数量不匹配: 期望 ${stat.chunkCount}, 实际 ${metadata.chunks}`,
          );
        }
      } catch {
        errors.push(`书籍 "${stat.title}" 的元数据解析失败`);
      }
    }
  }

  /**
   * 将 memories 按书籍加载后扁平化返回（跳过加载失败的书籍，不中止整个上传）
   */
  private async collectMemoriesForUpload(novels: Novel[]): Promise<Memory[]> {
    const memoriesToUpload: Memory[] = [];
    for (const novel of novels) {
      try {
        const bookMemories = await MemoryService.getAllMemories(novel.id);
        memoriesToUpload.push(...bookMemories);
      } catch (error) {
        console.warn(
          `[GistSyncService] 加载书籍 ${novel.title} (${novel.id}) 的 Memory 失败:`,
          error,
        );
      }
    }
    return memoriesToUpload;
  }

  /**
   * 将 JSON 字符串可选压缩为 {format: 'gzip', data}（失败时返回原始字符串）
   */
  private async maybeCompress(jsonContent: string, failureLabel: string): Promise<string> {
    try {
      const compressed = await compressString(jsonContent);
      return JSON.stringify({ format: 'gzip', data: compressed });
    } catch (e) {
      console.warn(`压缩${failureLabel}失败，将使用未压缩格式`, e);
      return jsonContent;
    }
  }

  /**
   * 将字符串按 UTF-8 字节预算切分（二分查找每个 chunk 能安全容纳的字符数），
   * 确保不在多字节字符中间切断
   */
  private chunkStringByByteBudget(input: string, byteBudget: number): string[] {
    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let position = 0;

    while (position < input.length) {
      const remaining = input.length - position;
      let left = 1;
      let right = Math.min(remaining, byteBudget);
      let bestLength = 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const candidate = input.substring(position, position + mid);
        const candidateBytes = encoder.encode(candidate).length;
        if (candidateBytes <= byteBudget) {
          bestLength = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      chunks.push(input.substring(position, position + bestLength));
      position += bestLength;
    }

    return chunks;
  }

  /**
   * 构建单本书籍要写入的文件集合（单文件或多块 + metadata），并追加 uploadStats。
   */
  private async buildNovelFilesForUpload(
    novel: Novel,
    files: Record<string, { content: string } | null>,
    uploadStats: Array<{
      novelId: string;
      title: string;
      size: number;
      chunked: boolean;
      chunkCount?: number;
    }>,
  ): Promise<void> {
    const serializedNovel = this.serializeDates(novel);
    const jsonContent = JSON.stringify(serializedNovel);
    const finalContent = await this.maybeCompress(jsonContent, `书籍 ${novel.title}`);
    const contentSize = new Blob([finalContent]).size;

    if (contentSize <= MAX_FILE_SIZE) {
      const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novel.id}.json`;
      files[fileName] = { content: finalContent };
      uploadStats.push({
        novelId: novel.id,
        title: novel.title,
        size: contentSize,
        chunked: false,
      });
      return;
    }

    // 文件过大，按字节预算切块
    const chunks = this.chunkStringByByteBudget(finalContent, CHUNK_SIZE);
    // 使用 _ 作为分隔符，避免与 UUID 连字符冲突以及 # 的 URL 编码问题
    chunks.forEach((chunk, index) => {
      const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novel.id}_${index}.json`;
      files[chunkFileName] = { content: chunk };
    });
    const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novel.id}.meta.json`;
    files[metadataFileName] = {
      content: JSON.stringify({ chunks: chunks.length, totalSize: contentSize }),
    };
    uploadStats.push({
      novelId: novel.id,
      title: novel.title,
      size: contentSize,
      chunked: true,
      chunkCount: chunks.length,
    });
  }

  /**
   * 准备 uploadToGist 的所有文件内容（settings + 每本书），同时驱动进度回调。
   * 返回文件 map、uploadStats 和进度计数。
   */
  private async prepareUploadFiles(
    data: {
      aiModels: AIModel[];
      appSettings: AppSettings;
      novels: Novel[];
      coverHistory?: CoverHistoryItem[];
      memories?: Memory[];
    },
    onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
  ): Promise<{
    files: Record<string, { content: string } | null>;
    uploadStats: Array<{
      novelId: string;
      title: string;
      size: number;
      chunked: boolean;
      chunkCount?: number;
    }>;
    novelsWithContent: Novel[];
    preparePhaseItems: number;
    totalItems: number;
    processedItems: number;
  }> {
    const novelsWithContent = await ChapterContentService.loadAllChapterContentsForNovels(
      data.novels,
    );
    const memoriesToUpload = await this.collectMemoriesForUpload(data.novels);

    const files: Record<string, { content: string } | null> = {};

    // 1. 设置文件
    const settingsData = {
      aiModels: this.serializeDates(data.aiModels),
      appSettings: this.serializeDates(data.appSettings),
      coverHistory: data.coverHistory ? this.serializeDates(data.coverHistory) : undefined,
      memories: memoriesToUpload.length > 0 ? this.serializeDates(memoriesToUpload) : undefined,
    };
    const settingsContent = await this.maybeCompress(JSON.stringify(settingsData), '设置文件');
    files[GIST_FILE_NAMES.SETTINGS] = { content: settingsContent };

    const uploadStats: Array<{
      novelId: string;
      title: string;
      size: number;
      chunked: boolean;
      chunkCount?: number;
    }> = [];

    // 准备阶段：设置文件(1) + 每本书(N)；上传批次估算为 70% 占比（下限 3）
    const preparePhaseItems = 1 + novelsWithContent.length;
    const estimatedUploadItems = Math.max(Math.ceil(preparePhaseItems * 0.7), 3);
    const totalItems = preparePhaseItems + estimatedUploadItems;
    let processedItems = 0;

    onProgress?.({
      current: processedItems,
      total: totalItems,
      message: '正在准备设置文件...',
    });

    processedItems = 1;
    onProgress?.({
      current: processedItems,
      total: totalItems,
      message: '设置文件准备完成',
    });

    // 2. 每本书的文件
    for (let novelIndex = 0; novelIndex < novelsWithContent.length; novelIndex++) {
      const novel = novelsWithContent[novelIndex];
      if (!novel) {
        processedItems = novelIndex + 2;
        if (onProgress) {
          const percentage = Math.round((processedItems / totalItems) * 100);
          onProgress({
            current: processedItems,
            total: totalItems,
            message: `跳过无效书籍 (${processedItems}/${totalItems}, ${percentage}%)`,
          });
        }
        continue;
      }

      await this.buildNovelFilesForUpload(novel, files, uploadStats);

      processedItems = novelIndex + 2;
      if (onProgress) {
        const percentage = Math.round((processedItems / totalItems) * 100);
        onProgress({
          current: processedItems,
          total: totalItems,
          message: `正在准备书籍: ${novel.title} (${processedItems}/${totalItems}, ${percentage}%)`,
        });
      }
    }

    onProgress?.({
      current: processedItems,
      total: totalItems,
      message: '准备完成，正在开始上传...',
    });

    return { files, uploadStats, novelsWithContent, preparePhaseItems, totalItems, processedItems };
  }

  /**
   * 上传数据到 Gist
   * @param config 同步配置
   * @param data 要上传的数据
   * @param onProgress 进度回调（可选）
   */
  async uploadToGist(
    config: SyncConfig,
    data: {
      aiModels: AIModel[];
      appSettings: AppSettings;
      novels: Novel[];
      coverHistory?: CoverHistoryItem[];
      memories?: Memory[];
    },
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
  ): Promise<SyncResult> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

      const { files, uploadStats, preparePhaseItems, totalItems } = await this.prepareUploadFiles(
        data,
        onProgress,
      );
      const estimatedUploadItems = totalItems - preparePhaseItems;

      const params = this.getGistParams(config);
      let gistId = params.gistId;
      let gistUrl: string | undefined;
      let isRecreated = false;
      let totalItemsRef = totalItems;

      if (gistId) {
        const updateOutcome = await this.updateExistingGistWithFiles(
          gistId,
          files,
          preparePhaseItems,
          estimatedUploadItems,
          totalItemsRef,
          onProgress,
        );
        totalItemsRef = updateOutcome.totalItems;
        if (updateOutcome.gistId) gistId = updateOutcome.gistId;
        if (updateOutcome.gistUrl) gistUrl = updateOutcome.gistUrl;

        // 如果 update 路径没能成功（例如 Gist 不存在），退化到创建新 Gist
        if (!gistUrl) {
          const createOutcome = await this.createNewGistFromFiles(files, totalItemsRef, onProgress);
          gistId = createOutcome.gistId;
          gistUrl = createOutcome.gistUrl;
          isRecreated = true;
        }
      } else {
        const createOutcome = await this.createNewGistFromFiles(files, totalItemsRef, onProgress);
        gistId = createOutcome.gistId;
        gistUrl = createOutcome.gistUrl;
      }

      // 验证上传的文件（必须在返回成功之前验证）
      let remoteUpdatedAt: string | undefined;
      if (gistId) {
        const filesToVerify: Record<string, { content: string }> = {};
        for (const [filename, file] of Object.entries(files)) {
          if (file !== null) {
            filesToVerify[filename] = file;
          }
        }
        remoteUpdatedAt = await this.verifyUploadedFiles(gistId, filesToVerify, uploadStats);
      }

      const message = gistId ? '数据已成功同步到 Gist' : 'Gist 已创建';

      return {
        success: true,
        message,
        ...(gistId ? { gistId } : {}),
        ...(gistUrl ? { gistUrl } : {}),
        ...(isRecreated ? { isRecreated: true } : {}),
        ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '同步到 Gist 时发生未知错误',
      };
    }
  }

  /**
   * 标注远程存在但本地即将上传的 files map 中不存在的 Tsukuyomi 文件为 null（删除）。
   * 覆盖书籍被删除、格式切换（单文件↔分块）、分块数量减少、分隔符重命名等场景。
   */
  private markOrphanedRemoteFilesForDeletion(
    files: Record<string, { content: string } | null>,
    currentFiles: Record<string, unknown>,
  ): void {
    const localFileNames = new Set<string>();
    for (const [filename, file] of Object.entries(files)) {
      if (file !== null) localFileNames.add(filename);
    }
    for (const [filename, file] of Object.entries(currentFiles)) {
      if (!file) continue;
      if (localFileNames.has(filename)) continue;
      const isTsukuyomiFile =
        filename === GIST_FILE_NAMES.SETTINGS ||
        filename.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) ||
        filename.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX);
      if (isTsukuyomiFile) files[filename] = null;
    }
  }

  /**
   * 单批次 Gist PATCH（带指数退避重试）。409 视为不可恢复冲突直接抛出。
   */
  private async patchGistBatchWithRetry(
    gistId: string,
    batchFiles: Record<string, { content: string } | null>,
    batchIndex: number,
  ): Promise<{ data: { id: string; html_url?: string } }> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_BASE = 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (!this.octokit) throw new Error('Octokit 客户端未初始化');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await this.octokit.rest.gists.update({
          gist_id: gistId,
          description: 'Tsukuyomi - Moonlit Translator - Settings and Novels',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          files: batchFiles as any,
        });
        return response;
      } catch (batchError) {
        lastError = batchError instanceof Error ? batchError : new Error(String(batchError));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorResponse = (batchError as any).response;
        const errorData = errorResponse?.data;
        const statusCode = errorResponse?.status;

        // 409：Gist 在读取后被修改或并发更新冲突——不重试
        if (statusCode === 409) {
          throw new Error('Gist 更新冲突：Gist 自上次读取后已被修改，请尝试重新同步。');
        }

        const isRetryable =
          !statusCode || (statusCode >= 500 && statusCode < 600) || statusCode === 429;

        if (isRetryable && attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
          console.warn(
            `[GistSyncService] 批量更新失败（批次 ${batchIndex}，尝试 ${attempt + 1}/${MAX_RETRIES}），${delay}ms 后重试:`,
            lastError.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(`[GistSyncService] 批量更新失败（批次 ${batchIndex}）:`, lastError);
        if (errorData) {
          console.error('Validation errors:', JSON.stringify(errorData, null, 2));
          throw new Error(`Gist 更新失败: ${JSON.stringify(errorData)}`);
        }
        throw lastError;
      }
    }

    throw lastError || new Error('批量更新失败：未知错误');
  }

  /**
   * 将 files 按 BATCH_SIZE 分批 PATCH 到已有 Gist；首批成功后记录 gistId/gistUrl。
   * 返回（可能已更新的）totalItems、gistId、gistUrl。
   */
  private async updateExistingGistWithFiles(
    existingGistId: string,
    files: Record<string, { content: string } | null>,
    preparePhaseItems: number,
    estimatedUploadItems: number,
    totalItemsIn: number,
    onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
  ): Promise<{ totalItems: number; gistId: string | undefined; gistUrl: string | undefined }> {
    if (!this.octokit) throw new Error('Octokit 客户端未初始化');
    let gistId: string | undefined = existingGistId;
    let gistUrl: string | undefined;
    let totalItems = totalItemsIn;

    try {
      const currentGist = await this.octokit.rest.gists.get({ gist_id: existingGistId });
      this.markOrphanedRemoteFilesForDeletion(files, currentGist.data.files || {});

      const allFiles = Object.entries(files);
      const BATCH_SIZE = 10;
      const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);

      // 进度：上传阶段起点基于准备阶段末尾；批次数超过估算时递增 totalItems（只增不减）
      const uploadPhaseStart = preparePhaseItems;
      if (totalBatches > estimatedUploadItems) {
        totalItems = preparePhaseItems + totalBatches;
      }

      onProgress?.({
        current: uploadPhaseStart,
        total: totalItems,
        message: '正在上传文件...',
      });

      for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
        const batchIndex = Math.floor(i / BATCH_SIZE);
        const batchFiles = Object.fromEntries(allFiles.slice(i, i + BATCH_SIZE));

        onProgress?.({
          current: uploadPhaseStart + batchIndex + 1,
          total: totalItems,
          message: `正在上传文件批次 ${batchIndex + 1}/${totalBatches}...`,
        });

        try {
          const response = await this.patchGistBatchWithRetry(existingGistId, batchFiles, batchIndex);
          if (batchIndex === 0) {
            gistId = response.data.id;
            gistUrl = response.data.html_url;
          }
        } catch (batchError) {
          console.error(
            `[GistSyncService] 批次 ${batchIndex + 1}/${totalBatches} 上传失败，` +
              `已完成 ${batchIndex}/${totalBatches} 个批次。Gist 可能处于不一致状态。`,
            batchError,
          );
          throw new Error(
            `Gist 批量上传在第 ${batchIndex + 1}/${totalBatches} 批次失败，` +
              `已有 ${batchIndex} 个批次已提交。建议重新上传以修复不一致状态。` +
              (batchError instanceof Error ? ` 原因: ${batchError.message}` : ''),
          );
        }
      }

      onProgress?.({
        current: totalItems,
        total: totalItems,
        message: '上传完成，正在验证...',
      });
    } catch (error) {
      // 明确的更新失败或冲突：向外抛；其他错误（例如 Gist 不存在）吞掉，让调用方走"创建"路径
      if (
        error instanceof Error &&
        (error.message.includes('Gist 更新失败') || error.message.includes('Gist 更新冲突'))
      ) {
        throw error;
      }
    }

    return { totalItems, gistId, gistUrl };
  }

  /**
   * 创建新 Gist（单次或分批：第一批走 create，后续 batch 走 update），返回新 gistId/gistUrl。
   */
  private async createNewGistFromFiles(
    files: Record<string, { content: string } | null>,
    totalItems: number,
    onProgress: ((progress: { current: number; total: number; message: string }) => void) | undefined,
  ): Promise<{ gistId: string; gistUrl: string | undefined }> {
    if (!this.octokit) throw new Error('Octokit 客户端未初始化');

    const filesForCreate: Record<string, { content: string }> = {};
    for (const [key, value] of Object.entries(files)) {
      if (value !== null) filesForCreate[key] = value;
    }
    const createEntries = Object.entries(filesForCreate);

    if (createEntries.length <= CREATE_BATCH_SIZE) {
      onProgress?.({
        current: totalItems,
        total: totalItems,
        message: '正在创建 Gist...',
      });
      const response = await this.octokit.rest.gists.create({
        description: 'Tsukuyomi - Moonlit Translator - Settings and Novels',
        public: false,
        files: filesForCreate,
      });
      return { gistId: response.data.id!, gistUrl: response.data.html_url ?? undefined };
    }

    const totalCreateBatches = Math.ceil(createEntries.length / CREATE_BATCH_SIZE);
    onProgress?.({
      current: totalItems - totalCreateBatches,
      total: totalItems,
      message: `正在创建 Gist（批次 1/${totalCreateBatches}）...`,
    });

    // 第一批：创建 Gist
    const firstBatchFiles = Object.fromEntries(createEntries.slice(0, CREATE_BATCH_SIZE));
    const response = await this.octokit.rest.gists.create({
      description: 'Tsukuyomi - Moonlit Translator - Settings and Novels',
      public: false,
      files: firstBatchFiles,
    });
    const newGistId = response.data.id!;
    const newGistUrl: string | undefined = response.data.html_url ?? undefined;

    // 后续批次：update
    for (let i = CREATE_BATCH_SIZE; i < createEntries.length; i += CREATE_BATCH_SIZE) {
      const batchIndex = Math.floor(i / CREATE_BATCH_SIZE);
      const batchFiles = Object.fromEntries(createEntries.slice(i, i + CREATE_BATCH_SIZE));
      onProgress?.({
        current: totalItems - totalCreateBatches + batchIndex + 1,
        total: totalItems,
        message: `正在创建 Gist（批次 ${batchIndex + 1}/${totalCreateBatches}）...`,
      });
      try {
        await this.octokit.rest.gists.update({ gist_id: newGistId, files: batchFiles });
      } catch (batchError) {
        console.error(
          `[GistSyncService] 创建批次 ${batchIndex + 1}/${totalCreateBatches} 失败，` +
            `已完成 ${batchIndex}/${totalCreateBatches} 个批次。Gist 可能处于不一致状态。`,
          batchError,
        );
        throw new Error(
          `Gist 批量创建在第 ${batchIndex + 1}/${totalCreateBatches} 批次失败，` +
            `已有 ${batchIndex} 个批次已提交。建议重新上传以修复不一致状态。` +
            (batchError instanceof Error ? ` 原因: ${batchError.message}` : ''),
        );
      }
    }

    onProgress?.({
      current: totalItems,
      total: totalItems,
      message: '创建完成，正在验证...',
    });

    return { gistId: newGistId, gistUrl: newGistUrl };
  }

  /**
   * 从 Gist 下载数据
   * @param config 同步配置
   * @param onProgress 进度回调（可选）
   * @param lastRemoteUpdatedAt 上次同步时远程 Gist 的 updated_at 时间戳（可选），用于远程变更检测
   */
  async downloadFromGist(
    config: SyncConfig,
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
    lastRemoteUpdatedAt?: string,
  ): Promise<SyncResult & { data?: GistSyncData }> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      const params = this.getGistParams(config);
      if (!this.octokit || !params.gistId) {
        throw new Error('Gist ID 未配置或 Octokit 客户端未初始化');
      }

      // 获取 Gist（带重试机制）
      const octokit = this.octokit;
      const gistId = params.gistId;
      const response = await withRetry(
        () => octokit.rest.gists.get({ gist_id: gistId }),
        '下载 Gist',
      );

      // 远程变更检测：比对 Gist 的 updated_at 与本地存储的时间戳
      const remoteUpdatedAt = response.data.updated_at ?? undefined;
      if (lastRemoteUpdatedAt && remoteUpdatedAt && lastRemoteUpdatedAt === remoteUpdatedAt) {
        return {
          success: true,
          skipped: true,
          remoteUpdatedAt,
          message: '远程数据未发生变更，跳过下载',
        };
      }

      const gistFiles = response.data.files;
      if (!gistFiles) {
        throw new Error('Gist 中没有文件');
      }

      const result: GistSyncData = {
        aiModels: [],
        novels: [],
      };

      onProgress?.({ current: 0, total: 1, message: '正在下载数据...' });

      // 1. 读取设置文件（解析失败不影响后续书籍处理）
      await this.downloadAndPopulateSettingsFile(gistFiles, result);

      // 2. 收集所有书籍 ID（包括分块的和未分块的）
      const novelIds = this.collectNovelIdsFromGistFiles(gistFiles);
      const totalNovels = novelIds.size;
      if (onProgress && totalNovels > 0) {
        onProgress({
          current: 0,
          total: totalNovels,
          message: `正在下载 ${totalNovels} 本书籍...`,
        });
      }

      // 3. 每本书独立处理（失败不影响其他书籍）
      let processedNovels = 0;
      const novelIdsArray = Array.from(novelIds);
      for (const novelId of novelIdsArray) {
        if (!novelId) continue;
        try {
          const novel = await this.downloadSingleNovelFromGistFiles(novelId, gistFiles);
          if (novel) result.novels.push(novel);
          processedNovels++;
          onProgress?.({
            current: processedNovels,
            total: totalNovels,
            message: novel
              ? `正在下载书籍: ${novel.title || novelId} (${processedNovels}/${totalNovels})`
              : `跳过书籍 ${novelId} (${processedNovels}/${totalNovels})`,
          });
        } catch {
          processedNovels++;
          onProgress?.({
            current: processedNovels,
            total: totalNovels,
            message: `处理书籍时出错 (${processedNovels}/${totalNovels})`,
          });
        }
      }

      onProgress?.({
        current: totalNovels || 1,
        total: totalNovels || 1,
        message: '下载完成',
      });

      const loadedNovels = result.novels.length;
      let message = '从 Gist 下载数据成功';
      if (totalNovels > loadedNovels) {
        const failedCount = totalNovels - loadedNovels;
        message = `从 Gist 下载数据成功，但有 ${failedCount} 个书籍文件解析失败。如果文件过大，请重新上传以使用分块存储。`;
      }

      return {
        success: true,
        message,
        data: result,
        ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
        ...(params.gistId ? { gistId: params.gistId } : {}),
        ...(response.data.html_url ? { gistUrl: response.data.html_url } : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '从 Gist 下载数据时发生未知错误',
      };
    }
  }

  /**
   * 读取并解析设置文件（含截断回退到 raw_url），写入 result.aiModels/appSettings/coverHistory/memories
   */
  private async downloadAndPopulateSettingsFile(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gistFiles: Record<string, any>,
    result: GistSyncData,
  ): Promise<void> {
    const settingsFile = gistFiles[GIST_FILE_NAMES.SETTINGS];
    if (!settingsFile) return;

    try {
      let settingsContent = settingsFile.content;
      const isSettingsTruncated = settingsFile.truncated === true || !settingsContent;

      if (isSettingsTruncated && settingsFile.raw_url) {
        const rawUrl = settingsFile.raw_url;
        try {
          settingsContent = await withRetry(async () => {
            const rawResponse = await fetch(rawUrl);
            if (!rawResponse.ok) {
              throw new Error(`HTTP ${rawResponse.status}: ${rawResponse.statusText}`);
            }
            return rawResponse.text();
          }, '获取设置文件 raw_url');
        } catch (fetchError) {
          console.warn('[GistSyncService] 从 raw_url 获取设置文件失败（已重试）:', fetchError);
        }
      }

      if (!settingsContent) return;

      const settingsData = (await this.parseGistContent(settingsContent)) as {
        aiModels?: AIModel[];
        appSettings?: AppSettings;
        coverHistory?: CoverHistoryItem[];
        memories?: Memory[];
      };

      if (settingsData.aiModels) {
        result.aiModels = this.deserializeDates(settingsData.aiModels);
      }
      if (settingsData.appSettings) {
        result.appSettings = this.deserializeDates(settingsData.appSettings);
      }
      if (settingsData.coverHistory) {
        result.coverHistory = this.deserializeDates(settingsData.coverHistory);
      }
      if (settingsData.memories) {
        result.memories = this.deserializeDates(settingsData.memories);
      }
    } catch (parseError) {
      console.error(
        '[GistSyncService] 设置文件解析失败，aiModels/appSettings/coverHistory 可能为空:',
        parseError,
      );
    }
  }

  /**
   * 扫描 gist 文件列表，收集所有书籍 ID（分块 / 单文件两种格式）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private collectNovelIdsFromGistFiles(gistFiles: Record<string, any>): Set<string> {
    const novelIds = new Set<string>();
    for (const fileName of Object.keys(gistFiles)) {
      if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
        const novelId = extractNovelIdFromChunkFileName(fileName);
        if (novelId) novelIds.add(novelId);
      } else if (
        fileName.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) &&
        !fileName.endsWith('.meta.json')
      ) {
        const match = fileName.match(/^novel-(.+)\.json$/);
        if (match && match[1]) novelIds.add(match[1]);
      }
    }
    return novelIds;
  }

  /**
   * 从 metadata 文件读取预期块数，失败/缺失时返回默认上限
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readExpectedChunkCount(metadataFile: any): number {
    const MAX_CHUNK_SEARCH_LIMIT = 1000;
    if (!metadataFile?.content) return MAX_CHUNK_SEARCH_LIMIT;
    try {
      const metadata = JSON.parse(metadataFile.content) as { chunks: number; totalSize: number };
      if (metadata.chunks && metadata.chunks > 0) return metadata.chunks;
    } catch {
      // 忽略解析错误
    }
    return MAX_CHUNK_SEARCH_LIMIT;
  }

  /**
   * 依次尝试新 / 旧两种分块命名格式（`_` / `#` / `-`），返回首个命中的 gist file
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lookupChunkFile(gistFiles: Record<string, any>, novelId: string, i: number): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any;
    fileName: string;
  } {
    for (const sep of ['_', '#', '-']) {
      const name = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}${sep}${i}.json`;
      if (gistFiles[name]) return { file: gistFiles[name], fileName: name };
    }
    return { file: undefined, fileName: '' };
  }

  /**
   * 收集单本书的所有 chunk（截断时尝试 raw_url），返回重组后的完整字符串；
   * 出现任何截断且无法恢复则返回 null
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async collectChunkContents(
    gistFiles: Record<string, any>,
    novelId: string,
    expectedChunks: number,
  ): Promise<string | null> {
    const chunkFiles: Array<{ index: number; content: string }> = [];
    let anyTruncated = false;

    for (let i = 0; i < expectedChunks; i++) {
      const { file: chunkFile } = this.lookupChunkFile(gistFiles, novelId, i);
      if (!chunkFile) break; // 没有更多分块文件

      const isChunkTruncated = chunkFile.truncated === true || !chunkFile.content;
      let chunkContent: string | undefined = chunkFile.content;

      if (isChunkTruncated && chunkFile.raw_url) {
        try {
          const rawResponse = await fetch(chunkFile.raw_url);
          if (rawResponse.ok) chunkContent = await rawResponse.text();
          else anyTruncated = true;
        } catch {
          anyTruncated = true;
        }
      }

      if (chunkContent) {
        chunkFiles.push({ index: i, content: chunkContent });
      } else {
        anyTruncated = true;
      }
    }

    if (anyTruncated || chunkFiles.length === 0) return null;
    chunkFiles.sort((a, b) => a.index - b.index);
    return chunkFiles.map((c) => c.content).join('');
  }

  /**
   * 尝试从单文件（非分块）下载并解析单本书。未命中或解析失败返回 null。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async parseSingleNovelFile(
    gistFiles: Record<string, any>,
    novelId: string,
  ): Promise<Novel | null> {
    const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.json`;
    if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) return null; // 命名异常
    const file = gistFiles[fileName];
    if (!file) return null;

    let fileContent = file.content;
    const isTruncated = file.truncated === true || !fileContent;
    if (isTruncated && file.raw_url) {
      try {
        const rawResponse = await fetch(file.raw_url);
        if (!rawResponse.ok) return null;
        fileContent = await rawResponse.text();
      } catch {
        return null;
      }
    }

    if (!fileContent) return null;

    try {
      const parsedContent = await this.parseGistContent(fileContent);
      return this.deserializeDates(parsedContent) as Novel;
    } catch {
      return null;
    }
  }

  /**
   * 处理单本书：优先尝试分块重组，失败回退到单文件，两者都失败返回 null
   */
  private async downloadSingleNovelFromGistFiles(
    novelId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gistFiles: Record<string, any>,
  ): Promise<Novel | null> {
    const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.meta.json`;
    const metadataFile = gistFiles[metadataFileName];
    const expectedChunks = this.readExpectedChunkCount(metadataFile);

    const fullChunkContent = await this.collectChunkContents(gistFiles, novelId, expectedChunks);
    if (fullChunkContent !== null) {
      try {
        const parsedContent = await this.parseGistContent(fullChunkContent);
        return this.deserializeDates(parsedContent) as Novel;
      } catch {
        // 分块解析失败，尝试单文件回退
      }
    }

    return this.parseSingleNovelFile(gistFiles, novelId);
  }

  /**
   * 验证 GitHub token 是否有效
   */
  async validateToken(config: SyncConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

      // 尝试获取当前用户信息来验证 token
      await this.octokit.rest.users.getAuthenticated();

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Token 验证失败',
      };
    }
  }

  /**
   * 单文件的"是否被修改"判定：先比大小，再看截断标志，最后比内容。
   * - 大小不同 → 修改
   * - 任一截断且大小相同 → 视为未变（由上层在有 change_status 时补判）
   * - 内容不同 → 修改
   */
  private isRevisionFileModified(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentFile: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previousFile: any,
  ): boolean {
    if (!currentFile || !previousFile) return false;

    const currentSize = currentFile.size || 0;
    const previousSize = previousFile.size || 0;
    if (currentSize !== previousSize) return true;

    // 任一文件被截断：无法准确比较，暂判未变（上层在 change_status 指示有变更时会补判）
    if (currentFile.truncated === true || previousFile.truncated === true) return false;

    const currentContent = currentFile.content || '';
    const previousContent = previousFile.content || '';
    return currentContent !== previousContent;
  }

  /**
   * 补判截断文件：当 change_status 表明有变更但主判定没捕捉到任何文件时，
   * 遍历两版本共有文件，把截断的或内容不同的都视为已修改。
   */
  private collectTruncatedSuspectedModifiedFiles(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commit: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentFilesMap: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previousFilesMap: Record<string, any>,
    addedCount: number,
    removedCount: number,
    currentModifiedFiles: string[],
  ): string[] {
    const hasChanges =
      commit.change_status &&
      ((commit.change_status.additions ?? 0) > 0 ||
        (commit.change_status.deletions ?? 0) > 0);
    if (
      !hasChanges ||
      addedCount > 0 ||
      removedCount > 0 ||
      currentModifiedFiles.length > 0
    ) {
      return [];
    }

    const currentFiles = Object.keys(currentFilesMap);
    const previousFiles = Object.keys(previousFilesMap);
    const allCommonFiles = currentFiles.filter((f) => previousFiles.includes(f));
    const extras: string[] = [];
    for (const filename of allCommonFiles) {
      if (currentModifiedFiles.includes(filename)) continue;
      const currentFile = currentFilesMap[filename];
      const previousFile = previousFilesMap[filename];
      if (!currentFile || !previousFile) continue;

      const currentTruncated = currentFile.truncated === true;
      const previousTruncated = previousFile.truncated === true;
      if (currentTruncated || previousTruncated) {
        extras.push(filename);
        continue;
      }

      const currentContent = currentFile.content || '';
      const previousContent = previousFile.content || '';
      if (currentContent !== previousContent) extras.push(filename);
    }
    return extras;
  }

  /**
   * 对比两版本的 files map，返回 added/removed/modified 三分组的文件变更条目
   */
  private diffRevisionFiles(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commit: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentFilesMap: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previousFilesMap: Record<string, any>,
  ): Array<{
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed';
    additions?: number;
    deletions?: number;
    changes?: number;
  }> {
    const currentFiles = Object.keys(currentFilesMap);
    const previousFiles = Object.keys(previousFilesMap);

    const addedFiles = currentFiles.filter((f) => !previousFiles.includes(f));
    const removedFiles = previousFiles.filter((f) => !currentFiles.includes(f));
    const modifiedFiles = currentFiles.filter((f) => {
      if (!previousFiles.includes(f)) return false;
      return this.isRevisionFileModified(currentFilesMap[f], previousFilesMap[f]);
    });

    const extraModified = this.collectTruncatedSuspectedModifiedFiles(
      commit,
      currentFilesMap,
      previousFilesMap,
      addedFiles.length,
      removedFiles.length,
      modifiedFiles,
    );
    modifiedFiles.push(...extraModified);

    return [
      ...addedFiles.map((filename) => ({
        filename,
        status: 'added' as const,
        size: currentFilesMap[filename]?.size,
      })),
      ...removedFiles.map((filename) => ({
        filename,
        status: 'removed' as const,
        size: previousFilesMap[filename]?.size,
      })),
      ...modifiedFiles.map((filename) => ({
        filename,
        status: 'modified' as const,
        size: currentFilesMap[filename]?.size,
      })),
    ];
  }

  /**
   * 为单次 commit 构造其文件变更列表：
   * - 第一次 commit：所有文件视为 added
   * - 有前一版本：diff 对比
   * - 无法获取前一版本：退化为把当前文件标记为 modified
   * - 无法获取当前版本：返回空列表
   */
  private async buildRevisionFileChangeList(
    gistId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commit: any,
    commitIndex: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allCommits: any[],
  ): Promise<
    Array<{
      filename: string;
      status: 'added' | 'removed' | 'modified' | 'renamed';
      additions?: number;
      deletions?: number;
      changes?: number;
    }>
  > {
    try {
      const revisionResponse = await this.octokit!.rest.gists.getRevision({
        gist_id: gistId,
        sha: commit.version,
      });
      const currentFilesMap = revisionResponse.data.files || {};

      if (commitIndex === 0) {
        return Object.keys(currentFilesMap).map((filename) => ({
          filename,
          status: 'added' as const,
          size: currentFilesMap[filename]?.size,
        }));
      }

      const previousCommit = allCommits[commitIndex - 1];
      if (!previousCommit) {
        return Object.keys(currentFilesMap).map((filename) => ({
          filename,
          status: 'modified' as const,
          size: currentFilesMap[filename]?.size,
        }));
      }

      try {
        const previousRevisionResponse = await this.octokit!.rest.gists.getRevision({
          gist_id: gistId,
          sha: previousCommit.version,
        });
        return this.diffRevisionFiles(
          commit,
          currentFilesMap,
          previousRevisionResponse.data.files || {},
        );
      } catch {
        return Object.keys(currentFilesMap).map((filename) => ({
          filename,
          status: 'modified' as const,
          size: currentFilesMap[filename]?.size,
        }));
      }
    } catch {
      return [];
    }
  }

  /**
   * 获取 Gist 修订历史
   */
  async getGistRevisions(config: SyncConfig): Promise<
    SyncResult & {
      revisions?: Array<{
        version: string;
        committedAt: string;
        changeStatus: {
          total: number;
          additions: number;
          deletions: number;
        };
        files?: Array<{
          filename: string;
          status: 'added' | 'removed' | 'modified' | 'renamed';
          additions?: number;
          deletions?: number;
          changes?: number;
        }>;
      }>;
    }
  > {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

      const params = this.getGistParams(config);
      if (!params.gistId) {
        throw new Error('Gist ID 未配置');
      }

      // 获取 Gist 修订历史
      const response = await this.octokit.rest.gists.listCommits({
        gist_id: params.gistId,
      });

      const revisions = await Promise.all(
        response.data.map(async (commit, commitIndex) => {
          const files = await this.buildRevisionFileChangeList(
            params.gistId!,
            commit,
            commitIndex,
            response.data,
          );

          return {
            version: commit.version,
            committedAt: commit.committed_at,
            changeStatus: {
              total: commit.change_status?.total ?? 0,
              additions: commit.change_status?.additions ?? 0,
              deletions: commit.change_status?.deletions ?? 0,
            },
            files,
          };
        }),
      );

      return {
        success: true,
        message: `获取到 ${revisions.length} 个修订版本`,
        revisions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取 Gist 修订历史时发生未知错误',
      };
    }
  }

  /**
   * 获取单个修订版本的详细信息（仅文件列表）
   */
  async getGistRevision(
    config: SyncConfig,
    version: string,
  ): Promise<
    SyncResult & {
      data?: {
        files: Record<
          string,
          { filename?: string; size?: number; content?: string; truncated?: boolean }
        >;
      };
    }
  > {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      const params = this.getGistParams(config);
      if (!this.octokit || !params.gistId) {
        throw new Error('Gist ID 未配置或 Octokit 客户端未初始化');
      }

      // 获取特定版本的 Gist
      const response = await this.octokit.rest.gists.getRevision({
        gist_id: params.gistId,
        sha: version,
      });

      // 过滤掉 null 值并转换类型
      const files: Record<
        string,
        { filename?: string; size?: number; content?: string; truncated?: boolean }
      > = {};
      if (response.data.files) {
        for (const [key, value] of Object.entries(response.data.files)) {
          if (value) {
            const fileInfo: {
              filename?: string;
              size?: number;
              content?: string;
              truncated?: boolean;
            } = {};
            if (value.filename !== undefined) fileInfo.filename = value.filename;
            if (value.size !== undefined) fileInfo.size = value.size;
            if (value.content !== undefined) fileInfo.content = value.content;
            if (value.truncated !== undefined) fileInfo.truncated = value.truncated;
            files[key] = fileInfo;
          }
        }
      }

      return {
        success: true,
        message: '获取修订版本详情成功',
        data: {
          files,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取修订版本详情失败',
      };
    }
  }

  /**
   * 从特定修订版本下载数据
   */
  async downloadFromGistRevision(
    config: SyncConfig,
    version: string,
  ): Promise<SyncResult & { data?: GistSyncData }> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      const params = this.getGistParams(config);
      if (!this.octokit || !params.gistId) {
        throw new Error('Gist ID 未配置或 Octokit 客户端未初始化');
      }

      // 获取特定版本的 Gist
      const response = await this.octokit.rest.gists.getRevision({
        gist_id: params.gistId,
        sha: version,
      });

      const gistFiles = response.data.files;
      if (!gistFiles) {
        throw new Error('Gist 中没有文件');
      }

      const result: GistSyncData = {
        aiModels: [],
        novels: [],
      };

      // 读取设置文件（复用 downloadFromGist 的 helper）
      await this.downloadAndPopulateSettingsFile(gistFiles, result);

      // 收集书籍 ID 后逐本重组（复用 downloadFromGist 的 helper）
      const novelIds = this.collectNovelIdsFromGistFiles(gistFiles);
      for (const novelId of novelIds) {
        try {
          const novel = await this.downloadSingleNovelFromGistFiles(novelId, gistFiles);
          if (novel) result.novels.push(novel);
        } catch {
          // 继续处理其他书籍
        }
      }

      return {
        success: true,
        message: '从修订版本下载数据成功',
        data: result,
        ...(params.gistId ? { gistId: params.gistId } : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '从修订版本下载数据时发生未知错误',
      };
    }
  }

  /**
   * 增量下载：基于 manifest 的选择性拉取
   *
   * 流程：
   * 1. 条件 GET（If-None-Match）检查远端是否有变更
   * 2. 若 304：直接返回 skipped
   * 3. 若 200 且远端无 manifest.json：返回 needsMigration 标志
   * 4. 若 200 且 schemaVersion 超过本客户端：返回 schemaVersionTooNew 标志
   * 5. 否则：基于 manifest diff 仅拉取变化的条目
   */
  async downloadFromGistWithManifest(
    config: SyncConfig,
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
  ): Promise<IncrementalDownloadResult> {
    this.validateConfig(config);
    return downloadWithManifest(config, onProgress);
  }

  /**
   * 增量上传：基于本地 manifest 与 knownRemoteHashes 的 diff，仅上传变化的条目
   *
   * 注意：调用方应该在调用前完成伪 CAS 检查（conditionalGetGist），
   * 本方法不做额外的并发检测，仅负责序列化和 PATCH。
   */
  async uploadToGistIncremental(
    config: SyncConfig,
    payload: UploadPayload,
    remoteFilesSnapshot: Record<string, { content?: string | null; truncated?: boolean | null; raw_url?: string | null; size?: number | null }>,
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
  ): Promise<IncrementalUploadResult> {
    this.validateConfig(config);
    this.initializeOctokit(config);
    if (!this.octokit) {
      throw new Error('Octokit 客户端未初始化');
    }
    return uploadIncremental(this.octokit, config, payload, remoteFilesSnapshot, onProgress);
  }

  /**
   * 伪 CAS 预检：上传前检查远端是否自上次已知状态以来发生变更
   * @returns 'unchanged' 表示安全可写；'changed' 表示需要重新合并
   */
  async verifyRemoteUnchanged(
    config: SyncConfig,
  ): Promise<
    | { status: 'unchanged'; etag: string }
    | { status: 'changed'; etag: string; files: Record<string, unknown> }
  > {
    this.validateConfig(config);
    const gistId = config.syncParams.gistId;
    if (!gistId) {
      throw new Error('Gist ID 未配置');
    }
    const token = config.secret || config.syncParams.token || '';
    const result = await conditionalGetGist(token, gistId, config.lastRemoteETag);
    if (result.notModified) {
      return { status: 'unchanged', etag: result.etag };
    }
    return { status: 'changed', etag: result.etag, files: result.files };
  }

  /**
   * 将 manifest 中的条目哈希提取为平面字典，供 SyncConfig 持久化。
   */
  static manifestToKnownHashes = remoteManifestToHashes;

  /**
   * manifest 文件的固定名称（导出以便外部一致使用）
   */
  static readonly MANIFEST_FILE_NAME = MANIFEST_FILE_NAME;

  /**
   * 删除 Gist
   */
  async deleteGist(config: SyncConfig): Promise<SyncResult> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

      const params = this.getGistParams(config);
      if (!params.gistId) {
        throw new Error('Gist ID 未配置');
      }

      // 删除 Gist
      await this.octokit.rest.gists.delete({
        gist_id: params.gistId,
      });

      return {
        success: true,
        message: 'Gist 已成功删除',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除 Gist 时发生未知错误',
      };
    }
  }
}
