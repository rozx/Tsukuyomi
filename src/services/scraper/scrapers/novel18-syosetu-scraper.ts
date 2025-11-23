import type { FetchNovelResult } from 'src/services/scraper/types';
import { NcodeSyosetuScraper } from './ncode-syosetu-scraper';

/**
 * novel18.syosetu.com 小说爬虫服务
 * 用于从 novel18.syosetu.com 获取和解析小说信息
 * 注意：novel18.syosetu.com 是 ncode.syosetu.com 的 R18 版本，使用相同的结构
 * 
 * 由于继承自 NcodeSyosetuScraper，所有对 NcodeSyosetuScraper 的修复（包括选择器、链接提取等）
 * 都会自动应用到 Novel18SyosetuScraper
 */
export class Novel18SyosetuScraper extends NcodeSyosetuScraper {
  protected override useProxy: boolean = false; // novel18.syosetu.com 不使用 AllOrigins 代理

  protected static override readonly BASE_URL = 'https://novel18.syosetu.com';
  // 匹配 novel18.syosetu.com 的小说 URL
  // 格式：https://novel18.syosetu.com/{novel_id}/ 或 https://novel18.syosetu.com/{novel_id}/{chapter_id}
  // novel_id 格式：n + 5-6 位字符（如 n7637dj）
  protected static override readonly NOVEL_URL_PATTERN = /^https?:\/\/novel18\.syosetu\.com\/(n\w{5,6})(?:\/(\d+))?(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 novel18.syosetu.com 小说 URL
   * @param url 要验证的 URL
   * @returns 是否为有效的 URL
   */
  override isValidUrl(url: string): boolean {
    return Novel18SyosetuScraper.NOVEL_URL_PATTERN.test(url);
  }

  /**
   * 从 URL 中提取小说 ID
   * @param url novel18.syosetu.com 小说 URL
   * @returns 小说 ID，如果无效则返回 null
   */
  override extractNovelId(url: string): string | null {
    const match = url.match(Novel18SyosetuScraper.NOVEL_URL_PATTERN);
    return match?.[1] ?? null;
  }

  /**
   * 从 URL 中提取小说主页 URL（用于获取章节列表）
   * @param url novel18.syosetu.com 小说 URL（可能是章节 URL）
   * @returns 小说主页 URL
   */
  protected override getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${Novel18SyosetuScraper.BASE_URL}/${novelId}/`;
    }
    return url;
  }

  /**
   * 获取并解析小说信息（支持分页获取所有章节）
   * 继承自 NcodeSyosetuScraper，自动获得所有修复和改进
   * @param url novel18.syosetu.com 小说 URL（可以是章节 URL，会自动提取小说主页）
   * @returns Promise<FetchNovelResult> 获取结果
   */
  override async fetchNovel(url: string): Promise<FetchNovelResult> {
    try {
      // 验证 URL
      if (!this.isValidUrl(url)) {
        return this.createErrorResult('无效的 novel18.syosetu.com 小说 URL');
      }

      // 获取小说主页 URL（如果传入的是章节 URL，需要提取小说主页）
      const novelIndexUrl = this.getNovelIndexUrl(url);

      // 获取并解析所有页面的章节（支持分页）
      // 这个方法继承自 NcodeSyosetuScraper，已经包含了所有修复
      const novelInfo = await this.parseNovelPageWithPagination(novelIndexUrl);

      // 转换为 Novel 格式
      const novel = this.convertToNovel(novelInfo);

      return this.createSuccessResult(novel);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error('获取小说信息时发生未知错误'),
      );
    }
  }
}

