import type { NovelScraper, ScraperType } from 'src/types/scraper';
import { SyosetuScraper } from './syosetu-scraper';
import { KakuyomuScraper } from './kakuyomu-scraper';

/**
 * 爬虫服务工厂
 * 根据 URL 自动选择对应的爬虫服务
 *
 * 支持的网站：
 * - syosetu.org (自定义中文翻译站) -> 自定义 SyosetuScraper
 * - kakuyomu.jp (カクヨム) -> 自定义 KakuyomuScraper
 */
export class NovelScraperFactory {
  private static syosetuScraper: NovelScraper = new SyosetuScraper();
  private static kakuyomuScraper: NovelScraper = new KakuyomuScraper();

  /**
   * 根据 URL 获取对应的爬虫服务
   * @param url 小说 URL
   * @returns 爬虫服务实例，如果找不到则返回 null
   */
  static getScraper(url: string): NovelScraper | null {
    // Kakuyomu
    if (url.includes('kakuyomu.jp')) {
      return this.kakuyomuScraper.isValidUrl(url) ? this.kakuyomuScraper : null;
    }

    // Syosetu.org
    if (url.includes('syosetu.org')) {
      return this.syosetuScraper.isValidUrl(url) ? this.syosetuScraper : null;
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
    if (url.includes('kakuyomu.jp')) {
      return 'kakuyomu';
    }

    if (url.includes('syosetu.org')) {
      return 'syosetu';
    }

    return 'unknown';
  }

  /**
   * 获取所有支持的爬虫服务
   * @returns 爬虫服务列表
   */
  static getAllScrapers(): NovelScraper[] {
    return [this.syosetuScraper, this.kakuyomuScraper];
  }

  /**
   * 获取支持的网站名称列表
   * @returns 支持的网站名称数组
   */
  static getSupportedSites(): string[] {
    return ['syosetu.org', 'kakuyomu.jp'];
  }

  /**
   * 获取支持的网站名称字符串（用于显示）
   * @returns 支持的网站名称字符串
   */
  static getSupportedSitesText(): string {
    return this.getSupportedSites().join('、');
  }
}

// 导出类型和接口
export type { NovelScraper, FetchNovelResult, ScraperType } from 'src/types/scraper';

// 导出具体实现（供需要时直接使用）
export { SyosetuScraper } from './syosetu-scraper';
export { KakuyomuScraper } from './kakuyomu-scraper';
export { BaseScraper } from './base-scraper';
export { ScraperService } from './scraper-service';
export type { ChapterContentResult, BatchFetchResult } from './scraper-service';
