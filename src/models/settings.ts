import type { AIModel, AIModelDefaultTasks } from '../services/ai/types/ai-model';
import type { Novel, CoverHistoryItem } from './novel';
import type { SyncConfig } from './sync';
import type { Memory } from './memory';

/**
 * 任务默认模型配置
 * 键为任务类型，值为模型 ID 或 null（表示未设置）
 */
export type TaskDefaultModels = {
  [K in keyof AIModelDefaultTasks]?: string | null;
};

/**
 * 网站-代理映射条目
 */
export interface ProxySiteMappingEntry {
  /**
   * 是否启用此映射规则
   * 默认值：true
   */
  enabled?: boolean;
  /**
   * 可用的代理 URL 列表
   */
  proxies: string[];
}

/**
 * 应用设置接口
 */
export interface AppSettings {
  /**
   * 最后编辑时间
   */
  lastEdited: Date;
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
  /**
   * 是否启用代理
   * 默认值：true
   */
  proxyEnabled?: boolean;
  /**
   * 代理 URL 模板
   * 格式：http://abc.xyz?url={url}
   * 其中 {url} 会被替换为实际要请求的 URL
   * 默认值：https://api.allorigins.win/raw?url={url}
   */
  proxyUrl?: string;
  /**
   * 是否在遇到错误时自动切换代理服务
   * 默认值：false
   */
  proxyAutoSwitch?: boolean;
  /**
   * 是否在自动切换代理成功时自动添加到网站-代理映射
   * 默认值：true
   */
  proxyAutoAddMapping?: boolean;
  /**
   * 网站-代理映射关系
   * 键为网站域名（如 "kakuyomu.jp"），值为映射配置（包含启用状态和代理 URL 列表）
   * 当自动切换代理时，会自动记录成功的代理服务
   */
  proxySiteMapping?: Record<string, ProxySiteMappingEntry>;
  /**
   * 用户自定义的代理列表
   * 每个代理包含名称和 URL
   * 默认包含一些预设代理
   */
  proxyList?: Array<{
    id: string;
    name: string;
    url: string;
    description?: string;
  }>;
  /**
   * Tavily 搜索 API Key
   * 用于网络搜索功能 (https://tavily.com/)
   */
  tavilyApiKey?: string;
  /**
   * 书籍列表排序选项
   * 默认值：'default'
   */
  booksSortOption?: string;
  /**
   * 是否已关闭首次启动快速开始弹窗
   * 默认值：false（首次启动会自动展示）
   */
  quickStartDismissed?: boolean;
}

export interface Settings {
  aiModels: AIModel[];
  sync: SyncConfig[];
  novels: Novel[];
  coverHistory?: CoverHistoryItem[];
  memories?: Memory[];
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
    memories?: Memory[];
    appSettings?: AppSettings;
  };
}
