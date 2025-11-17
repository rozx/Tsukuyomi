import type { AIModel } from './ai/ai-model';
import type { Novel, CoverHistoryItem } from './novel';
import type { SyncConfig } from './sync';

/**
 * 应用设置接口
 */
export interface AppSettings {
  /**
   * 爬虫并发数限制（同时进行的请求数量）
   * 默认值：3
   */
  scraperConcurrencyLimit: number;
}

export interface Settings {
  aiModels: AIModel[];
  sync: SyncConfig[];
  novels: Novel[];
  coverHistory?: CoverHistoryItem[];
  appSettings?: AppSettings;
}

export interface ExportResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    models: AIModel[];
    novels: Novel[];
    coverHistory: CoverHistoryItem[];
    appSettings?: AppSettings;
  };
}
