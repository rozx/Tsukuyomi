import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { ConflictDetectionService } from 'src/services/conflict-detection-service';
import type { ConflictResolution } from 'src/services/conflict-detection-service';
import type { GistSyncData } from 'src/services/gist-sync-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import type { Novel, Volume, Chapter, Paragraph } from 'src/models/novel';
import { isEqual, omit } from 'lodash';
import { isTimeDifferent, isNewlyAdded as checkIsNewlyAdded } from 'src/utils/time-utils';

/**
 * 同步数据服务
 * 处理上传/下载配置的通用逻辑
 */
export class SyncDataService {

  /**
   * 应用下载的数据（根据冲突解决结果）
   */
  static async applyDownloadedData(
    remoteData: {
      novels?: any[] | null;
      aiModels?: any[] | null;
      appSettings?: any;
      coverHistory?: any[] | null;
    } | null,
    resolutions: ConflictResolution[],
    lastSyncTime?: number,
  ): Promise<void> {
    // 如果 remoteData 为 null，直接返回
    if (!remoteData) {
      return;
    }

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

    // 如果没有传入 lastSyncTime，从设置中获取
    const syncTime = lastSyncTime ?? settingsStore.gistSync.lastSyncTime ?? 0;

    const resolutionMap = new Map(resolutions.map((r) => [r.conflictId, r.choice]));

    // 处理 AI 模型（确保 aiModels 是数组）
    if (
      remoteData.aiModels &&
      Array.isArray(remoteData.aiModels) &&
      remoteData.aiModels.length > 0
    ) {
      const finalModels: any[] = [];

      // 收集所有远程模型（根据冲突解决选择）
      for (const remoteModel of remoteData.aiModels) {
        const localModel = aiModelsStore.models.find((m) => m.id === remoteModel.id);
        if (localModel) {
          // 有冲突，根据用户选择
          const resolution = resolutionMap.get(remoteModel.id);
          if (resolution === 'remote') {
            finalModels.push(remoteModel);
          } else {
            finalModels.push(localModel);
          }
        } else {
          // 新模型，直接添加
          finalModels.push(remoteModel);
        }
      }

      // 添加本地独有的模型
      // 只保留在上次同步后新添加的本地模型（lastEdited > lastSyncTime）
      // 陈旧的本地模型（lastEdited <= lastSyncTime）会被自动删除，因为远程已删除
      for (const localModel of aiModelsStore.models) {
        if (!remoteData.aiModels.find((m) => m.id === localModel.id)) {
          // 检查是否有冲突解决选择（用户手动选择删除）
          const resolution = resolutionMap.get(localModel.id);
          if (resolution === 'remote') {
            // 用户选择删除本地模型，不添加
            continue;
          }

          // 检查是否是本地新增的（在上次同步后添加）
          if (
            localModel.lastEdited &&
            checkIsNewlyAdded(localModel.lastEdited, syncTime)
          ) {
            // 本地新增的模型，保留
            finalModels.push(localModel);
          }
          // 如果不在上次同步后添加，说明是陈旧的本地模型，不添加（自动删除）
        }
      }

      await aiModelsStore.clearModels();
      for (const model of finalModels) {
        await aiModelsStore.addModel(model);
      }
    }

    // 处理书籍（确保 novels 是数组）
    if (remoteData.novels && Array.isArray(remoteData.novels) && remoteData.novels.length > 0) {
      const finalBooks: Novel[] = [];

      // 收集所有远程书籍（根据冲突解决选择）
      for (const remoteNovel of remoteData.novels) {
        const localNovel = booksStore.books.find((b) => b.id === remoteNovel.id);
        if (localNovel) {
          // 有冲突，根据用户选择
          const resolution = resolutionMap.get(remoteNovel.id);
          if (resolution === 'remote') {
            // 使用远程书籍，但需要保留本地章节内容
            const mergedNovel = await SyncDataService.mergeNovelWithLocalContent(
              remoteNovel as Novel,
              localNovel,
            );
            finalBooks.push(mergedNovel);
          } else {
            // 使用本地书籍，但需要确保章节内容已加载
            const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(
              localNovel,
            );
            finalBooks.push(localNovelWithContent);
          }
        } else {
          // 新书籍，直接添加
          finalBooks.push(remoteNovel as Novel);
        }
      }

      // 添加本地独有的书籍
      // 只保留在上次同步后新添加的本地书籍（lastEdited > lastSyncTime）
      // 陈旧的本地书籍（lastEdited <= lastSyncTime）会被自动删除，因为远程已删除
      for (const localBook of booksStore.books) {
        if (!remoteData.novels.find((n) => n.id === localBook.id)) {
          // 检查是否有冲突解决选择（用户手动选择删除）
          const resolution = resolutionMap.get(localBook.id);
          if (resolution === 'remote') {
            // 用户选择删除本地书籍，不添加
            continue;
          }

          // 检查是否是本地新增的（在上次同步后添加）
          if (checkIsNewlyAdded(localBook.lastEdited, syncTime)) {
            // 本地新增的书籍，保留（确保章节内容已加载）
            const localBookWithContent = await SyncDataService.ensureNovelContentLoaded(localBook);
            finalBooks.push(localBookWithContent);
          }
          // 如果不在上次同步后添加，说明是陈旧的本地书籍，不添加（自动删除）
        }
      }

      await booksStore.clearBooks();
      await booksStore.bulkAddBooks(finalBooks);
    }

    // 处理封面历史（确保 coverHistory 是数组）
    if (
      remoteData.coverHistory &&
      Array.isArray(remoteData.coverHistory) &&
      remoteData.coverHistory.length > 0
    ) {
      const finalCovers: any[] = [];

      for (const remoteCover of remoteData.coverHistory) {
        const localCover = coverHistoryStore.covers.find((c) => c.id === remoteCover.id);
        if (localCover) {
          const resolution = resolutionMap.get(remoteCover.id);
          if (resolution === 'remote') {
            finalCovers.push(remoteCover);
          } else {
            finalCovers.push(localCover);
          }
        } else {
          finalCovers.push(remoteCover);
        }
      }

      // 添加本地独有的封面
      // 只保留在上次同步后新添加的本地封面（addedAt > lastSyncTime）
      // 陈旧的本地封面（addedAt <= lastSyncTime）会被自动删除，因为远程已删除
      for (const localCover of coverHistoryStore.covers) {
        if (!remoteData.coverHistory.find((c) => c.id === localCover.id)) {
          // 检查是否有冲突解决选择（用户手动选择删除）
          const resolution = resolutionMap.get(localCover.id);
          if (resolution === 'remote') {
            // 用户选择删除本地封面，不添加
            continue;
          }

          // 检查是否是本地新增的（在上次同步后添加）
          if (checkIsNewlyAdded(localCover.addedAt, syncTime)) {
            // 本地新增的封面，保留
            finalCovers.push(localCover);
          }
          // 如果不在上次同步后添加，说明是陈旧的本地封面，不添加（自动删除）
        }
      }

      await coverHistoryStore.clearHistory();
      for (const cover of finalCovers) {
        await coverHistoryStore.addCover(cover);
      }
    }

    // 处理设置
    if (remoteData.appSettings) {
      const resolution = resolutionMap.get('app-settings');
      if (resolution === 'remote' || resolutions.length === 0) {
        // 无冲突时也应用远程设置
        const currentGistSync = settingsStore.gistSync;
        await settingsStore.importSettings(remoteData.appSettings);
        await settingsStore.updateGistSync(currentGistSync);
      }
    }
  }

  /**
   * 创建安全的远程数据对象（确保 novels 和 aiModels 是数组）
   */
  static createSafeRemoteData(data: GistSyncData | null | undefined): {
    novels: any[];
    aiModels: any[];
    appSettings?: any;
    coverHistory: any[];
  } {
    return {
      novels: Array.isArray(data?.novels) ? data.novels : [],
      aiModels: Array.isArray(data?.aiModels) ? data.aiModels : [],
      appSettings: data?.appSettings,
      coverHistory: Array.isArray(data?.coverHistory) ? data.coverHistory : [],
    };
  }

  /**
   * 检测冲突并返回安全的数据对象
   */
  static detectConflictsAndCreateSafeData(remoteData: GistSyncData | null | undefined): {
    hasConflicts: boolean;
    conflicts: any[];
    safeRemoteData: {
      novels: any[];
      aiModels: any[];
      appSettings?: any;
      coverHistory: any[];
    };
  } {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

    const safeRemoteData = this.createSafeRemoteData(remoteData);

    // 获取上次同步时间
    const lastSyncTime = settingsStore.gistSync.lastSyncTime || 0;

    const conflictResult = ConflictDetectionService.detectConflicts(
      {
        novels: booksStore.books || [],
        aiModels: aiModelsStore.models || [],
        appSettings: settingsStore.getAllSettings(),
        coverHistory: coverHistoryStore.covers || [],
      },
      {
        novels: safeRemoteData.novels,
        aiModels: safeRemoteData.aiModels,
        ...(safeRemoteData.appSettings ? { appSettings: safeRemoteData.appSettings } : {}),
        ...(safeRemoteData.coverHistory ? { coverHistory: safeRemoteData.coverHistory } : {}),
      },
      lastSyncTime,
    );

    return {
      hasConflicts: conflictResult.hasConflicts,
      conflicts: conflictResult.conflicts,
      safeRemoteData,
    };
  }

  /**
   * 检查本地数据相对于远程数据是否有变更（需要上传）
   */
  static hasChangesToUpload(
    local: {
      novels: any[];
      aiModels: any[];
      appSettings: any;
      coverHistory: any[];
    },
    remote: {
      novels: any[];
      aiModels: any[];
      appSettings?: any;
      coverHistory?: any[];
    },
  ): boolean {
    // 1. 检查书籍
    if (local.novels.length !== (remote.novels || []).length) return true;

    const remoteNovelMap = new Map((remote.novels || []).map((n) => [n.id, n]));
    for (const localNovel of local.novels) {
      const remoteNovel = remoteNovelMap.get(localNovel.id);
      if (!remoteNovel) return true; // 本地有新书籍

      // 检查更新时间
      if (isTimeDifferent(localNovel.lastEdited, remoteNovel.lastEdited)) {
        return true;
      }
    }

    // 2. 检查 AI 模型
    if (local.aiModels.length !== (remote.aiModels || []).length) return true;

    const remoteModelMap = new Map((remote.aiModels || []).map((m) => [m.id, m]));
    for (const localModel of local.aiModels) {
      const remoteModel = remoteModelMap.get(localModel.id);
      if (!remoteModel) return true;

      // 比较内容（使用 lodash 深度比较，排除 apiKey 和 lastEdited）
      const localForCompare = omit(localModel, 'apiKey', 'lastEdited');
      const remoteForCompare = omit(remoteModel, 'apiKey', 'lastEdited');
      if (!isEqual(localForCompare, remoteForCompare)) {
        return true;
      }
    }

    // 3. 检查设置（使用 lodash 深度比较，排除 lastEdited）
    const localSettingsForCompare = omit(local.appSettings, 'lastEdited');
    const remoteSettingsForCompare = omit(remote.appSettings || {}, 'lastEdited');
    if (!isEqual(localSettingsForCompare, remoteSettingsForCompare)) {
      if (!remote.appSettings && Object.keys(local.appSettings).length > 0) return true;
      if (remote.appSettings) return true;
    }

    // 4. 检查封面历史
    if (local.coverHistory.length !== (remote.coverHistory || []).length) return true;

    const remoteCoverMap = new Map((remote.coverHistory || []).map((c) => [c.id, c]));
    for (const localCover of local.coverHistory) {
      const remoteCover = remoteCoverMap.get(localCover.id);
      if (!remoteCover) return true;

      if (isTimeDifferent(localCover.addedAt, remoteCover.addedAt)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 合并远程书籍数据与本地章节内容
   * 当应用远程书籍数据时，保留本地书籍的章节内容
   * @param remoteNovel 远程书籍数据
   * @param localNovel 本地书籍数据
   * @returns 合并后的书籍数据
   */
  static async mergeNovelWithLocalContent(
    remoteNovel: Novel,
    localNovel: Novel,
  ): Promise<Novel> {
    // 使用远程书籍的元数据，但保留本地书籍的章节内容
    const mergedNovel: Novel = {
      ...remoteNovel,
      // 保留本地书籍的创建时间（如果远程没有）
      createdAt: remoteNovel.createdAt || localNovel.createdAt,
      // 保留远程书籍的 lastEdited（这是合并操作，使用远程的 lastEdited）
      lastEdited: remoteNovel.lastEdited || localNovel.lastEdited,
    };

    // 使用远程的 volumes 结构（如果远程有 volumes，使用远程的；如果远程没有，清空 volumes）
    // 但保留本地章节内容（如果章节 ID 匹配）
    if (remoteNovel.volumes && remoteNovel.volumes.length > 0) {
      // 远程有 volumes，使用远程的 volumes 结构，但保留本地章节内容
      mergedNovel.volumes = await Promise.all(
        remoteNovel.volumes.map(async (remoteVolume) => {
          // 查找对应的本地卷
          const localVolume = localNovel.volumes?.find((v) => v.id === remoteVolume.id);

          if (localVolume && localVolume.chapters && remoteVolume.chapters) {
            // 合并章节，保留本地章节内容
            const mergedChapters = await Promise.all(
              remoteVolume.chapters.map(async (remoteChapter) => {
                const localChapter = localVolume.chapters?.find(
                  (ch) => ch.id === remoteChapter.id,
                );

                // 如果本地章节存在，尝试保留其内容
                if (localChapter) {
                  let contentToPreserve: Paragraph[] | undefined;

                  // 首先尝试从本地章节获取（如果已加载）
                  if (
                    localChapter.content !== undefined &&
                    localChapter.content !== null &&
                    Array.isArray(localChapter.content) &&
                    localChapter.content.length > 0
                  ) {
                    contentToPreserve = localChapter.content;
                  } else {
                    // 如果本地章节没有 content，从 IndexedDB 加载
                    contentToPreserve = await ChapterContentService.loadChapterContent(
                      localChapter.id,
                    );
                  }

                  // 如果找到了内容，保留它
                  if (contentToPreserve !== undefined && contentToPreserve.length > 0) {
                    return {
                      ...remoteChapter,
                      content: contentToPreserve,
                    } as Chapter;
                  }
                }

                // 如果远程章节有内容，使用远程内容
                // 否则尝试从 IndexedDB 加载（如果章节 ID 相同）
                if (
                  (!remoteChapter.content ||
                    (Array.isArray(remoteChapter.content) &&
                      remoteChapter.content.length === 0)) &&
                  localChapter
                ) {
                  const contentFromDB = await ChapterContentService.loadChapterContent(
                    remoteChapter.id,
                  );
                  if (contentFromDB && contentFromDB.length > 0) {
                    return {
                      ...remoteChapter,
                      content: contentFromDB,
                    } as Chapter;
                  }
                }

                return remoteChapter as Chapter;
              }),
            );

            return {
              ...remoteVolume,
              chapters: mergedChapters,
            } as Volume;
          }

          // 远程 volume 在本地不存在，直接使用远程 volume
          // 但尝试从 IndexedDB 加载章节内容（如果章节 ID 匹配）
          if (remoteVolume.chapters) {
            const chaptersWithContent = await Promise.all(
              remoteVolume.chapters.map(async (remoteChapter) => {
                // 如果远程章节没有内容，尝试从 IndexedDB 加载
                if (
                  !remoteChapter.content ||
                  (Array.isArray(remoteChapter.content) &&
                    remoteChapter.content.length === 0)
                ) {
                  const contentFromDB = await ChapterContentService.loadChapterContent(
                    remoteChapter.id,
                  );
                  if (contentFromDB && contentFromDB.length > 0) {
                    return {
                      ...remoteChapter,
                      content: contentFromDB,
                    } as Chapter;
                  }
                }
                return remoteChapter as Chapter;
              }),
            );
            return {
              ...remoteVolume,
              chapters: chaptersWithContent,
            } as Volume;
          }

          return remoteVolume as Volume;
        }),
      );
    } else {
      // 远程没有 volumes，清空 volumes（删除本地的 volumes）
      mergedNovel.volumes = [];
    }

    return mergedNovel;
  }

  /**
   * 确保书籍的章节内容已加载
   * 如果章节内容未加载，从 IndexedDB 加载
   * @param novel 书籍对象
   * @returns 包含章节内容的书籍对象
   */
  static async ensureNovelContentLoaded(novel: Novel): Promise<Novel> {
    // 如果书籍没有 volumes，直接返回
    if (!novel.volumes || novel.volumes.length === 0) {
      return novel;
    }

    // 检查是否所有章节都已加载内容
    let needsLoading = false;
    for (const volume of novel.volumes) {
      if (volume.chapters) {
        for (const chapter of volume.chapters) {
          // 如果章节没有 content 或 content 为空，需要加载
          if (
            chapter.content === undefined ||
            chapter.content === null ||
            (Array.isArray(chapter.content) && chapter.content.length === 0)
          ) {
            needsLoading = true;
            break;
          }
        }
        if (needsLoading) break;
      }
    }

    // 如果不需要加载，直接返回
    if (!needsLoading) {
      return novel;
    }

    // 需要加载章节内容
    const novelWithContent: Novel = {
      ...novel,
      volumes: await Promise.all(
        novel.volumes.map(async (volume) => {
          if (!volume.chapters) {
            return volume;
          }

          const chaptersWithContent = await Promise.all(
            volume.chapters.map(async (chapter) => {
              // 如果章节已有内容，直接返回
              if (
                chapter.content !== undefined &&
                chapter.content !== null &&
                Array.isArray(chapter.content) &&
                chapter.content.length > 0
              ) {
                return chapter;
              }

              // 从 IndexedDB 加载内容
              const content = await ChapterContentService.loadChapterContent(chapter.id);
              if (content && content.length > 0) {
                return {
                  ...chapter,
                  content,
                  contentLoaded: true,
                } as Chapter;
              }

              return chapter;
            }),
          );

          return {
            ...volume,
            chapters: chaptersWithContent,
          };
        }),
      ),
    };

    return novelWithContent;
  }
}
