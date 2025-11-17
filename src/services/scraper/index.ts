import type { NovelScraper, ScraperType } from 'src/types/scraper';
import { SyosetuScraper } from './syosetu-scraper';

/**
 * 爬虫服务工厂
 * 根据 URL 自动选择对应的爬虫服务
 */
export class NovelScraperFactory {
  private static scrapers: NovelScraper[] = [new SyosetuScraper()];

  /**
   * 根据 URL 获取对应的爬虫服务
   * @param url 小说 URL
   * @returns 爬虫服务实例，如果找不到则返回 null
   */
  static getScraper(url: string): NovelScraper | null {
    for (const scraper of this.scrapers) {
      if (scraper.isValidUrl(url)) {
        return scraper;
      }
    }
    return null;
  }

  /**
   * 验证 URL 是否被任何爬虫服务支持
   * @param url 要验证的 URL
   * @returns 是否支持
   */
  static isValidUrl(url: string): boolean {
    return this.getScraper(url) !== null;
  }

  /**
   * 获取 URL 对应的爬虫类型
   * @param url 小说 URL
   * @returns 爬虫类型
   */
  static getScraperType(url: string): ScraperType {
    if (new SyosetuScraper().isValidUrl(url)) {
      return 'syosetu';
    }
    return 'unknown';
  }

  /**
   * 获取所有支持的爬虫服务
   * @returns 爬虫服务列表
   */
  static getAllScrapers(): NovelScraper[] {
    return [...this.scrapers];
  }
}

// 导出类型和接口
export type { NovelScraper, FetchNovelResult, ScraperType } from 'src/types/scraper';

// 导出具体实现（供需要时直接使用）
export { SyosetuScraper } from './syosetu-scraper';
export { BaseScraper } from './base-scraper';
export { ScraperService } from './scraper-service';
export type { ChapterContentResult, BatchFetchResult } from './scraper-service';

