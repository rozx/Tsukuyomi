import type { Settings, ExportResult, ImportResult } from 'src/models/settings';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import {
  parseAiModels,
  parseAppSettings,
  parseCoverHistory,
  parseMemories,
  parseNovels,
  parseSyncConfigs,
  validateSettingsShape,
} from './settings/settings-parsers';

/**
 * 设置服务
 * 处理设置的导入和导出
 */
export interface BookImportData {
  novels: Novel[];
  memoriesByBookId: Map<string, Memory[]>;
}

interface ImportCounts {
  models: number;
  novels: number;
  coverHistory: number;
  memories: number;
  sync: number;
  appSettings: boolean;
}

function buildImportMessage(counts: ImportCounts): string {
  const parts: string[] = [];
  if (counts.models > 0) parts.push(`${counts.models} 个 AI 模型配置`);
  if (counts.novels > 0) parts.push(`${counts.novels} 本书籍`);
  if (counts.coverHistory > 0) parts.push(`${counts.coverHistory} 个封面历史记录`);
  if (counts.memories > 0) parts.push(`${counts.memories} 条 Memory 记录`);
  if (counts.sync > 0) parts.push(`${counts.sync} 个同步配置`);
  if (counts.appSettings) parts.push('应用设置');
  return parts.join('、');
}

export class SettingsService {
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
    const shapeError = validateSettingsShape(settings);
    if (shapeError) {
      return { success: false, error: shapeError };
    }

    const models = parseAiModels(settings.aiModels);
    const novels = parseNovels(settings.novels);
    const coverHistory = parseCoverHistory(settings.coverHistory);
    const memories = parseMemories(settings.memories);
    const sync = parseSyncConfigs(settings.sync);
    const appSettings = parseAppSettings(settings.appSettings);

    const hasAnyContent =
      models.length > 0 ||
      novels.length > 0 ||
      coverHistory.length > 0 ||
      memories.length > 0 ||
      sync.length > 0 ||
      Boolean(appSettings);

    if (!hasAnyContent) {
      return {
        success: false,
        error: '设置数据中没有有效的 AI 模型、书籍、封面历史、Memory、同步设置或应用设置',
      };
    }

    return {
      success: true,
      message: `成功导入 ${buildImportMessage({
        models: models.length,
        novels: novels.length,
        coverHistory: coverHistory.length,
        memories: memories.length,
        sync: sync.length,
        appSettings: Boolean(appSettings),
      })}`,
      data: {
        models,
        novels,
        coverHistory,
        ...(memories.length > 0 ? { memories } : {}),
        ...(sync.length > 0 ? { sync } : {}),
        ...(appSettings ? { appSettings } : {}),
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
