import type { NovelScraper } from 'src/services/scraper/types';
import { SyosetuScraper } from './scrapers';
import { KakuyomuScraper } from './scrapers';
import { NcodeSyosetuScraper } from './scrapers';
import { Novel18SyosetuScraper } from './scrapers';

/**
 * 爬虫服务工厂
 * 根据 URL 自动选择对应的爬虫服务
 *
 * 支持的网站：
 * - syosetu.org (自定义中文翻译站) -> 自定义 SyosetuScraper
 * - kakuyomu.jp (カクヨム) -> 自定义 KakuyomuScraper
 * - ncode.syosetu.com (小説家になろう) -> NcodeSyosetuScraper
 * - novel18.syosetu.com (小説家になろう R18) -> Novel18SyosetuScraper
 */
export class NovelScraperFactory {
  private static syosetuScraper: NovelScraper = new SyosetuScraper();
  private static kakuyomuScraper: NovelScraper = new KakuyomuScraper();
  private static ncodeSyosetuScraper: NovelScraper = new NcodeSyosetuScraper();
  private static novel18SyosetuScraper: NovelScraper = new Novel18SyosetuScraper();

  /**
   * 根据 URL 获取对应的爬虫服务
   * @param url 小说 URL
   * @returns 爬虫服务实例，如果找不到则返回 null
   */
  /**
   * 按主机名匹配（不是 URL 子串），避免 `evil.com/?r=syosetu.org` 或
   * `syosetu.org.attacker.com` 这样的绕过 —— CodeQL JS "incomplete URL
   * substring sanitization" 专门检查这种模式。
   */
  private static hostMatches(url: string, host: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === host || parsed.hostname.endsWith(`.${host}`);
    } catch {
      return false;
    }
  }

  static getScraper(url: string): NovelScraper | null {
    if (this.hostMatches(url, 'kakuyomu.jp')) {
      return this.kakuyomuScraper.isValidUrl(url) ? this.kakuyomuScraper : null;
    }
    if (this.hostMatches(url, 'novel18.syosetu.com')) {
      return this.novel18SyosetuScraper.isValidUrl(url) ? this.novel18SyosetuScraper : null;
    }
    if (this.hostMatches(url, 'ncode.syosetu.com')) {
      return this.ncodeSyosetuScraper.isValidUrl(url) ? this.ncodeSyosetuScraper : null;
    }
    // Syosetu.org (注意：这是不同的网站)
    if (this.hostMatches(url, 'syosetu.org')) {
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
   * 获取支持的网站名称列表
   * @returns 支持的网站名称数组
   */
  static getSupportedSites(): string[] {
    return ['syosetu.org', 'kakuyomu.jp', 'ncode.syosetu.com', 'novel18.syosetu.com'];
  }

  /**
   * 获取支持的网站名称字符串（用于显示）
   * @returns 支持的网站名称字符串
   */
  static getSupportedSitesText(): string {
    return this.getSupportedSites().join('、');
  }
}
