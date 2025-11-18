import { runWithConcurrencyLimit } from 'src/utils/concurrency';
import { NovelScraperFactory } from 'src/services/scraper';

/**
 * 章节内容获取结果
 */
export interface ChapterContentResult {
  chapterId: string;
  content: string;
  chapterTitle: string;
}

/**
 * 批量获取章节内容的结果
 */
export interface BatchFetchResult {
  success: boolean;
  result?: ChapterContentResult;
  error?: Error;
  index: number;
}

/**
 * 爬虫服务
 * 提供批量获取章节内容等功能，包含并发控制
 */
export class ScraperService {
  /**
   * 批量获取章节内容，使用并发控制
   * @param chapters 章节信息数组，包含 chapterId, webUrl, title
   * @param concurrencyLimit 最大并发数，默认 3
   * @param onProgress 进度回调函数，参数为 (completed, total)
   * @returns Promise，解析为所有章节的获取结果数组
   */
  static async fetchChaptersContent(
    chapters: Array<{ chapterId: string; webUrl: string; title: string }>,
    concurrencyLimit: number = 3,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<BatchFetchResult[]> {
    // 创建异步任务数组
    const tasks = chapters.map((chapter) => {
      return async (): Promise<ChapterContentResult> => {
        const scraper = NovelScraperFactory.getScraper(chapter.webUrl);
        if (!scraper) {
          throw new Error('不支持的网站');
        }

        const content = await scraper.fetchChapterContent(chapter.webUrl);
        return {
          chapterId: chapter.chapterId,
          content,
          chapterTitle: chapter.title,
        };
      };
    });

    // 使用并发控制批量获取章节内容
    const results = await runWithConcurrencyLimit(tasks, concurrencyLimit, onProgress);

    // 转换结果格式
    return results.map((result) => {
      const batchResult: BatchFetchResult = {
        success: result.success,
        index: result.index,
      };

      if (result.result) {
        batchResult.result = result.result;
      }

      if (result.error) {
        batchResult.error = result.error;
      }

      return batchResult;
    });
  }
}
