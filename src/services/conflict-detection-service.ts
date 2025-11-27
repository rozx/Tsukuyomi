import type { Novel } from 'src/models/novel';
import type { AIModel, AIProvider, AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem } from 'src/models/novel';
import { isEqual, omit } from 'lodash';
import { isTimeDifferent } from 'src/utils/time-utils';
import type { Volume, Chapter } from 'src/models/novel';

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
   * 创建冲突项
   */
  private static createConflictItem(
    type: ConflictType,
    id: string,
    localName: string,
    remoteName: string,
    localLastEdited: Date,
    remoteLastEdited: Date,
    localData: unknown,
    remoteData: unknown,
  ): ConflictItem {
    return {
      type,
      id,
      localName,
      remoteName,
      localLastEdited,
      remoteLastEdited,
      localData,
      remoteData,
    };
  }
  /**
   * 检测本地和远程数据之间的冲突
   * @param lastSyncTime 上次同步时间（毫秒时间戳），用于判断本地新增的内容
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
    lastSyncTime?: number,
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
    const novelConflicts = this.detectNovelConflicts(
      local.novels,
      remoteNovels,
      lastSyncTime,
    );
    conflicts.push(...novelConflicts);

    // 检测 AI 模型冲突（确保 aiModels 不为 null/undefined）
    const remoteAiModels = remote.aiModels || [];
    const modelConflicts = this.detectAIModelConflicts(
      local.aiModels,
      remoteAiModels,
      lastSyncTime,
    );
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
        lastSyncTime,
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
   * 只检测两端都存在且内容被修改的情况，或本地存在但可能是远程删除的情况
   */
  private static detectNovelConflicts(
    localNovels: Novel[],
    remoteNovels: Novel[],
    lastSyncTime?: number,
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localNovels.map((n) => [n.id, n]));
    const remoteMap = new Map(remoteNovels.map((n) => [n.id, n]));

    // 只检测两端都存在且内容不同的情况
    for (const remoteNovel of remoteNovels) {
      const localNovel = localMap.get(remoteNovel.id);
      if (localNovel) {
        // 书籍存在于两端，先比较内容，再检查时间
        // 注意：排除章节内容（content），因为章节内容是懒加载的，不应该参与冲突检测
        const localNovelWithoutContent = ConflictDetectionService.createNovelWithoutContent(localNovel);
        const remoteNovelWithoutContent = ConflictDetectionService.createNovelWithoutContent({
          ...remoteNovel,
          lastEdited: new Date(remoteNovel.lastEdited),
        });

        const localDataWithoutTime = omit(localNovelWithoutContent, 'lastEdited', 'createdAt');
        const remoteDataWithoutTime = omit(remoteNovelWithoutContent, 'lastEdited', 'createdAt');

        // 如果内容不同或时间差异超过 1 秒，认为有冲突
        const contentDifferent = !isEqual(localDataWithoutTime, remoteDataWithoutTime);
        const remoteLastEditedDate = new Date(remoteNovel.lastEdited);
        const timeDifferent = isTimeDifferent(
          localNovel.lastEdited,
          remoteLastEditedDate,
        );

        if (contentDifferent || timeDifferent) {
          conflicts.push(
            this.createConflictItem(
              ConflictType.Novel,
              remoteNovel.id,
              localNovel.title,
              remoteNovel.title,
              localNovel.lastEdited,
              remoteLastEditedDate,
              localNovel,
              remoteNovel,
            ),
          );
        }
      }
      // 如果本地没有此书籍，这是远程新增的内容，不算冲突
    }

    // 检测本地存在但远程不存在的情况
    // 如果 lastEdited 在上次同步之后，说明是本地新添加的，不算冲突，会保留
    // 如果 lastEdited 在上次同步之前或等于，说明是陈旧的本地文件，远程已删除，会自动删除，不算冲突
    // 不需要在这里检测，同步服务会自动处理

    return conflicts;
  }

  /**
   * 检测 AI 模型冲突
   * 只检测两端都存在且内容被修改的情况，或本地存在但可能是远程删除的情况
   */
  private static detectAIModelConflicts(
    localModels: AIModel[],
    remoteModels: AIModel[],
    lastSyncTime?: number,
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localModels.map((m) => [m.id, m]));
    const remoteMap = new Map(remoteModels.map((m) => [m.id, m]));

    // 只检测两端都存在的情况
    for (const remoteModel of remoteModels) {
      const localModel = localMap.get(remoteModel.id);
      if (localModel) {
        // 模型存在于两端，先比较内容，再检查时间
        const localDataWithoutTime = omit(localModel, 'lastEdited');
        const remoteDataWithoutTime = omit(
          {
            ...remoteModel,
            lastEdited: remoteModel.lastEdited ? new Date(remoteModel.lastEdited) : new Date(0),
          },
          'lastEdited',
        );

        // 使用 lodash isEqual 进行深度比较，排除 apiKey（敏感信息）
        const localForCompare = omit(localDataWithoutTime, 'apiKey');
        const remoteForCompare = omit(remoteDataWithoutTime, 'apiKey');
        const contentDifferent = !isEqual(localForCompare, remoteForCompare);

        // 检查时间差异
        const localLastEdited = localModel.lastEdited || new Date(0);
        const remoteLastEdited = remoteModel.lastEdited
          ? new Date(remoteModel.lastEdited)
          : new Date(0);
        const timeDifferent = isTimeDifferent(localLastEdited, remoteLastEdited);

        if (contentDifferent || timeDifferent) {
          conflicts.push(
            this.createConflictItem(
              ConflictType.AIModel,
              remoteModel.id,
              localModel.name,
              remoteModel.name,
              localLastEdited,
              remoteLastEdited,
              localModel,
              remoteModel,
            ),
          );
        }
      }
      // 如果本地没有此模型，这是远程新增的内容，不算冲突
    }

    // 检测本地存在但远程不存在的情况
    // 如果 lastEdited 在上次同步之后，说明是本地新添加的，不算冲突，会保留
    // 如果 lastEdited 在上次同步之前或等于，说明是陈旧的本地文件，远程已删除，会自动删除，不算冲突
    // 不需要在这里检测，同步服务会自动处理

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

    // 先比较内容，再检查时间
    const localDataWithoutTime = omit(localSettings, 'lastEdited');
    const remoteDataWithoutTime = omit(
      {
        ...remoteSettings,
        lastEdited: remoteSettings.lastEdited
          ? new Date(remoteSettings.lastEdited)
          : new Date(0),
      },
      'lastEdited',
    );

    // 使用 lodash isEqual 进行深度比较
    const contentDifferent = !isEqual(localDataWithoutTime, remoteDataWithoutTime);

    // 检查时间差异
    const localLastEdited = localSettings.lastEdited || new Date(0);
    const remoteLastEdited = remoteSettings.lastEdited
      ? new Date(remoteSettings.lastEdited)
      : new Date(0);
    const timeDifferent = isTimeDifferent(localLastEdited, remoteLastEdited);

    if (contentDifferent || timeDifferent) {
      conflicts.push(
        this.createConflictItem(
          ConflictType.Settings,
          'app-settings',
          '本地设置',
          '远程设置',
          localLastEdited,
          remoteLastEdited,
          localSettings,
          remoteSettings,
        ),
      );
    }

    return conflicts;
  }

  /**
   * 检测封面历史冲突
   * 只检测两端都存在且内容被修改的情况，或本地存在但可能是远程删除的情况
   */
  private static detectCoverHistoryConflicts(
    localCovers: CoverHistoryItem[],
    remoteCovers: CoverHistoryItem[],
    lastSyncTime?: number,
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localCovers.map((c) => [c.id, c]));
    const remoteMap = new Map(remoteCovers.map((c) => [c.id, c]));

    // 只检测两端都存在的情况
    for (const remoteCover of remoteCovers) {
      const localCover = localMap.get(remoteCover.id);
      if (localCover) {
        // 封面历史使用 addedAt 作为 lastEdited
        const localAddedAt = new Date(localCover.addedAt);
        const remoteAddedAt = new Date(remoteCover.addedAt);

        // 先比较内容，再检查时间
        const localDataWithoutTime = omit(localCover, 'addedAt');
        const remoteDataWithoutTime = omit(remoteCover, 'addedAt');
        const contentDifferent = !isEqual(localDataWithoutTime, remoteDataWithoutTime);

        // 检查时间差异
        const timeDifferent = isTimeDifferent(localAddedAt, remoteAddedAt);

        if (contentDifferent || timeDifferent) {
          conflicts.push(
            this.createConflictItem(
              ConflictType.CoverHistory,
              remoteCover.id,
              `封面 ${localCover.url.substring(0, 30)}...`,
              `封面 ${remoteCover.url.substring(0, 30)}...`,
              localAddedAt,
              remoteAddedAt,
              localCover,
              remoteCover,
            ),
          );
        }
      }
      // 如果本地没有此封面，这是远程新增的内容，不算冲突
    }

    // 检测本地存在但远程不存在的情况
    // 如果 addedAt 在上次同步之后，说明是本地新添加的，不算冲突，会保留
    // 如果 addedAt 在上次同步之前或等于，说明是陈旧的本地文件，远程已删除，会自动删除，不算冲突
    // 不需要在这里检测，同步服务会自动处理

    return conflicts;
  }

  /**
   * 创建一个不包含章节内容的书籍副本，用于比较
   * 章节内容是懒加载的，不应该参与冲突检测的比较
   */
  private static createNovelWithoutContent(novel: Novel): Novel {
    return {
      ...novel,
      volumes: novel.volumes?.map((volume) => ({
        ...volume,
        chapters: volume.chapters?.map((chapter) => {
          // 移除 content、contentLoaded 和 originalContent 字段
          // 这些都是懒加载的，不应该参与冲突检测的比较
          const { content, contentLoaded, originalContent, ...chapterWithoutContent } = chapter;
          return chapterWithoutContent as Chapter;
        }),
      })),
    };
  }
}

