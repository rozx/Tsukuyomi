import type { Novel } from '../../models/novel';

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
export type ScraperType = 'syosetu' | 'kakuyomu' | 'ncode' | 'unknown';

/**
 * 章节信息接口（用于从不同网站解析的章节数据）
 */
export interface ParsedChapterInfo {
  title: string;
  url: string;
  date?: string | Date; // 章节的创建/首次发布时间
  lastUpdated?: string | Date; // 章节的最后更新时间（从网站获取）
}

/**
 * 卷信息接口（用于从不同网站解析的卷数据）
 */
export interface ParsedVolumeInfo {
  title: string;
  startIndex: number; // 该卷开始的章节索引
}

