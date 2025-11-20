import { Octokit } from '@octokit/rest';
import type { AIModel } from 'src/types/ai/ai-model';
import type { Novel } from 'src/types/novel';
import type { AppSettings } from 'src/types/settings';
import type { SyncConfig } from 'src/types/sync';
import { SyncType } from 'src/types/sync';
import type { CoverHistoryItem } from 'src/types/novel';
import { extractNovelIdFromChunkFileName } from 'src/utils/gist-file-utils';

/**
 * Gist 文件名称常量
 */
const GIST_FILE_NAMES = {
  SETTINGS: 'luna-ai-settings.json',
  NOVEL_PREFIX: 'novel-',
  NOVEL_CHUNK_PREFIX: 'novel-chunk-',
} as const;

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
          const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${stat.novelId}#${i}.json`;
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
   */
  async uploadToGist(
    config: SyncConfig,
    data: {
      aiModels: AIModel[];
      appSettings: AppSettings;
      novels: Novel[];
      coverHistory?: CoverHistoryItem[];
    },
  ): Promise<SyncResult> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      if (!this.octokit) {
        throw new Error('Octokit 客户端未初始化');
      }

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
      files[GIST_FILE_NAMES.SETTINGS] = {
        content: JSON.stringify(settingsData, null, 2),
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

      for (const novel of data.novels) {
        const serializedNovel = this.serializeDates(novel);
        const jsonContent = JSON.stringify(serializedNovel, null, 2);
        const contentSize = new Blob([jsonContent]).size;

        if (contentSize <= MAX_FILE_SIZE) {
          // 文件足够小，直接存储
          const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novel.id}.json`;
          files[fileName] = {
            content: jsonContent,
          };
          uploadStats.push({
            novelId: novel.id,
            title: novel.title,
            size: contentSize,
            chunked: false,
          });
        } else {
          // 文件过大，分割成多个块
          // 按字节安全分割（确保不在多字节字符中间切断）
          // 使用二分查找来高效确定分块大小
          const encoder = new TextEncoder();
          const chunks: string[] = [];
          let position = 0;

          while (position < jsonContent.length) {
            const remaining = jsonContent.length - position;

            // 使用二分查找找到最大的字符数，使得字节数不超过 CHUNK_SIZE
            let left = 1;
            let right = Math.min(remaining, CHUNK_SIZE); // 最坏情况：每字符1字节
            let bestLength = 1;

            while (left <= right) {
              const mid = Math.floor((left + right) / 2);
              const candidate = jsonContent.substring(position, position + mid);
              const candidateBytes = encoder.encode(candidate).length;

              if (candidateBytes <= CHUNK_SIZE) {
                bestLength = mid;
                left = mid + 1;
              } else {
                right = mid - 1;
              }
            }

            const chunk = jsonContent.substring(position, position + bestLength);
            chunks.push(chunk);
            position += bestLength;
          }

          // 存储每个块
          // 使用 # 作为分隔符，避免与 UUID 中的连字符冲突
          chunks.forEach((chunk, index) => {
            const chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novel.id}#${index}.json`;
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
          const localNovelIds = new Set(data.novels.map((n) => n.id));

          // 创建一个集合，包含所有本地已经添加到 files 中的文件名（排除 null 值）
          const localFileNames = new Set<string>();
          for (const [filename, file] of Object.entries(files)) {
            if (file !== null) {
              localFileNames.add(filename);
            }
          }

          // 找出需要删除的文件（远程存在但本地已删除）
          const filesToDelete: string[] = [];
          for (const [filename, file] of Object.entries(currentFiles)) {
            if (!file) {
              continue;
            }

            // 跳过设置文件
            if (filename === GIST_FILE_NAMES.SETTINGS) {
              continue;
            }

            // 如果文件已经在本地 files 中（即将上传），则跳过
            if (localFileNames.has(filename)) {
              continue;
            }

            // 检查是否是书籍相关文件
            // 首先检查是否是分块文件（优先处理，因为它们有特殊格式）
            if (filename.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
              // 分块文件（新格式：novel-chunk-{id}#{index}.json 或旧格式：novel-chunk-{id}-{index}.json）
              const chunkNovelId = extractNovelIdFromChunkFileName(filename);
              if (chunkNovelId && !localNovelIds.has(chunkNovelId)) {
                // GitHub API 要求使用 null 值来删除文件
                files[filename] = null; // 删除文件（书籍已删除）
                filesToDelete.push(filename);
              }
            } else if (
              filename.endsWith('.meta.json') &&
              filename.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX)
            ) {
              // 元数据文件（novel-{id}.meta.json）
              const metaMatch = filename.match(/^novel-(.+)\.meta\.json$/);
              if (metaMatch && metaMatch[1] && !localNovelIds.has(metaMatch[1])) {
                files[filename] = null; // 删除文件（书籍已删除）
                filesToDelete.push(filename);
              }
            } else if (
              filename.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX) &&
              filename.endsWith('.json')
            ) {
              // 普通书籍文件（novel-{id}.json）
              const novelIdMatch = filename.match(/^novel-(.+)\.json$/);
              if (novelIdMatch && novelIdMatch[1]) {
                const novelId = novelIdMatch[1];
                if (!localNovelIds.has(novelId)) {
                  files[filename] = null; // 删除文件（书籍已删除）
                  filesToDelete.push(filename);
                }
              }
            }
          }

          // 确保所有要删除的文件都被明确设置为 null
          // GitHub API 要求使用 { content: null } 格式来删除文件
          for (const filename of filesToDelete) {
            if (files[filename] !== null) {
              files[filename] = null;
            }
          }
        } catch (getError) {
          // 如果获取失败（例如 Gist 不存在），继续使用原始 files
          // 在更新时会处理创建新 Gist 的情况
        }

        // 尝试更新现有 Gist
        try {
          const response = await this.octokit.rest.gists.update({
            gist_id: gistId,
            description: 'Luna AI Translator - Settings and Novels',
            files,
          });
          gistId = response.data.id;
          gistUrl = response.data.html_url;
        } catch (updateError: unknown) {
          // 如果更新失败（例如 Gist 不存在或已被删除），创建新的 Gist
          const errorStatus = (updateError as { status?: number })?.status;
          if (errorStatus === 404 || errorStatus === 403) {
            const response = await this.octokit.rest.gists.create({
              description: 'Luna AI Translator - Settings and Novels',
              public: false,
              files,
            });
            // 重新创建时，使用新创建的 Gist ID（GitHub 不允许指定 ID）
            // 但标记为重新创建，以便在 UI 中显示提示
            gistId = response.data.id;
            isRecreated = true;
            gistUrl = response.data.html_url;
          } else {
            // 其他错误，重新抛出
            throw updateError;
          }
        }
      } else {
        // 创建新 Gist
        const response = await this.octokit.rest.gists.create({
          description: 'Luna AI Translator - Settings and Novels',
          public: false,
          files,
        });
        gistId = response.data.id;
        gistUrl = response.data.html_url;
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
   */
  async downloadFromGist(config: SyncConfig): Promise<SyncResult & { data?: GistSyncData }> {
    try {
      this.validateConfig(config);
      this.initializeOctokit(config);

      const params = this.getGistParams(config);
      if (!this.octokit || !params.gistId) {
        throw new Error('Gist ID 未配置或 Octokit 客户端未初始化');
      }

      // 获取 Gist
      const response = await this.octokit.rest.gists.get({
        gist_id: params.gistId,
      });

      const gistFiles = response.data.files;
      if (!gistFiles) {
        throw new Error('Gist 中没有文件');
      }

      const result: GistSyncData = {
        aiModels: [],
        novels: [],
      };

      // 1. 读取设置文件
      const settingsFile = gistFiles[GIST_FILE_NAMES.SETTINGS];
      if (settingsFile && settingsFile.content) {
        try {
          const settingsData = JSON.parse(settingsFile.content) as {
            aiModels?: AIModel[];
            appSettings?: AppSettings;
            coverHistory?: CoverHistoryItem[];
          };

          if (settingsData.aiModels) {
            result.aiModels = this.deserializeDates(settingsData.aiModels) as AIModel[];
          }
          if (settingsData.appSettings) {
            result.appSettings = this.deserializeDates(settingsData.appSettings) as AppSettings;
          }
          if (settingsData.coverHistory) {
            result.coverHistory = this.deserializeDates(
              settingsData.coverHistory,
            ) as CoverHistoryItem[];
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

      // 处理每本书
      for (const novelId of novelIds) {
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
            // 优先尝试新格式（使用 # 分隔符）
            let chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}#${i}.json`;
            let chunkFile = gistFiles[chunkFileName];

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
                const parsedContent = JSON.parse(fullContent);
                const novel = this.deserializeDates(parsedContent) as Novel;
                result.novels.push(novel);
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
              const parsedContent = JSON.parse(fileContent);
              const novel = this.deserializeDates(parsedContent) as Novel;
              result.novels.push(novel);
            } catch {
              // 继续处理其他书籍
              continue;
            }
          }
        } catch {
          // 继续处理其他书籍
        }
      }

      // 使用之前收集的 novelIds 来统计总数（这是准确的书籍数量）
      const totalNovels = novelIds.size;
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
          const settingsData = JSON.parse(settingsFile.content) as {
            aiModels?: AIModel[];
            appSettings?: AppSettings;
            coverHistory?: CoverHistoryItem[];
          };

          if (settingsData.aiModels) {
            result.aiModels = this.deserializeDates(settingsData.aiModels) as AIModel[];
          }
          if (settingsData.appSettings) {
            result.appSettings = this.deserializeDates(settingsData.appSettings) as AppSettings;
          }
          if (settingsData.coverHistory) {
            result.coverHistory = this.deserializeDates(
              settingsData.coverHistory,
            ) as CoverHistoryItem[];
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
          const metadataFileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.meta.json`;
          const metadataFile = gistFiles[metadataFileName];
          const fileName = `${GIST_FILE_NAMES.NOVEL_PREFIX}${novelId}.json`;

          const chunkFiles: Array<{
            index: number;
            content: string;
            fileName: string;
            size: number;
          }> = [];

          for (let i = 0; i < 100; i++) {
            let chunkFileName = `${GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX}${novelId}#${i}.json`;
            let chunkFile = gistFiles[chunkFileName];

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
                const parsedContent = JSON.parse(fullContent);
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
                const parsedContent = JSON.parse(fileContent);
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
