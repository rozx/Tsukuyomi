import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { ConflictDetectionService } from 'src/services/conflict-detection-service';
import type { ConflictResolution } from 'src/services/conflict-detection-service';
import type { GistSyncData } from 'src/services/gist-sync-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import type { Novel, Volume, Chapter } from 'src/models/novel';

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
  ): Promise<void> {
    // 如果 remoteData 为 null，直接返回
    if (!remoteData) {
      return;
    }

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

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
      // 如果用户选择了 'remote'（删除本地），则不添加本地模型
      for (const localModel of aiModelsStore.models) {
        if (!remoteData.aiModels.find((m) => m.id === localModel.id)) {
          // 检查是否有冲突解决选择
          const resolution = resolutionMap.get(localModel.id);
          if (resolution === 'remote') {
            // 用户选择删除本地模型，不添加
            continue;
          }
          // 用户选择保留本地或没有冲突，添加本地模型
          finalModels.push(localModel);
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
            const mergedNovel = await this.mergeNovelWithLocalContent(
              remoteNovel as Novel,
              localNovel,
            );
            finalBooks.push(mergedNovel);
          } else {
            finalBooks.push(localNovel);
          }
        } else {
          // 新书籍，直接添加
          finalBooks.push(remoteNovel as Novel);
        }
      }

      // 添加本地独有的书籍
      // 如果用户选择了 'remote'（删除本地），则不添加本地书籍
      for (const localBook of booksStore.books) {
        if (!remoteData.novels.find((n) => n.id === localBook.id)) {
          // 检查是否有冲突解决选择
          const resolution = resolutionMap.get(localBook.id);
          if (resolution === 'remote') {
            // 用户选择删除本地书籍，不添加
            continue;
          }
          // 用户选择保留本地或没有冲突，添加本地书籍
          finalBooks.push(localBook);
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
      // 如果用户选择了 'remote'（删除本地），则不添加本地封面
      for (const localCover of coverHistoryStore.covers) {
        if (!remoteData.coverHistory.find((c) => c.id === localCover.id)) {
          // 检查是否有冲突解决选择
          const resolution = resolutionMap.get(localCover.id);
          if (resolution === 'remote') {
            // 用户选择删除本地封面，不添加
            continue;
          }
          // 用户选择保留本地或没有冲突，添加本地封面
          finalCovers.push(localCover);
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
      const localTime = new Date(localNovel.lastEdited).getTime();
      const remoteTime = new Date(remoteNovel.lastEdited).getTime();

      // 如果本地时间比远程时间新（甚至哪怕只差一点），就需要上传
      if (Math.abs(localTime - remoteTime) > 1000) return true;
    }

    // 2. 检查 AI 模型
    if (local.aiModels.length !== (remote.aiModels || []).length) return true;

    const remoteModelMap = new Map((remote.aiModels || []).map((m) => [m.id, m]));
    for (const localModel of local.aiModels) {
      const remoteModel = remoteModelMap.get(localModel.id);
      if (!remoteModel) return true;

      // 比较内容 (简单比较)
      if (JSON.stringify(localModel) !== JSON.stringify(remoteModel)) {
        return true;
      }
    }

    // 3. 检查设置
    if (JSON.stringify(local.appSettings) !== JSON.stringify(remote.appSettings || {})) {
      if (!remote.appSettings && Object.keys(local.appSettings).length > 0) return true;
      if (remote.appSettings) return true;
    }

    // 4. 检查封面历史
    if (local.coverHistory.length !== (remote.coverHistory || []).length) return true;

    const remoteCoverMap = new Map((remote.coverHistory || []).map((c) => [c.id, c]));
    for (const localCover of local.coverHistory) {
      const remoteCover = remoteCoverMap.get(localCover.id);
      if (!remoteCover) return true;

      const localTime = new Date(localCover.addedAt).getTime();
      const remoteTime = new Date(remoteCover.addedAt).getTime();
      if (Math.abs(localTime - remoteTime) > 1000) return true;
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
  private static async mergeNovelWithLocalContent(
    remoteNovel: Novel,
    localNovel: Novel,
  ): Promise<Novel> {
    // 使用远程书籍的元数据，但保留本地书籍的章节内容
    const mergedNovel: Novel = {
      ...remoteNovel,
      // 保留本地书籍的创建时间（如果远程没有）
      createdAt: remoteNovel.createdAt || localNovel.createdAt,
    };

    // 如果远程书籍有 volumes，需要合并章节内容
    if (remoteNovel.volumes && localNovel.volumes) {
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
                  let contentToPreserve: Paragraph[] | undefined = undefined;

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

          return remoteVolume as Volume;
        }),
      );
    }

    return mergedNovel;
  }
}
