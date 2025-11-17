/**
 * 类型定义导出入口
 * 统一导出所有类型定义，方便导入使用
 */

export type { AIModel, AIProvider, AIModelDefaultTasks } from './ai/ai-model';
export type { MessageLanguages, MessageSchema } from './i18n';
export type {
  SyosetuChapter,
  SyosetuNovelInfo,
} from './syosetu';
export type {
  NovelScraper,
  FetchNovelResult,
  ScraperType,
} from './scraper';
