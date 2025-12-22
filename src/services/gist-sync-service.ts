import { Octokit } from '@octokit/rest';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel } from 'src/models/novel';
import type { AppSettings } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import type { CoverHistoryItem } from 'src/models/novel';
import { compressString, decompressString } from 'src/utils/compression';
import { ChapterContentService } from 'src/services/chapter-content-service';

/**
 * Gist 文件名称常量
 */
const GIST_FILE_NAMES = {
  SETTINGS: 'luna-ai-settings.json',
  NOVEL_PREFIX: 'novel-',
  NOVEL_CHUNK_PREFIX: 'novel-chunk-',
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
}

/**
 * 从 Gist 下载的数据接口
 */
export interface GistSyncData {
  aiModels: AIModel[];
  appSettings?: AppSettings;
  novels: Novel[];
  coverHistory?: CoverHistoryItem[];
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
   * 将序列化的日期字符串转换回 Date 对象
   */
  private deserializeDates<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      return new Date(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deserializeDates(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const deserialized = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (deserialized as Record<string, unknown>)[key] = this.deserializeDates(value);
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
  ): Promise<void> {
    if (!this.octokit) {
      throw new Error('Octokit 客户端未初始化，无法验证上传');
    }

    const response = await this.octokit.rest.gists.get({
      gist_id: gistId,
    });

    const uploadedFiles = response.data.files;
    if (!uploadedFiles) {
      throw new Error('无法获取上传的文件信息');
    }

    const errors: string[] = [];

    // 检查每个期望的文件
    for (const [fileName, expectedFile] of Object.entries(expectedFiles)) {
      const uploadedFile = uploadedFiles[fileName];

      if (!uploadedFile) {
        errors.push(`文件缺失: ${fileName}`);
        continue;
      }

      const expectedSize = new Blob([expectedFile.content]).size;
      const uploadedSize = uploadedFile.size || 0;

      // 检查文件大小是否匹配
      const sizeDiff = Math.abs(uploadedSize - expectedSize);
      const sizeDiffPercent = expectedSize > 0 ? (sizeDiff / expectedSize) * 100 : 0;

      if (sizeDiffPercent > 5) {
        errors.push(
          `文件大小不匹配: ${fileName} (期望: ${(expectedSize / 1024).toFixed(2)} KB, 实际: ${(uploadedSize / 1024).toFixed(2)} KB, 差异: ${sizeDiffPercent.toFixed(2)}%)`,
        );
      }
    }

    // 验证每本书的分块完整性
    for (const stat of uploadStats) {
      if (stat.chunked && stat.chunkCount) {
        for (let i = 0; i < stat.chunkCount; i++) {
          // 使用 _ 作为分隔符
          const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${stat.novelId}_${i}.json`;
          const chunkFile = uploadedFiles[chunkFileName];

          if (!chunkFile) {
            errors.push(`书籍 "${stat.title}" 的分块 ${i} 缺失: ${chunkFileName}`);
          }
        }

        // 验证元数据文件
        const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${stat.novelId}.meta.json`;
        const metadataFile = uploadedFiles[metadataFileName];

        if (!metadataFile) {
          errors.push(`书籍 "${stat.title}" 的元数据文件缺失: ${metadataFileName}`);
        } else if (metadataFile.content) {
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
    }

    if (errors.length > 0) {
      throw new Error(`文件验证失败:\n${errors.join('\n')}`);
    }
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
    },
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
  ): Promise<SyncResult> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

      // 在同步前加载所有章节内容
      const novelsWithContent = await ChapterContentService.loadAllChapterContentsForNovels(
        data.novels,
      );

      // 准备文件内容
      // 注意：要删除文件，GitHub API 要求使用 null 值
      // 类型定义：Record<string, { content: string } | null>
      const files: Record<string, { content: string } | null> = {};

      // 1. 设置文件（包含 aiModels 和 appSettings）
      const settingsData = {
        aiModels: this.serializeDates(data.aiModels),
        appSettings: this.serializeDates(data.appSettings),
        coverHistory: data.coverHistory ? this.serializeDates(data.coverHistory) : undefined,
      };

      const settingsJson = JSON.stringify(settingsData);
      // 尝试压缩设置文件
      let settingsContent = settingsJson;
      try {
        const compressed = await compressString(settingsJson);
        settingsContent = JSON.stringify({
          format: 'gzip',
          data: compressed,
        });
      } catch (e) {
        console.warn('压缩设置文件失败，将使用未压缩格式', e);
      }

      files[GIST_FILE_NAMES.SETTINGS] = {
        content: settingsContent,
      };

      // 2. 为每本书创建单独的 JSON 文件
      // 如果文件过大，则分割成多个块
      const uploadStats: Array<{
        novelId: string;
        title: string;
        size: number;
        chunked: boolean;
        chunkCount?: number;
      }> = [];

      // 记录每本书的存储格式（分块或单文件），以便清理旧格式文件
      const novelFormats = new Map<string, 'chunked' | 'single'>();

      // 计算总数：准备阶段（设置文件 + 每本书）+ 上传批次
      // 先计算上传批次数量（稍后更新）
      let totalBatches = 0;
      const totalItems = 1 + novelsWithContent.length; // 1 个设置文件 + N 本书
      let processedItems = 0;

      // 更新进度：开始处理设置文件
      if (onProgress) {
        onProgress({
          current: processedItems,
          total: totalItems,
          message: '正在准备设置文件...',
        });
      }

      // 设置文件准备完成，递增进度
      processedItems = 1;

      for (let novelIndex = 0; novelIndex < novelsWithContent.length; novelIndex++) {
        const novel = novelsWithContent[novelIndex];
        if (!novel) {
          // 跳过 null 值时也要更新进度，确保进度跟踪准确
          processedItems = novelIndex + 2; // 1 (设置文件) + novelIndex + 1 (当前书籍)
          if (onProgress) {
            onProgress({
              current: processedItems,
              total: totalItems,
              message: `跳过无效书籍 (${processedItems}/${totalItems})`,
            });
          }
          continue;
        }
        const serializedNovel = this.serializeDates(novel);
        // 使用压缩格式（去除空格和换行）以减少文件大小
        const jsonContent = JSON.stringify(serializedNovel);

        // 尝试压缩书籍数据
        let finalContent = jsonContent;
        try {
          const compressed = await compressString(jsonContent);
          finalContent = JSON.stringify({
            format: 'gzip',
            data: compressed,
          });
        } catch (e) {
          console.warn(`压缩书籍 ${novel.title} 失败，将使用未压缩格式`, e);
        }

        const contentSize = new Blob([finalContent]).size;

        if (contentSize <= MAX_FILE_SIZE) {
          // 文件足够小，直接存储
          novelFormats.set(novel.id, 'single');
          const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novel.id}.json`;
          files[fileName] = {
            content: finalContent,
          };
          uploadStats.push({
            novelId: novel.id,
            title: novel.title,
            size: contentSize,
            chunked: false,
          });
        } else {
          // 文件过大，分割成多个块
          novelFormats.set(novel.id, 'chunked');
          // 按字节安全分割（确保不在多字节字符中间切断）
          // 使用二分查找来高效确定分块大小
          const encoder = new TextEncoder();
          const chunks: string[] = [];
          let position = 0;

          while (position < finalContent.length) {
            const remaining = finalContent.length - position;

            // 使用二分查找找到最大的字符数，使得字节数不超过 CHUNK_SIZE
            let left = 1;
            let right = Math.min(remaining, CHUNK_SIZE); // 最坏情况：每字符1字节
            let bestLength = 1;

            while (left <= right) {
              const mid = Math.floor((left + right) / 2);
              const candidate = finalContent.substring(position, position + mid);
              const candidateBytes = encoder.encode(candidate).length;

              if (candidateBytes <= CHUNK_SIZE) {
                bestLength = mid;
                left = mid + 1;
              } else {
                right = mid - 1;
              }
            }

            const chunk = finalContent.substring(position, position + bestLength);
            chunks.push(chunk);
            position += bestLength;
          }

          // 存储每个块
          // 使用 _ 作为分隔符，避免与 UUID 中的连字符冲突，也避免 # 可能引起的 URL 编码问题
          chunks.forEach((chunk, index) => {
            const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novel.id}_${index}.json`;
            files[chunkFileName] = {
              content: chunk,
            };
          });

          // 存储块元数据（块数量和总大小）
          const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novel.id}.meta.json`;
          const metadata = { chunks: chunks.length, totalSize: contentSize };
          files[metadataFileName] = {
            content: JSON.stringify(metadata),
          };

          uploadStats.push({
            novelId: novel.id,
            title: novel.title,
            size: contentSize,
            chunked: true,
            chunkCount: chunks.length,
          });
        }

        // 更新进度：处理完一本书（设置文件已完成，所以是 1 + novelIndex + 1）
        processedItems = novelIndex + 2; // 1 (设置文件) + novelIndex + 1 (当前书籍)
        if (onProgress) {
          onProgress({
            current: processedItems,
            total: totalItems,
            message: `正在准备书籍: ${novel.title} (${processedItems}/${totalItems})`,
          });
        }
      }

      const params = this.getGistParams(config);
      let gistId = params.gistId;
      let gistUrl: string | undefined;
      let isRecreated = false;

      if (gistId) {
        // 获取当前 Gist 的所有文件，以找出需要删除的文件
        try {
          const currentGist = await this.octokit.rest.gists.get({
            gist_id: gistId,
          });

          const currentFiles = currentGist.data.files || {};
          const localNovelIds = new Set(novelsWithContent.map((n) => n.id));

          // 创建一个集合，包含所有本地已经添加到 files 中的文件名（排除 null 值）
          const localFileNames = new Set<string>();
          for (const [filename, file] of Object.entries(files)) {
            if (file !== null) {
              localFileNames.add(filename);
            }
          }

          // 找出需要删除的文件（远程存在但本地已删除，或者格式已改变，或者分块数量减少）
          // 简单的逻辑：如果文件在 currentFiles 中存在，但在 files（即将上传的文件列表）中不存在，
          // 且该文件看起来像是我们生成的（以特定的前缀开头），则将其删除。
          const filesToDelete: string[] = [];
          for (const [filename, file] of Object.entries(currentFiles)) {
            if (!file) {
              continue;
            }

            // 检查文件是否在即将上传的列表中
            if (localFileNames.has(filename)) {
              continue;
            }

            // 检查文件名是否符合我们的命名规范
            const isLunaFile =
              filename === GIST_FILE_NAMES.SETTINGS ||
              filename.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) ||
              filename.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX);

            if (isLunaFile) {
              // 如果是我们的文件，且不在上传列表中，说明应该删除
              // 这涵盖了：
              // 1. 书籍被删除
              // 2. 书籍格式改变（单文件 <-> 分块）
              // 3. 分块数量减少（例如以前有 10 个块，现在只有 8 个，第 8、9 个块会被删除）
              // 4. 文件重命名（例如分隔符从 # 变为 _，旧文件会被删除）
              files[filename] = null; // 删除文件
              filesToDelete.push(filename);
            }
          }

          // 确保所有要删除的文件都被明确设置为 null
          // GitHub API 要求使用 { content: null } 格式来删除文件
          for (const filename of filesToDelete) {
            if (files[filename] !== null) {
              files[filename] = null;
            }
          }

          // 批量更新 Gist，避免 payload 过大导致 422 错误
          // 将文件分为多个批次，每个批次包含一部分更新和删除
          const allFiles = Object.entries(files);
          const BATCH_SIZE = 10; // 每个请求最多处理 10 个文件
          const MAX_RETRIES = 3; // 最大重试次数
          const RETRY_DELAY_BASE = 1000; // 基础重试延迟（毫秒）

          // 辅助函数：执行带重试的批量更新
          const updateBatchWithRetry = async (
            batchFiles: Record<string, { content: string } | null>,
            batchIndex: number,
          ): Promise<void> => {
            let lastError: Error | null = null;

            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
              try {
                if (!gistId) throw new Error('Gist ID is undefined during batch update');
                if (!this.octokit) throw new Error('Octokit 客户端未初始化');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response: any = await this.octokit.rest.gists.update({
                  gist_id: gistId,
                  description: 'Luna AI Translator - Settings and Novels',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  files: batchFiles as any,
                });
                // 更新 gistId 和 gistUrl（虽然通常不会变）
                if (batchIndex === 0) {
                  gistId = response.data.id;
                  gistUrl = response.data.html_url;
                }
                return; // 成功，退出重试循环
              } catch (batchError) {
                lastError =
                  batchError instanceof Error ? batchError : new Error(String(batchError));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const errorResponse = (batchError as any).response;
                const errorData = errorResponse?.data;
                const statusCode = errorResponse?.status;

                // 409 Conflict: 通常意味着 Gist 在我们读取后被修改了，或者并发更新冲突
                // 不重试，直接抛出错误
                if (statusCode === 409) {
                  throw new Error('Gist 更新冲突：Gist 自上次读取后已被修改，请尝试重新同步。');
                }

                // 对于网络错误和 5xx 错误，可以重试
                const isRetryable =
                  !statusCode || // 网络错误（没有状态码）
                  (statusCode >= 500 && statusCode < 600) || // 5xx 服务器错误
                  statusCode === 429; // 429 Too Many Requests

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                  // 计算重试延迟（指数退避）
                  const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
                  console.warn(
                    `[GistSyncService] 批量更新失败（批次 ${batchIndex}，尝试 ${attempt + 1}/${MAX_RETRIES}），${delay}ms 后重试:`,
                    lastError.message,
                  );
                  await new Promise((resolve) => setTimeout(resolve, delay));
                  continue; // 重试
                }

                // 不可重试的错误或已达到最大重试次数
                console.error(`[GistSyncService] 批量更新失败（批次 ${batchIndex}）:`, lastError);
                if (errorData) {
                  console.error('Validation errors:', JSON.stringify(errorData, null, 2));
                  throw new Error(`Gist 更新失败: ${JSON.stringify(errorData)}`);
                }
                throw lastError;
              }
            }

            // 如果所有重试都失败了，抛出最后一个错误
            throw lastError || new Error('批量更新失败：未知错误');
          };

          // 优先处理删除操作，以释放配额（如果有配额限制的话）
          // 但为了原子性，混合处理可能更好，这里简单按顺序分批
          totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);
          const finalTotal = totalItems + totalBatches; // 准备阶段 + 上传批次

          // 更新进度：开始上传
          // 确保当前进度反映准备阶段已完成（使用 totalItems 而不是 processedItems）
          if (onProgress) {
            onProgress({
              current: totalItems,
              total: finalTotal,
              message: '正在上传文件...',
            });
          }

          for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batchIndex = Math.floor(i / BATCH_SIZE);
            const batchFiles = Object.fromEntries(allFiles.slice(i, i + BATCH_SIZE));

            // 更新进度：上传批次
            if (onProgress) {
              onProgress({
                current: totalItems + batchIndex + 1,
                total: finalTotal,
                message: `正在上传文件批次 ${batchIndex + 1}/${totalBatches}...`,
              });
            }

            await updateBatchWithRetry(batchFiles, batchIndex);
          }

          // 更新进度：上传完成
          if (onProgress) {
            onProgress({
              current: finalTotal,
              total: finalTotal,
              message: '上传完成，正在验证...',
            });
          }
        } catch (error) {
          // 如果是更新失败，我们希望中断并报错
          if (
            error instanceof Error &&
            (error.message.includes('Gist 更新失败') || error.message.includes('Gist 更新冲突'))
          ) {
            throw error;
          }
          // 如果获取失败（例如 Gist 不存在），继续使用原始 files (尝试创建新 Gist)
          // 注意：如果是 batch update 失败，也会进入这里，但会被上面的 if 重新抛出
        }

        // 如果已经有了 gistUrl，说明 batch update 成功了（或者部分成功），不需要再创建
        if (!gistUrl) {
          // 尝试创建新 Gist
          // ... (这里实际上是把 files 用于 create)
          // 但是 create 不能使用 null 值，需要过滤掉
          const filesForCreate: Record<string, { content: string }> = {};
          for (const [key, value] of Object.entries(files)) {
            if (value !== null) {
              filesForCreate[key] = value;
            }
          }

          const response = await this.octokit.rest.gists.create({
            description: 'Luna AI Translator - Settings and Novels',
            public: false,
            files: filesForCreate,
          });
          gistId = response.data.id;
          gistUrl = response.data.html_url;
          isRecreated = true;
        }
      } else {
        // 创建新 Gist
        // 更新进度：开始创建（准备阶段已完成，使用 totalItems）
        if (onProgress) {
          onProgress({
            current: totalItems,
            total: totalItems,
            message: '正在创建 Gist...',
          });
        }

        const filesForCreate: Record<string, { content: string }> = {};
        for (const [key, value] of Object.entries(files)) {
          if (value !== null) {
            filesForCreate[key] = value;
          }
        }
        const response = await this.octokit.rest.gists.create({
          description: 'Luna AI Translator - Settings and Novels',
          public: false,
          files: filesForCreate,
        });
        gistId = response.data.id;
        gistUrl = response.data.html_url;

        // 更新进度：创建完成
        if (onProgress) {
          onProgress({
            current: totalItems,
            total: totalItems,
            message: '创建完成，正在验证...',
          });
        }
      }

      // 验证上传的文件（必须在返回成功之前验证）
      // 只验证实际要上传的文件（排除 null 值，即要删除的文件）
      if (gistId) {
        const filesToVerify: Record<string, { content: string }> = {};
        for (const [filename, file] of Object.entries(files)) {
          if (file !== null) {
            filesToVerify[filename] = file;
          }
        }
        await this.verifyUploadedFiles(gistId, filesToVerify, uploadStats);
      }

      const message = gistId ? '数据已成功同步到 Gist' : 'Gist 已创建';

      return {
        success: true,
        message,
        ...(gistId ? { gistId } : {}),
        ...(gistUrl ? { gistUrl } : {}),
        ...(isRecreated ? { isRecreated: true } : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '同步到 Gist 时发生未知错误',
      };
    }
  }

  /**
   * 从 Gist 下载数据
   * @param config 同步配置
   * @param onProgress 进度回调（可选）
   */
  async downloadFromGist(
    config: SyncConfig,
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
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

      const gistFiles = response.data.files;
      if (!gistFiles) {
        throw new Error('Gist 中没有文件');
      }

      const result: GistSyncData = {
        aiModels: [],
        novels: [],
      };

      // 更新进度：开始下载
      if (onProgress) {
        onProgress({
          current: 0,
          total: 1,
          message: '正在下载数据...',
        });
      }

      // 1. 读取设置文件
      const settingsFile = gistFiles[GIST_FILE_NAMES.SETTINGS];
      if (settingsFile && settingsFile.content) {
        try {
          const settingsData = (await this.parseGistContent(settingsFile.content)) as {
            aiModels?: AIModel[];
            appSettings?: AppSettings;
            coverHistory?: CoverHistoryItem[];
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
        } catch {
          // 忽略设置文件解析错误，继续处理书籍
        }
      }

      // 2. 读取所有书籍文件
      // 首先收集所有书籍 ID（包括分块的和未分块的）
      const novelIds = new Set<string>();

      for (const fileName of Object.keys(gistFiles)) {
        if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
          const novelId = extractNovelIdFromChunkFileName(fileName);
          if (novelId) {
            novelIds.add(novelId);
          }
        } else if (
          fileName.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) &&
          !fileName.endsWith('.meta.json')
        ) {
          // 处理普通书籍文件（非分块、非 metadata）
          // 提取书籍 ID（从 "novel-{id}.json" 格式）
          const match = fileName.match(/^novel-(.+)\.json$/);
          if (match && match[1]) {
            novelIds.add(match[1]);
          }
        }
      }

      // 更新进度：开始处理书籍
      const totalNovels = novelIds.size;
      if (onProgress && totalNovels > 0) {
        onProgress({
          current: 0,
          total: totalNovels,
          message: `正在下载 ${totalNovels} 本书籍...`,
        });
      }

      // 处理每本书
      let processedNovels = 0;
      const novelIdsArray = Array.from(novelIds);
      for (let novelIndex = 0; novelIndex < novelIdsArray.length; novelIndex++) {
        const novelId = novelIdsArray[novelIndex];
        try {
          const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.meta.json`;
          const metadataFile = gistFiles[metadataFileName];
          const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.json`;

          // 首先检查是否有分块文件（优先使用分块文件）
          const chunkFiles: Array<{
            index: number;
            content: string;
            fileName: string;
            size: number;
          }> = [];
          const truncatedChunkFiles: Array<{
            index: number;
            fileName: string;
            size: number;
            contentLength: number;
          }> = [];

          for (let i = 0; i < 100; i++) {
            // 优先尝试最新格式（使用 _ 分隔符）
            let chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}_${i}.json`;
            let chunkFile = gistFiles[chunkFileName];

            // 尝试旧格式（使用 # 分隔符）
            if (!chunkFile) {
              chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}#${i}.json`;
              chunkFile = gistFiles[chunkFileName];
            }

            // 向后兼容：如果新格式不存在，尝试旧格式
            if (!chunkFile) {
              chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}-${i}.json`;
              chunkFile = gistFiles[chunkFileName];
            }
            if (chunkFile) {
              // 检查分块文件是否被截断（GitHub API 对大文件返回 truncated=true）
              const chunkSize = chunkFile.size || 0;
              const chunkContentLength = chunkFile.content?.length || 0;
              const isChunkTruncated = chunkFile.truncated === true || !chunkFile.content;

              let chunkContent = chunkFile.content;

              // 如果文件被截断（GitHub API 行为），尝试从 raw_url 获取完整内容
              if (isChunkTruncated && chunkFile.raw_url) {
                try {
                  const rawResponse = await fetch(chunkFile.raw_url);
                  if (rawResponse.ok) {
                    chunkContent = await rawResponse.text();
                  } else {
                    truncatedChunkFiles.push({
                      index: i,
                      fileName: chunkFileName,
                      size: chunkSize,
                      contentLength: chunkContentLength,
                    });
                  }
                } catch {
                  truncatedChunkFiles.push({
                    index: i,
                    fileName: chunkFileName,
                    size: chunkSize,
                    contentLength: chunkContentLength,
                  });
                }
              }

              if (chunkContent) {
                chunkFiles.push({
                  index: i,
                  content: chunkContent,
                  fileName: chunkFileName,
                  size: chunkSize,
                });
              } else {
                truncatedChunkFiles.push({
                  index: i,
                  fileName: chunkFileName,
                  size: chunkSize,
                  contentLength: 0,
                });
              }
            } else {
              // 没有找到更多分块文件，停止搜索
              break;
            }
          }

          // 如果发现分块文件被截断，直接报告错误并跳过
          if (truncatedChunkFiles.length > 0) {
            continue; // 跳过，不尝试未分块文件
          }

          // 如果找到分块文件，尝试重组
          if (chunkFiles.length > 0) {
            try {
              // 按索引排序
              chunkFiles.sort((a, b) => a.index - b.index);

              // 如果有 metadata 文件，验证块数量
              if (metadataFile && metadataFile.content) {
                try {
                  JSON.parse(metadataFile.content) as {
                    chunks: number;
                    totalSize: number;
                  };
                } catch {
                  // 忽略元数据解析错误
                }
              }

              // 组合所有块
              const fullContent = chunkFiles.map((chunk) => chunk.content).join('');

              // 尝试解析完整的 JSON
              try {
                const parsedContent = await this.parseGistContent(fullContent);
                const novel = this.deserializeDates(parsedContent) as Novel;
                result.novels.push(novel);

                // 更新进度：处理完一本书
                processedNovels++;
                if (onProgress) {
                  onProgress({
                    current: processedNovels,
                    total: totalNovels,
                    message: `正在下载书籍: ${novel.title || novelId} (${processedNovels}/${totalNovels})`,
                  });
                }

                continue; // 成功重组，继续处理下一本书
              } catch {
                // 如果解析失败，尝试使用未分块文件（如果存在且未截断）
              }
            } catch {
              // 继续尝试使用未分块文件（如果存在）
            }
          }

          // 尝试使用未分块的书籍文件
          // 确保 fileName 不是分块文件名
          if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
            // 如果 fileName 是分块文件名，说明逻辑错误，跳过
            continue;
          }

          const file = gistFiles[fileName];
          if (file) {
            let fileContent = file.content;
            const truncated = file.truncated === true;

            // 检测文件是否被截断（GitHub API 对大文件返回 truncated=true）
            const isTruncated = truncated || !fileContent;

            if (isTruncated && file.raw_url) {
              // 尝试从 raw_url 获取完整内容
              try {
                const rawResponse = await fetch(file.raw_url);
                if (rawResponse.ok) {
                  fileContent = await rawResponse.text();
                } else {
                  continue;
                }
              } catch {
                continue;
              }
            }

            if (!fileContent) {
              continue;
            }

            try {
              const parsedContent = await this.parseGistContent(fileContent);
              const novel = this.deserializeDates(parsedContent) as Novel;
              result.novels.push(novel);

              // 更新进度：处理完一本书
              processedNovels++;
              if (onProgress) {
                onProgress({
                  current: processedNovels,
                  total: totalNovels,
                  message: `正在下载书籍: ${novel.title || novelId} (${processedNovels}/${totalNovels})`,
                });
              }
            } catch {
              // 继续处理其他书籍
              processedNovels++;
              if (onProgress) {
                onProgress({
                  current: processedNovels,
                  total: totalNovels,
                  message: `跳过无法解析的书籍 (${processedNovels}/${totalNovels})`,
                });
              }
              continue;
            }
          } else {
            // 文件不存在，跳过
            processedNovels++;
            if (onProgress) {
              onProgress({
                current: processedNovels,
                total: totalNovels,
                message: `跳过缺失的书籍 (${processedNovels}/${totalNovels})`,
              });
            }
          }
        } catch {
          // 继续处理其他书籍
          processedNovels++;
          if (onProgress) {
            onProgress({
              current: processedNovels,
              total: totalNovels,
              message: `处理书籍时出错 (${processedNovels}/${totalNovels})`,
            });
          }
        }
      }

      // 更新进度：下载完成
      if (onProgress) {
        onProgress({
          current: totalNovels || 1,
          total: totalNovels || 1,
          message: '下载完成',
        });
      }

      // 使用之前收集的 novelIds 来统计总数（这是准确的书籍数量）
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
          // 获取该版本的详细信息以获取文件变更
          let files: Array<{
            filename: string;
            status: 'added' | 'removed' | 'modified' | 'renamed';
            additions?: number;
            deletions?: number;
            changes?: number;
          }> = [];

          try {
            const revisionResponse = await this.octokit!.rest.gists.getRevision({
              gist_id: params.gistId!,
              sha: commit.version,
            });

            const currentFilesMap = revisionResponse.data.files || {};

            // 获取前一个版本以比较文件变更
            if (commitIndex > 0) {
              const previousCommit = response.data[commitIndex - 1];
              if (!previousCommit) {
                // 如果前一个版本不存在，只列出当前版本的文件
                files = Object.keys(currentFilesMap).map((filename) => {
                  const file = currentFilesMap[filename];
                  return {
                    filename,
                    status: 'modified' as const,
                    size: file?.size,
                  };
                });
              } else {
                try {
                  const previousRevisionResponse = await this.octokit!.rest.gists.getRevision({
                    gist_id: params.gistId!,
                    sha: previousCommit.version,
                  });

                  const previousFilesMap = previousRevisionResponse.data.files || {};

                  const currentFiles = Object.keys(currentFilesMap);
                  const previousFiles = Object.keys(previousFilesMap);

                  // 找出新增、删除和修改的文件
                  // 新增：在当前版本存在但不在前一个版本
                  const addedFiles = currentFiles.filter((f) => !previousFiles.includes(f));

                  // 删除：在前一个版本存在但不在当前版本
                  const removedFiles = previousFiles.filter((f) => !currentFiles.includes(f));

                  // 修改：在两个版本都存在，但内容不同
                  // 通过比较文件的 SHA、大小或内容来判断
                  const modifiedFiles = currentFiles.filter((f) => {
                    if (!previousFiles.includes(f)) {
                      return false; // 不在前一个版本，是新增的
                    }
                    const currentFile = currentFilesMap[f];
                    const previousFile = previousFilesMap[f];

                    if (!currentFile || !previousFile) {
                      return false;
                    }

                    // 比较文件大小（GitHub Gist API 文件对象没有 SHA 属性）
                    // 使用大小作为主要判断依据

                    // 如果没有 SHA，比较文件大小
                    const currentSize = currentFile.size || 0;
                    const previousSize = previousFile.size || 0;

                    if (currentSize !== previousSize) {
                      return true;
                    }

                    // 检查文件是否被截断
                    const currentTruncated = currentFile.truncated === true;
                    const previousTruncated = previousFile.truncated === true;

                    // 如果任一文件被截断，且大小相同，我们无法确定是否真的改变了
                    // 但如果 change_status 显示有变更，我们假设可能被修改了
                    if (currentTruncated || previousTruncated) {
                      // 如果文件被截断，我们无法准确比较内容
                      // 但如果大小不同，肯定有变化（已经在上面检查了）
                      // 如果大小相同但被截断，我们暂时认为没有变化
                      // 这会在后面的逻辑中处理
                      return false;
                    }

                    // 如果大小相同且都没有被截断，比较文件内容
                    const currentContent = currentFile.content || '';
                    const previousContent = previousFile.content || '';

                    // 如果内容不同，文件被修改了
                    if (currentContent !== previousContent) {
                      return true;
                    }

                    // 如果内容也相同，文件没有变化
                    return false;
                  });

                  // 如果 change_status 显示有变更，但我们的检测没有找到变更的文件
                  // 可能是某些文件的内容被截断了，我们需要更仔细地检查所有共同文件
                  const hasChanges =
                    commit.change_status &&
                    ((commit.change_status.additions ?? 0) > 0 ||
                      (commit.change_status.deletions ?? 0) > 0);

                  // 如果检测到的变更文件数量为 0，但 change_status 显示有变更
                  // 我们需要更仔细地检查所有共同文件，特别是那些被截断的文件
                  if (
                    hasChanges &&
                    addedFiles.length === 0 &&
                    removedFiles.length === 0 &&
                    modifiedFiles.length === 0
                  ) {
                    // 列出所有在两个版本中都存在的文件，并尝试比较
                    const allCommonFiles = currentFiles.filter((f) => previousFiles.includes(f));

                    for (const filename of allCommonFiles) {
                      // 如果已经在 modifiedFiles 中，跳过
                      if (modifiedFiles.includes(filename)) {
                        continue;
                      }

                      const currentFile = currentFilesMap[filename];
                      const previousFile = previousFilesMap[filename];

                      if (!currentFile || !previousFile) {
                        continue;
                      }

                      // 检查文件是否被截断
                      const currentTruncated = currentFile.truncated === true;
                      const previousTruncated = previousFile.truncated === true;

                      // 如果任一文件被截断，且 change_status 显示有变更
                      // 我们假设文件可能被修改了（因为无法准确比较）
                      if (currentTruncated || previousTruncated) {
                        modifiedFiles.push(filename);
                        continue;
                      }

                      // 文件没有被截断，比较内容
                      const currentContent = currentFile.content || '';
                      const previousContent = previousFile.content || '';
                      if (currentContent !== previousContent) {
                        modifiedFiles.push(filename);
                      }
                    }
                  }

                  files = [
                    ...addedFiles.map((filename) => {
                      const file = currentFilesMap[filename];
                      return {
                        filename,
                        status: 'added' as const,
                        size: file?.size,
                      };
                    }),
                    ...removedFiles.map((filename) => {
                      const file = previousFilesMap[filename];
                      return {
                        filename,
                        status: 'removed' as const,
                        size: file?.size,
                      };
                    }),
                    ...modifiedFiles.map((filename) => {
                      const file = currentFilesMap[filename];
                      return {
                        filename,
                        status: 'modified' as const,
                        size: file?.size,
                      };
                    }),
                  ];
                } catch {
                  // 如果无法获取前一个版本，只列出当前版本的文件，标记为修改
                  files = Object.keys(currentFilesMap).map((filename) => {
                    const file = currentFilesMap[filename];
                    return {
                      filename,
                      status: 'modified' as const,
                      size: file?.size,
                    };
                  });
                }
              }
            } else {
              // 第一个版本，所有文件都是新增的
              files = Object.keys(revisionResponse.data.files || {}).map((filename) => {
                const file = currentFilesMap[filename];
                return {
                  filename,
                  status: 'added' as const,
                  size: file?.size,
                };
              });
            }
          } catch {
            // 如果无法获取版本详情，继续但不包含文件信息
          }

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

      // 读取设置文件
      const settingsFile = gistFiles[GIST_FILE_NAMES.SETTINGS];
      if (settingsFile && settingsFile.content) {
        try {
          const settingsData = (await this.parseGistContent(settingsFile.content)) as {
            aiModels?: AIModel[];
            appSettings?: AppSettings;
            coverHistory?: CoverHistoryItem[];
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
        } catch {
          // 忽略设置文件解析错误
        }
      }

      // 收集书籍 ID
      const novelIds = new Set<string>();

      for (const fileName of Object.keys(gistFiles)) {
        if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
          const novelId = extractNovelIdFromChunkFileName(fileName);
          if (novelId) {
            novelIds.add(novelId);
          }
        } else if (
          fileName.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) &&
          !fileName.endsWith('.meta.json')
        ) {
          const match = fileName.match(/^novel-(.+)\.json$/);
          if (match && match[1]) {
            novelIds.add(match[1]);
          }
        }
      }

      // 处理每本书（使用与 downloadFromGist 相同的逻辑）
      for (const novelId of novelIds) {
        try {
          const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.json`;

          const chunkFiles: Array<{
            index: number;
            content: string;
            fileName: string;
            size: number;
          }> = [];

          for (let i = 0; i < 100; i++) {
            // 优先尝试最新格式（使用 _ 分隔符）
            let chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}_${i}.json`;
            let chunkFile = gistFiles[chunkFileName];

            // 尝试旧格式（使用 # 分隔符）
            if (!chunkFile) {
              chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}#${i}.json`;
              chunkFile = gistFiles[chunkFileName];
            }

            // 向后兼容：如果新格式不存在，尝试旧格式
            if (!chunkFile) {
              chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}-${i}.json`;
              chunkFile = gistFiles[chunkFileName];
            }
            if (chunkFile) {
              let chunkContent = chunkFile.content;
              const isChunkTruncated = chunkFile.truncated === true || !chunkContent;

              if (isChunkTruncated && chunkFile.raw_url) {
                try {
                  const rawResponse = await fetch(chunkFile.raw_url);
                  if (rawResponse.ok) {
                    chunkContent = await rawResponse.text();
                  }
                } catch {
                  // 忽略获取失败
                }
              }

              if (chunkContent) {
                chunkFiles.push({
                  index: i,
                  content: chunkContent,
                  fileName: chunkFileName,
                  size: chunkFile.size || 0,
                });
              }
            } else {
              break;
            }
          }

          if (chunkFiles.length > 0) {
            try {
              chunkFiles.sort((a, b) => a.index - b.index);
              const fullContent = chunkFiles.map((chunk) => chunk.content).join('');

              try {
                const parsedContent = await this.parseGistContent(fullContent);
                const novel = this.deserializeDates(parsedContent) as Novel;
                result.novels.push(novel);
                continue;
              } catch {
                // 解析失败，尝试单文件
              }
            } catch {
              // 重组失败，尝试单文件
            }
          }

          if (fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
            continue;
          }

          const file = gistFiles[fileName];
          if (file) {
            let fileContent = file.content;
            const truncated = file.truncated === true;

            if (truncated && file.raw_url) {
              try {
                const rawResponse = await fetch(file.raw_url);
                if (rawResponse.ok) {
                  fileContent = await rawResponse.text();
                }
              } catch {
                // 忽略获取失败
              }
            }

            if (fileContent) {
              try {
                const parsedContent = await this.parseGistContent(fileContent);
                const novel = this.deserializeDates(parsedContent) as Novel;
                result.novels.push(novel);
              } catch {
                // 忽略解析错误
              }
            }
          }
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
