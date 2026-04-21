// 爬虫服务工厂（对外统一入口）
export { NovelScraperFactory } from './novel-scraper-factory';

// 导出类型和接口
export type { NovelScraper, FetchNovelResult, ScraperType } from 'src/services/scraper/types';

// 导出具体实现（供需要时直接使用）
export { ScraperService } from './services';
export type { ChapterContentResult, BatchFetchResult } from './services';
