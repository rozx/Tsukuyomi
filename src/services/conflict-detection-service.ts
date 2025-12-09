import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AppSettings } from 'src/models/settings';
import type { CoverHistoryItem } from 'src/models/novel';
import { isEqual, omit } from 'lodash';

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

interface Identifiable {
  id: string;
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
      const settingsConflicts = this.detectSettingsConflicts(local.appSettings, remote.appSettings);
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
   * 通用冲突检测方法
   */
  private static detectGenericConflicts<T extends Identifiable>(
    type: ConflictType,
    localItems: T[],
    remoteItems: T[],
    getName: (item: T) => string,
    ignoredKeys: string[] = ['lastEdited', 'createdAt'],
    getLastEdited: (item: T) => Date = (item) => {
      const withTime = item as unknown as { lastEdited?: Date | string };
      return withTime.lastEdited ? new Date(withTime.lastEdited) : new Date(0);
    },
  ): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localItems.map((i) => [i.id, i]));

    for (const remoteItem of remoteItems) {
      const localItem = localMap.get(remoteItem.id);
      if (localItem) {
        const localData = omit(localItem, ignoredKeys);
        const remoteData = omit(remoteItem, ignoredKeys);

        if (!isEqual(localData, remoteData)) {
          conflicts.push(
            this.createConflictItem(
              type,
              remoteItem.id,
              getName(localItem),
              getName(remoteItem),
              getLastEdited(localItem),
              getLastEdited(remoteItem),
              localItem,
              remoteItem,
            ),
          );
        }
      }
    }
    return conflicts;
  }

  /**
   * 检测书籍冲突
   * 只检测两端都存在且内容被修改的情况，或本地存在但可能是远程删除的情况
   * 只有当同一部分（章节、卷或元数据）被不同修改时，才认为是冲突
   * 如果只是新增内容（新章节/卷），不算冲突
   */
  private static detectNovelConflicts(localNovels: Novel[], remoteNovels: Novel[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const localMap = new Map(localNovels.map((n) => [n.id, n]));

    // 只检测两端都存在且内容不同的情况
    for (const remoteNovel of remoteNovels) {
      const localNovel = localMap.get(remoteNovel.id);
      if (localNovel) {
        // 检查是否存在真正的冲突（同一部分被不同修改）
        const hasRealConflict = this.hasNovelRealConflict(localNovel, remoteNovel);

        if (hasRealConflict) {
          const remoteLastEditedDate = new Date(remoteNovel.lastEdited);
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
   * 检查两个书籍是否存在真正的冲突
   * 只有当同一部分（章节、卷或元数据）被不同修改时，才认为是冲突
   * 如果只是新增内容（新章节/卷），不算冲突
   */
  private static hasNovelRealConflict(localNovel: Novel, remoteNovel: Novel): boolean {
    // 1. 检查元数据是否被不同修改（排除 volumes，因为 volumes 的变化可能是新增）
    const ignoredKeys = [
      'volumes',
      'lastEdited',
      'createdAt',
      'characterSettings',
      'terminologies',
      'notes',
    ];
    const localMetadata = omit(localNovel, ignoredKeys);
    const remoteMetadata = omit(remoteNovel, ignoredKeys);

    // 如果元数据不同，认为是冲突
    if (!isEqual(localMetadata, remoteMetadata)) {
      return true;
    }

    // 2. 检查 volumes 和 chapters 是否存在真正的冲突
    // 只有当已存在的卷/章节被不同修改时，才认为是冲突
    const localVolumes = localNovel.volumes || [];
    const remoteVolumes = remoteNovel.volumes || [];

    // 创建卷和章节的映射
    const localVolumeMap = new Map(localVolumes.map((v) => [v.id, v]));
    const remoteVolumeMap = new Map(remoteVolumes.map((v) => [v.id, v]));

    // 检查每个已存在的卷是否有冲突
    for (const [volumeId, localVolume] of localVolumeMap) {
      const remoteVolume = remoteVolumeMap.get(volumeId);

      if (remoteVolume) {
        // 卷存在于两端，检查卷的元数据是否有冲突
        const volumeIgnoredKeys = ['chapters', 'lastEdited', 'createdAt'];
        const localVolumeMetadata = omit(localVolume, volumeIgnoredKeys);
        const remoteVolumeMetadata = omit(remoteVolume, volumeIgnoredKeys);

        if (!isEqual(localVolumeMetadata, remoteVolumeMetadata)) {
          // 卷的元数据被不同修改，认为是冲突
          return true;
        } // 检查章节是否有冲突
        const localChapters = localVolume.chapters || [];
        const remoteChapters = remoteVolume.chapters || [];

        const localChapterMap = new Map(localChapters.map((c) => [c.id, c]));
        const remoteChapterMap = new Map(remoteChapters.map((c) => [c.id, c]));

        // 检查每个已存在的章节是否有冲突
        for (const [chapterId, localChapter] of localChapterMap) {
          const remoteChapter = remoteChapterMap.get(chapterId);

          if (remoteChapter) {
            // 章节存在于两端，检查章节的元数据是否有冲突
            // 注意：排除 content、contentLoaded 和 originalContent，因为它们是懒加载的
            // 如果仅内容发生变化（lastEdited 更新），由于我们忽略了 lastEdited 和 content，
            // 这里将不会检测到冲突。这是为了避免因懒加载导致无法比较内容而产生的误报。
            // 内容的冲突解决依赖于 "Last Write Wins" 策略（由 SyncService 处理）。
            const chapterIgnoredKeys = [
              'content',
              'contentLoaded',
              'originalContent',
              'lastEdited',
              'createdAt',
              'lastUpdated',
            ];
            const localChapterWithoutContent = omit(localChapter, chapterIgnoredKeys);
            const remoteChapterWithoutContent = omit(remoteChapter, chapterIgnoredKeys);

            if (!isEqual(localChapterWithoutContent, remoteChapterWithoutContent)) {
              // 章节的元数据被不同修改，认为是冲突
              return true;
            }
          }
          // 如果远程没有此章节，这是本地新增的章节，不算冲突
        }
        // 如果远程有本地没有的章节，这是远程新增的章节，不算冲突
      }
      // 如果远程没有此卷，这是本地新增的卷，不算冲突
    }
    // 如果远程有本地没有的卷，这是远程新增的卷，不算冲突

    // 3. 检查 characterSettings、terminologies、notes 是否有冲突
    // 只有当已存在的项被不同修改时，才认为是冲突
    if (this.hasArrayItemsConflict(localNovel.characterSettings, remoteNovel.characterSettings)) {
      return true;
    }
    if (this.hasArrayItemsConflict(localNovel.terminologies, remoteNovel.terminologies)) {
      return true;
    }
    if (this.hasArrayItemsConflict(localNovel.notes, remoteNovel.notes)) {
      return true;
    }

    // 没有发现真正的冲突
    return false;
  }

  /**
   * 检查两个数组中的项是否存在冲突
   * 只有当已存在的项被不同修改时，才认为是冲突
   * 如果只是新增项，不算冲突
   */
  private static hasArrayItemsConflict<T extends Identifiable>(
    localItems: T[] | undefined,
    remoteItems: T[] | undefined,
  ): boolean {
    if (!localItems && !remoteItems) return false;
    if (!localItems || !remoteItems) return false; // 如果一边有一边没有，可能是新增，不算冲突

    const localMap = new Map(localItems.map((item) => [item.id, item]));
    const remoteMap = new Map(remoteItems.map((item) => [item.id, item]));

    // 检查每个已存在的项是否有冲突
    for (const [id, localItem] of localMap) {
      const remoteItem = remoteMap.get(id);

      if (remoteItem) {
        // 项存在于两端，检查是否有冲突
        // 排除时间字段，因为时间变化可能是由于其他原因
        const localItemWithoutTime = omit(localItem, 'lastEdited', 'createdAt');
        const remoteItemWithoutTime = omit(remoteItem, 'lastEdited', 'createdAt');

        if (!isEqual(localItemWithoutTime, remoteItemWithoutTime)) {
          // 项被不同修改，认为是冲突
          return true;
        }
      }
      // 如果远程没有此项，这是本地新增的项，不算冲突
    }
    // 如果远程有本地没有的项，这是远程新增的项，不算冲突

    return false;
  } /**
   * 检测 AI 模型冲突
   * 只检测两端都存在且内容被修改的情况，或本地存在但可能是远程删除的情况
   */
  private static detectAIModelConflicts(
    localModels: AIModel[],
    remoteModels: AIModel[],
  ): ConflictItem[] {
    return this.detectGenericConflicts(
      ConflictType.AIModel,
      localModels,
      remoteModels,
      (item) => item.name,
      ['lastEdited', 'apiKey'],
    );
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
        lastEdited: remoteSettings.lastEdited ? new Date(remoteSettings.lastEdited) : new Date(0),
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

    // 只有内容不同才认为是冲突
    if (contentDifferent) {
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
  ): ConflictItem[] {
    return this.detectGenericConflicts(
      ConflictType.CoverHistory,
      localCovers,
      remoteCovers,
      (item) => `封面 ${item.url.substring(0, 30)}...`,
      ['addedAt'],
      (item) => new Date(item.addedAt),
    );
  }
}
