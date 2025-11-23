/**
 * 类型定义导出入口
 * 统一导出所有类型定义，方便导入使用
 */

export type { AIModel, AIProvider, AIModelDefaultTasks } from '../services/ai/types/ai-model';
export type { MessageLanguages, MessageSchema } from '../i18n/types';
export type { SyosetuChapter, SyosetuNovelInfo } from '../services/scraper/scrapers/syosetu-types';
export type { NovelScraper, FetchNovelResult, ScraperType } from '../services/scraper/types';
