import type { Novel } from './novel';

/**
 * 爬虫服务接口
 * 所有小说网站爬虫服务必须实现此接口
 */
export interface NovelScraper {
  /**
   * 验证 URL 是否为该服务支持的 URL
   * @param url 要验证的 URL
   * @returns 是否为支持的 URL
   */
  isValidUrl(url: string): boolean;

  /**
   * 获取并解析小说信息
   * @param url 小说 URL
   * @returns Promise<FetchNovelResult> 获取结果
   */
  fetchNovel(url: string): Promise<FetchNovelResult>;

  /**
   * 获取章节内容
   * @param chapterUrl 章节 URL
   * @returns Promise<string> 章节内容
   * @throws {Error} 如果获取失败
   */
  fetchChapterContent(chapterUrl: string): Promise<string>;
}

/**
 * 获取小说结果
 */
export interface FetchNovelResult {
  success: boolean;
  novel?: Novel;
  error?: string;
}

/**
 * 支持的爬虫服务类型
 */
export type ScraperType = 'syosetu' | 'unknown';

