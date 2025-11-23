import type { AIModel, AIModelDefaultTasks } from '../services/ai/types/ai-model';
import type { Novel, CoverHistoryItem } from './novel';
import type { SyncConfig } from './sync';

/**
 * 任务默认模型配置
 * 键为任务类型，值为模型 ID 或 null（表示未设置）
 */
export type TaskDefaultModels = {
  [K in keyof AIModelDefaultTasks]?: string | null;
};

/**
 * 应用设置接口
 */
export interface AppSettings {
  /**
   * 爬虫并发数限制（同时进行的请求数量）
   * 默认值：3
   */
  scraperConcurrencyLimit: number;
  /**
   * 各任务的默认 AI 模型配置
   * 键为任务类型（translation、proofreading、termsTranslation、assistant）
   * 值为模型 ID 或 null（表示未设置）
   */
  taskDefaultModels?: TaskDefaultModels;
  /**
   * 最后打开的设置标签页索引
   * 默认值：0（第一个标签页）
   */
  lastOpenedSettingsTab?: number;
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
    sync?: SyncConfig[];
    novels: Novel[];
    coverHistory: CoverHistoryItem[];
    appSettings?: AppSettings;
  };
}
