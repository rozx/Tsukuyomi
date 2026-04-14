import type { Settings, ExportResult, ImportResult, AppSettings } from 'src/models/settings';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel, CoverHistoryItem } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';

/**
 * 设置服务
 * 处理设置的导入和导出
 */
export interface BookImportData {
  novels: Novel[];
  memoriesByBookId: Map<string, Memory[]>;
}

export class SettingsService {
  private static toTimestamp(value: Date | number | string): number {
    if (typeof value === 'number') {
      return value;
    }
    return new Date(value).getTime();
  }

  static downloadJson(data: unknown, filename: string): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static async readJsonFile(file: File): Promise<unknown> {
    const isValidFile =
      file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');
    if (!isValidFile) {
      throw new Error('请选择 JSON 或 TXT 格式的文件');
    }
    const content = await file.text();
    return JSON.parse(content);
  }

  static exportSettings(settings: Settings): ExportResult {
    try {
      const filename = `tsukuyomi-settings-${new Date().toISOString().split('T')[0]}.json`;
      this.downloadJson(settings, filename);
      return {
        success: true,
        message: '设置已成功导出到本地文件',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '导出设置时发生未知错误',
      };
    }
  }

  /**
   * 验证文件类型
   * @param file 文件对象
   * @returns 是否为有效的 JSON 文件
   */
  static validateFileType(file: File): boolean {
    return file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');
  }

  /**
   * 从文件读取设置
   * @param file 文件对象
   * @returns Promise<ImportResult> 导入结果
   */
  static async importSettingsFromFile(file: File): Promise<ImportResult> {
    try {
      const settings = (await this.readJsonFile(file)) as Settings;
      return this.validateAndParseSettings(settings);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '解析设置文件时发生未知错误',
      };
    }
  }

  /**
   * 验证并解析设置数据
   * @param settings 原始设置数据
   * @returns ImportResult 验证和解析结果
   */
  static validateAndParseSettings(settings: Settings): ImportResult {
    // 验证数据结构
    if (!settings || typeof settings !== 'object') {
      return {
        success: false,
        error: '无效的设置数据格式',
      };
    }

    // 验证 aiModels 数组
    if (!Array.isArray(settings.aiModels)) {
      return {
        success: false,
        error: '设置数据中缺少有效的 aiModels 数组',
      };
    }

    // 验证 novels 数组（如果存在）
    if (settings.novels !== undefined && !Array.isArray(settings.novels)) {
      return {
        success: false,
        error: '设置数据中的 novels 字段格式无效',
      };
    }

    // 验证 coverHistory 数组（如果存在）
    if (settings.coverHistory !== undefined && !Array.isArray(settings.coverHistory)) {
      return {
        success: false,
        error: '设置数据中的 coverHistory 字段格式无效',
      };
    }

    // 验证 memories 数组（如果存在）
    if (settings.memories !== undefined && !Array.isArray(settings.memories)) {
      return {
        success: false,
        error: '设置数据中的 memories 字段格式无效',
      };
    }

    // 验证 sync 数组（如果存在）
    if (settings.sync !== undefined && !Array.isArray(settings.sync)) {
      return {
        success: false,
        error: '设置数据中的 sync 字段格式无效',
      };
    }

    // 验证每个模型的必需字段
    const validModels: AIModel[] = [];
    for (const model of settings.aiModels) {
      if (
        typeof model === 'object' &&
        model.id &&
        model.name &&
        model.provider &&
        model.model &&
        model.apiKey
      ) {
        // 确保 lastEdited 是 Date 对象，如果不存在则使用当前时间
        const validModel: AIModel = {
          ...model,
          lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(),
        };
        validModels.push(validModel);
      }
    }

    // 验证每个书籍的必需字段
    const validNovels: Novel[] = [];
    if (settings.novels && Array.isArray(settings.novels)) {
      for (const novel of settings.novels) {
        if (
          typeof novel === 'object' &&
          novel.id &&
          novel.title &&
          novel.createdAt &&
          novel.lastEdited
        ) {
          // 将日期字符串转换回 Date 对象
          // 保留所有字段，包括 starred 字段
          const processedNovel: Novel = {
            ...novel,
            createdAt: new Date(novel.createdAt),
            lastEdited: new Date(novel.lastEdited),
          };
          validNovels.push(processedNovel);
        }
      }
    }

    // 验证封面历史记录
    const validCoverHistory: CoverHistoryItem[] = [];
    if (settings.coverHistory && Array.isArray(settings.coverHistory)) {
      for (const cover of settings.coverHistory) {
        if (typeof cover === 'object' && cover.id && cover.url && cover.addedAt) {
          // 将日期字符串转换回 Date 对象
          const processedCover: CoverHistoryItem = {
            ...cover,
            addedAt: new Date(cover.addedAt),
          };
          validCoverHistory.push(processedCover);
        }
      }
    }

    // 验证 Memory 记录
    const validMemories: Memory[] = [];
    if (settings.memories && Array.isArray(settings.memories)) {
      for (const memory of settings.memories) {
        if (
          typeof memory === 'object' &&
          memory.id &&
          memory.bookId &&
          memory.content &&
          typeof memory.summary === 'string' &&
          memory.createdAt &&
          memory.lastAccessedAt
        ) {
          // Memory 使用时间戳（number），使用辅助函数转换
          const processedMemory: Memory = {
            ...memory,
            createdAt: this.toTimestamp(memory.createdAt),
            lastAccessedAt: this.toTimestamp(memory.lastAccessedAt),
          };
          validMemories.push(processedMemory);
        }
      }
    }

    // 验证同步配置
    const validSync: SyncConfig[] = [];
    if (settings.sync && Array.isArray(settings.sync)) {
      for (const syncConfig of settings.sync) {
        if (
          typeof syncConfig === 'object' &&
          typeof syncConfig.enabled === 'boolean' &&
          typeof syncConfig.lastSyncTime === 'number' &&
          typeof syncConfig.syncInterval === 'number' &&
          typeof syncConfig.syncType === 'string' &&
          Object.values(SyncType).includes(syncConfig.syncType as SyncType) &&
          typeof syncConfig.syncParams === 'object' &&
          typeof syncConfig.secret === 'string' &&
          typeof syncConfig.apiEndpoint === 'string'
        ) {
          validSync.push({
            enabled: syncConfig.enabled,
            lastSyncTime: syncConfig.lastSyncTime,
            syncInterval: syncConfig.syncInterval,
            syncType: syncConfig.syncType as SyncType,
            syncParams: syncConfig.syncParams || {},
            secret: syncConfig.secret,
            apiEndpoint: syncConfig.apiEndpoint,
            ...(syncConfig.lastSyncedModelIds && Array.isArray(syncConfig.lastSyncedModelIds)
              ? { lastSyncedModelIds: syncConfig.lastSyncedModelIds }
              : {}),
          });
        }
      }
    }

    // 验证应用设置（如果存在）
    let validAppSettings: AppSettings | undefined;
    if (settings.appSettings && typeof settings.appSettings === 'object') {
      const appSettings = settings.appSettings;
      validAppSettings = {} as AppSettings;

      // 验证并处理 lastEdited
      validAppSettings.lastEdited = appSettings.lastEdited
        ? new Date(appSettings.lastEdited)
        : new Date();

      // 验证并发数限制
      if (
        typeof appSettings.scraperConcurrencyLimit === 'number' &&
        appSettings.scraperConcurrencyLimit >= 1 &&
        appSettings.scraperConcurrencyLimit <= 10
      ) {
        validAppSettings.scraperConcurrencyLimit = appSettings.scraperConcurrencyLimit;
      } else {
        validAppSettings.scraperConcurrencyLimit = 3; // 默认值
      }

      // 验证任务默认模型配置（如果存在）
      if (appSettings.taskDefaultModels && typeof appSettings.taskDefaultModels === 'object') {
        validAppSettings.taskDefaultModels = {};
        const taskDefaultModels = appSettings.taskDefaultModels;
        const validTaskKeys = ['translation', 'proofreading', 'termsTranslation', 'assistant'];

        for (const taskKey of validTaskKeys) {
          const modelId = taskDefaultModels[taskKey as keyof typeof taskDefaultModels];
          if (modelId === null || (typeof modelId === 'string' && modelId.length > 0)) {
            validAppSettings.taskDefaultModels[
              taskKey as keyof typeof validAppSettings.taskDefaultModels
            ] = modelId;
          }
        }

        // 如果没有任何有效的任务配置，则不设置 taskDefaultModels
        if (Object.keys(validAppSettings.taskDefaultModels).length === 0) {
          delete validAppSettings.taskDefaultModels;
        }
      }

      // 复制其他可选字段
      if (appSettings.lastOpenedSettingsTab !== undefined) {
        validAppSettings.lastOpenedSettingsTab = appSettings.lastOpenedSettingsTab;
      }
      if (appSettings.proxyEnabled !== undefined) {
        validAppSettings.proxyEnabled = appSettings.proxyEnabled;
      }
      if (appSettings.proxyUrl !== undefined) {
        validAppSettings.proxyUrl = appSettings.proxyUrl;
      }
      if (appSettings.proxyAutoSwitch !== undefined) {
        validAppSettings.proxyAutoSwitch = appSettings.proxyAutoSwitch;
      }
      if (appSettings.proxyAutoAddMapping !== undefined) {
        validAppSettings.proxyAutoAddMapping = appSettings.proxyAutoAddMapping;
      }
      if (appSettings.proxySiteMapping !== undefined) {
        validAppSettings.proxySiteMapping = appSettings.proxySiteMapping;
      }
      if (appSettings.proxyList !== undefined) {
        validAppSettings.proxyList = appSettings.proxyList;
      }
      if (typeof appSettings.quickStartDismissed === 'boolean') {
        validAppSettings.quickStartDismissed = appSettings.quickStartDismissed;
      }
    }

    if (
      validModels.length === 0 &&
      validNovels.length === 0 &&
      validCoverHistory.length === 0 &&
      validMemories.length === 0 &&
      validSync.length === 0 &&
      !validAppSettings
    ) {
      return {
        success: false,
        error: '设置数据中没有有效的 AI 模型、书籍、封面历史、Memory、同步设置或应用设置',
      };
    }

    // 构建成功消息
    const messages: string[] = [];
    if (validModels.length > 0) {
      messages.push(`${validModels.length} 个 AI 模型配置`);
    }
    if (validNovels.length > 0) {
      messages.push(`${validNovels.length} 本书籍`);
    }
    if (validCoverHistory.length > 0) {
      messages.push(`${validCoverHistory.length} 个封面历史记录`);
    }
    if (validMemories.length > 0) {
      messages.push(`${validMemories.length} 条 Memory 记录`);
    }
    if (validSync.length > 0) {
      messages.push(`${validSync.length} 个同步配置`);
    }
    if (validAppSettings) {
      messages.push('应用设置');
    }

    return {
      success: true,
      message: `成功导入 ${messages.join('、')}`,
      data: {
        models: validModels,
        novels: validNovels,
        coverHistory: validCoverHistory,
        ...(validMemories.length > 0 ? { memories: validMemories } : {}),
        ...(validSync.length > 0 ? { sync: validSync } : {}),
        ...(validAppSettings ? { appSettings: validAppSettings } : {}),
      },
    };
  }

  static parseBookImportData(raw: unknown): BookImportData {
    if (!raw || typeof raw !== 'object') {
      throw new Error('无法识别的文件格式。请确保文件包含书籍数据。');
    }

    const data = raw as Record<string, unknown>;
    let novels: unknown[] = [];
    let rawMemories: unknown[] = [];
    let memoriesAnchorBookId: string | undefined;

    if (Array.isArray(data)) {
      novels = data;
    } else if (data.novels && Array.isArray(data.novels)) {
      novels = data.novels;
      if (data.memories && Array.isArray(data.memories)) {
        rawMemories = data.memories;
      }
    } else if (data.novel && typeof data.novel === 'object') {
      novels = [data.novel];
      if (data.memories && Array.isArray(data.memories)) {
        rawMemories = data.memories;
        memoriesAnchorBookId = (data.novel as Record<string, unknown>).id as string | undefined;
      }
    } else if (data.title) {
      novels = [data];
    } else {
      throw new Error('无法识别的文件格式。请确保文件包含书籍数据。');
    }

    if (novels.length === 0) {
      throw new Error('文件中没有找到有效的书籍数据');
    }

    const memoriesByBookId = new Map<string, Memory[]>();
    if (rawMemories.length > 0) {
      if (memoriesAnchorBookId) {
        memoriesByBookId.set(memoriesAnchorBookId, rawMemories as Memory[]);
      } else {
        for (const mem of rawMemories) {
          const m = mem as Record<string, unknown>;
          if (m.bookId) {
            let list = memoriesByBookId.get(m.bookId as string);
            if (!list) {
              list = [];
              memoriesByBookId.set(m.bookId as string, list);
            }
            list.push(mem as Memory);
          }
        }
      }
    }

    return {
      novels: novels as Novel[],
      memoriesByBookId,
    };
  }
}
