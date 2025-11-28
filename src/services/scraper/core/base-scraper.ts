import axios from 'axios';
import type {
  NovelScraper,
  FetchNovelResult,
  ParsedChapterInfo,
  ParsedVolumeInfo,
} from 'src/services/scraper/types';
import type { Novel, Chapter, Volume, Translation } from 'src/models/novel';
import { UniqueIdGenerator, generateShortId } from 'src/utils/id-generator';
import { ProxyService } from 'src/services/proxy-service';
import { useElectron } from 'src/composables/useElectron';

/**
 * 爬虫服务基类
 * 提供通用的错误处理和工具方法
 */
export abstract class BaseScraper implements NovelScraper {
  /**
   * 是否使用服务器代理路径（在浏览器环境中使用 /api/... 代理）
   * 注意：在 Node.js/Bun 环境下不再使用 AllOrigins，而是直接访问或使用服务器代理
   * 子类可以通过设置此属性来控制是否使用代理
   * @default true
   */
  protected useProxy: boolean = true;

  /**
   * 验证 URL 是否为该服务支持的 URL
   * @param url 要验证的 URL
   * @returns 是否为支持的 URL
   */
  abstract isValidUrl(url: string): boolean;

  /**
   * 获取并解析小说信息
   * @param url 小说 URL
   * @returns Promise<FetchNovelResult> 获取结果
   */
  abstract fetchNovel(url: string): Promise<FetchNovelResult>;

  /**
   * 获取章节内容
   * @param chapterUrl 章节 URL
   * @returns Promise<string> 章节内容
   * @throws {Error} 如果获取失败
   */
  abstract fetchChapterContent(chapterUrl: string): Promise<string>;

  /**
   * 从 HTML 中提取段落（抽象方法，由子类实现）
   * @param html 章节 HTML 内容
   * @returns 段落数组，每个元素是一个段落文本
   */
  protected abstract extractParagraphsFromHtml(html: string): string[];

  /**
   * 获取页面 HTML（通用方法）
   * 在浏览器环境中，使用服务器提供的 /api/... 代理路径或用户配置的代理
   * 在 Electron 环境中，使用 Electron 的 net 模块直接请求或用户配置的代理
   * 在 Node.js/Bun 环境中，直接访问 URL 或使用用户配置的代理
   * @param url 页面 URL
   * @param _proxyPath 代理路径（可选，已弃用）
   * @returns Promise<string> HTML 内容
   * @throws {Error} 如果获取失败
   */
  protected async fetchPage(url: string, _proxyPath?: string): Promise<string> {
    try {
      // 检测环境
      const { isElectron, isBrowser } = useElectron();

      // 使用代理服务的自动切换功能执行请求
      return await ProxyService.executeWithAutoSwitch(
        url,
        async (proxiedUrl: string) => {
          // 在 Electron 环境中，使用 Electron 的 net 模块
          if (isElectron.value) {
            if (!window.electronAPI?.fetch) {
              throw new Error('Electron API 未正确加载，请检查 preload 脚本');
            }

            const headers: Record<string, string> = {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
            };

            // 设置 Referer
            const urlObj = new URL(url);
            headers['Referer'] = urlObj.origin;

            const response = await window.electronAPI.fetch(proxiedUrl, {
              method: 'GET',
              headers,
              timeout: 60000,
            });

            if (response.status >= 400) {
              throw new Error(`目标网站返回错误: ${response.status}`);
            }

            if (response.data) {
              return response.data;
            }

            throw new Error('返回的内容为空');
          }

          // 在浏览器环境（非 Electron）或 Node.js/Bun 环境中，使用 axios
          const headers: Record<string, string> = {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          };

          // 只在非浏览器环境（如 Node.js/Bun）中设置这些请求头
          if (!isBrowser.value) {
            headers['User-Agent'] =
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            headers['Accept-Encoding'] = 'gzip, deflate, br';
            headers['Referer'] = url.startsWith('https://')
              ? new URL(url).origin
              : 'https://kakuyomu.jp/';
          }

          const response = await axios.get(proxiedUrl, {
            timeout: 60000, // 60 秒超时（与代理服务器超时时间一致）
            headers,
            validateStatus: (status) => status >= 200 && status < 400,
          });

          if (response.status >= 400) {
            throw new Error(`目标网站返回错误: ${response.status}`);
          }

          if (response.data) {
            // 检查返回的内容类型
            const contentType = response.headers['content-type'] || '';
            const dataStr =
              typeof response.data === 'string' ? response.data : String(response.data);

            // 检查是否是 JSON 响应（可能是代理服务返回的 JSON 格式）
            if (contentType.includes('application/json') || dataStr.trim().startsWith('{')) {
              // 尝试解析 JSON 以获取实际内容
              try {
                const jsonData =
                  typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

                // 某些代理服务（如 AllOrigins）返回 JSON，内容在 contents 字段
                if (jsonData.contents && typeof jsonData.contents === 'string') {
                  return jsonData.contents;
                }

                // 某些代理服务返回 JSON，内容在 data 字段
                if (jsonData.data && typeof jsonData.data === 'string') {
                  return jsonData.data;
                }

                // cors.lol 可能直接返回 HTML（即使 Content-Type 是 JSON）
                // 检查是否包含 HTML 标签
                if (dataStr.includes('<html') || dataStr.includes('<!DOCTYPE')) {
                  return dataStr;
                }

                console.error('[BaseScraper] JSON 响应中未找到 HTML 内容', {
                  keys: Object.keys(jsonData),
                  jsonPreview: JSON.stringify(jsonData).substring(0, 500),
                });
              } catch {
                // 不是有效的 JSON，可能是 HTML 但被误判为 JSON
              }
            }

            return response.data;
          }

          throw new Error('返回的内容为空');
        },
        {
          skipInternalProxy: isElectron.value, // Electron 环境不使用内部代理路径
          maxRetries: 3,
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // 服务器返回了错误状态码
          throw new Error(
            `获取页面失败: ${error.response.status} ${error.response.statusText || error.message}`,
          );
        } else if (error.request) {
          // 请求已发出但没有收到响应
          throw new Error('网络连接失败，请检查网络设置');
        } else {
          // 请求配置出错
          throw new Error(`请求配置错误: ${error.message}`);
        }
      }
      throw error instanceof Error ? error : new Error('获取页面时发生未知错误');
    }
  }

  /**
   * 创建错误结果
   * @param error 错误信息
   * @returns FetchNovelResult
   */
  protected createErrorResult(error: string | Error): FetchNovelResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : error,
    };
  }

  /**
   * 创建成功结果
   * @param novel 小说对象
   * @returns FetchNovelResult
   */
  protected createSuccessResult(novel: Novel): FetchNovelResult {
    return {
      success: true,
      novel,
    };
  }

  /**
   * 创建章节对象（通用方法）
   * @param chapterInfo 解析后的章节信息
   * @param idGenerator 章节 ID 生成器
   * @param defaultDate 默认日期（如果章节信息中没有日期）
   * @returns Chapter 对象
   */
  protected createChapter(
    chapterInfo: ParsedChapterInfo,
    idGenerator: UniqueIdGenerator,
    defaultDate: Date = new Date(),
  ): Chapter {
    // 解析创建日期
    let chapterDate = defaultDate;
    if (chapterInfo.date) {
      if (chapterInfo.date instanceof Date) {
        chapterDate = chapterInfo.date;
      } else {
        // 尝试解析日期字符串（格式：2025年05月16日(金) 08:13）
        const dateMatch = chapterInfo.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1; // JavaScript 月份从 0 开始
          const day = parseInt(dateMatch[3], 10);
          chapterDate = new Date(year, month, day);
        }
      }
    }

    // 解析最后更新时间
    // 只有当网站明确提供了 lastUpdated 时才设置，否则保持为空
    let lastUpdatedDate: Date | undefined;
    if (chapterInfo.lastUpdated) {
      if (chapterInfo.lastUpdated instanceof Date) {
        lastUpdatedDate = chapterInfo.lastUpdated;
      } else {
        // 尝试解析日期字符串（格式：2025年05月16日(金) 08:13 或 2025年05月16日(金) 08:13(改)）
        // 移除 "(改)" 标记后解析
        const cleanedDate = chapterInfo.lastUpdated.replace(/\(改\)/g, '').trim();
        const dateMatch = cleanedDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1; // JavaScript 月份从 0 开始
          const day = parseInt(dateMatch[3], 10);
          lastUpdatedDate = new Date(year, month, day);
        }
      }
    }
    // 注意：如果只有 date 而没有 lastUpdated，则不设置 lastUpdated（保持 undefined）

    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const chapter: Chapter = {
      id: idGenerator.generate(),
      title: {
        original: chapterInfo.title,
        translation,
      },
      webUrl: chapterInfo.url,
      lastEdited: chapterDate,
      createdAt: chapterDate,
    };

    // 只有当网站明确提供了 lastUpdated 时才设置
    if (lastUpdatedDate) {
      chapter.lastUpdated = lastUpdatedDate;
    }

    return chapter;
  }

  /**
   * 创建卷对象（通用方法）
   * @param volumeInfo 解析后的卷信息
   * @param chapters 该卷的章节数组
   * @param idGenerator 卷 ID 生成器
   * @returns Volume 对象
   */
  protected createVolume(
    volumeInfo: ParsedVolumeInfo,
    chapters: Chapter[],
    idGenerator: UniqueIdGenerator,
  ): Volume {
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    return {
      id: idGenerator.generate(),
      title: {
        original: volumeInfo.title,
        translation,
      },
      chapters,
    };
  }

  /**
   * 将章节分组到卷中（通用方法）
   * @param chapters 章节数组
   * @param volumesInfo 卷信息数组（可选）
   * @param defaultVolumeTitle 默认卷标题（当没有卷信息时使用）
   * @returns Volume 数组
   */
  protected groupChaptersIntoVolumes(
    chapters: ParsedChapterInfo[],
    volumesInfo?: ParsedVolumeInfo[],
    defaultVolumeTitle: string = '正文',
  ): Volume[] {
    const volumeIdGenerator = new UniqueIdGenerator();
    const chapterIdGenerator = new UniqueIdGenerator();
    const now = new Date();
    const volumes: Volume[] = [];

    // 如果有卷信息，按卷分组
    if (volumesInfo && volumesInfo.length > 0) {
      volumesInfo.forEach((volumeInfo, volumeIndex) => {
        const volumeTranslation: Translation = {
          id: generateShortId(),
          translation: '',
          aiModelId: '',
        };

        const volume: Volume = {
          id: volumeIdGenerator.generate(),
          title: {
            original: volumeInfo.title,
            translation: volumeTranslation,
          },
          chapters: [],
        };

        // 计算该卷的章节范围
        const startIndex = volumeInfo.startIndex;
        const nextVolumeInfo = volumesInfo[volumeIndex + 1];
        const endIndex = nextVolumeInfo ? nextVolumeInfo.startIndex : chapters.length;

        // 将该卷的章节添加到卷中
        for (let i = startIndex; i < endIndex; i++) {
          const chapterInfo = chapters[i];
          if (!chapterInfo) continue;

          const chapter = this.createChapter(chapterInfo, chapterIdGenerator, now);
          volume.chapters?.push(chapter);
        }

        if (volume.chapters && volume.chapters.length > 0) {
          volumes.push(volume);
        }
      });
    } else {
      // 如果没有卷信息，使用默认卷
      const defaultVolumeTranslation: Translation = {
        id: generateShortId(),
        translation: '',
        aiModelId: '',
      };

      const defaultVolume: Volume = {
        id: volumeIdGenerator.generate(),
        title: {
          original: defaultVolumeTitle,
          translation: defaultVolumeTranslation,
        },
        chapters: [],
      };

      // 将章节添加到默认卷
      chapters.forEach((chapterInfo) => {
        const chapter = this.createChapter(chapterInfo, chapterIdGenerator, now);
        defaultVolume.chapters?.push(chapter);
      });

      if (defaultVolume.chapters && defaultVolume.chapters.length > 0) {
        volumes.push(defaultVolume);
      }
    }

    return volumes;
  }
}
