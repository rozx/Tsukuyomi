import type { Novel } from 'src/models/novel';
import type { AIModel, AIProvider, AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem } from 'src/models/novel';

/**
 * 冲突类型
 */
export enum ConflictType {
  Novel = 'novel',
  AIModel = 'aiModel',
  Settings = 'settings',
  CoverHistory = 'coverHistory',
}

/**
 * 冲突项
 */
export interface ConflictItem {
  type: ConflictType;
  id: string;
  localName: string;
  remoteName: string;
  localLastEdited: Date;
  remoteLastEdited: Date;
  localData: unknown;
  remoteData: unknown;
}

/**
 * 冲突检测结果
 */
export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: ConflictItem[];
}

/**
 * 冲突解决选择
 */
export interface ConflictResolution {
  conflictId: string;
  type: ConflictType;
  choice: 'local' | 'remote';
}

/**
 * 冲突检测服务
 */
export class ConflictDetectionService {
  /**
   * 检测本地和远程数据之间的冲突
   */
  static detectConflicts(
    local: {
      novels: Novel[];
      aiModels: AIModel[];
      appSettings: AppSettings;
      coverHistory: CoverHistoryItem[];
    },
    remote: {
      novels: Novel[];
      aiModels: AIModel[];
      appSettings?: AppSettings;
      coverHistory?: CoverHistoryItem[];
    },
  ): ConflictDetectionResult {
    // 确保 remote 不为 null/undefined
    if (!remote) {
      return {
        hasConflicts: false,
        conflicts: [],
      };
    }
    
    const conflicts: ConflictItem[] = [];

    // 检测书籍冲突（确保 novels 不为 null/undefined）
    const remoteNovels = remote?.novels || [];
    const novelConflicts = this.detectNovelConflicts(local.novels, remoteNovels);
    conflicts.push(...novelConflicts);

    // 检测 AI 模型冲突（确保 aiModels 不为 null/undefined）
    const remoteAiModels = remote.aiModels || [];
    const modelConflicts = this.detectAIModelConflicts(local.aiModels, remoteAiModels);
    conflicts.push(...modelConflicts);

    // 检测设置冲突
    if (remote.appSettings) {
      const settingsConflicts = this.detectSettingsConflicts(
        local.appSettings,
        remote.appSettings,
      );
      conflicts.push(...settingsConflicts);
    }

    // 检测封面历史冲突
    if (remote.coverHistory) {
      const coverConflicts = this.detectCoverHistoryConflicts(
        local.coverHistory,
        remote.coverHistory,
      );
      conflicts.push(...coverConflicts);
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * 检测书籍冲突
   */
  private static detectNovelConflicts(
    localNovels: Novel[],
    remoteNovels: Novel[],
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localNovels.map((n) => [n.id, n]));
    const remoteMap = new Map(remoteNovels.map((n) => [n.id, n]));

    // 检测远程书籍的冲突（两端都存在且时间不同）
    for (const remoteNovel of remoteNovels) {
      const localNovel = localMap.get(remoteNovel.id);
      if (localNovel) {
        // 书籍存在于两端，检查是否有冲突
        const localTime = localNovel.lastEdited.getTime();
        const remoteTime = new Date(remoteNovel.lastEdited).getTime();

        // 如果时间差异超过 1 秒，认为有冲突
        if (Math.abs(localTime - remoteTime) > 1000) {
          conflicts.push({
            type: ConflictType.Novel,
            id: remoteNovel.id,
            localName: localNovel.title,
            remoteName: remoteNovel.title,
            localLastEdited: localNovel.lastEdited,
            remoteLastEdited: new Date(remoteNovel.lastEdited),
            localData: localNovel,
            remoteData: remoteNovel,
          });
        }
      }
    }

    // 检测本地存在但远程不存在的书籍（本地新添加或远程已删除）
    for (const localNovel of localNovels) {
      if (!remoteMap.has(localNovel.id)) {
        // 本地存在但远程不存在，需要用户选择是否删除本地书籍
        conflicts.push({
          type: ConflictType.Novel,
          id: localNovel.id,
          localName: localNovel.title,
          remoteName: '[已删除]', // 远程不存在，标记为已删除
          localLastEdited: localNovel.lastEdited,
          remoteLastEdited: new Date(0), // 使用纪元时间表示不存在
          localData: localNovel,
          remoteData: null, // 远程不存在，设置为 null
        });
      }
    }

    return conflicts;
  }

  /**
   * 检测 AI 模型冲突
   */
  private static detectAIModelConflicts(
    localModels: AIModel[],
    remoteModels: AIModel[],
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localModels.map((m) => [m.id, m]));

    for (const remoteModel of remoteModels) {
      const localModel = localMap.get(remoteModel.id);
      if (localModel) {
        // 模型存在于两端，检查是否有冲突
        // AI 模型没有 lastEdited，使用 JSON 比较
        const localJson = JSON.stringify(this.serializeModel(localModel));
        const remoteJson = JSON.stringify(this.serializeModel(remoteModel));

        if (localJson !== remoteJson) {
          conflicts.push({
            type: ConflictType.AIModel,
            id: remoteModel.id,
            localName: localModel.name,
            remoteName: remoteModel.name,
            localLastEdited: new Date(), // AI 模型没有时间戳，使用当前时间
            remoteLastEdited: new Date(),
            localData: localModel,
            remoteData: remoteModel,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 检测设置冲突
   */
  private static detectSettingsConflicts(
    localSettings: AppSettings,
    remoteSettings: AppSettings,
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localJson = JSON.stringify(localSettings);
    const remoteJson = JSON.stringify(remoteSettings);

    if (localJson !== remoteJson) {
      conflicts.push({
        type: ConflictType.Settings,
        id: 'app-settings',
        localName: '本地设置',
        remoteName: '远程设置',
        localLastEdited: new Date(),
        remoteLastEdited: new Date(),
        localData: localSettings,
        remoteData: remoteSettings,
      });
    }

    return conflicts;
  }

  /**
   * 检测封面历史冲突
   */
  private static detectCoverHistoryConflicts(
    localCovers: CoverHistoryItem[],
    remoteCovers: CoverHistoryItem[],
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localCovers.map((c) => [c.id, c]));

    for (const remoteCover of remoteCovers) {
      const localCover = localMap.get(remoteCover.id);
      if (localCover) {
        const localTime = new Date(localCover.addedAt).getTime();
        const remoteTime = new Date(remoteCover.addedAt).getTime();

        if (Math.abs(localTime - remoteTime) > 1000) {
          conflicts.push({
            type: ConflictType.CoverHistory,
            id: remoteCover.id,
            localName: `封面 ${localCover.url.substring(0, 30)}...`,
            remoteName: `封面 ${remoteCover.url.substring(0, 30)}...`,
            localLastEdited: new Date(localCover.addedAt),
            remoteLastEdited: new Date(remoteCover.addedAt),
            localData: localCover,
            remoteData: remoteCover,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 序列化 AI 模型用于比较（排除不重要的字段）
   */
  private static serializeModel(model: AIModel): {
    id: string;
    name: string;
    provider: AIProvider;
    model: string;
    temperature: number;
    maxTokens: number;
    contextWindow?: number;
    rateLimit?: number;
    baseUrl: string;
    isDefault: AIModelDefaultTasks;
    enabled: boolean;
  } {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      model: model.model,
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
      ...(model.rateLimit !== undefined ? { rateLimit: model.rateLimit } : {}),
      baseUrl: model.baseUrl,
      isDefault: model.isDefault,
      enabled: model.enabled,
      // 排除 apiKey，因为它是敏感信息且不应该用于冲突检测
    };
  }
}

