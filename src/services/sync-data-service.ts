import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { GistSyncData } from 'src/services/gist-sync-service';
import { GlobalConfig } from 'src/services/global-config-cache';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import type { Novel, Volume, Chapter, Paragraph, Translation } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { DeletionRecord } from 'src/models/sync';
import { isEqual, omit } from 'lodash';
import { isTimeDifferent, isNewlyAdded as checkIsNewlyAdded } from 'src/utils/time-utils';

/**
 * 合并段落翻译
 * 将远程段落的翻译合并到本地段落中
 * @param localParagraphs 本地段落列表
 * @param remoteParagraphs 远程段落列表
 * @returns 合并后的段落列表
 */
function mergeParagraphTranslations(
  localParagraphs: Paragraph[],
  remoteParagraphs: Paragraph[] | undefined,
): Paragraph[] {
  // 如果远程没有段落，直接返回本地段落
  if (!remoteParagraphs || remoteParagraphs.length === 0) {
    return localParagraphs;
  }

  // 创建远程段落的映射（按 ID）
  const remoteParagraphMap = new Map<string, Paragraph>();
  for (const remotePara of remoteParagraphs) {
    remoteParagraphMap.set(remotePara.id, remotePara);
  }

  // 合并翻译到本地段落
  const mergedParagraphs: Paragraph[] = localParagraphs.map((localPara) => {
    const remotePara = remoteParagraphMap.get(localPara.id);

    // 如果远程没有对应段落，保持本地段落不变
    if (!remotePara) {
      return localPara;
    }

    // 如果远程段落没有翻译，保持本地段落不变
    if (!remotePara.translations || remotePara.translations.length === 0) {
      return localPara;
    }

    // 合并翻译：将远程翻译添加到本地翻译中（去重）
    const localTranslationIds = new Set((localPara.translations || []).map((t) => t.id));

    const mergedTranslations: Translation[] = [...(localPara.translations || [])];

    for (const remoteTranslation of remotePara.translations) {
      // 如果本地没有这个翻译 ID，添加它
      if (!localTranslationIds.has(remoteTranslation.id)) {
        mergedTranslations.push(remoteTranslation);
      }
    }

    // 确定 selectedTranslationId
    // 优先使用远程的 selectedTranslationId（如果远程有翻译且本地没有选择的翻译）
    let selectedTranslationId = localPara.selectedTranslationId;

    // 如果本地没有选择翻译，或者选择的翻译不存在于合并后的翻译列表中
    const selectedTranslationExists = mergedTranslations.some(
      (t) => t.id === selectedTranslationId,
    );

    if (!selectedTranslationId || !selectedTranslationExists) {
      // 使用远程的 selectedTranslationId（如果存在于合并后的翻译列表中）
      if (
        remotePara.selectedTranslationId &&
        mergedTranslations.some((t) => t.id === remotePara.selectedTranslationId)
      ) {
        selectedTranslationId = remotePara.selectedTranslationId;
      } else if (mergedTranslations.length > 0 && mergedTranslations[0]) {
        // 否则使用第一个翻译
        selectedTranslationId = mergedTranslations[0].id;
      }
    }

    return {
      ...localPara,
      translations: mergedTranslations,
      selectedTranslationId,
    };
  });

  return mergedParagraphs;
}

/**
 * 将远程翻译合并到本地书籍中
 * 当本地书籍较新时使用，保留本地结构但合并远程翻译
 * @param localNovel 本地书籍数据（较新）
 * @param remoteNovel 远程书籍数据（可能有新翻译）
 * @returns 合并后的书籍数据
 */
async function mergeRemoteTranslationsIntoLocalNovel(
  localNovel: Novel,
  remoteNovel: Novel | undefined,
): Promise<Novel> {
  // 如果远程没有书籍，直接返回本地书籍
  if (!remoteNovel) {
    return localNovel;
  }

  // 如果本地或远程没有 volumes，直接返回本地书籍
  if (
    !localNovel.volumes ||
    localNovel.volumes.length === 0 ||
    !remoteNovel.volumes ||
    remoteNovel.volumes.length === 0
  ) {
    return localNovel;
  }

  // 创建远程卷和章节的映射
  const remoteVolumeMap = new Map<string, Volume>();
  const remoteChapterMap = new Map<string, Chapter>();

  for (const volume of remoteNovel.volumes) {
    remoteVolumeMap.set(volume.id, volume);
    if (volume.chapters) {
      for (const chapter of volume.chapters) {
        remoteChapterMap.set(chapter.id, chapter);
      }
    }
  }

  // 合并翻译到本地书籍
  const mergedVolumes = await Promise.all(
    localNovel.volumes.map(async (localVolume) => {
      if (!localVolume.chapters || localVolume.chapters.length === 0) {
        return localVolume;
      }

      const mergedChapters = await Promise.all(
        localVolume.chapters.map(async (localChapter) => {
          const remoteChapter = remoteChapterMap.get(localChapter.id);

          // 如果远程没有这个章节，保持本地章节不变
          if (!remoteChapter) {
            return localChapter;
          }

          // 获取本地章节内容
          let localContent: Paragraph[] | undefined;
          if (
            localChapter.content !== undefined &&
            localChapter.content !== null &&
            Array.isArray(localChapter.content) &&
            localChapter.content.length > 0
          ) {
            localContent = localChapter.content;
          } else {
            // 从 IndexedDB 加载本地内容
            localContent = await ChapterContentService.loadChapterContent(localChapter.id);
          }

          // 如果本地没有内容，保持不变
          if (!localContent || localContent.length === 0) {
            return localChapter;
          }

          // 获取远程章节内容
          const remoteContent = remoteChapter.content;

          // 合并翻译
          const mergedContent = mergeParagraphTranslations(localContent, remoteContent);

          return {
            ...localChapter,
            content: mergedContent,
          };
        }),
      );

      return {
        ...localVolume,
        chapters: mergedChapters,
      };
    }),
  );

  return {
    ...localNovel,
    volumes: mergedVolumes,
  };
}

/**
 * 可恢复的项目接口
 */
export interface RestorableItem {
  id: string;
  type: 'novel' | 'model' | 'cover';
  title: string;
  deletedAt: number;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * 规范化封面 URL（用于跨设备去重/删除）
 */
function normalizeCoverUrl(url: unknown): string {
  return typeof url === 'string' ? url.trim() : '';
}

/**
 * 按 URL 去重封面历史：同一 URL 只保留 addedAt 最新的那条
 */
function dedupeCoverHistoryByUrl(
  covers: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const cover of covers) {
    const url = normalizeCoverUrl(cover?.url);
    if (!url) continue;
    const existing = map.get(url);
    if (!existing) {
      map.set(url, cover);
      continue;
    }
    const existingTime = existing?.addedAt ? new Date(existing.addedAt).getTime() : 0;
    const currentTime = cover?.addedAt ? new Date(cover.addedAt).getTime() : 0;
    if (currentTime >= existingTime) {
      map.set(url, cover);
    }
  }
  return Array.from(map.values());
}

/**
 * 数据备份接口（用于回滚）
 */
interface DataBackup {
  models: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  books: Novel[];
  covers: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  settings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  gistSync: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * 同步数据服务
 * 处理上传/下载配置的通用逻辑
 */
export class SyncDataService {
  /**
   * 验证远程数据的完整性
   * @param remoteData 远程数据
   * @returns 验证是否通过
   */
  private static validateRemoteData(
    remoteData: {
      novels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    } | null,
  ): boolean {
    if (!remoteData) {
      return true; // null 数据是有效的（表示没有远程数据）
    }

    // 验证 novels 数组
    if (remoteData.novels !== null && remoteData.novels !== undefined) {
      if (!Array.isArray(remoteData.novels)) {
        console.error('[SyncDataService] 验证失败: novels 必须是数组');
        return false;
      }
      // 验证每个 novel 的基本结构
      for (const novel of remoteData.novels) {
        if (!novel || typeof novel !== 'object') {
          console.error('[SyncDataService] 验证失败: novel 必须是对象');
          return false;
        }
        if (!novel.id || typeof novel.id !== 'string') {
          console.error('[SyncDataService] 验证失败: novel 必须包含有效的 id');
          return false;
        }
      }
    }

    // 验证 aiModels 数组
    if (remoteData.aiModels !== null && remoteData.aiModels !== undefined) {
      if (!Array.isArray(remoteData.aiModels)) {
        console.error('[SyncDataService] 验证失败: aiModels 必须是数组');
        return false;
      }
      // 验证每个 model 的基本结构
      for (const model of remoteData.aiModels) {
        if (!model || typeof model !== 'object') {
          console.error('[SyncDataService] 验证失败: model 必须是对象');
          return false;
        }
        if (!model.id || typeof model.id !== 'string') {
          console.error('[SyncDataService] 验证失败: model 必须包含有效的 id');
          return false;
        }
      }
    }

    // 验证 coverHistory 数组
    if (remoteData.coverHistory !== null && remoteData.coverHistory !== undefined) {
      if (!Array.isArray(remoteData.coverHistory)) {
        console.error('[SyncDataService] 验证失败: coverHistory 必须是数组');
        return false;
      }
      // 验证每个 cover 的基本结构
      for (const cover of remoteData.coverHistory) {
        if (!cover || typeof cover !== 'object') {
          console.error('[SyncDataService] 验证失败: cover 必须是对象');
          return false;
        }
        if (!cover.id || typeof cover.id !== 'string') {
          console.error('[SyncDataService] 验证失败: cover 必须包含有效的 id');
          return false;
        }
      }
    }

    // 验证 memories 数组
    if (remoteData.memories !== null && remoteData.memories !== undefined) {
      if (!Array.isArray(remoteData.memories)) {
        console.error('[SyncDataService] 验证失败: memories 必须是数组');
        return false;
      }
      // 验证每个 memory 的基本结构
      for (const memory of remoteData.memories) {
        if (!memory || typeof memory !== 'object') {
          console.error('[SyncDataService] 验证失败: memory 必须是对象');
          return false;
        }
        if (!memory.id || typeof memory.id !== 'string') {
          console.error('[SyncDataService] 验证失败: memory 必须包含有效的 id');
          return false;
        }
        if (!memory.bookId || typeof memory.bookId !== 'string') {
          console.error('[SyncDataService] 验证失败: memory 必须包含有效的 bookId');
          return false;
        }
      }
    }

    // appSettings 可以是任何对象，不需要严格验证
    return true;
  }

  /**
   * 创建数据备份（用于回滚）
   */
  private static createBackup(): DataBackup {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settings = GlobalConfig.getAllSettingsSnapshot();
    const gistSync = GlobalConfig.getGistSyncSnapshot();

    return {
      models: JSON.parse(JSON.stringify(aiModelsStore.models)),
      books: JSON.parse(JSON.stringify(booksStore.books)),
      covers: JSON.parse(JSON.stringify(coverHistoryStore.covers)),
      settings: JSON.parse(JSON.stringify(settings ?? {})),
      gistSync: JSON.parse(JSON.stringify(gistSync ?? {})),
    };
  }

  /**
   * 从备份恢复数据（回滚操作）
   */
  private static async restoreFromBackup(backup: DataBackup): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

    console.warn('[SyncDataService] 正在从备份恢复数据...');

    try {
      // 恢复 AI 模型
      await aiModelsStore.clearModels();
      for (const model of backup.models) {
        await aiModelsStore.addModel(model);
      }

      // 恢复书籍
      await booksStore.clearBooks();
      await booksStore.bulkAddBooks(backup.books);

      // 恢复封面历史
      await coverHistoryStore.clearHistory();
      for (const cover of backup.covers) {
        await coverHistoryStore.addCover(cover);
      }

      // 恢复设置
      await settingsStore.importSettings(backup.settings);
      await settingsStore.updateGistSync(backup.gistSync);

      console.log('[SyncDataService] 数据恢复完成');
    } catch (restoreError) {
      console.error('[SyncDataService] 恢复数据失败:', restoreError);
      throw new Error('数据恢复失败，请检查本地数据完整性');
    }
  }

  /**
   * 应用下载的数据（总是使用最新的 lastEdited 时间）
   * 包含回滚机制，确保数据完整性
   * @param remoteData 远程数据
   * @param lastSyncTime 上次同步时间（可选）
   * @param isManualRetrieval 是否为手动检索（默认 false）。如果为 true，会保留所有远程书籍，即使它们的 lastEdited 时间早于 lastSyncTime
   * @returns 如果是手动检索，返回可恢复的项目列表；否则返回空数组
   */
  static async applyDownloadedData(
    remoteData: {
      novels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    } | null,
    lastSyncTime?: number,
    isManualRetrieval = false,
  ): Promise<RestorableItem[]> {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    // 如果 remoteData 为 null，直接返回
    if (!remoteData) {
      return [];
    }

    // 验证远程数据的完整性
    if (!SyncDataService.validateRemoteData(remoteData)) {
      console.error('[SyncDataService] 远程数据验证失败，拒绝应用数据');
      throw new Error('远程数据格式无效，无法应用');
    }

    // 创建数据备份（用于回滚）
    const backup = SyncDataService.createBackup();

    const restorableItems: RestorableItem[] = [];

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

    // 如果没有传入 lastSyncTime，从设置中获取
    const gistSyncSnapshot = GlobalConfig.getGistSyncSnapshot();
    const syncTime = lastSyncTime ?? gistSyncSnapshot?.lastSyncTime ?? 0;

    try {
      // 辅助函数：决定是否使用远程数据（总是使用最新的 lastEdited 时间）
      const shouldUseRemote = (
        localLastEdited?: Date | number | string,
        remoteLastEdited?: Date | number | string,
      ): boolean => {
        if (localLastEdited && remoteLastEdited) {
          const localTime = new Date(localLastEdited).getTime();
          const remoteTime = new Date(remoteLastEdited).getTime();
          return remoteTime > localTime;
        }
        // 如果缺少时间戳，默认使用远程（假设远程是新的）
        return true;
      };

      // 处理 AI 模型（确保 aiModels 是数组）
      // 使用删除记录列表来判断是否恢复已删除的模型
      // 注意：即使远程列表为空，也需要处理本地独有的模型
      if (remoteData.aiModels && Array.isArray(remoteData.aiModels)) {
        const finalModels: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        const deletedModelIds = gistSyncSnapshot?.deletedModelIds || [];
        const deletedModelIdsMap = new Map<string, number>(
          deletedModelIds.map((record) => [record.id, record.deletedAt]),
        );

        // 收集所有远程模型（使用最新的 lastEdited 时间）
        for (const remoteModel of remoteData.aiModels) {
          const localModel = aiModelsStore.models.find((m) => m.id === remoteModel.id);
          if (localModel) {
            if (isManualRetrieval) {
              finalModels.push(remoteModel);
              continue;
            }
            // 比较 lastEdited 时间，使用最新的
            const localTime = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
            const remoteTime = remoteModel.lastEdited
              ? new Date(remoteModel.lastEdited).getTime()
              : 0;
            if (remoteTime > localTime) {
              finalModels.push(remoteModel);
            } else {
              finalModels.push(localModel);
            }
          } else {
            // 本地不存在，检查是否在删除记录中
            const deletionRecord = deletedModelIdsMap.get(remoteModel.id);
            if (deletionRecord !== undefined) {
              // 在删除记录中，检查删除时间
              // deletionRecord 是 number 类型（deletedAt 时间戳）
              if (deletionRecord > syncTime) {
                // 删除时间晚于上次同步时间，说明是本地删除的，不恢复
                // 除非是手动检索
                if (isManualRetrieval) {
                  // 手动检索时，收集可恢复的项目
                  restorableItems.push({
                    id: remoteModel.id,
                    type: 'model',
                    title: (remoteModel as any).name || remoteModel.id, // eslint-disable-line @typescript-eslint/no-explicit-any
                    deletedAt: deletionRecord,
                    data: remoteModel,
                  });
                }
                // 自动同步时不恢复
              } else {
                // 删除时间早于或等于上次同步时间，可能是旧删除，检查远程是否有更新
                if (remoteModel.lastEdited) {
                  const remoteTime = new Date(remoteModel.lastEdited).getTime();
                  if (remoteTime > syncTime) {
                    // 远程有更新，恢复（从删除记录中移除）
                    finalModels.push(remoteModel);
                    // 从删除记录中移除
                    const updatedDeletedModelIds = deletedModelIds.filter(
                      (record) => record.id !== remoteModel.id,
                    );
                    await settingsStore.updateGistSync({
                      deletedModelIds: updatedDeletedModelIds,
                    });
                  }
                }
              }
            } else {
              // 不在删除记录中，检查是否是远程新添加的
              // 如果是首次同步（syncTime === 0），应用所有远程模型
              // 如果是手动检索（isManualRetrieval），应用所有远程模型
              // 否则检查 lastEdited 时间
              if (
                syncTime === 0 ||
                isManualRetrieval ||
                (remoteModel.lastEdited && checkIsNewlyAdded(remoteModel.lastEdited, syncTime))
              ) {
                // 远程新添加的模型，保留
                finalModels.push(remoteModel);
              }
            }
          }
        }

        // 添加本地独有的模型
        // 只保留在上次同步后新添加的本地模型（lastEdited > lastSyncTime）
        // 陈旧的本地模型（lastEdited <= lastSyncTime）会被自动删除，因为远程已删除
        // 但如果远程模型列表为空，保留所有本地模型（避免误删除）
        for (const localModel of aiModelsStore.models) {
          if (!remoteData.aiModels.find((m) => m.id === localModel.id)) {
            // 检查是否是本地新增的（在上次同步后添加）
            // 如果远程模型列表为空，保留所有本地模型
            // 注意：isManualRetrieval 不应该影响是否删除远程已删除的模型
            if (
              remoteData.aiModels.length === 0 ||
              (localModel.lastEdited && checkIsNewlyAdded(localModel.lastEdited, syncTime))
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
      // 即使远程书籍列表为空，也需要处理（可能远程删除了所有书籍）
      if (remoteData.novels && Array.isArray(remoteData.novels)) {
        const finalBooks: Novel[] = [];

        // 收集所有远程书籍（使用最新的 lastEdited 时间）
        for (const remoteNovel of remoteData.novels) {
          const localNovel = booksStore.books.find((b) => b.id === remoteNovel.id);
          if (localNovel) {
            // 比较 lastEdited 时间，使用最新的
            if (shouldUseRemote(localNovel.lastEdited, remoteNovel.lastEdited)) {
              // 使用远程书籍，但需要保留本地章节内容
              const mergedNovel = await SyncDataService.mergeNovelWithLocalContent(
                remoteNovel as Novel,
                localNovel,
              );
              finalBooks.push(mergedNovel);
            } else {
              // 使用本地书籍，但需要合并远程翻译（远程可能有新翻译）
              const localNovelWithContent =
                await SyncDataService.ensureNovelContentLoaded(localNovel);
              // 合并远程翻译到本地书籍
              const mergedNovel = await mergeRemoteTranslationsIntoLocalNovel(
                localNovelWithContent,
                remoteNovel as Novel,
              );
              finalBooks.push(mergedNovel);
            }
          } else {
            // 本地不存在，检查是否在删除记录中
            const deletedNovelIds = gistSyncSnapshot?.deletedNovelIds || [];
            const deletedNovelIdsMap = new Map<string, number>(
              deletedNovelIds.map((record) => [record.id, record.deletedAt]),
            );
            const deletionRecord = deletedNovelIdsMap.get(remoteNovel.id);

            if (deletionRecord !== undefined) {
              // 在删除记录中，检查删除时间
              // deletionRecord 是 number 类型（deletedAt 时间戳）
              if (deletionRecord > syncTime) {
                // 删除时间晚于上次同步时间，说明是本地删除的，不恢复
                // 除非是手动检索
                if (isManualRetrieval) {
                  // 手动检索时，收集可恢复的项目
                  restorableItems.push({
                    id: remoteNovel.id,
                    type: 'novel',
                    title: (remoteNovel as Novel).title || remoteNovel.id,
                    deletedAt: deletionRecord,
                    data: remoteNovel,
                  });
                }
                // 自动同步时不恢复
              } else {
                // 删除时间早于或等于上次同步时间，可能是旧删除，检查远程是否有更新
                const remoteTime = new Date(remoteNovel.lastEdited).getTime();
                if (remoteTime > syncTime) {
                  // 远程有更新，恢复（从删除记录中移除）
                  finalBooks.push(remoteNovel as Novel);
                  // 从删除记录中移除
                  const updatedDeletedNovelIds = deletedNovelIds.filter(
                    (record) => record.id !== remoteNovel.id,
                  );
                  await settingsStore.updateGistSync({
                    deletedNovelIds: updatedDeletedNovelIds,
                  });
                }
              }
            } else {
              // 不在删除记录中，检查是否是远程新添加的
              // 如果是首次同步（syncTime === 0），应用所有远程书籍
              // 如果本地书籍列表为空（可能是手动清空后恢复），应用所有远程书籍
              // 否则只保留在上次同步后新添加的远程书籍（lastEdited > lastSyncTime）
              if (
                syncTime === 0 ||
                booksStore.books.length === 0 ||
                isManualRetrieval ||
                checkIsNewlyAdded(remoteNovel.lastEdited, syncTime)
              ) {
                // 远程新添加的书籍，保留
                finalBooks.push(remoteNovel as Novel);
              }
            }
          }
        }

        // 添加本地独有的书籍
        // 只保留在上次同步后新添加的本地书籍（lastEdited > lastSyncTime）
        // 陈旧的本地书籍（lastEdited <= lastSyncTime）会被自动删除，因为远程已删除
        // 但如果远程书籍列表为空（可能是远程删除了所有书籍），保留所有本地书籍
        for (const localBook of booksStore.books) {
          if (!remoteData.novels.find((n) => n.id === localBook.id)) {
            // 检查是否是本地新增的（在上次同步后添加）
            // 如果远程书籍列表为空，保留所有本地书籍（可能是远程删除了所有书籍）
            // 注意：isManualRetrieval 不应该影响是否删除远程已删除的书籍
            if (
              remoteData.novels.length === 0 ||
              checkIsNewlyAdded(localBook.lastEdited, syncTime)
            ) {
              // 本地新增的书籍，保留（确保章节内容已加载）
              const localBookWithContent =
                await SyncDataService.ensureNovelContentLoaded(localBook);
              finalBooks.push(localBookWithContent);
            }
            // 如果不在上次同步后添加，说明是陈旧的本地书籍，不添加（自动删除）
          }
        }

        await booksStore.clearBooks();
        await booksStore.bulkAddBooks(finalBooks);
      }

      // 处理封面历史（确保 coverHistory 是数组）
      // 注意：即使远程列表为空，也需要处理本地独有的封面
      if (remoteData.coverHistory && Array.isArray(remoteData.coverHistory)) {
        const finalCovers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        const deletedCoverIds = gistSyncSnapshot?.deletedCoverIds || [];
        const deletedCoverIdsMap = new Map<string, number>(
          deletedCoverIds.map((record) => [record.id, record.deletedAt]),
        );
        const deletedCoverUrls = gistSyncSnapshot?.deletedCoverUrls || [];
        const deletedCoverUrlsMap = new Map<string, number>(
          deletedCoverUrls.map((record: any) => [normalizeCoverUrl(record.url), record.deletedAt]), // eslint-disable-line @typescript-eslint/no-explicit-any
        );

        for (const remoteCover of remoteData.coverHistory) {
          const remoteUrl = normalizeCoverUrl(remoteCover?.url);
          const localCover =
            coverHistoryStore.covers.find((c) => c.id === remoteCover.id) ||
            (remoteUrl
              ? coverHistoryStore.covers.find((c) => normalizeCoverUrl(c.url) === remoteUrl)
              : undefined);
          if (localCover) {
            // 比较 addedAt 时间，使用最新的
            if (shouldUseRemote(localCover.addedAt, remoteCover.addedAt)) {
              finalCovers.push(remoteCover);
            } else {
              finalCovers.push(localCover);
            }
          } else {
            // 本地不存在，检查是否在删除记录中
            const deletionRecordById = deletedCoverIdsMap.get(remoteCover.id);
            const deletionRecordByUrl = remoteUrl ? deletedCoverUrlsMap.get(remoteUrl) : undefined;
            const deletionRecord =
              deletionRecordById !== undefined && deletionRecordByUrl !== undefined
                ? Math.max(deletionRecordById, deletionRecordByUrl)
                : (deletionRecordById ?? deletionRecordByUrl);
            if (deletionRecord !== undefined) {
              // 在删除记录中，检查删除时间
              // deletionRecord 是 number 类型（deletedAt 时间戳）
              if (deletionRecord > syncTime) {
                // 删除时间晚于上次同步时间，说明是本地删除的，不恢复
                // 除非是手动检索
                if (isManualRetrieval) {
                  // 手动检索时，收集可恢复的项目
                  restorableItems.push({
                    id: remoteCover.id,
                    type: 'cover',
                    title: (remoteCover as any).url || remoteCover.id, // eslint-disable-line @typescript-eslint/no-explicit-any
                    deletedAt: deletionRecord,
                    data: remoteCover,
                  });
                }
                // 自动同步时不恢复
              } else {
                // 删除时间早于或等于上次同步时间，可能是旧删除，检查远程是否有更新
                const remoteTime = new Date(remoteCover.addedAt).getTime();
                if (remoteTime > syncTime) {
                  // 远程有更新，恢复（从删除记录中移除）
                  finalCovers.push(remoteCover);
                  // 从删除记录中移除（按 id / 按 url）
                  const updatedDeletedCoverIds = deletedCoverIds.filter(
                    (record) => record.id !== remoteCover.id,
                  );
                  const updatedDeletedCoverUrls = remoteUrl
                    ? deletedCoverUrls.filter(
                        (record: any) => normalizeCoverUrl(record.url) !== remoteUrl,
                      ) // eslint-disable-line @typescript-eslint/no-explicit-any
                    : deletedCoverUrls;
                  await settingsStore.updateGistSync({
                    deletedCoverIds: updatedDeletedCoverIds,
                    deletedCoverUrls: updatedDeletedCoverUrls,
                  });
                }
              }
            } else {
              // 不在删除记录中，检查是否是远程新添加的
              // 如果是首次同步（syncTime === 0），应用所有远程封面
              // 如果是手动检索（isManualRetrieval），应用所有远程封面
              // 否则只保留在上次同步后新添加的远程封面（addedAt > lastSyncTime）
              if (
                syncTime === 0 ||
                isManualRetrieval ||
                checkIsNewlyAdded(remoteCover.addedAt, syncTime)
              ) {
                // 远程新添加的封面，保留
                finalCovers.push(remoteCover);
              }
            }
          }
        }

        // 添加本地独有的封面
        // 只保留在上次同步后新添加的本地封面（addedAt > lastSyncTime）
        // 陈旧的本地封面（addedAt <= lastSyncTime）会被自动删除，因为远程已删除
        // 但如果远程封面列表为空，保留所有本地封面（避免误删除）
        for (const localCover of coverHistoryStore.covers) {
          const localUrl = normalizeCoverUrl(localCover?.url);
          const existsInRemote =
            !!remoteData.coverHistory.find((c) => c.id === localCover.id) ||
            (localUrl
              ? !!remoteData.coverHistory.find(
                  (c) => normalizeCoverUrl((c as any)?.url) === localUrl,
                )
              : false); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!existsInRemote) {
            // 检查是否是本地新增的（在上次同步后添加）
            // 如果远程封面列表为空，保留所有本地封面
            // 注意：isManualRetrieval 不应该影响是否删除远程已删除的封面
            if (
              remoteData.coverHistory.length === 0 ||
              checkIsNewlyAdded(localCover.addedAt, syncTime)
            ) {
              // 本地新增的封面，保留
              finalCovers.push(localCover);
            }
            // 如果不在上次同步后添加，说明是陈旧的本地封面，不添加（自动删除）
          }
        }

        // 按 URL 去重（跨设备：同一 URL 可能有不同 id）
        const deduped = dedupeCoverHistoryByUrl(finalCovers);

        await coverHistoryStore.clearHistory();
        for (const cover of deduped) {
          await coverHistoryStore.addCover(cover);
        }
      }

      // 处理 Memory（确保 memories 是数组）
      // 即使远程 Memory 列表为空，也需要处理（可能远程删除了所有 Memory）
      if (remoteData.memories && Array.isArray(remoteData.memories)) {
        // 将远程 Memory 按 bookId 分组
        const remoteMemoriesByBook = new Map<string, Memory[]>();
        for (const remoteMemory of remoteData.memories) {
          const bookId = remoteMemory.bookId;
          if (!remoteMemoriesByBook.has(bookId)) {
            remoteMemoriesByBook.set(bookId, []);
          }
          remoteMemoriesByBook.get(bookId)!.push(remoteMemory);
        }

        // 遍历所有本地书籍，合并 Memory
        for (const localBook of booksStore.books) {
          const remoteMemories = remoteMemoriesByBook.get(localBook.id);
          if (!remoteMemories || remoteMemories.length === 0) {
            // 远程没有该书籍的 Memory，保留本地 Memory
            continue;
          }

          // 获取本地 Memory
          const localMemories = await MemoryService.getAllMemories(localBook.id);

          // 创建远程 Memory 的映射（按 ID）
          const remoteMemoryMap = new Map<string, Memory>();
          for (const remoteMemory of remoteMemories) {
            remoteMemoryMap.set(remoteMemory.id, remoteMemory);
          }

          // 合并 Memory：保留最新的 lastAccessedAt 时间
          for (const localMemory of localMemories) {
            const remoteMemory = remoteMemoryMap.get(localMemory.id);
            if (remoteMemory) {
              // 比较最后访问时间，使用最新的
              if (remoteMemory.lastAccessedAt > localMemory.lastAccessedAt) {
                // 远程更新，更新本地 Memory
                try {
                  await MemoryService.updateMemory(
                    localBook.id,
                    remoteMemory.id,
                    remoteMemory.content,
                    remoteMemory.summary,
                  );
                } catch (error) {
                  console.warn(
                    `[SyncDataService] 更新 Memory ${remoteMemory.id} 失败:`,
                    error,
                  );
                }
              }
              // 从远程列表中移除已处理的 Memory
              remoteMemoryMap.delete(localMemory.id);
            }
            // 如果本地没有对应的远程 Memory，保持不变（本地独有的 Memory）
          }

          // 添加远程独有的 Memory
          for (const remoteMemory of remoteMemoryMap.values()) {
            try {
              await MemoryService.createMemory(
                remoteMemory.bookId,
                remoteMemory.content,
                remoteMemory.summary,
              );
            } catch (error) {
              console.warn(
                `[SyncDataService] 创建 Memory ${remoteMemory.id} 失败:`,
                error,
              );
            }
          }
        }
      }

      // 处理设置
      if (remoteData.appSettings) {
        const localSettings = GlobalConfig.getAllSettingsSnapshot() ?? ({} as any);
        // 手动检索时强制使用远程设置，否则比较 lastEdited
        const shouldApplyRemoteSettings =
          isManualRetrieval ||
          shouldUseRemote(localSettings.lastEdited, remoteData.appSettings.lastEdited);
        if (shouldApplyRemoteSettings) {
          // 保存本地的 Gist 同步配置（包括同步状态）
          const currentGistSync = GlobalConfig.getGistSyncSnapshot();
          await settingsStore.importSettings(remoteData.appSettings);
          // 恢复本地的 Gist 同步配置，确保本地同步状态不被覆盖
          if (currentGistSync) {
            await settingsStore.updateGistSync(currentGistSync);
          }
        }
      }

      // 合并删除记录（从远程设置中获取）
      // 删除记录存储在 appSettings.syncs 中
      if (remoteData.appSettings?.syncs) {
        const remoteSyncs = remoteData.appSettings.syncs;
        const gistSync = remoteSyncs.find((s: any) => s.syncType === 'gist'); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (gistSync) {
          const localGistSync = (GlobalConfig.getGistSyncSnapshot() ?? {}) as any;

          // 合并删除记录：保留最新的删除时间戳
          const mergeDeletionRecords = (
            local: DeletionRecord[] = [],
            remote: DeletionRecord[] = [],
          ): DeletionRecord[] => {
            const mergedMap = new Map<string, DeletionRecord>();

            // 添加本地删除记录
            for (const record of local) {
              mergedMap.set(record.id, record);
            }

            // 合并远程删除记录（保留最新的删除时间）
            for (const record of remote) {
              const existing = mergedMap.get(record.id);
              if (!existing || record.deletedAt > existing.deletedAt) {
                mergedMap.set(record.id, record);
              }
            }

            return Array.from(mergedMap.values());
          };

          // 合并按 URL 的删除记录（用于封面）
          const mergeUrlDeletionRecords = (
            local: Array<{ url: string; deletedAt: number }> = [],
            remote: Array<{ url: string; deletedAt: number }> = [],
          ): Array<{ url: string; deletedAt: number }> => {
            const mergedMap = new Map<string, { url: string; deletedAt: number }>();

            for (const record of local) {
              const key = normalizeCoverUrl(record.url);
              if (key) mergedMap.set(key, { url: key, deletedAt: record.deletedAt });
            }

            for (const record of remote) {
              const key = normalizeCoverUrl(record.url);
              if (!key) continue;
              const existing = mergedMap.get(key);
              if (!existing || record.deletedAt > existing.deletedAt) {
                mergedMap.set(key, { url: key, deletedAt: record.deletedAt });
              }
            }

            return Array.from(mergedMap.values());
          };

          const mergedDeletedNovelIds = mergeDeletionRecords(
            localGistSync.deletedNovelIds,
            gistSync.deletedNovelIds,
          );
          const mergedDeletedModelIds = mergeDeletionRecords(
            localGistSync.deletedModelIds,
            gistSync.deletedModelIds,
          );
          const mergedDeletedCoverIds = mergeDeletionRecords(
            localGistSync.deletedCoverIds,
            gistSync.deletedCoverIds,
          );
          const mergedDeletedCoverUrls = mergeUrlDeletionRecords(
            (localGistSync as any).deletedCoverUrls, // eslint-disable-line @typescript-eslint/no-explicit-any
            (gistSync as any).deletedCoverUrls, // eslint-disable-line @typescript-eslint/no-explicit-any
          );

          // 更新删除记录
          await settingsStore.updateGistSync({
            deletedNovelIds: mergedDeletedNovelIds,
            deletedModelIds: mergedDeletedModelIds,
            deletedCoverIds: mergedDeletedCoverIds,
            deletedCoverUrls: mergedDeletedCoverUrls,
          });
        }
      }

      // 清理旧的删除记录（每次同步时都清理，避免记录无限增长）
      await settingsStore.cleanupOldDeletionRecords();

      // 返回可恢复的项目（仅在手动检索时）
      return isManualRetrieval ? restorableItems : [];
    } catch (error) {
      // 发生错误，回滚到备份数据
      console.error('[SyncDataService] 应用下载数据时发生错误，正在回滚:', error);

      try {
        await SyncDataService.restoreFromBackup(backup);
      } catch (rollbackError) {
        console.error('[SyncDataService] 回滚失败:', rollbackError);
        // 回滚也失败了，抛出原始错误和回滚错误
        throw new Error(
          `应用数据失败: ${error instanceof Error ? error.message : String(error)}; ` +
            `回滚也失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }

      // 回滚成功，重新抛出原始错误
      throw error;
    }
  }

  /**
   * 创建安全的远程数据对象（确保 novels 和 aiModels 是数组）
   */
  static createSafeRemoteData(data: GistSyncData | null | undefined): {
    novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    memories: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  } {
    if (!data) {
      return {
        novels: [],
        aiModels: [],
        coverHistory: [],
        memories: [],
      };
    }
    return {
      novels: Array.isArray(data.novels) ? data.novels : [],
      aiModels: Array.isArray(data.aiModels) ? data.aiModels : [],
      appSettings: data.appSettings,
      coverHistory: Array.isArray(data.coverHistory) ? data.coverHistory : [],
      memories: Array.isArray(data.memories) ? data.memories : [],
    };
  }

  /**
   * 合并本地数据和远程数据，用于上传
   * 返回合并后的数据，不修改 store
   * @param localData 本地数据
   * @param remoteData 远程数据
   * @param lastSyncTime 上次同步时间
   * @returns 合并后的数据
   */
  static async mergeDataForUpload(
    localData: {
      novels: Novel[];
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: Memory[];
    },
    remoteData: {
      novels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    } | null,
    lastSyncTime: number,
  ): Promise<{
    novels: Novel[];
    aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    memories: Memory[];
  }> {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });

    if (!remoteData) {
      // 没有远程数据，直接返回本地数据
      return {
        novels: localData.novels,
        aiModels: localData.aiModels,
        appSettings: localData.appSettings,
        coverHistory: localData.coverHistory,
        memories: localData.memories || [],
      };
    }

    // 辅助函数：决定是否使用远程数据（总是使用最新的 lastEdited 时间）
    const shouldUseRemote = (
      localLastEdited?: Date | number | string,
      remoteLastEdited?: Date | number | string,
    ): boolean => {
      if (localLastEdited && remoteLastEdited) {
        const localTime = new Date(localLastEdited).getTime();
        const remoteTime = new Date(remoteLastEdited).getTime();
        return remoteTime > localTime;
      }
      // 如果缺少时间戳，默认使用本地（因为我们要上传）
      return false;
    };

    // 获取删除记录，用于检查远程独有项是否在本地被删除过
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const deletedModelIds = gistSync?.deletedModelIds || [];
    const deletedModelIdsMap = new Map<string, number>(
      deletedModelIds.map((record) => [record.id, record.deletedAt]),
    );
    const deletedNovelIds = gistSync?.deletedNovelIds || [];
    const deletedNovelIdsMap = new Map<string, number>(
      deletedNovelIds.map((record) => [record.id, record.deletedAt]),
    );
    const deletedCoverIds = gistSync?.deletedCoverIds || [];
    const deletedCoverIdsMap = new Map<string, number>(
      deletedCoverIds.map((record) => [record.id, record.deletedAt]),
    );
    const deletedCoverUrls = gistSync?.deletedCoverUrls || [];
    const deletedCoverUrlsMap = new Map<string, number>(
      deletedCoverUrls.map((record: any) => [normalizeCoverUrl(record.url), record.deletedAt]), // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    // 合并 AI 模型
    const finalModels: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const remoteModels = remoteData.aiModels || [];
    const remoteModelMap = new Map(remoteModels.map((m: any) => [m.id, m])); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 特殊处理：如果远程模型列表为空，但本地存在模型
    // 旧逻辑只上传“上次同步后新增”的本地模型，会导致远端空列表无法被本地补齐
    // 在这种场景下，优先用本地全量模型进行恢复，避免用户看到“模型不同步”
    if (remoteModels.length === 0 && localData.aiModels.length > 0) {
      finalModels.push(...localData.aiModels);
    } else {
      // 处理远程和本地都有的模型
      for (const localModel of localData.aiModels) {
        const remoteModel = remoteModelMap.get(localModel.id);
        if (remoteModel) {
          if (shouldUseRemote(localModel.lastEdited, remoteModel.lastEdited)) {
            finalModels.push(remoteModel);
          } else {
            finalModels.push(localModel);
          }
        } else {
          // 本地独有的模型，检查是否是新增的
          if (localModel.lastEdited && checkIsNewlyAdded(localModel.lastEdited, lastSyncTime)) {
            finalModels.push(localModel);
          }
        }
      }

      // 添加远程独有的模型（如果在上次同步后没有在本地被删除）
      for (const remoteModel of remoteModels) {
        if (!localData.aiModels.find((m) => m.id === remoteModel.id)) {
          // 检查是否在本地删除记录中
          const deletionRecord = deletedModelIdsMap.get(remoteModel.id);
          if (deletionRecord !== undefined && deletionRecord > lastSyncTime) {
            // 本地删除时间晚于上次同步，说明是用户本地删除的，不添加
            continue;
          }
          // 远程有但本地没有，检查是否是远程新增的
          if (remoteModel.lastEdited && checkIsNewlyAdded(remoteModel.lastEdited, lastSyncTime)) {
            finalModels.push(remoteModel);
          }
        }
      }
    }

    // 合并书籍
    const finalBooks: Novel[] = [];
    const remoteNovels = remoteData.novels || [];
    const remoteNovelMap = new Map(remoteNovels.map((n: any) => [n.id, n])); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 处理远程和本地都有的书籍
    for (const localNovel of localData.novels) {
      const remoteNovel = remoteNovelMap.get(localNovel.id);
      if (remoteNovel) {
        if (shouldUseRemote(localNovel.lastEdited, remoteNovel.lastEdited)) {
          // 使用远程书籍，但保留本地章节内容
          const mergedNovel = await SyncDataService.mergeNovelWithLocalContent(
            remoteNovel as Novel,
            localNovel,
          );
          finalBooks.push(mergedNovel);
        } else {
          // 使用本地书籍，但需要合并远程翻译（远程可能有新翻译）
          const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
          // 合并远程翻译到本地书籍
          const mergedNovel = await mergeRemoteTranslationsIntoLocalNovel(
            localNovelWithContent,
            remoteNovel as Novel,
          );
          finalBooks.push(mergedNovel);
        }
      } else {
        // 本地独有的书籍，检查是否是新增的
        if (checkIsNewlyAdded(localNovel.lastEdited, lastSyncTime)) {
          const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
          finalBooks.push(localNovelWithContent);
        }
      }
    }

    // 添加远程独有的书籍（如果在上次同步后没有在本地被删除）
    for (const remoteNovel of remoteNovels) {
      if (!localData.novels.find((n) => n.id === remoteNovel.id)) {
        // 检查是否在本地删除记录中
        const deletionRecord = deletedNovelIdsMap.get(remoteNovel.id);
        if (deletionRecord !== undefined && deletionRecord > lastSyncTime) {
          // 本地删除时间晚于上次同步，说明是用户本地删除的，不添加
          continue;
        }
        // 远程有但本地没有，检查是否是远程新增的
        if (checkIsNewlyAdded(remoteNovel.lastEdited, lastSyncTime)) {
          finalBooks.push(remoteNovel as Novel);
        }
      }
    }

    // 合并封面历史
    const finalCovers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const remoteCovers = remoteData.coverHistory || [];
    const remoteCoverMap = new Map(remoteCovers.map((c: any) => [c.id, c])); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 特殊处理：如果远程封面历史为空，但本地存在封面历史
    // 旧逻辑只上传“上次同步后新增”的本地封面，会导致远端空列表无法被本地补齐
    if (remoteCovers.length === 0 && localData.coverHistory.length > 0) {
      finalCovers.push(...localData.coverHistory);
    } else {
      // 处理远程和本地都有的封面
      for (const localCover of localData.coverHistory) {
        const localUrl = normalizeCoverUrl(localCover?.url);
        const remoteCover =
          remoteCoverMap.get(localCover.id) ||
          (localUrl
            ? remoteCovers.find((c: any) => normalizeCoverUrl(c?.url) === localUrl)
            : undefined); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (remoteCover) {
          if (shouldUseRemote(localCover.addedAt, remoteCover.addedAt)) {
            finalCovers.push(remoteCover);
          } else {
            finalCovers.push(localCover);
          }
        } else {
          // 本地独有的封面，检查是否是新增的
          if (checkIsNewlyAdded(localCover.addedAt, lastSyncTime)) {
            finalCovers.push(localCover);
          }
        }
      }

      // 添加远程独有的封面（如果在上次同步后没有在本地被删除）
      for (const remoteCover of remoteCovers) {
        const remoteUrl = normalizeCoverUrl(remoteCover?.url);
        const existsInLocal =
          !!localData.coverHistory.find((c) => c.id === remoteCover.id) ||
          (remoteUrl
            ? !!localData.coverHistory.find((c) => normalizeCoverUrl((c as any)?.url) === remoteUrl)
            : false); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!existsInLocal) {
          // 检查是否在本地删除记录中
          const deletionRecordById = deletedCoverIdsMap.get(remoteCover.id);
          const deletionRecordByUrl = remoteUrl ? deletedCoverUrlsMap.get(remoteUrl) : undefined;
          const deletionRecord =
            deletionRecordById !== undefined && deletionRecordByUrl !== undefined
              ? Math.max(deletionRecordById, deletionRecordByUrl)
              : (deletionRecordById ?? deletionRecordByUrl);
          if (deletionRecord !== undefined && deletionRecord > lastSyncTime) {
            // 本地删除时间晚于上次同步，说明是用户本地删除的，不添加
            continue;
          }
          if (checkIsNewlyAdded(remoteCover.addedAt, lastSyncTime)) {
            finalCovers.push(remoteCover);
          }
        }
      }
    }

    // 最终按 URL 去重（跨设备：同一 URL 可能有不同 id）
    const dedupedCovers = dedupeCoverHistoryByUrl(finalCovers);

    // 合并设置
    let finalSettings = localData.appSettings;
    if (remoteData.appSettings) {
      if (shouldUseRemote(localData.appSettings.lastEdited, remoteData.appSettings.lastEdited)) {
        // 使用远程设置，但保留本地的 Gist 同步配置
        // 这包括 lastSyncTime、lastSyncedModelIds、deletedNovelIds 等本地状态
        // syncs 是一个数组，需要用 find 查找 gist 类型的配置
        const localSyncs = localData.appSettings.syncs;
        const remoteSyncs = remoteData.appSettings.syncs;
        const localGistSync = Array.isArray(localSyncs)
          ? localSyncs.find((s: any) => s.syncType === 'gist') // eslint-disable-line @typescript-eslint/no-explicit-any
          : undefined;
        const remoteGistSync = Array.isArray(remoteSyncs)
          ? remoteSyncs.find((s: any) => s.syncType === 'gist') // eslint-disable-line @typescript-eslint/no-explicit-any
          : undefined;

        // 合并 Gist 同步配置：保留本地的同步状态，但使用远程的其他配置
        const mergedGistSync = localGistSync
          ? {
              ...remoteGistSync,
              ...localGistSync,
              // 确保本地的重要状态字段被保留
              lastSyncTime: localGistSync.lastSyncTime ?? remoteGistSync?.lastSyncTime ?? 0,
              lastSyncedModelIds:
                localGistSync.lastSyncedModelIds ?? remoteGistSync?.lastSyncedModelIds,
              deletedNovelIds:
                localGistSync.deletedNovelIds ?? remoteGistSync?.deletedNovelIds ?? [],
              deletedModelIds:
                localGistSync.deletedModelIds ?? remoteGistSync?.deletedModelIds ?? [],
              deletedCoverIds:
                localGistSync.deletedCoverIds ?? remoteGistSync?.deletedCoverIds ?? [],
            }
          : remoteGistSync;

        // 构建合并后的 syncs 数组
        const mergedSyncs = Array.isArray(remoteSyncs) ? [...remoteSyncs] : [];
        const gistIndex = mergedSyncs.findIndex((s: any) => s.syncType === 'gist'); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (mergedGistSync) {
          if (gistIndex >= 0) {
            mergedSyncs[gistIndex] = mergedGistSync;
          } else {
            mergedSyncs.push(mergedGistSync);
          }
        }

        finalSettings = {
          ...remoteData.appSettings,
          syncs: mergedSyncs,
        };
      }
    }

    // 合并 Memory
    // Memory 的合并逻辑：对于每个 Memory，保留最新的 lastAccessedAt 时间
    const finalMemories: Memory[] = [];
    const remoteMemories = remoteData.memories || [];
    const remoteMemoryMap = new Map(remoteMemories.map((m: Memory) => [m.id, m]));
    const localMemories = localData.memories || [];

    // 处理本地和远程都有的 Memory
    for (const localMemory of localMemories) {
      const remoteMemory = remoteMemoryMap.get(localMemory.id);
      if (remoteMemory) {
        // 比较 lastAccessedAt 时间，使用最新的
        if (remoteMemory.lastAccessedAt > localMemory.lastAccessedAt) {
          finalMemories.push(remoteMemory);
        } else {
          finalMemories.push(localMemory);
        }
        remoteMemoryMap.delete(localMemory.id);
      } else {
        // 本地独有的 Memory，直接添加
        finalMemories.push(localMemory);
      }
    }

    // 添加远程独有的 Memory
    for (const remoteMemory of remoteMemoryMap.values()) {
      finalMemories.push(remoteMemory as Memory);
    }

    return {
      novels: finalBooks,
      aiModels: finalModels,
      appSettings: finalSettings,
      coverHistory: dedupedCovers,
      memories: finalMemories,
    };
  }

  /**
   * 检查本地数据相对于远程数据是否有变更（需要上传）
   */
  static hasChangesToUpload(
    local: {
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    remote: {
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
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
    // 还需要排除 syncs 中的 lastSyncTime 和 lastSyncedModelIds，因为每次同步都会更新
    // 如果远程有设置且时间戳相同，则认为没有变更（避免因 merge 导致的差异触发上传）
    if (
      !remote.appSettings ||
      isTimeDifferent(local.appSettings.lastEdited, remote.appSettings.lastEdited)
    ) {
      const prepareSettingsForCompare = (settings: any) => {
        const omitted = omit(settings, 'lastEdited');
        if (omitted.syncs && Array.isArray(omitted.syncs)) {
          omitted.syncs = omitted.syncs.map((sync: any) =>
            omit(sync, 'lastSyncTime', 'lastSyncedModelIds'),
          );
        }
        return omitted;
      };

      const localSettingsForCompare = prepareSettingsForCompare(local.appSettings);
      const remoteSettingsForCompare = prepareSettingsForCompare(remote.appSettings || {});

      if (!isEqual(localSettingsForCompare, remoteSettingsForCompare)) {
        if (!remote.appSettings && Object.keys(local.appSettings).length > 0) return true;
        if (remote.appSettings) return true;
      }
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

    // 5. 检查 Memory
    if (local.memories.length !== (remote.memories || []).length) return true;

    const remoteMemoryMap = new Map((remote.memories || []).map((m) => [m.id, m]));
    for (const localMemory of local.memories) {
      const remoteMemory = remoteMemoryMap.get(localMemory.id);
      if (!remoteMemory) return true;

      // 比较 lastAccessedAt 时间
      if (isTimeDifferent(localMemory.lastAccessedAt, remoteMemory.lastAccessedAt)) {
        return true;
      }

      // 比较内容和摘要（如果时间相同）
      if (localMemory.content !== remoteMemory.content || localMemory.summary !== remoteMemory.summary) {
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
  static async mergeNovelWithLocalContent(remoteNovel: Novel, localNovel: Novel): Promise<Novel> {
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
                const localChapter = localVolume.chapters?.find((ch) => ch.id === remoteChapter.id);

                // 如果本地章节存在，尝试保留其内容并合并远程翻译
                if (localChapter) {
                  let localContent: Paragraph[] | undefined;

                  // 首先尝试从本地章节获取（如果已加载）
                  if (
                    localChapter.content !== undefined &&
                    localChapter.content !== null &&
                    Array.isArray(localChapter.content) &&
                    localChapter.content.length > 0
                  ) {
                    localContent = localChapter.content;
                  } else {
                    // 如果本地章节没有 content，从 IndexedDB 加载
                    localContent = await ChapterContentService.loadChapterContent(localChapter.id);
                  }

                  // 如果找到了本地内容，保留它并合并远程翻译
                  if (localContent !== undefined && localContent.length > 0) {
                    // 获取远程章节内容（如果有的话）
                    const remoteContent = remoteChapter.content;

                    // 合并翻译：将远程翻译添加到本地段落中
                    const mergedContent = mergeParagraphTranslations(localContent, remoteContent);

                    return {
                      ...remoteChapter,
                      content: mergedContent,
                    } as Chapter;
                  }
                }

                // 如果远程章节有内容，使用远程内容
                // 否则尝试从 IndexedDB 加载（如果章节 ID 相同）
                if (
                  (!remoteChapter.content ||
                    (Array.isArray(remoteChapter.content) && remoteChapter.content.length === 0)) &&
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
                  (Array.isArray(remoteChapter.content) && remoteChapter.content.length === 0)
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
