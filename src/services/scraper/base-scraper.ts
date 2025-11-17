import axios from 'axios';
import type { NovelScraper, FetchNovelResult } from 'src/types/scraper';
import type { Novel } from 'src/types/novel';

/**
 * 爬虫服务基类
 * 提供通用的错误处理和工具方法
 */
export abstract class BaseScraper implements NovelScraper {
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
   * 获取页面 HTML（通用方法）
   * 使用 AllOrigins CORS 代理服务获取页面内容
   * @param url 页面 URL
   * @param proxyPath 代理路径（可选，已弃用，现在使用 AllOrigins）
   * @returns Promise<string> HTML 内容
   * @throws {Error} 如果获取失败
   */
  protected async fetchPage(url: string, proxyPath?: string): Promise<string> {
    try {
      // 使用 AllOrigins CORS 代理服务
      // API 文档: https://allorigins.win/
      const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

      // 添加随机延迟，模拟人类行为（1-3秒）
      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // 重试机制：最多重试 3 次
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // AllOrigins 返回 JSON 格式: { contents: "HTML内容", status: {...} }
          const response = await axios.get<{
            contents: string;
            status: {
              http_code: number;
              content_type: string;
              url: string;
            };
          }>(allOriginsUrl, {
            timeout: 60000, // 60 秒超时（AllOrigins 可能需要更长时间）
            validateStatus: (status) => status >= 200 && status < 400,
          });

          // 检查 AllOrigins 返回的状态
          if (response.data.status.http_code >= 400) {
            throw new Error(`目标网站返回错误: ${response.data.status.http_code}`);
          }

          // 返回 HTML 内容
          if (response.data.contents) {
            return response.data.contents;
          }

          throw new Error('AllOrigins 返回的内容为空');
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          
          // 如果是错误且还有重试机会，等待后重试
          if (attempt < maxRetries - 1) {
            // 每次重试前等待更长时间（指数退避）
            const retryDelay = (attempt + 1) * 2000 + Math.floor(Math.random() * 1000);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // 如果没有重试机会了，直接抛出错误
          throw error;
        }
      }
      
      // 如果所有重试都失败了，抛出最后一个错误
      throw lastError || new Error('Failed to fetch page after retries');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // 服务器返回了错误状态码
          throw new Error(`获取页面失败: ${error.response.status} ${error.response.statusText || error.message}`);
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
}

