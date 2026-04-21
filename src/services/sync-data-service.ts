import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { GistSyncData } from 'src/services/gist-sync-service';
import { GlobalConfig } from 'src/services/global-config-cache';
import { aiModelService } from 'src/services/ai-model-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import type { Novel, Volume, Chapter, Paragraph, Translation } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { DeletionRecord } from 'src/models/sync';
import { isEqual, omit } from 'lodash';
import { isTimeDifferent, isNewlyAdded as checkIsNewlyAdded } from 'src/utils/time-utils';

function mergeUniqueById<T extends { id: string }>(
  primaryItems: T[] | undefined,
  secondaryItems: T[] | undefined,
  resolveDuplicate?: (primaryItem: T, secondaryItem: T) => T,
): T[] | undefined {
  if (!primaryItems || primaryItems.length === 0) {
    return secondaryItems;
  }
  if (!secondaryItems || secondaryItems.length === 0) {
    return primaryItems;
  }

  const secondaryMap = new Map<string, T>();
  for (const item of secondaryItems) {
    secondaryMap.set(item.id, item);
  }

  const seenIds = new Set<string>();
  const merged = primaryItems.map((item) => {
    seenIds.add(item.id);
    const secondaryItem = secondaryMap.get(item.id);
    if (!secondaryItem || !resolveDuplicate) {
      return item;
    }
    return resolveDuplicate(item, secondaryItem);
  });

  for (const item of secondaryItems) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

function mergeUniqueStrings(
  primaryItems: string[] | undefined,
  secondaryItems: string[] | undefined,
): string[] | undefined {
  if (!primaryItems || primaryItems.length === 0) {
    return secondaryItems;
  }
  if (!secondaryItems || secondaryItems.length === 0) {
    return primaryItems;
  }

  return Array.from(new Set([...primaryItems, ...secondaryItems]));
}

function getMergeTimestamp(value: Date | number | string | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }

  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getVolumeMergeTimestamp(volume: Volume): number {
  if (!volume.chapters || volume.chapters.length === 0) {
    return 0;
  }

  let latestTimestamp = 0;
  for (const chapter of volume.chapters) {
    latestTimestamp = Math.max(latestTimestamp, getMergeTimestamp(chapter.lastEdited));
  }
  return latestTimestamp;
}

function shouldKeepLocalOnlyItem(
  localItemTime: number,
  remoteNovelTime: number,
  lastSyncTime: number,
): boolean {
  if (lastSyncTime === 0 || remoteNovelTime === 0) {
    return true;
  }

  if (remoteNovelTime <= lastSyncTime) {
    return true;
  }

  return localItemTime > lastSyncTime;
}

function mergeNotes(primaryNotes: Novel['notes'], secondaryNotes: Novel['notes']): Novel['notes'] {
  return mergeUniqueById(primaryNotes, secondaryNotes, (primaryNote, secondaryNote) => {
    const primaryTime = getMergeTimestamp(primaryNote.lastEdited);
    const secondaryTime = getMergeTimestamp(secondaryNote.lastEdited);
    return secondaryTime > primaryTime ? secondaryNote : primaryNote;
  });
}

async function loadChapterContentForNovelMerge(chapter: Chapter | undefined): Promise<Paragraph[]> {
  if (!chapter) {
    return [];
  }

  if (
    chapter.content !== undefined &&
    chapter.content !== null &&
    Array.isArray(chapter.content) &&
    chapter.content.length > 0
  ) {
    return chapter.content;
  }

  const loadedContent = await ChapterContentService.loadChapterContent(chapter.id);
  return loadedContent ?? [];
}

async function ensureChapterContentLoadedForNovelMerge(chapter: Chapter): Promise<Chapter> {
  const content = await loadChapterContentForNovelMerge(chapter);
  if (content.length === 0) {
    return chapter;
  }

  return {
    ...chapter,
    content,
  };
}

async function mergeNovelChapters(
  primaryChapters: Chapter[] | undefined,
  secondaryChapters: Chapter[] | undefined,
  preferRemoteSelection: boolean,
  primaryNovelLastEdited?: Date | number | string,
  secondaryNovelLastEdited?: Date | number | string,
  lastSyncTime = 0,
): Promise<Chapter[] | undefined> {
  const primaryIsRemote = preferRemoteSelection;
  const remoteNovelTime = primaryIsRemote
    ? getMergeTimestamp(primaryNovelLastEdited)
    : getMergeTimestamp(secondaryNovelLastEdited);
  const shouldKeepChapterWithoutCounterpart = (chapter: Chapter): boolean => {
    const chapterTime = getMergeTimestamp(chapter.lastEdited);
    return shouldKeepLocalOnlyItem(chapterTime, remoteNovelTime, lastSyncTime);
  };

  if (!primaryChapters || primaryChapters.length === 0) {
    if (!secondaryChapters || secondaryChapters.length === 0) {
      return primaryChapters;
    }
    const chapters = secondaryChapters.filter(shouldKeepChapterWithoutCounterpart);
    return Promise.all(chapters.map(ensureChapterContentLoadedForNovelMerge));
  }
  if (!secondaryChapters || secondaryChapters.length === 0) {
    const chapters = primaryIsRemote
      ? primaryChapters
      : primaryChapters.filter(shouldKeepChapterWithoutCounterpart);
    return Promise.all(chapters.map(ensureChapterContentLoadedForNovelMerge));
  }

  const secondaryChapterMap = new Map<string, Chapter>();
  for (const chapter of secondaryChapters) {
    secondaryChapterMap.set(chapter.id, chapter);
  }

  const mergedChapters = await Promise.all(
    primaryChapters.map(async (primaryChapter) => {
      const secondaryChapter = secondaryChapterMap.get(primaryChapter.id);
      if (!secondaryChapter) {
        if (!primaryIsRemote && !shouldKeepChapterWithoutCounterpart(primaryChapter)) {
          return null;
        }
        return ensureChapterContentLoadedForNovelMerge(primaryChapter);
      }

      const localChapter = primaryIsRemote ? secondaryChapter : primaryChapter;
      const remoteChapter = primaryIsRemote ? primaryChapter : secondaryChapter;
      const localTime = getMergeTimestamp(localChapter.lastEdited);
      const remoteTime = getMergeTimestamp(remoteChapter.lastEdited);
      const preferRemoteChapter =
        remoteTime === localTime ? preferRemoteSelection : remoteTime > localTime;
      const winningChapter = preferRemoteChapter ? remoteChapter : localChapter;

      const localContent = await loadChapterContentForNovelMerge(localChapter);
      const remoteContent = await loadChapterContentForNovelMerge(remoteChapter);

      if (localContent.length === 0 && remoteContent.length === 0) {
        return winningChapter;
      }

      return {
        ...winningChapter,
        content: mergeParagraphTranslations(localContent, remoteContent, preferRemoteChapter),
      };
    }),
  );
  const compactMergedChapters = mergedChapters.filter((chapter): chapter is Chapter => !!chapter);

  const seenChapterIds = new Set(primaryChapters.map((chapter) => chapter.id));
  for (const secondaryChapter of secondaryChapters) {
    if (seenChapterIds.has(secondaryChapter.id)) continue;
    if (!shouldKeepChapterWithoutCounterpart(secondaryChapter)) continue;
    compactMergedChapters.push(await ensureChapterContentLoadedForNovelMerge(secondaryChapter));
  }

  return compactMergedChapters;
}

async function mergeNovelVolumes(
  primaryVolumes: Volume[] | undefined,
  secondaryVolumes: Volume[] | undefined,
  preferRemoteSelection: boolean,
  primaryNovelLastEdited?: Date | number | string,
  secondaryNovelLastEdited?: Date | number | string,
  lastSyncTime = 0,
): Promise<Volume[] | undefined> {
  const primaryIsRemote = preferRemoteSelection;
  const remoteNovelTime = primaryIsRemote
    ? getMergeTimestamp(primaryNovelLastEdited)
    : getMergeTimestamp(secondaryNovelLastEdited);
  const localNovelTime = primaryIsRemote
    ? getMergeTimestamp(secondaryNovelLastEdited)
    : getMergeTimestamp(primaryNovelLastEdited);
  const shouldKeepVolumeWithoutCounterpart = (volume: Volume): boolean => {
    const volumeTimestamp = getVolumeMergeTimestamp(volume);
    const effectiveLocalTime = volumeTimestamp > 0 ? volumeTimestamp : localNovelTime;
    return shouldKeepLocalOnlyItem(effectiveLocalTime, remoteNovelTime, lastSyncTime);
  };

  if (!primaryVolumes || primaryVolumes.length === 0) {
    if (!secondaryVolumes || secondaryVolumes.length === 0) {
      return primaryVolumes;
    }
    const volumes = secondaryVolumes.filter(shouldKeepVolumeWithoutCounterpart);
    return Promise.all(
      volumes.map(async (volume) => ({
        ...volume,
        chapters: await mergeNovelChapters(
          volume.chapters,
          undefined,
          preferRemoteSelection,
          primaryNovelLastEdited,
          secondaryNovelLastEdited,
          lastSyncTime,
        ),
      })),
    );
  }
  if (!secondaryVolumes || secondaryVolumes.length === 0) {
    const volumes = primaryIsRemote
      ? primaryVolumes
      : primaryVolumes.filter(shouldKeepVolumeWithoutCounterpart);
    return Promise.all(
      volumes.map(async (volume) => ({
        ...volume,
        chapters: await mergeNovelChapters(
          volume.chapters,
          undefined,
          preferRemoteSelection,
          primaryNovelLastEdited,
          secondaryNovelLastEdited,
          lastSyncTime,
        ),
      })),
    );
  }

  const secondaryVolumeMap = new Map<string, Volume>();
  for (const volume of secondaryVolumes) {
    secondaryVolumeMap.set(volume.id, volume);
  }

  const mergedVolumes = await Promise.all(
    primaryVolumes.map(async (primaryVolume) => {
      const secondaryVolume = secondaryVolumeMap.get(primaryVolume.id);
      if (!secondaryVolume) {
        if (!primaryIsRemote && !shouldKeepVolumeWithoutCounterpart(primaryVolume)) {
          return null;
        }
        return {
          ...primaryVolume,
          chapters: await mergeNovelChapters(
            primaryVolume.chapters,
            undefined,
            preferRemoteSelection,
            primaryNovelLastEdited,
            secondaryNovelLastEdited,
            lastSyncTime,
          ),
        };
      }

      return {
        ...primaryVolume,
        chapters: await mergeNovelChapters(
          primaryVolume.chapters,
          secondaryVolume.chapters,
          preferRemoteSelection,
          primaryNovelLastEdited,
          secondaryNovelLastEdited,
          lastSyncTime,
        ),
      };
    }),
  );
  const compactMergedVolumes = mergedVolumes.filter((volume) => volume !== null) as Volume[];

  const seenVolumeIds = new Set(primaryVolumes.map((volume) => volume.id));
  for (const secondaryVolume of secondaryVolumes) {
    if (!seenVolumeIds.has(secondaryVolume.id)) {
      if (!shouldKeepVolumeWithoutCounterpart(secondaryVolume)) {
        continue;
      }
      compactMergedVolumes.push({
        ...secondaryVolume,
        chapters: await mergeNovelChapters(
          secondaryVolume.chapters,
          undefined,
          preferRemoteSelection,
          primaryNovelLastEdited,
          secondaryNovelLastEdited,
          lastSyncTime,
        ),
      });
    }
  }

  return compactMergedVolumes;
}

async function mergeNovelKeepingPrimary(
  primaryNovel: Novel,
  secondaryNovel: Novel | undefined,
  preferRemoteSelection: boolean,
  lastSyncTime = 0,
): Promise<Novel> {
  if (!secondaryNovel) {
    return primaryNovel;
  }

  return {
    ...primaryNovel,
    alternateTitles: mergeUniqueStrings(
      primaryNovel.alternateTitles,
      secondaryNovel.alternateTitles,
    ),
    tags: mergeUniqueStrings(primaryNovel.tags, secondaryNovel.tags),
    webUrl: mergeUniqueStrings(primaryNovel.webUrl, secondaryNovel.webUrl),
    characterSettings: mergeUniqueById(
      primaryNovel.characterSettings,
      secondaryNovel.characterSettings,
    ),
    terminologies: mergeUniqueById(primaryNovel.terminologies, secondaryNovel.terminologies),
    notes: mergeNotes(primaryNovel.notes, secondaryNovel.notes),
    volumes: await mergeNovelVolumes(
      primaryNovel.volumes,
      secondaryNovel.volumes,
      preferRemoteSelection,
      primaryNovel.lastEdited,
      secondaryNovel.lastEdited,
      lastSyncTime,
    ),
  };
}

/**
 * 合并段落翻译
 *
 * 语义：按 id（带文本回退）union 两侧段落集合；不丢弃任何一方独有的段落。
 *
 * - `preferRemoteSelection=false`（默认）：本地为主导方，输出顺序跟随本地段落顺序，
 *   远端独有段落追加在末尾；段落字段以本地为基（`{...local, translations: union}`）
 * - `preferRemoteSelection=true`：远端为主导方，输出顺序跟随远端段落顺序，
 *   本地独有段落追加在末尾；段落字段以远端为基
 *
 * 翻译始终按主导方翻译优先、副方未见 id 追加的方式 union，与段落 union 同构。
 *
 * 历史问题：早期实现用 `localParagraphs.map(...)` 直接丢弃远端独有段落，
 * 导致"本地落后于远端"的设备同步时反而把远端新段落吞掉，并在下一轮上传
 * 把截断版本推回远端造成数据丢失（见 useSyncExecutor 重复上传问题）。
 */
function mergeParagraphTranslations(
  localParagraphs: Paragraph[],
  remoteParagraphs: Paragraph[] | undefined,
  preferRemoteSelection = false,
): Paragraph[] {
  if (!remoteParagraphs || remoteParagraphs.length === 0) {
    return localParagraphs;
  }
  if (!localParagraphs || localParagraphs.length === 0) {
    return remoteParagraphs;
  }

  const primary = preferRemoteSelection ? remoteParagraphs : localParagraphs;
  const secondary = preferRemoteSelection ? localParagraphs : remoteParagraphs;

  const secondaryById = new Map<string, Paragraph>();
  for (const p of secondary) secondaryById.set(p.id, p);

  // 文本回退：用于同段落在不同设备 ID 不同（例如重新抓取）的匹配。
  // 用 FIFO 队列而非单值映射——否则小说里常见的重复文本（分隔符、「……」、
  // 重复台词等）会让多个 primary 段落同时吃到同一个 secondary，造成错误翻译
  // 被复制到多处 + 副方段落在末尾重复追加。每条文本按顺序只消费一次。
  const secondaryByText = new Map<string, Paragraph[]>();
  for (const p of secondary) {
    const queue = secondaryByText.get(p.text);
    if (queue) queue.push(p);
    else secondaryByText.set(p.text, [p]);
  }

  const consumedSecondaryIds = new Set<string>();

  const mergeOne = (primaryPara: Paragraph): Paragraph => {
    let match = secondaryById.get(primaryPara.id);
    if (!match) {
      const queue = secondaryByText.get(primaryPara.text);
      // 注意：队列里可能放着已经通过 id 匹配被消费过的段落；跳过它们，
      // 保证同一 secondary 段落不会被双重消费
      while (queue && queue.length > 0) {
        const candidate = queue.shift();
        if (candidate && !consumedSecondaryIds.has(candidate.id)) {
          match = candidate;
          break;
        }
      }
    }
    if (!match) {
      return primaryPara;
    }
    consumedSecondaryIds.add(match.id);

    const seen = new Set<string>();
    const merged: Translation[] = [];
    for (const t of primaryPara.translations ?? []) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    for (const t of match.translations ?? []) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }

    let selectedTranslationId = primaryPara.selectedTranslationId;
    const primarySelectedValid =
      !!selectedTranslationId && merged.some((t) => t.id === selectedTranslationId);
    if (!primarySelectedValid) {
      const secondarySelectedValid =
        !!match.selectedTranslationId && merged.some((t) => t.id === match.selectedTranslationId);
      if (secondarySelectedValid) {
        selectedTranslationId = match.selectedTranslationId;
      } else if (merged.length > 0 && merged[0]) {
        selectedTranslationId = merged[0].id;
      }
    }

    return {
      ...primaryPara,
      translations: merged,
      selectedTranslationId,
    };
  };

  const result: Paragraph[] = primary.map(mergeOne);

  // 追加副方独有段落（未被 id 或文本匹配消费过的）
  for (const secondaryPara of secondary) {
    if (!consumedSecondaryIds.has(secondaryPara.id)) {
      result.push(secondaryPara);
    }
  }

  return result;
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
  lastSyncTime = 0,
): Promise<Novel> {
  return mergeNovelKeepingPrimary(localNovel, remoteNovel, false, lastSyncTime);
}

/**
 * 可恢复的项目接口
 */
export interface RestorableItem {
  id: string;
  type: 'novel' | 'model' | 'cover' | 'memory';
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
 * 合并快速开始关闭状态（单调语义）
 * 规则：任一端为 true，合并结果即为 true，避免“已关闭”回退为“未关闭”。
 */
function mergeQuickStartDismissedFlag(
  localAppSettings: { quickStartDismissed?: unknown } | null | undefined,
  remoteAppSettings: { quickStartDismissed?: unknown } | null | undefined,
  phase: 'download' | 'upload',
): boolean {
  const localDismissed = localAppSettings?.quickStartDismissed === true;
  const remoteHasFlag = typeof remoteAppSettings?.quickStartDismissed === 'boolean';
  const remoteDismissed = remoteAppSettings?.quickStartDismissed === true;

  if (localDismissed && !remoteHasFlag) {
    console.info(
      `[SyncDataService] (${phase}) 远程 appSettings 缺少 quickStartDismissed，保留本地已关闭状态`,
    );
  } else if (localDismissed && remoteHasFlag && !remoteDismissed) {
    console.info(
      `[SyncDataService] (${phase}) 检测到 quickStartDismissed 冲突（local=true, remote=false），按单调规则保留 true`,
    );
  } else if (!localDismissed && remoteDismissed) {
    console.info(`[SyncDataService] (${phase}) 采用远程 quickStartDismissed=true`);
  }

  return localDismissed || remoteDismissed;
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
   * 剥离 Memory 的本地字段（embedding / embeddingModel / 已弃用的 attachedTo）
   * 用于 Gist 上传时 strip，以及下载时防御性 strip 旧版本 payload
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static stripLocalFieldsFromMemory(memory: any): Memory {
    if (!memory || typeof memory !== 'object') {
      return memory as Memory;
    }

    const {
      attachedTo: _a,
      embedding: _e,
      embeddingModel: _m,
      ...clean
    } = memory as Record<string, unknown>;
    return clean as unknown as Memory;
  }

  /**
   * 剥离 Novel 树中所有 Translation 的 memoryScoreBreakdown 字段
   * 该字段是 UI 调试用的本地数据，不参与跨设备同步
   */
  private static stripLocalFieldsFromNovel(novel: Novel): Novel {
    if (!novel || !Array.isArray(novel.volumes)) {
      return novel;
    }

    const stripTranslation = (t: unknown): unknown => {
      if (!t || typeof t !== 'object') return t;

      const { memoryScoreBreakdown: _b, ...rest } = t as Record<string, unknown>;
      return rest;
    };

    const cleanedVolumes = novel.volumes.map((volume) => {
      if (!volume || !Array.isArray(volume.chapters)) return volume;
      const cleanedChapters = volume.chapters.map((chapter) => {
        if (!chapter || !Array.isArray(chapter.content)) return chapter;
        const cleanedContent = chapter.content.map((paragraph) => {
          if (!paragraph) return paragraph;
          const cleanedTranslations = Array.isArray(paragraph.translations)
            ? (paragraph.translations.map(stripTranslation) as typeof paragraph.translations)
            : paragraph.translations;
          return { ...paragraph, translations: cleanedTranslations };
        });
        return { ...chapter, content: cleanedContent };
      });
      return { ...volume, chapters: cleanedChapters };
    });

    return { ...novel, volumes: cleanedVolumes } as Novel;
  }

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
      // 恢复 AI 模型（使用 put/upsert 而非 clear+add）
      for (const model of backup.models) {
        await aiModelService.saveModel(model);
      }
      // 删除不在备份中的模型
      const backupModelIds = new Set(backup.models.map((m: any) => m.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const existingModel of aiModelsStore.models) {
        if (!backupModelIds.has(existingModel.id)) {
          try {
            await aiModelService.deleteModel(existingModel.id);
          } catch {
            /* 忽略 */
          }
        }
      }
      // 确保 lastEdited 是 Date 对象（backup 经过 JSON 序列化，Date 会变成字符串）
      aiModelsStore.models = backup.models.map((m: any) => ({
        ...m,
        lastEdited: m.lastEdited ? new Date(m.lastEdited) : new Date(0),
      }));

      // 恢复书籍（使用 bulkAddBooks 的 put/upsert，再清理旧书籍）
      const backupBookIds = new Set(backup.books.map((b: Novel) => b.id));
      const staleBookIdsForRestore = booksStore.books
        .filter((b) => !backupBookIds.has(b.id))
        .map((b) => b.id);

      await booksStore.bulkAddBooks(backup.books);
      for (const staleId of staleBookIdsForRestore) {
        try {
          await booksStore.deleteBook(staleId);
        } catch {
          /* 忽略 */
        }
      }

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

        // 收集需要从删除记录中移除的模型 ID（循环结束后批量更新）
        const modelIdsToUndelete = new Set<string>();

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
                    title: remoteModel.name || remoteModel.id,
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
                    // 远程有更新，恢复（标记从删除记录中移除）
                    finalModels.push(remoteModel);
                    modelIdsToUndelete.add(remoteModel.id);
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

        // 批量从删除记录中移除已恢复的模型（一次 DB 写入而非 N 次）
        if (modelIdsToUndelete.size > 0) {
          const updatedDeletedModelIds = deletedModelIds.filter(
            (record) => !modelIdsToUndelete.has(record.id),
          );
          await settingsStore.updateGistSync({
            deletedModelIds: updatedDeletedModelIds,
          });
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

        // 先写入所有最终模型（put/upsert），再删除不在最终列表中的旧模型。
        // 这样即使删除步骤失败，新数据已安全写入，避免 clear+add 模式的数据丢失风险。
        const finalModelIds = new Set(finalModels.map((m) => m.id));
        const staleModelIds = aiModelsStore.models
          .filter((m) => !finalModelIds.has(m.id))
          .map((m) => m.id);

        // 持久化所有最终模型到 DB（saveModel 使用 put/upsert，保留原始 lastEdited）
        for (const model of finalModels) {
          await aiModelService.saveModel(model);
        }

        // 更新内存状态（确保 lastEdited 是 Date 对象）
        aiModelsStore.models = finalModels.map((m) => ({
          ...m,
          lastEdited: m.lastEdited ? new Date(m.lastEdited) : new Date(0),
        }));

        // 删除不再需要的旧模型
        for (const staleId of staleModelIds) {
          try {
            await aiModelService.deleteModel(staleId);
          } catch (e) {
            console.warn('[SyncDataService] 删除旧模型失败:', staleId, e);
          }
        }
      }

      // 处理书籍（确保 novels 是数组）
      // 即使远程书籍列表为空，也需要处理（可能远程删除了所有书籍）
      if (remoteData.novels && Array.isArray(remoteData.novels)) {
        const finalBooks: Novel[] = [];

        const deletedNovelIds = gistSyncSnapshot?.deletedNovelIds || [];
        const deletedNovelIdsMap = new Map<string, number>(
          deletedNovelIds.map((record) => [record.id, record.deletedAt]),
        );
        // 收集需要从删除记录中移除的书籍 ID（循环结束后批量更新）
        const novelIdsToUndelete = new Set<string>();

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
                syncTime,
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
                syncTime,
              );
              finalBooks.push(mergedNovel);
            }
          } else {
            // 本地不存在，检查是否在删除记录中
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
                  // 远程有更新，恢复（标记从删除记录中移除）
                  finalBooks.push(remoteNovel as Novel);
                  novelIdsToUndelete.add(remoteNovel.id);
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

        // 批量从删除记录中移除已恢复的书籍（一次 DB 写入而非 N 次）
        if (novelIdsToUndelete.size > 0) {
          const updatedDeletedNovelIds = deletedNovelIds.filter(
            (record) => !novelIdsToUndelete.has(record.id),
          );
          await settingsStore.updateGistSync({
            deletedNovelIds: updatedDeletedNovelIds,
          });
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

        // 先写入所有最终书籍（put/upsert），再删除不在最终列表中的旧书籍。
        // 这样即使删除步骤失败，新数据已安全写入，避免 clear+add 模式的数据丢失风险。
        const finalBookIds = new Set(finalBooks.map((b) => b.id));
        const staleBookIds = booksStore.books
          .filter((b) => !finalBookIds.has(b.id))
          .map((b) => b.id);

        await booksStore.bulkAddBooks(finalBooks);

        for (const staleId of staleBookIds) {
          try {
            await booksStore.deleteBook(staleId);
          } catch (e) {
            console.warn('[SyncDataService] 删除旧书籍失败:', staleId, e);
          }
        }
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

        // 收集需要从删除记录中移除的封面 ID 和 URL（循环结束后批量更新）
        const coverIdsToUndelete = new Set<string>();
        const coverUrlsToUndelete = new Set<string>();

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
                    title: remoteCover.url || remoteCover.id,
                    deletedAt: deletionRecord,
                    data: remoteCover,
                  });
                }
                // 自动同步时不恢复
              } else {
                // 删除时间早于或等于上次同步时间，可能是旧删除，检查远程是否有更新
                const remoteTime = new Date(remoteCover.addedAt).getTime();
                if (remoteTime > syncTime) {
                  // 远程有更新，恢复（标记从删除记录中移除）
                  finalCovers.push(remoteCover);
                  coverIdsToUndelete.add(remoteCover.id);
                  if (remoteUrl) {
                    coverUrlsToUndelete.add(remoteUrl);
                  }
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

        // 批量从删除记录中移除已恢复的封面（一次 DB 写入而非 N 次）
        if (coverIdsToUndelete.size > 0 || coverUrlsToUndelete.size > 0) {
          const updatedDeletedCoverIds = deletedCoverIds.filter(
            (record) => !coverIdsToUndelete.has(record.id),
          );
          const updatedDeletedCoverUrls = deletedCoverUrls.filter(
            (record: any) => !coverUrlsToUndelete.has(normalizeCoverUrl(record.url)), // eslint-disable-line @typescript-eslint/no-explicit-any
          );
          await settingsStore.updateGistSync({
            deletedCoverIds: updatedDeletedCoverIds,
            deletedCoverUrls: updatedDeletedCoverUrls,
          });
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
              ? !!remoteData.coverHistory.find((c) => normalizeCoverUrl(c?.url) === localUrl)
              : false);
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
      // 使用与 Books/Models/Covers 一致的"重建最终列表"模式
      if (remoteData.memories && Array.isArray(remoteData.memories)) {
        // 构建 Memory 删除记录映射
        const deletedMemoryIds = gistSyncSnapshot?.deletedMemoryIds || [];
        const deletedMemoryIdsMap = new Map<string, number>(
          deletedMemoryIds.map((record) => [record.id, record.deletedAt]),
        );
        // 收集需要从删除记录中移除的 Memory ID（循环结束后批量更新）
        const memoryIdsToUndelete = new Set<string>();

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
          const localMemories = await MemoryService.getAllMemories(localBook.id);

          const finalMemories: Memory[] = [];
          // 内容映射：用于内容级别去重（content → Memory）
          const contentMap = new Map<string, Memory>();

          // 辅助函数：将 Memory 加入最终列表（带内容去重）
          const addToFinal = (memory: Memory) => {
            const existingByContent = contentMap.get(memory.content);
            if (existingByContent) {
              if (memory.lastAccessedAt > existingByContent.lastAccessedAt) {
                const idx = finalMemories.indexOf(existingByContent);
                if (idx >= 0) finalMemories[idx] = memory;
                contentMap.set(memory.content, memory);
              }
            } else {
              finalMemories.push(memory);
              contentMap.set(memory.content, memory);
            }
          };

          // 创建远程 Memory 的映射（按 ID，去重保留最新）
          const remoteMemoryMap = new Map<string, Memory>();
          if (remoteMemories) {
            for (const remoteMemory of remoteMemories) {
              // 远程可能存在重复 id（历史数据问题），保留 lastAccessedAt 更大的那条
              const existing = remoteMemoryMap.get(remoteMemory.id);
              if (!existing || remoteMemory.lastAccessedAt > existing.lastAccessedAt) {
                remoteMemoryMap.set(remoteMemory.id, remoteMemory);
              }
            }
          }

          // 创建本地 Memory 的映射（按 ID，用于 O(1) 查找）
          const localMemoryMap = new Map<string, Memory>();
          for (const localMemory of localMemories) {
            localMemoryMap.set(localMemory.id, localMemory);
          }

          // 1. 处理远程 Memory（与 Books/Models 一致的远程优先遍历）
          for (const remoteMemory of remoteMemoryMap.values()) {
            const localMemory = localMemoryMap.get(remoteMemory.id);

            if (localMemory) {
              // 两边都有：使用较新的 lastAccessedAt
              const winner =
                remoteMemory.lastAccessedAt > localMemory.lastAccessedAt
                  ? remoteMemory
                  : localMemory;
              addToFinal(winner);
            } else {
              // 远程独有：检查删除记录
              const deletionRecord = deletedMemoryIdsMap.get(remoteMemory.id);
              if (deletionRecord !== undefined) {
                if (deletionRecord > syncTime) {
                  // 删除时间晚于上次同步 → 本地删除的，不恢复
                  if (isManualRetrieval) {
                    restorableItems.push({
                      type: 'memory',
                      id: remoteMemory.id,
                      title: remoteMemory.summary || remoteMemory.content.substring(0, 50),
                      deletedAt: deletionRecord,
                      data: remoteMemory,
                    });
                  }
                  continue;
                } else if (remoteMemory.lastAccessedAt > syncTime) {
                  // 删除时间早于同步 + 远程有更新 → 自动恢复
                  memoryIdsToUndelete.add(remoteMemory.id);
                } else {
                  // 旧删除记录，远程也没更新，跳过
                  continue;
                }
              }

              // 不在删除记录中，或已标记恢复 → 添加到最终列表
              if (
                syncTime === 0 ||
                isManualRetrieval ||
                checkIsNewlyAdded(remoteMemory.lastAccessedAt, syncTime)
              ) {
                addToFinal(remoteMemory);
              }
            }
          }

          // 2. 添加本地独有的 Memory
          // 只保留在上次同步后新增/修改的本地 Memory（lastAccessedAt > syncTime）
          // 陈旧的本地 Memory（lastAccessedAt <= syncTime）不添加（远程已删除）
          // 但如果远程 Memory 列表为空，保留所有本地 Memory（避免误删除）
          for (const localMemory of localMemories) {
            if (remoteMemoryMap.has(localMemory.id)) continue; // 已在步骤 1 处理
            if (
              remoteData.memories.length === 0 ||
              checkIsNewlyAdded(localMemory.lastAccessedAt, syncTime)
            ) {
              addToFinal(localMemory);
            }
            // 否则：陈旧的本地 Memory，不添加（自动删除）
          }

          // 3. 先写入所有最终 Memory（upsert），再删除不在最终列表中的旧 Memory
          const finalMemoryIds = new Set(finalMemories.map((m) => m.id));

          for (const memory of finalMemories) {
            try {
              await MemoryService.createMemoryWithId(
                localBook.id,
                memory.id,
                memory.content,
                memory.summary,
                { createdAt: memory.createdAt, lastAccessedAt: memory.lastAccessedAt },
              );
            } catch (error) {
              console.warn(`[SyncDataService] 写入 Memory ${memory.id} 失败:`, error);
            }
          }

          // 删除不在最终列表中的旧 Memory
          const staleMemoryIds = localMemories
            .filter((m) => !finalMemoryIds.has(m.id))
            .map((m) => m.id);
          for (const staleId of staleMemoryIds) {
            try {
              await MemoryService.deleteMemory(localBook.id, staleId);
            } catch (error) {
              console.warn(`[SyncDataService] 删除旧 Memory ${staleId} 失败:`, error);
            }
          }
        }

        // 批量更新删除记录：移除已恢复的 Memory ID
        if (memoryIdsToUndelete.size > 0) {
          const updatedDeletedMemoryIds = (gistSyncSnapshot?.deletedMemoryIds || []).filter(
            (record) => !memoryIdsToUndelete.has(record.id),
          );
          await settingsStore.updateGistSync({
            deletedMemoryIds: updatedDeletedMemoryIds,
          });
        }
      }

      // 处理设置
      if (remoteData.appSettings) {
        const localSettings = GlobalConfig.getAllSettingsSnapshot() ?? ({} as any);
        const mergedQuickStartDismissed = mergeQuickStartDismissedFlag(
          localSettings,
          remoteData.appSettings,
          'download',
        );
        // 手动检索时强制使用远程设置，否则比较 lastEdited
        const shouldApplyRemoteSettings =
          isManualRetrieval ||
          shouldUseRemote(localSettings.lastEdited, remoteData.appSettings.lastEdited);
        if (shouldApplyRemoteSettings) {
          // 保存本地的 Gist 同步配置（包括同步状态）
          const currentGistSync = GlobalConfig.getGistSyncSnapshot();
          await settingsStore.importSettings({
            ...remoteData.appSettings,
            quickStartDismissed: mergedQuickStartDismissed,
          });
          // 恢复本地的 Gist 同步配置，确保本地同步状态不被覆盖
          if (currentGistSync) {
            await settingsStore.updateGistSync(currentGistSync);
          }
        } else if (mergedQuickStartDismissed && localSettings.quickStartDismissed !== true) {
          // 即便不整体采用远程设置，也要同步“已关闭”语义，避免状态回退
          await settingsStore.importSettings({ quickStartDismissed: true });
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
            localGistSync.deletedCoverUrls,
            gistSync.deletedCoverUrls,
          );
          const mergedDeletedMemoryIds = mergeDeletionRecords(
            localGistSync.deletedMemoryIds,
            gistSync.deletedMemoryIds,
          );

          // 更新删除记录
          await settingsStore.updateGistSync({
            deletedNovelIds: mergedDeletedNovelIds,
            deletedModelIds: mergedDeletedModelIds,
            deletedCoverIds: mergedDeletedCoverIds,
            deletedCoverUrls: mergedDeletedCoverUrls,
            deletedMemoryIds: mergedDeletedMemoryIds,
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
   * 用远程快照完全覆盖本地已同步数据（用于"恢复到修订版本"场景）。
   *
   * 与 applyDownloadedData 不同，本方法不做 lastEdited 比较、不保留本地独有条目、
   * 不返回 RestorableItem。执行流程：
   *   1. 校验远程数据；失败直接抛错
   *   2. 创建本地备份（失败时用于回滚）
   *   3. 清空：books（含章节内容）、AI 模型、封面历史、所有书籍的 memories
   *   4. 按快照批量写入 novels / aiModels / coverHistory / memories
   *   5. 导入 appSettings，但保留本地当前 Gist 同步配置（凭据、enabled、lastSyncTime）
   *   6. 清空 deletedNovelIds / deletedModelIds 删除记录
   *   7. 失败时 restoreFromBackup 回滚
   */
  static async overwriteFromSnapshot(
    remoteData: {
      novels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    } | null,
  ): Promise<void> {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    if (!remoteData) {
      return;
    }

    if (!SyncDataService.validateRemoteData(remoteData)) {
      console.error('[SyncDataService] 远程数据验证失败，拒绝覆盖');
      throw new Error('远程数据格式无效，无法应用');
    }

    const backup = SyncDataService.createBackup();

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();

    try {
      // 1. 清空本地已同步数据
      // 1.1 删除所有书籍旧 memories（需要在清空 books 之前收集 bookId，
      //     但我们直接使用备份中的书籍列表，避免与 clearBooks 的竞态）
      for (const oldBook of backup.books) {
        let oldMemories: Memory[] = [];
        try {
          oldMemories = await MemoryService.getAllMemories(oldBook.id);
        } catch (error) {
          console.warn(`[SyncDataService] 读取书籍 ${oldBook.id} 的旧 Memory 失败:`, error);
        }
        for (const memory of oldMemories) {
          try {
            await MemoryService.deleteMemory(oldBook.id, memory.id);
          } catch (error) {
            console.warn(`[SyncDataService] 删除旧 Memory ${memory.id} 失败:`, error);
          }
        }
      }

      // 1.2 清空书籍（含章节内容）、AI 模型、封面
      await booksStore.clearBooks();
      await aiModelsStore.clearModels();
      await coverHistoryStore.clearHistory();

      // 2. 按快照批量写入
      const remoteNovels = Array.isArray(remoteData.novels) ? remoteData.novels : [];
      if (remoteNovels.length > 0) {
        await booksStore.bulkAddBooks(remoteNovels as Novel[]);
      }

      const remoteModels = Array.isArray(remoteData.aiModels) ? remoteData.aiModels : [];
      for (const model of remoteModels) {
        await aiModelService.saveModel(model);
      }
      aiModelsStore.models = remoteModels.map((m: any) => ({
        ...m,
        lastEdited: m.lastEdited ? new Date(m.lastEdited) : new Date(0),
      }));

      const remoteCovers = Array.isArray(remoteData.coverHistory) ? remoteData.coverHistory : [];
      for (const cover of remoteCovers) {
        await coverHistoryStore.addCover(cover);
      }

      const remoteMemories = Array.isArray(remoteData.memories) ? remoteData.memories : [];
      for (const memory of remoteMemories) {
        try {
          await MemoryService.createMemoryWithId(
            memory.bookId,
            memory.id,
            memory.content,
            memory.summary,
            { createdAt: memory.createdAt, lastAccessedAt: memory.lastAccessedAt },
          );
        } catch (error) {
          console.warn(`[SyncDataService] 写入 Memory ${memory.id} 失败:`, error);
        }
      }

      // 3. 导入 appSettings（若快照包含），随后恢复本地 Gist 凭据
      const currentGistSync = GlobalConfig.getGistSyncSnapshot();
      if (remoteData.appSettings) {
        await settingsStore.replaceSettingsFromSyncSnapshot(remoteData.appSettings);
      }

      // 4. 保留本地 Gist 凭据与 lastSyncTime，并清空删除记录
      if (currentGistSync) {
        await settingsStore.updateGistSync({
          ...currentGistSync,
          deletedNovelIds: [],
          deletedModelIds: [],
        });
      } else {
        await settingsStore.updateGistSync({
          deletedNovelIds: [],
          deletedModelIds: [],
        });
      }
    } catch (error) {
      console.error('[SyncDataService] 覆盖快照时发生错误，正在回滚:', error);
      try {
        await SyncDataService.restoreFromBackup(backup);
      } catch (rollbackError) {
        console.error('[SyncDataService] 回滚失败:', rollbackError);
        throw new Error(
          `应用快照失败: ${error instanceof Error ? error.message : String(error)}; ` +
            `回滚也失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
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
    // 下载路径防御性 strip：清理旧版本 Gist payload 里可能带的 attachedTo 字段，
    // 以及其他本地才关心的字段（embedding / embeddingModel / memoryScoreBreakdown）。
    // 这样后续的合并逻辑不需要处理跨版本字段形态差异。
    const rawMemories = Array.isArray(data.memories) ? data.memories : [];
    const strippedMemories = rawMemories.map((m) => SyncDataService.stripLocalFieldsFromMemory(m));
    const rawNovels = Array.isArray(data.novels) ? data.novels : [];
    const strippedNovels = rawNovels.map((n) =>
      n && typeof n === 'object' ? SyncDataService.stripLocalFieldsFromNovel(n) : (n as Novel),
    );
    return {
      novels: strippedNovels,
      aiModels: Array.isArray(data.aiModels) ? data.aiModels : [],
      appSettings: data.appSettings,
      coverHistory: Array.isArray(data.coverHistory) ? data.coverHistory : [],
      memories: strippedMemories,
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
          // 如果 lastEdited 未设置，保守处理：视为新增（避免丢失数据）
          if (!localModel.lastEdited || checkIsNewlyAdded(localModel.lastEdited, lastSyncTime)) {
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
            lastSyncTime,
          );
          finalBooks.push(mergedNovel);
        } else {
          // 使用本地书籍，但需要合并远程翻译（远程可能有新翻译）
          const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
          // 合并远程翻译到本地书籍
          const mergedNovel = await mergeRemoteTranslationsIntoLocalNovel(
            localNovelWithContent,
            remoteNovel as Novel,
            lastSyncTime,
          );
          finalBooks.push(mergedNovel);
        }
      } else {
        // 本地独有的书籍，检查是否是新增的
        // 如果 lastEdited 未设置，保守处理：视为新增（避免丢失数据）
        if (!localNovel.lastEdited || checkIsNewlyAdded(localNovel.lastEdited, lastSyncTime)) {
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
            : undefined);
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
            ? !!localData.coverHistory.find((c) => normalizeCoverUrl(c?.url) === remoteUrl)
            : false);
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
      const mergedQuickStartDismissed = mergeQuickStartDismissedFlag(
        localData.appSettings,
        remoteData.appSettings,
        'upload',
      );
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
              deletedMemoryIds:
                localGistSync.deletedMemoryIds ?? remoteGistSync?.deletedMemoryIds ?? [],
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
          quickStartDismissed: mergedQuickStartDismissed,
        };
      } else {
        finalSettings = {
          ...localData.appSettings,
          quickStartDismissed: mergedQuickStartDismissed,
        };
      }
    }

    // 合并 Memory
    // Memory 的合并逻辑：对于每个 Memory，保留最新的 lastAccessedAt 时间
    // 同时进行内容级别去重：不同 ID 但相同内容的 Memory 只保留一条
    const finalMemories: Memory[] = [];
    const remoteMemories = remoteData.memories || [];
    const remoteMemoryMap = new Map(remoteMemories.map((m: Memory) => [m.id, m]));
    const localMemories = localData.memories || [];
    const deletedMemoryIds = gistSync?.deletedMemoryIds || [];
    const deletedMemoryIdsMap = new Map<string, number>(
      deletedMemoryIds.map((record) => [record.id, record.deletedAt]),
    );

    // 内容映射：用于内容级别去重（content → Memory）
    const contentMap = new Map<string, Memory>();

    // 处理本地和远程都有的 Memory
    for (const localMemory of localMemories) {
      const remoteMemory = remoteMemoryMap.get(localMemory.id);
      let winner: Memory;
      if (remoteMemory) {
        // 比较 lastAccessedAt 时间，使用最新的
        winner =
          remoteMemory.lastAccessedAt > localMemory.lastAccessedAt ? remoteMemory : localMemory;
        remoteMemoryMap.delete(localMemory.id);
      } else {
        // 本地独有的 Memory
        winner = localMemory;
      }

      // 内容去重：如果已有相同内容的 Memory，保留 lastAccessedAt 更新的
      const existingByContent = contentMap.get(winner.content);
      if (existingByContent) {
        if (winner.lastAccessedAt > existingByContent.lastAccessedAt) {
          // 替换掉旧的
          const idx = finalMemories.indexOf(existingByContent);
          if (idx >= 0) {
            finalMemories[idx] = winner;
          }
          contentMap.set(winner.content, winner);
        }
        // 否则跳过（保留已有的更新版本）
      } else {
        finalMemories.push(winner);
        contentMap.set(winner.content, winner);
      }
    }

    // 添加远程独有的 Memory（带内容去重和删除记录检查）
    for (const remoteMemory of remoteMemoryMap.values()) {
      // 检查是否在本地删除记录中
      const deletionRecord = deletedMemoryIdsMap.get(remoteMemory.id);
      if (deletionRecord !== undefined && deletionRecord > lastSyncTime) {
        // 本地删除时间晚于上次同步，说明是用户本地删除的，不添加
        continue;
      }

      const existingByContent = contentMap.get(remoteMemory.content);
      if (existingByContent) {
        // 内容重复，保留 lastAccessedAt 更新的
        if (remoteMemory.lastAccessedAt > existingByContent.lastAccessedAt) {
          const idx = finalMemories.indexOf(existingByContent);
          if (idx >= 0) {
            finalMemories[idx] = remoteMemory;
          }
          contentMap.set(remoteMemory.content, remoteMemory);
        }
      } else {
        finalMemories.push(remoteMemory);
        contentMap.set(remoteMemory.content, remoteMemory);
      }
    }

    // 上传路径 strip：去除本地才关心的字段（embedding / embeddingModel / memoryScoreBreakdown），
    // 以及防御性去除可能残留在旧数据中的 attachedTo 字段。
    const strippedMemories = finalMemories.map((m) =>
      SyncDataService.stripLocalFieldsFromMemory(m),
    );
    const strippedBooks = finalBooks.map((b) => SyncDataService.stripLocalFieldsFromNovel(b));

    return {
      novels: strippedBooks,
      aiModels: finalModels,
      appSettings: finalSettings,
      coverHistory: dedupedCovers,
      memories: strippedMemories,
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
            omit(
              sync,
              'lastSyncTime',
              'lastSyncedModelIds',
              'lastRemoteUpdatedAt',
              // 删除记录在 applyDownloadedData 中会被合并/清理，
              // 导致本地与远程出现差异，不应作为"需要上传"的判断依据
              'deletedNovelIds',
              'deletedModelIds',
              'deletedCoverIds',
              'deletedCoverUrls',
              'deletedMemoryIds',
            ),
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
      if (
        localMemory.content !== remoteMemory.content ||
        localMemory.summary !== remoteMemory.summary
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查自上次同步以来本地数据是否有变更（不需要远程数据做比较）
   * 用于 downloadSkipped 场景：远程无变更，只需判断本地是否有新修改
   *
   * 检查逻辑：
   * 1. 书籍：任何书籍的 lastEdited > lastSyncTime
   * 2. AI 模型：任何模型的 lastEdited > lastSyncTime
   * 3. 设置：settings 的 lastEdited > lastSyncTime
   * 4. 封面历史：任何封面的 addedAt > lastSyncTime
   * 5. Memory：任何记忆的 lastAccessedAt > lastSyncTime
   *
   * @param localData 当前本地数据
   * @param lastSyncTime 上次同步时间（毫秒时间戳），0 表示首次同步（视为有变更）
   * @returns 如果本地有变更返回 true
   * @deprecated 由 `hasLocalChangesByHash` 取代——manifest 驱动路径使用哈希比对，
   *   不再依赖基于 `lastSyncTime` 的启发式。保留仅用于遗留路径与回归测试对比。
   */
  static hasLocalChangesSinceLastSync(
    localData: {
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    lastSyncTime: number,
  ): boolean {
    // 首次同步（lastSyncTime === 0）：视为有变更，需要上传
    if (lastSyncTime <= 0) return true;

    // 1. 检查书籍
    for (const novel of localData.novels) {
      if (novel.lastEdited && checkIsNewlyAdded(novel.lastEdited, lastSyncTime)) {
        return true;
      }
    }

    // 2. 检查 AI 模型
    for (const model of localData.aiModels) {
      if (model.lastEdited && checkIsNewlyAdded(model.lastEdited, lastSyncTime)) {
        return true;
      }
    }

    // 3. 检查设置
    if (
      localData.appSettings?.lastEdited &&
      checkIsNewlyAdded(localData.appSettings.lastEdited, lastSyncTime)
    ) {
      return true;
    }

    // 4. 检查封面历史
    for (const cover of localData.coverHistory) {
      if (cover.addedAt && checkIsNewlyAdded(cover.addedAt, lastSyncTime)) {
        return true;
      }
    }

    // 5. 检查 Memory
    for (const memory of localData.memories) {
      if (memory.lastAccessedAt && checkIsNewlyAdded(memory.lastAccessedAt, lastSyncTime)) {
        return true;
      }
    }

    // 6. 检查删除记录（用户删除了书籍/模型/封面，删除项不在上面的列表中，必须单独检测）
    const syncs = localData.appSettings?.syncs || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gistSync = syncs.find((s: any) => s.syncType === 'gist');
    if (gistSync) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasNewDeletion = (records: any[] | undefined): boolean => {
        if (!records || records.length === 0) return false;
        return records.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (record: any) => record.deletedAt && record.deletedAt > lastSyncTime,
        );
      };
      if (
        hasNewDeletion(gistSync.deletedNovelIds) ||
        hasNewDeletion(gistSync.deletedModelIds) ||
        hasNewDeletion(gistSync.deletedCoverIds) ||
        hasNewDeletion(gistSync.deletedCoverUrls)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 基于哈希比对检测本地是否有需要上传的变更。
   *
   * 比较本地 manifest 的每个条目哈希与 `knownRemoteHashes`（上次已知的远端状态）。
   * - 任一条目哈希不同 → 有变更
   * - 本地存在但 known 不存在 → 有变更（新条目）
   * - known 存在但本地不存在 → 有变更（本地删除）
   *
   * @param localHashes 当前本地 manifest 的 entryKey -> hash 字典
   * @param knownRemoteHashes SyncConfig 中持久化的上次已知远端哈希字典
   */
  static hasLocalChangesByHash(
    localHashes: Record<string, string>,
    knownRemoteHashes: Record<string, string>,
  ): boolean {
    const localKeys = new Set(Object.keys(localHashes));
    const knownKeys = new Set(Object.keys(knownRemoteHashes));

    for (const key of localKeys) {
      if (!knownKeys.has(key)) return true; // 本地新增
      if (localHashes[key] !== knownRemoteHashes[key]) return true; // 哈希不同
    }
    for (const key of knownKeys) {
      if (!localKeys.has(key)) return true; // 本地删除
    }
    return false;
  }

  /**
   * 基于 manifest diff 的选择性应用：仅合并变化的条目到本地。
   *
   * 与 `applyDownloadedData` 的差异：
   * - 输入是按 entry key 反序列化的 map（已经是选择性下载的结果）
   * - 每个条目按类型独立合并，不扫描全量数据
   * - 本方法不创建备份——调用方（executor）负责 backup/rollback 语义
   *
   * 合并规则：
   * - `settings`：比较 lastEdited，使用较新者
   * - `ai-models`：远端为准（应用时已经做过时间比较）
   * - `cover-history`：远端为准
   * - `novel:<id>`：使用 mergeNovelWithLocalContent 保留本地章节内容
   * - `memories:<id>`：按 lastAccessedAt 合并每本书的 memory 列表，内容去重
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async applyPartialRemoteData(changedEntries: Record<string, any>): Promise<void> {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settingsStore = useSettingsStore();
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;

    for (const [entryKey, entry] of Object.entries(changedEntries)) {
      if (!entry || typeof entry !== 'object' || !('kind' in entry)) continue;

      const kind = (entry as { kind: string }).kind;
      try {
        if (kind === 'settings') {
          const remoteSettings = (entry as { value: Record<string, unknown> }).value;
          const localSettings = settingsStore.getAllSettings();
          const localTime = localSettings.lastEdited
            ? new Date(localSettings.lastEdited as unknown as string).getTime()
            : 0;
          const remoteTime = remoteSettings.lastEdited
            ? new Date(remoteSettings.lastEdited as unknown as string).getTime()
            : 0;
          if (remoteTime > localTime) {
            await settingsStore.importSettings(remoteSettings);
          }
        } else if (kind === 'ai-models') {
          const remoteModels = (entry as { value: Array<Record<string, unknown>> }).value;
          const gistSync = GlobalConfig.getGistSyncSnapshot();
          const lastSyncTime = gistSync?.lastSyncTime ?? 0;
          const deletedModelMap = new Map<string, number>(
            (gistSync?.deletedModelIds ?? []).map((r) => [r.id, r.deletedAt]),
          );

          const remoteIds = new Set<string>();
          for (const rm of remoteModels) {
            const rmId = rm.id as string;
            remoteIds.add(rmId);
            const localModel = aiModelsStore.models.find((m) => m.id === rmId);
            if (!localModel) {
              // 本地无此模型——检查是否被本地删除（防止跨设备恢复）
              const deletedAt = deletedModelMap.get(rmId);
              if (deletedAt !== undefined && deletedAt > lastSyncTime) continue;
              await aiModelService.saveModel(
                rm as unknown as Parameters<typeof aiModelService.saveModel>[0],
              );
              aiModelsStore.models.push(rm as unknown as (typeof aiModelsStore.models)[number]);
              continue;
            }
            const lt = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
            const rt = rm.lastEdited ? new Date(rm.lastEdited as string).getTime() : 0;
            if (rt > lt) {
              await aiModelService.saveModel(
                rm as unknown as Parameters<typeof aiModelService.saveModel>[0],
              );
              const idx = aiModelsStore.models.findIndex((m) => m.id === rmId);
              if (idx >= 0) {
                aiModelsStore.models[idx] = rm as unknown as (typeof aiModelsStore.models)[number];
              }
            }
          }

          // 跨设备删除传播：远端聚合条目不再包含某个模型且本地自上次同步后未编辑，
          // 视为远端删除——否则无法在多设备间传播 AI 模型删除
          const localModelsSnapshot = [...aiModelsStore.models];
          for (const localModel of localModelsSnapshot) {
            if (remoteIds.has(localModel.id)) continue;
            const lt = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
            // 本地自上次同步后被编辑（新增/更新）——保留，让后续上传把它推给远端
            if (lastSyncTime === 0 || lt > lastSyncTime) continue;
            try {
              await aiModelService.deleteModel(localModel.id);
            } catch (e) {
              console.warn('[SyncDataService] 传播远端模型删除失败:', localModel.id, e);
            }
            const idx = aiModelsStore.models.findIndex((m) => m.id === localModel.id);
            if (idx >= 0) aiModelsStore.models.splice(idx, 1);
          }
        } else if (kind === 'cover-history') {
          const remoteCovers = (entry as { value: Array<Record<string, unknown>> }).value;
          const gistSync = GlobalConfig.getGistSyncSnapshot();
          const lastSyncTime = gistSync?.lastSyncTime ?? 0;
          const deletedCoverMap = new Map<string, number>(
            (gistSync?.deletedCoverIds ?? []).map((r) => [r.id, r.deletedAt]),
          );

          // upsert 远端封面；跳过那些本地删除晚于上次同步的
          const remoteCoverIds = new Set<string>();
          for (const rc of remoteCovers) {
            const rcId = rc.id as string;
            remoteCoverIds.add(rcId);
            const deletedAt = deletedCoverMap.get(rcId);
            if (deletedAt !== undefined && deletedAt > lastSyncTime) continue;
            await coverHistoryStore.addCover(
              rc as unknown as Parameters<typeof coverHistoryStore.addCover>[0],
            );
          }

          // 跨设备删除传播：远端聚合条目不再包含某个封面且本地自上次同步后未新增，
          // 视为远端删除
          const localCoversSnapshot = [...coverHistoryStore.covers];
          for (const localCover of localCoversSnapshot) {
            if (remoteCoverIds.has(localCover.id)) continue;
            const addedAt = localCover.addedAt
              ? new Date(localCover.addedAt as unknown as string | number | Date).getTime()
              : 0;
            if (lastSyncTime === 0 || addedAt > lastSyncTime) continue;
            try {
              await coverHistoryStore.removeCover(localCover.id);
            } catch (e) {
              console.warn('[SyncDataService] 传播远端封面删除失败:', localCover.id, e);
            }
          }
        } else if (kind === 'novel') {
          const remoteNovel = (entry as { value: Novel }).value;
          const localNovel = booksStore.books.find((b) => b.id === remoteNovel.id);
          if (!localNovel) {
            // 本地无此书籍——检查是否被本地删除（防止跨设备恢复）
            const deletedNovelMap = new Map<string, number>(
              (gistSync?.deletedNovelIds ?? []).map((r) => [r.id, r.deletedAt]),
            );
            const deletedAt = deletedNovelMap.get(remoteNovel.id);
            if (deletedAt !== undefined && deletedAt > lastSyncTime) {
              continue; // 本地主动删除了，不恢复
            }
            await booksStore.bulkAddBooks([remoteNovel]);
          } else {
            const localTime = localNovel.lastEdited ? new Date(localNovel.lastEdited).getTime() : 0;
            const remoteTime = remoteNovel.lastEdited
              ? new Date(remoteNovel.lastEdited).getTime()
              : 0;
            if (remoteTime > localTime) {
              const merged = await SyncDataService.mergeNovelWithLocalContent(
                remoteNovel,
                localNovel,
                lastSyncTime,
              );
              await booksStore.bulkAddBooks([merged]);
            } else {
              // 本地较新：仍然防御性地把远端独有的翻译合入本地。
              // 翻译写入在某些路径下不会 bump novel.lastEdited（例如仅更新段落翻译数组），
              // 这种情况下时间戳比较会漏掉远端的新翻译——fallback 保证它们不会丢。
              try {
                const localNovelWithContent =
                  await SyncDataService.ensureNovelContentLoaded(localNovel);
                const mergedNovel = await mergeRemoteTranslationsIntoLocalNovel(
                  localNovelWithContent,
                  remoteNovel,
                  lastSyncTime,
                );
                await booksStore.bulkAddBooks([mergedNovel]);
              } catch (e) {
                console.warn(
                  `[SyncDataService] 合并远端翻译失败 (novel:${remoteNovel.id})，保留本地:`,
                  e,
                );
              }
            }
          }
        } else if (kind === 'memories') {
          const bookId = (entry as { bookId: string }).bookId;
          const remoteMemories = (entry as { value: Memory[] }).value;
          const localMemories = await MemoryService.getAllMemories(bookId);
          const gistSync = GlobalConfig.getGistSyncSnapshot();
          const lastSyncTime = gistSync?.lastSyncTime ?? 0;
          const deletedMemoryIds = gistSync?.deletedMemoryIds || [];
          const deletedMap = new Map<string, number>(
            deletedMemoryIds.map((r) => [r.id, r.deletedAt]),
          );

          const remoteIds = new Set(remoteMemories.map((m) => m.id));
          const finalMap = new Map<string, Memory>();

          // 1. 远端 memory：按 id 去重（保留 lastAccessedAt 更大的），跳过被本地删除的
          for (const rm of remoteMemories) {
            const deletion = deletedMap.get(rm.id);
            if (deletion !== undefined && deletion > lastSyncTime) {
              continue;
            }
            const existing = finalMap.get(rm.id);
            if (!existing || rm.lastAccessedAt > existing.lastAccessedAt) {
              finalMap.set(rm.id, rm);
            }
          }

          // 2. 本地独有 memory：
          //    - 若 lastAccessedAt > lastSyncTime → 本地新增/刚访问过，保留（下次上传传给远端）
          //    - 若 lastAccessedAt <= lastSyncTime 且远端列表非空 → 远端已删除，本地视同删除
          //    - 若远端列表为空 → 保留本地（避免远端空载时误删）
          for (const local of localMemories) {
            if (remoteIds.has(local.id)) {
              // 远端有同 id 的记录，以远端版本合并（已在步骤 1 处理）；这里补登记本地版本用于后续 max
              const existing = finalMap.get(local.id);
              if (!existing || local.lastAccessedAt > existing.lastAccessedAt) {
                finalMap.set(local.id, local);
              }
              continue;
            }
            const isFreshLocal = lastSyncTime === 0 || local.lastAccessedAt > lastSyncTime;
            if (isFreshLocal || remoteMemories.length === 0) {
              finalMap.set(local.id, local);
            }
            // 否则：陈旧本地 memory + 远端非空 → 视为远端删除，不保留
          }

          // 内容去重：同 content 保留 lastAccessedAt 更大的
          const byContent = new Map<string, Memory>();
          for (const m of finalMap.values()) {
            const ex = byContent.get(m.content);
            if (!ex || m.lastAccessedAt > ex.lastAccessedAt) {
              byContent.set(m.content, m);
            }
          }

          const finalList = Array.from(byContent.values());
          const finalIds = new Set(finalList.map((m) => m.id));

          // 删除不在 finalList 的本地 memory
          for (const local of localMemories) {
            if (!finalIds.has(local.id)) {
              try {
                await MemoryService.deleteMemory(bookId, local.id);
              } catch (e) {
                console.warn(`[SyncDataService] 删除 Memory ${local.id} 失败:`, e);
              }
            }
          }

          // 保存最终列表：使用 upsertMemoryForSync 按远端字段原样写入，
          // 不对时间戳做 min/max 钳制——否则下一轮计算的 hash 会与 manifest 不一致
          for (const m of finalList) {
            await MemoryService.upsertMemoryForSync(m);
          }
        }
      } catch (error) {
        console.error(`[SyncDataService] applyPartialRemoteData 处理条目 ${entryKey} 失败:`, error);
        // 继续处理其他条目，不中止整个 apply
      }
    }
  }

  /**
   * 应用远端删除：把远端 manifest 中的墓碑或隐式删除传播到本地。
   *
   * 冲突策略：
   * - 若传入 `deletedAt`（来自远端墓碑）：对比本地 `lastEdited` 与 `deletedAt`；
   *   若本地更新更晚，视为"本地主动持有"，保留本地；否则删除。
   * - 若未传入 `deletedAt`（隐式删除，无墓碑信息）：回退到"本地在 lastSyncTime 后修改过则保留"的启发式。
   *
   * @param deletions 远端已删除的条目列表，可选带 deletedAt（墓碑时间戳）
   */
  static async applyRemoteDeletions(
    deletions: Array<{ key: string; deletedAt?: string }>,
  ): Promise<void> {
    if (!deletions.length) return;

    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;

    // 阈值：有墓碑用墓碑时间，否则回退到 lastSyncTime
    const thresholdFor = (deletedAt: string | undefined): number => {
      if (deletedAt) {
        const t = new Date(deletedAt).getTime();
        if (Number.isFinite(t)) return t;
      }
      return lastSyncTime;
    };

    for (const { key, deletedAt } of deletions) {
      try {
        // novel:<id> — 删除本地书籍（包括章节内容与 memories）
        if (key.startsWith('novel:')) {
          const bookId = key.slice('novel:'.length);
          const localBook = booksStore.books.find((b) => b.id === bookId);
          if (!localBook) continue; // 本地已无——什么都不做

          const localTime = localBook.lastEdited ? new Date(localBook.lastEdited).getTime() : 0;
          const threshold = thresholdFor(deletedAt);
          if (localTime > threshold) {
            // 本地编辑晚于删除时间（或 lastSyncTime）——保留本地
            console.info(
              `[SyncDataService] 跳过远端删除 ${key}：本地编辑 ${new Date(localTime).toISOString()} 晚于阈值 ${new Date(threshold).toISOString()}`,
            );
            continue;
          }

          try {
            await booksStore.deleteBook(bookId);
          } catch (e) {
            console.warn(`[SyncDataService] 删除本地书籍 ${bookId} 失败:`, e);
          }
          continue;
        }

        // memories:<bookId> — 清空该书的所有 memories（无墓碑，回退 lastSyncTime 启发式）
        if (key.startsWith('memories:')) {
          const bookId = key.slice('memories:'.length);
          const localMemories = await MemoryService.getAllMemories(bookId);
          if (localMemories.length === 0) continue;

          const threshold = thresholdFor(deletedAt);
          const hasRecent = localMemories.some((m) => m.lastAccessedAt > threshold);
          if (hasRecent) {
            console.info(`[SyncDataService] 跳过远端删除 ${key}：本地有较新的 memory 活动`);
            continue;
          }

          for (const m of localMemories) {
            try {
              await MemoryService.deleteMemory(bookId, m.id);
            } catch (e) {
              console.warn(`[SyncDataService] 删除 Memory ${m.id} 失败:`, e);
            }
          }
          continue;
        }

        // 聚合条目（ai-models / cover-history / settings）：不做整体删除
        if (key === 'ai-models' || key === 'cover-history' || key === 'settings') {
          console.info(`[SyncDataService] 忽略聚合条目的远端删除 ${key}（需手动确认）`);
          void aiModelsStore;
          continue;
        }
      } catch (error) {
        console.error(`[SyncDataService] applyRemoteDeletions 处理 ${key} 失败:`, error);
      }
    }
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
    lastSyncTime = 0,
  ): Promise<Novel> {
    const mergedNovel = await mergeNovelKeepingPrimary(remoteNovel, localNovel, true, lastSyncTime);
    return {
      ...mergedNovel,
      createdAt: remoteNovel.createdAt || localNovel.createdAt,
      lastEdited: remoteNovel.lastEdited || localNovel.lastEdited,
    };
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
