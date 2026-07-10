import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import {
  useSettingsStore,
  getSyncDeletionPropagationStateClearedPatch,
} from 'src/stores/settings';
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
import { stripNovelLocalFields } from 'src/utils/sync-strip';

/** 取数组或缺省值，null/undefined 视为空数组 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrayOrEmpty<T = any>(value: T[] | null | undefined): T[] {
  return value || [];
}

/** 三路合并单个同步字段：本地值优先，其次远端，最后回退值 */
function mergeSyncField<T>(
  localValue: T | undefined,
  remoteValue: T | undefined,
  fallback: T,
): T {
  return localValue ?? remoteValue ?? fallback;
}

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

/** 章节/卷标题的通用形态（原文字符串或带译文的对象） */
type OriginalTitle = string | { original: string; translation: Translation };

/**
 * 合并配对章节/卷的标题：胜者标题还是纯原文、败者已带同原文的译文对象时，采用败者，
 * 避免"重新抓取的一侧获胜"把另一侧已翻译的标题冲掉。其余情况保持胜者标题。
 */
function mergeTitlePreservingTranslation(
  winnerTitle: OriginalTitle,
  loserTitle: OriginalTitle,
): OriginalTitle {
  if (
    typeof winnerTitle === 'string' &&
    typeof loserTitle === 'object' &&
    loserTitle !== null &&
    loserTitle.original === winnerTitle
  ) {
    return loserTitle;
  }
  return winnerTitle;
}

/** 取卷原文标题（兼容 string / {original, translation} 两种格式），与本地导入的卷匹配语义一致 */
function getVolumeOriginalTitle(volume: Volume): string {
  if (typeof volume.title === 'string') {
    return volume.title;
  }
  return volume.title?.original ?? '';
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
  const localNovelTime = primaryIsRemote
    ? getMergeTimestamp(secondaryNovelLastEdited)
    : getMergeTimestamp(primaryNovelLastEdited);
  // 本地独有章节：远端书自上次同步未变 → 本地新增，保留；否则仅当章节新于上次同步才保留
  const shouldKeepLocalOnlyChapter = (chapter: Chapter): boolean =>
    shouldKeepLocalOnlyItem(getMergeTimestamp(chapter.lastEdited), remoteNovelTime, lastSyncTime);
  // 远端独有章节（镜像规则）：本地书自上次同步未变 → 本地不可能删除过它，保留；
  // 本地变过 → 仅当远端章节新于上次同步才保留，否则视为本地已删除的残留（防复活）
  const shouldKeepRemoteOnlyChapter = (chapter: Chapter): boolean =>
    shouldKeepLocalOnlyItem(getMergeTimestamp(chapter.lastEdited), localNovelTime, lastSyncTime);
  const shouldKeepPrimaryOnlyChapter = primaryIsRemote
    ? shouldKeepRemoteOnlyChapter
    : shouldKeepLocalOnlyChapter;
  const shouldKeepSecondaryOnlyChapter = primaryIsRemote
    ? shouldKeepLocalOnlyChapter
    : shouldKeepRemoteOnlyChapter;

  if (!primaryChapters || primaryChapters.length === 0) {
    if (!secondaryChapters || secondaryChapters.length === 0) {
      return primaryChapters;
    }
    const chapters = secondaryChapters.filter(shouldKeepSecondaryOnlyChapter);
    return Promise.all(chapters.map(ensureChapterContentLoadedForNovelMerge));
  }
  if (!secondaryChapters || secondaryChapters.length === 0) {
    const chapters = primaryChapters.filter(shouldKeepPrimaryOnlyChapter);
    return Promise.all(chapters.map(ensureChapterContentLoadedForNovelMerge));
  }

  const primaryChapterIds = new Set(primaryChapters.map((chapter) => chapter.id));
  const secondaryChapterMap = new Map<string, Chapter>();
  // webUrl 回退索引：两台设备各自抓取同一章节会生成不同的章节 id，
  // webUrl 才是跨设备稳定标识（与本地导入 mergeChapterInto 的去重键一致）。
  // 用 FIFO 队列 + 消费标记，与段落文本回退同构，防止同 URL 被双重消费。
  // 已与某个 primary 同 id 的章节不进回退索引，避免被别的章节抢先消费。
  const secondaryByWebUrl = new Map<string, Chapter[]>();
  for (const chapter of secondaryChapters) {
    secondaryChapterMap.set(chapter.id, chapter);
    if (chapter.webUrl && !primaryChapterIds.has(chapter.id)) {
      const queue = secondaryByWebUrl.get(chapter.webUrl);
      if (queue) queue.push(chapter);
      else secondaryByWebUrl.set(chapter.webUrl, [chapter]);
    }
  }

  // 同步预配对（先按 id，再按 webUrl 回退），避免在并发的 async 回调里竞争消费队列
  const consumedSecondaryIds = new Set<string>();
  const chapterPairs = primaryChapters.map((primaryChapter) => {
    let secondaryChapter = secondaryChapterMap.get(primaryChapter.id);
    if (!secondaryChapter && primaryChapter.webUrl) {
      const queue = secondaryByWebUrl.get(primaryChapter.webUrl);
      while (queue && queue.length > 0) {
        const candidate = queue.shift();
        if (candidate && !consumedSecondaryIds.has(candidate.id)) {
          secondaryChapter = candidate;
          break;
        }
      }
    }
    if (secondaryChapter) {
      consumedSecondaryIds.add(secondaryChapter.id);
    }
    return { primaryChapter, secondaryChapter };
  });

  const mergedChapters = await Promise.all(
    chapterPairs.map(async ({ primaryChapter, secondaryChapter }) => {
      if (!secondaryChapter) {
        if (!shouldKeepPrimaryOnlyChapter(primaryChapter)) {
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
      const losingChapter = preferRemoteChapter ? localChapter : remoteChapter;
      const mergedTitle = mergeTitlePreservingTranslation(
        winningChapter.title,
        losingChapter.title,
      );

      const localContent = await loadChapterContentForNovelMerge(localChapter);
      const remoteContent = await loadChapterContentForNovelMerge(remoteChapter);

      if (localContent.length === 0 && remoteContent.length === 0) {
        return mergedTitle === winningChapter.title
          ? winningChapter
          : { ...winningChapter, title: mergedTitle };
      }

      return {
        ...winningChapter,
        title: mergedTitle,
        content: mergeParagraphTranslations(localContent, remoteContent, preferRemoteChapter),
      };
    }),
  );
  const compactMergedChapters = mergedChapters.filter((chapter): chapter is Chapter => !!chapter);

  // 追加副方独有章节（未被 id 或 webUrl 匹配消费过的），内容并行加载
  const appendedSecondaryChapters = await Promise.all(
    secondaryChapters
      .filter(
        (chapter) =>
          !primaryChapterIds.has(chapter.id) &&
          !consumedSecondaryIds.has(chapter.id) &&
          shouldKeepSecondaryOnlyChapter(chapter),
      )
      .map(ensureChapterContentLoadedForNovelMerge),
  );
  compactMergedChapters.push(...appendedSecondaryChapters);

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
  // 本地独有卷：与章节同规则（卷时间戳取卷内章节最新 lastEdited）
  const shouldKeepLocalOnlyVolume = (volume: Volume): boolean => {
    const volumeTimestamp = getVolumeMergeTimestamp(volume);
    const effectiveTime = volumeTimestamp > 0 ? volumeTimestamp : localNovelTime;
    return shouldKeepLocalOnlyItem(effectiveTime, remoteNovelTime, lastSyncTime);
  };
  // 远端独有卷（镜像规则）：本地书自上次同步未变 → 保留；本地变过 → 仅当卷内容
  // 新于上次同步才保留，否则视为本地已删除的残留（防复活）
  const shouldKeepRemoteOnlyVolume = (volume: Volume): boolean => {
    const volumeTimestamp = getVolumeMergeTimestamp(volume);
    const effectiveTime = volumeTimestamp > 0 ? volumeTimestamp : remoteNovelTime;
    return shouldKeepLocalOnlyItem(effectiveTime, localNovelTime, lastSyncTime);
  };
  const shouldKeepPrimaryOnlyVolume = primaryIsRemote
    ? shouldKeepRemoteOnlyVolume
    : shouldKeepLocalOnlyVolume;
  const shouldKeepSecondaryOnlyVolume = primaryIsRemote
    ? shouldKeepLocalOnlyVolume
    : shouldKeepRemoteOnlyVolume;

  // 单边有 volumes 时的共用分支：对 volumes 逐个并行合并 chapters（对端缺失传 undefined）
  const mergeSingleSideVolumes = (volumes: Volume[]): Promise<Volume[]> =>
    Promise.all(
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

  if (!primaryVolumes || primaryVolumes.length === 0) {
    if (!secondaryVolumes || secondaryVolumes.length === 0) {
      return primaryVolumes;
    }
    return mergeSingleSideVolumes(secondaryVolumes.filter(shouldKeepSecondaryOnlyVolume));
  }
  if (!secondaryVolumes || secondaryVolumes.length === 0) {
    return mergeSingleSideVolumes(primaryVolumes.filter(shouldKeepPrimaryOnlyVolume));
  }

  const primaryVolumeIds = new Set(primaryVolumes.map((volume) => volume.id));
  const secondaryVolumeMap = new Map<string, Volume>();
  // 原文标题回退索引：两台设备各自抓取同一卷会生成不同的卷 id，
  // 原文标题才是跨设备稳定标识（与本地导入 findVolumeIndexByOriginalTitle 语义一致）。
  const secondaryByTitle = new Map<string, Volume[]>();
  for (const volume of secondaryVolumes) {
    secondaryVolumeMap.set(volume.id, volume);
    if (!primaryVolumeIds.has(volume.id)) {
      const titleKey = getVolumeOriginalTitle(volume);
      const queue = secondaryByTitle.get(titleKey);
      if (queue) queue.push(volume);
      else secondaryByTitle.set(titleKey, [volume]);
    }
  }

  // 同步预配对（先按 id，再按原文标题回退），与章节配对同构
  const consumedSecondaryVolumeIds = new Set<string>();
  const volumePairs = primaryVolumes.map((primaryVolume) => {
    let secondaryVolume = secondaryVolumeMap.get(primaryVolume.id);
    if (!secondaryVolume) {
      const queue = secondaryByTitle.get(getVolumeOriginalTitle(primaryVolume));
      while (queue && queue.length > 0) {
        const candidate = queue.shift();
        if (candidate && !consumedSecondaryVolumeIds.has(candidate.id)) {
          secondaryVolume = candidate;
          break;
        }
      }
    }
    if (secondaryVolume) {
      consumedSecondaryVolumeIds.add(secondaryVolume.id);
    }
    return { primaryVolume, secondaryVolume };
  });

  const mergedVolumes = await Promise.all(
    volumePairs.map(async ({ primaryVolume, secondaryVolume }) => {
      if (!secondaryVolume) {
        if (!shouldKeepPrimaryOnlyVolume(primaryVolume)) {
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
        title: mergeTitlePreservingTranslation(primaryVolume.title, secondaryVolume.title),
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

  // 追加副方独有卷（未被 id 或标题匹配消费过的），章节合并并行执行
  const appendedSecondaryVolumes = await Promise.all(
    secondaryVolumes
      .filter(
        (volume) =>
          !primaryVolumeIds.has(volume.id) &&
          !consumedSecondaryVolumeIds.has(volume.id) &&
          shouldKeepSecondaryOnlyVolume(volume),
      )
      .map(async (secondaryVolume) => ({
        ...secondaryVolume,
        chapters: await mergeNovelChapters(
          secondaryVolume.chapters,
          undefined,
          preferRemoteSelection,
          primaryNovelLastEdited,
          secondaryNovelLastEdited,
          lastSyncTime,
        ),
      })),
  );
  compactMergedVolumes.push(...appendedSecondaryVolumes);

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
 * 为 hasChangesToUpload 的深度比较准备 appSettings 副本：
 * - 去掉 lastEdited（每次写入都会变）
 * - 去掉 syncs 中每条的 lastSyncTime/lastSyncedModelIds/lastRemoteUpdatedAt
 * - 去掉所有墓碑（会在下载合并路径中改动，不应触发上传判定）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareAppSettingsForDiff(settings: any): any {
  const omitted = omit(settings, 'lastEdited');
  if (omitted.syncs && Array.isArray(omitted.syncs)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    omitted.syncs = omitted.syncs.map((sync: any) =>
      omit(
        sync,
        'lastSyncTime',
        'lastSyncedModelIds',
        'lastRemoteUpdatedAt',
        'deletedNovelIds',
        'deletedModelIds',
        'deletedCoverIds',
        'deletedCoverUrls',
        'deletedMemoryIds',
      ),
    );
  }
  return omitted;
}

/**
 * 校验一个数组：每个元素必须是对象且具备非空字符串 id 字段（用于 novels/aiModels/coverHistory）
 */
function validateObjectArrayWithIdField(
  value: unknown,
  fieldName: string,
  itemLabel: string,
): boolean {
  if (value === null || value === undefined) return true;
  if (!Array.isArray(value)) {
    console.error(`[SyncDataService] 验证失败: ${fieldName} 必须是数组`);
    return false;
  }
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      console.error(`[SyncDataService] 验证失败: ${itemLabel} 必须是对象`);
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (item as any).id;
    if (!id || typeof id !== 'string') {
      console.error(`[SyncDataService] 验证失败: ${itemLabel} 必须包含有效的 id`);
      return false;
    }
  }
  return true;
}

/**
 * 校验 memories 数组：每个元素除 id 外还需带 bookId
 */
function validateMemoriesArray(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!Array.isArray(value)) {
    console.error('[SyncDataService] 验证失败: memories 必须是数组');
    return false;
  }
  for (const memory of value) {
    if (!memory || typeof memory !== 'object') {
      console.error('[SyncDataService] 验证失败: memory 必须是对象');
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = memory as any;
    if (!m.id || typeof m.id !== 'string') {
      console.error('[SyncDataService] 验证失败: memory 必须包含有效的 id');
      return false;
    }
    if (!m.bookId || typeof m.bookId !== 'string') {
      console.error('[SyncDataService] 验证失败: memory 必须包含有效的 bookId');
      return false;
    }
  }
  return true;
}

/**
 * 合并本地与远端的删除记录：按 id 去重，保留最新的 deletedAt。
 */
function mergeDeletionRecords(
  local: DeletionRecord[] = [],
  remote: DeletionRecord[] = [],
): DeletionRecord[] {
  const mergedMap = new Map<string, DeletionRecord>();
  for (const record of local) {
    mergedMap.set(record.id, record);
  }
  for (const record of remote) {
    const existing = mergedMap.get(record.id);
    if (!existing || record.deletedAt > existing.deletedAt) {
      mergedMap.set(record.id, record);
    }
  }
  return Array.from(mergedMap.values());
}

/**
 * 合并按 URL 的删除记录（用于封面），按规范化后的 URL 去重。
 */
function mergeUrlDeletionRecords(
  local: Array<{ url: string; deletedAt: number }> = [],
  remote: Array<{ url: string; deletedAt: number }> = [],
): Array<{ url: string; deletedAt: number }> {
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
    if (!remoteData) return true; // null 数据是有效的（表示没有远程数据）

    if (!validateObjectArrayWithIdField(remoteData.novels, 'novels', 'novel')) return false;
    if (!validateObjectArrayWithIdField(remoteData.aiModels, 'aiModels', 'model')) return false;
    if (!validateObjectArrayWithIdField(remoteData.coverHistory, 'coverHistory', 'cover')) {
      return false;
    }
    if (!validateMemoriesArray(remoteData.memories)) return false;

    // appSettings 可以是任何对象，不需要严格验证
    return true;
  }

  /**
   * 创建数据备份（用于回滚）
   *
   * store 中的 books 只有元数据——章节内容存于独立的 chapter-contents store，
   * 而覆盖/应用流程可能清空或改写它。备份必须把全部章节内容内联进 books，
   * 否则回滚只能还原元数据，段落与译文会永久丢失。加载失败时直接抛错，
   * 宁可中止本次操作也不能在没有完整备份的情况下执行破坏性写入。
   */
  private static async createBackup(): Promise<DataBackup> {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();
    const settings = GlobalConfig.getAllSettingsSnapshot();
    const gistSync = GlobalConfig.getGistSyncSnapshot();

    const booksWithContent = await ChapterContentService.loadAllChapterContentsForNovels(
      booksStore.books,
    );

    return {
      models: JSON.parse(JSON.stringify(aiModelsStore.models)),
      books: JSON.parse(JSON.stringify(booksWithContent)),
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

    // 创建数据备份（用于回滚，含内联章节内容）
    const backup = await SyncDataService.createBackup();

    const restorableItems: RestorableItem[] = [];

    // 如果没有传入 lastSyncTime，从设置中获取
    const gistSyncSnapshot = GlobalConfig.getGistSyncSnapshot();
    const syncTime = lastSyncTime ?? gistSyncSnapshot?.lastSyncTime ?? 0;

    try {
      if (remoteData.aiModels && Array.isArray(remoteData.aiModels)) {
        await SyncDataService.applyDownloadedAiModels(
          remoteData.aiModels,
          gistSyncSnapshot,
          syncTime,
          isManualRetrieval,
          restorableItems,
        );
      }

      if (remoteData.novels && Array.isArray(remoteData.novels)) {
        await SyncDataService.applyDownloadedNovels(
          remoteData.novels,
          gistSyncSnapshot,
          syncTime,
          isManualRetrieval,
          restorableItems,
        );
      }

      if (remoteData.coverHistory && Array.isArray(remoteData.coverHistory)) {
        await SyncDataService.applyDownloadedCoverHistory(
          remoteData.coverHistory,
          gistSyncSnapshot,
          syncTime,
          isManualRetrieval,
          restorableItems,
        );
      }

      if (remoteData.memories && Array.isArray(remoteData.memories)) {
        await SyncDataService.applyDownloadedMemories(
          remoteData.memories,
          gistSyncSnapshot,
          syncTime,
          isManualRetrieval,
          restorableItems,
        );
      }

      if (remoteData.appSettings) {
        await SyncDataService.applyDownloadedAppSettings(remoteData.appSettings, isManualRetrieval);
      }

      if (remoteData.appSettings?.syncs) {
        await SyncDataService.mergeDeletionRecordsFromRemote(remoteData.appSettings.syncs);
      }

      // 清理旧的删除记录（每次同步时都清理，避免记录无限增长）
      const settingsStore = useSettingsStore();
      await settingsStore.cleanupOldDeletionRecords();

      // 返回可恢复的项目（仅在手动检索时）
      return isManualRetrieval ? restorableItems : [];
    } catch (error) {
      // 发生错误，回滚到备份数据
      console.error('[SyncDataService] 应用下载数据时发生错误，正在回滚:', error);
      await SyncDataService.rollbackWithBackupOrThrow(backup, error, '应用数据失败');
      throw error; // unreachable，但 TS 的控制流推断需要这行
    }
  }

  /**
   * 统一的"回滚兜底"：尝试从备份恢复，如再次失败则构造带双重错误信息的新错误抛出。
   * 供 applyDownloadedData / restoreSnapshotOverwrite 共用。
   */
  private static async rollbackWithBackupOrThrow(
    backup: DataBackup,
    error: unknown,
    errorPrefix: string,
  ): Promise<never> {
    try {
      await SyncDataService.restoreFromBackup(backup);
    } catch (rollbackError) {
      console.error('[SyncDataService] 回滚失败:', rollbackError);
      throw new Error(
        `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}; ` +
          `回滚也失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }
    throw error;
  }

  /**
   * 查询封面 id / url 两张墓碑表，返回二者里更晚的一个 deletedAt（都缺则 undefined）。
   * 供 selectFinalCover / collectRemoteOnlyCovers 等共用，避免三元合并逻辑被抄两份。
   */
  private static lookupCoverDeletionRecord(
    coverId: string,
    coverUrl: string | undefined,
    deletedCoverIdsMap: Map<string, number>,
    deletedCoverUrlsMap: Map<string, number>,
  ): number | undefined {
    const byId = deletedCoverIdsMap.get(coverId);
    const byUrl = coverUrl ? deletedCoverUrlsMap.get(coverUrl) : undefined;
    if (byId !== undefined && byUrl !== undefined) return Math.max(byId, byUrl);
    return byId ?? byUrl;
  }

  /**
   * shouldUseRemoteByTime / shouldUseRemoteForUpload 的共用实现：
   * 两端时间戳齐全时按远端>本地；否则交给 fallbackWhenMissing 决定。
   */
  private static compareEditTimeWithFallback(
    localLastEdited: Date | number | string | undefined,
    remoteLastEdited: Date | number | string | undefined,
    fallbackWhenMissing: boolean,
  ): boolean {
    if (localLastEdited && remoteLastEdited) {
      const localTime = new Date(localLastEdited).getTime();
      const remoteTime = new Date(remoteLastEdited).getTime();
      return remoteTime > localTime;
    }
    return fallbackWhenMissing;
  }

  /**
   * 决定是否使用远程值（基于 lastEdited 时间比较，缺失时间戳时默认偏好远程）。
   * 仅供 applyDownloadedData 各子步骤共用。
   */
  private static shouldUseRemoteByTime(
    localLastEdited?: Date | number | string,
    remoteLastEdited?: Date | number | string,
  ): boolean {
    return SyncDataService.compareEditTimeWithFallback(localLastEdited, remoteLastEdited, true);
  }

  /**
   * 选出单个远程 AI 模型对应的最终条目；若应跳过则返回 null。
   * 视语义：两边都有用最新时间戳；本地无则检查删除墓碑/新增判定。
   */
  private static selectFinalAiModel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remoteModel: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localModel: any,
    deletedModelIdsMap: Map<string, number>,
    syncTime: number,
    isManualRetrieval: boolean,
    modelIdsToUndelete: Set<string>,
    restorableItems: RestorableItem[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (localModel) {
      if (isManualRetrieval) return remoteModel;
      const localTime = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
      const remoteTime = remoteModel.lastEdited ? new Date(remoteModel.lastEdited).getTime() : 0;
      return remoteTime > localTime ? remoteModel : localModel;
    }

    // 本地不存在，检查删除记录
    const deletionRecord = deletedModelIdsMap.get(remoteModel.id);
    if (deletionRecord !== undefined) {
      if (deletionRecord > syncTime) {
        // 本地主动删除过，仅在手动检索时收集为可恢复项
        if (isManualRetrieval) {
          restorableItems.push({
            id: remoteModel.id,
            type: 'model',
            title: remoteModel.name || remoteModel.id,
            deletedAt: deletionRecord,
            data: remoteModel,
          });
        }
        return null;
      }
      // 旧删除记录：若远端自那之后有更新则恢复
      if (remoteModel.lastEdited) {
        const remoteTime = new Date(remoteModel.lastEdited).getTime();
        if (remoteTime > syncTime) {
          modelIdsToUndelete.add(remoteModel.id);
          return remoteModel;
        }
      }
      return null;
    }

    // 不在删除记录中：首次同步 / 手动检索 / 远端新增则保留
    if (
      syncTime === 0 ||
      isManualRetrieval ||
      (remoteModel.lastEdited && checkIsNewlyAdded(remoteModel.lastEdited, syncTime))
    ) {
      return remoteModel;
    }
    return null;
  }

  /**
   * 将远端模型与本地模型列表合并后持久化（put 新列表后删除不再需要的旧条目）。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async applyDownloadedAiModels(
    remoteModels: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    gistSyncSnapshot: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    syncTime: number,
    isManualRetrieval: boolean,
    restorableItems: RestorableItem[],
  ): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const settingsStore = useSettingsStore();

    const finalModels: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const deletedModelIds = gistSyncSnapshot?.deletedModelIds || [];
    const deletedModelIdsMap = new Map<string, number>(
      deletedModelIds.map((record: any) => [record.id, record.deletedAt] as const), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    const modelIdsToUndelete = new Set<string>();
    const localModelsById = new Map(aiModelsStore.models.map((m) => [m.id, m]));
    const remoteModelIds = new Set<string>(remoteModels.map((m) => m.id));

    for (const remoteModel of remoteModels) {
      const localModel = localModelsById.get(remoteModel.id);
      const winner = SyncDataService.selectFinalAiModel(
        remoteModel,
        localModel,
        deletedModelIdsMap,
        syncTime,
        isManualRetrieval,
        modelIdsToUndelete,
        restorableItems,
      );
      if (winner) finalModels.push(winner);
    }

    // 批量从删除记录中移除已恢复的模型
    if (modelIdsToUndelete.size > 0) {
      const updatedDeletedModelIds = deletedModelIds.filter(
        (record: any) => !modelIdsToUndelete.has(record.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      await settingsStore.updateGistSync({ deletedModelIds: updatedDeletedModelIds });
    }

    // 添加本地独有的模型（远端列表为空或本地新增）
    for (const localModel of aiModelsStore.models) {
      if (!remoteModelIds.has(localModel.id)) {
        if (
          remoteModels.length === 0 ||
          (localModel.lastEdited && checkIsNewlyAdded(localModel.lastEdited, syncTime))
        ) {
          finalModels.push(localModel);
        }
      }
    }

    // 先写入（upsert），再删除旧条目，避免 clear+add 中间态丢数据
    const finalModelIds = new Set(finalModels.map((m) => m.id));
    const staleModelIds = aiModelsStore.models
      .filter((m) => !finalModelIds.has(m.id))
      .map((m) => m.id);

    for (const model of finalModels) {
      await aiModelService.saveModel(model);
    }

    aiModelsStore.models = finalModels.map((m) => ({
      ...m,
      lastEdited: m.lastEdited ? new Date(m.lastEdited) : new Date(0),
    }));

    for (const staleId of staleModelIds) {
      try {
        await aiModelService.deleteModel(staleId);
      } catch (e) {
        console.warn('[SyncDataService] 删除旧模型失败:', staleId, e);
      }
    }
  }

  /**
   * 选出单个远程 Novel 对应的最终条目；若应跳过则返回 null。
   * 两边都有时分别走"远端赢"/"本地赢并合并远端翻译"分支。
   */
  private static async selectFinalNovel(
    remoteNovel: Novel,
    localNovel: Novel | undefined,
    deletedNovelIdsMap: Map<string, number>,
    syncTime: number,
    isManualRetrieval: boolean,
    localBooksEmpty: boolean,
    novelIdsToUndelete: Set<string>,
    restorableItems: RestorableItem[],
  ): Promise<Novel | null> {
    if (localNovel) {
      if (SyncDataService.shouldUseRemoteByTime(localNovel.lastEdited, remoteNovel.lastEdited)) {
        return SyncDataService.mergeNovelWithLocalContent(remoteNovel, localNovel, syncTime);
      }
      const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
      return mergeRemoteTranslationsIntoLocalNovel(localNovelWithContent, remoteNovel, syncTime);
    }

    const deletionRecord = deletedNovelIdsMap.get(remoteNovel.id);
    if (deletionRecord !== undefined) {
      if (deletionRecord > syncTime) {
        if (isManualRetrieval) {
          restorableItems.push({
            id: remoteNovel.id,
            type: 'novel',
            title: remoteNovel.title || remoteNovel.id,
            deletedAt: deletionRecord,
            data: remoteNovel,
          });
        }
        return null;
      }
      const remoteTime = new Date(remoteNovel.lastEdited).getTime();
      if (remoteTime > syncTime) {
        novelIdsToUndelete.add(remoteNovel.id);
        return remoteNovel;
      }
      return null;
    }

    if (
      syncTime === 0 ||
      localBooksEmpty ||
      isManualRetrieval ||
      checkIsNewlyAdded(remoteNovel.lastEdited, syncTime)
    ) {
      return remoteNovel;
    }
    return null;
  }

  /**
   * 应用远端书籍列表到本地：合并远端/本地，持久化后删除陈旧条目。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async applyDownloadedNovels(
    remoteNovels: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    gistSyncSnapshot: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    syncTime: number,
    isManualRetrieval: boolean,
    restorableItems: RestorableItem[],
  ): Promise<void> {
    const booksStore = useBooksStore();
    const settingsStore = useSettingsStore();

    const finalBooks: Novel[] = [];
    const deletedNovelIds = gistSyncSnapshot?.deletedNovelIds || [];
    const deletedNovelIdsMap = new Map<string, number>(
      deletedNovelIds.map((record: any) => [record.id, record.deletedAt] as const), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    const novelIdsToUndelete = new Set<string>();
    const localBooksEmpty = booksStore.books.length === 0;
    const localBooksById = new Map(booksStore.books.map((b) => [b.id, b]));
    const remoteNovelIds = new Set<string>(remoteNovels.map((n) => n.id));

    for (const remoteNovel of remoteNovels) {
      const localNovel = localBooksById.get(remoteNovel.id);
      const winner = await SyncDataService.selectFinalNovel(
        remoteNovel as Novel,
        localNovel,
        deletedNovelIdsMap,
        syncTime,
        isManualRetrieval,
        localBooksEmpty,
        novelIdsToUndelete,
        restorableItems,
      );
      if (winner) finalBooks.push(winner);
    }

    if (novelIdsToUndelete.size > 0) {
      const updatedDeletedNovelIds = deletedNovelIds.filter(
        (record: any) => !novelIdsToUndelete.has(record.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      await settingsStore.updateGistSync({ deletedNovelIds: updatedDeletedNovelIds });
    }

    // 添加本地独有的书籍（远端列表为空或本地新增）
    for (const localBook of booksStore.books) {
      if (!remoteNovelIds.has(localBook.id)) {
        if (remoteNovels.length === 0 || checkIsNewlyAdded(localBook.lastEdited, syncTime)) {
          const localBookWithContent = await SyncDataService.ensureNovelContentLoaded(localBook);
          finalBooks.push(localBookWithContent);
        }
      }
    }

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

  /**
   * 选出单个远程封面对应的最终条目。封面删除墓碑同时按 id 和 URL 索引。
   */
  private static selectFinalCover(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remoteCover: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localCover: any,
    remoteUrl: string,
    deletedCoverIdsMap: Map<string, number>,
    deletedCoverUrlsMap: Map<string, number>,
    syncTime: number,
    isManualRetrieval: boolean,
    coverIdsToUndelete: Set<string>,
    coverUrlsToUndelete: Set<string>,
    restorableItems: RestorableItem[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (localCover) {
      return SyncDataService.shouldUseRemoteByTime(localCover.addedAt, remoteCover.addedAt)
        ? remoteCover
        : localCover;
    }

    const deletionRecord = SyncDataService.lookupCoverDeletionRecord(
      remoteCover.id,
      remoteUrl,
      deletedCoverIdsMap,
      deletedCoverUrlsMap,
    );

    if (deletionRecord !== undefined) {
      if (deletionRecord > syncTime) {
        if (isManualRetrieval) {
          restorableItems.push({
            id: remoteCover.id,
            type: 'cover',
            title: remoteCover.url || remoteCover.id,
            deletedAt: deletionRecord,
            data: remoteCover,
          });
        }
        return null;
      }
      const remoteTime = new Date(remoteCover.addedAt).getTime();
      if (remoteTime > syncTime) {
        coverIdsToUndelete.add(remoteCover.id);
        if (remoteUrl) coverUrlsToUndelete.add(remoteUrl);
        return remoteCover;
      }
      return null;
    }

    if (
      syncTime === 0 ||
      isManualRetrieval ||
      checkIsNewlyAdded(remoteCover.addedAt, syncTime)
    ) {
      return remoteCover;
    }
    return null;
  }

  /**
   * 从 gistSync 快照构造删除墓碑的 id/url 双索引
   */
  private static buildCoverDeletionMaps(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gistSyncSnapshot: any,
  ): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedCoverIds: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedCoverUrls: any[];
    deletedCoverIdsMap: Map<string, number>;
    deletedCoverUrlsMap: Map<string, number>;
  } {
    const deletedCoverIds = gistSyncSnapshot?.deletedCoverIds || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deletedCoverIdsMap = new Map<string, number>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deletedCoverIds.map((record: any) => [record.id, record.deletedAt] as const),
    );
    const deletedCoverUrls = gistSyncSnapshot?.deletedCoverUrls || [];
    const deletedCoverUrlsMap = new Map<string, number>(
      deletedCoverUrls.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (record: any) => [normalizeCoverUrl(record.url), record.deletedAt] as const,
      ),
    );
    return { deletedCoverIds, deletedCoverUrls, deletedCoverIdsMap, deletedCoverUrlsMap };
  }

  /**
   * 按 id 或 URL 查找远程封面在本地的对应记录
   */
  private static findLocalCoverMatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localCovers: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remoteCover: any,
    remoteUrl: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    const byId = localCovers.find((c) => c.id === remoteCover.id);
    if (byId) return byId;
    if (!remoteUrl) return undefined;
    return localCovers.find((c) => normalizeCoverUrl(c.url) === remoteUrl);
  }

  /**
   * 命中撤销集合时，同步更新 gistSync.deletedCoverIds / deletedCoverUrls 持久化字段
   */
  private static async persistCoverUndeletes(
    coverIdsToUndelete: Set<string>,
    coverUrlsToUndelete: Set<string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedCoverIds: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedCoverUrls: any[],
  ): Promise<void> {
    if (coverIdsToUndelete.size === 0 && coverUrlsToUndelete.size === 0) return;
    const settingsStore = useSettingsStore();
    const updatedDeletedCoverIds = deletedCoverIds.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (record: any) => !coverIdsToUndelete.has(record.id),
    );
    const updatedDeletedCoverUrls = deletedCoverUrls.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (record: any) => !coverUrlsToUndelete.has(normalizeCoverUrl(record.url)),
    );
    await settingsStore.updateGistSync({
      deletedCoverIds: updatedDeletedCoverIds,
      deletedCoverUrls: updatedDeletedCoverUrls,
    });
  }

  /**
   * 挑选本地新增但远端缺失的封面（首次同步或新增判定通过时保留）
   */
  private static collectLocalOnlyCovers(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localCovers: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remoteCovers: any[],
    syncTime: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];
    for (const localCover of localCovers) {
      const localUrl = normalizeCoverUrl(localCover?.url);
      const existsInRemote =
        !!remoteCovers.find((c) => c.id === localCover.id) ||
        (localUrl ? !!remoteCovers.find((c) => normalizeCoverUrl(c?.url) === localUrl) : false);
      if (existsInRemote) continue;
      if (remoteCovers.length === 0 || checkIsNewlyAdded(localCover.addedAt, syncTime)) {
        result.push(localCover);
      }
    }
    return result;
  }

  /**
   * 应用远端封面历史到本地：合并远端/本地、URL 去重，最后 clear+add 重建。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async applyDownloadedCoverHistory(
    remoteCovers: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    gistSyncSnapshot: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    syncTime: number,
    isManualRetrieval: boolean,
    restorableItems: RestorableItem[],
  ): Promise<void> {
    const coverHistoryStore = useCoverHistoryStore();
    const { deletedCoverIds, deletedCoverUrls, deletedCoverIdsMap, deletedCoverUrlsMap } =
      SyncDataService.buildCoverDeletionMaps(gistSyncSnapshot);

    const coverIdsToUndelete = new Set<string>();
    const coverUrlsToUndelete = new Set<string>();
    const finalCovers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const remoteCover of remoteCovers) {
      const remoteUrl = normalizeCoverUrl(remoteCover?.url);
      const localCover = SyncDataService.findLocalCoverMatch(
        coverHistoryStore.covers,
        remoteCover,
        remoteUrl,
      );
      const winner = SyncDataService.selectFinalCover(
        remoteCover,
        localCover,
        remoteUrl,
        deletedCoverIdsMap,
        deletedCoverUrlsMap,
        syncTime,
        isManualRetrieval,
        coverIdsToUndelete,
        coverUrlsToUndelete,
        restorableItems,
      );
      if (winner) finalCovers.push(winner);
    }

    await SyncDataService.persistCoverUndeletes(
      coverIdsToUndelete,
      coverUrlsToUndelete,
      deletedCoverIds,
      deletedCoverUrls,
    );

    finalCovers.push(
      ...SyncDataService.collectLocalOnlyCovers(
        coverHistoryStore.covers,
        remoteCovers,
        syncTime,
      ),
    );

    const deduped = dedupeCoverHistoryByUrl(finalCovers);

    await coverHistoryStore.clearHistory();
    for (const cover of deduped) {
      await coverHistoryStore.addCover(cover);
    }
  }

  /**
   * 将远程独有 Memory 合并到本地给定书籍的最终列表（处理删除墓碑/新增判定）。
   */
  private static resolveRemoteOnlyMemory(
    remoteMemory: Memory,
    deletedMemoryIdsMap: Map<string, number>,
    syncTime: number,
    isManualRetrieval: boolean,
    memoryIdsToUndelete: Set<string>,
    restorableItems: RestorableItem[],
  ): Memory | null {
    const deletionRecord = deletedMemoryIdsMap.get(remoteMemory.id);
    if (deletionRecord !== undefined) {
      if (deletionRecord > syncTime) {
        if (isManualRetrieval) {
          restorableItems.push({
            type: 'memory',
            id: remoteMemory.id,
            title: remoteMemory.summary || remoteMemory.content.substring(0, 50),
            deletedAt: deletionRecord,
            data: remoteMemory,
          });
        }
        return null;
      } else if (remoteMemory.lastAccessedAt > syncTime) {
        memoryIdsToUndelete.add(remoteMemory.id);
      } else {
        return null;
      }
    }

    if (
      syncTime === 0 ||
      isManualRetrieval ||
      checkIsNewlyAdded(remoteMemory.lastAccessedAt, syncTime)
    ) {
      return remoteMemory;
    }
    return null;
  }

  /**
   * 合并某本书的远端/本地 Memory 并重建最终列表：按 content 去重，按 id 写入。
   */
  private static async applyBookMemories(
    bookId: string,
    remoteMemoryMap: Map<string, Memory>,
    deletedMemoryIdsMap: Map<string, number>,
    syncTime: number,
    isManualRetrieval: boolean,
    remoteMemoriesListEmpty: boolean,
    memoryIdsToUndelete: Set<string>,
    restorableItems: RestorableItem[],
  ): Promise<void> {
    const localMemories = await MemoryService.getAllMemories(bookId);

    const finalMemories: Memory[] = [];
    const contentMap = new Map<string, Memory>();

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

    const localMemoryMap = new Map<string, Memory>();
    for (const localMemory of localMemories) {
      localMemoryMap.set(localMemory.id, localMemory);
    }

    // 1. 处理远程 Memory
    for (const remoteMemory of remoteMemoryMap.values()) {
      const localMemory = localMemoryMap.get(remoteMemory.id);
      if (localMemory) {
        const winner =
          remoteMemory.lastAccessedAt > localMemory.lastAccessedAt ? remoteMemory : localMemory;
        addToFinal(winner);
      } else {
        const resolved = SyncDataService.resolveRemoteOnlyMemory(
          remoteMemory,
          deletedMemoryIdsMap,
          syncTime,
          isManualRetrieval,
          memoryIdsToUndelete,
          restorableItems,
        );
        if (resolved) addToFinal(resolved);
      }
    }

    // 2. 添加本地独有的 Memory
    for (const localMemory of localMemories) {
      if (remoteMemoryMap.has(localMemory.id)) continue;
      if (remoteMemoriesListEmpty || checkIsNewlyAdded(localMemory.lastAccessedAt, syncTime)) {
        addToFinal(localMemory);
      }
    }

    // 3. 先写入，再删除不在最终列表中的旧 Memory
    const finalMemoryIds = new Set(finalMemories.map((m) => m.id));
    for (const memory of finalMemories) {
      try {
        await MemoryService.createMemoryWithId(
          bookId,
          memory.id,
          memory.content,
          memory.summary,
          { createdAt: memory.createdAt, lastAccessedAt: memory.lastAccessedAt },
        );
      } catch (error) {
        console.warn(`[SyncDataService] 写入 Memory ${memory.id} 失败:`, error);
      }
    }

    const staleMemoryIds = localMemories
      .filter((m) => !finalMemoryIds.has(m.id))
      .map((m) => m.id);
    for (const staleId of staleMemoryIds) {
      try {
        await MemoryService.deleteMemory(bookId, staleId);
      } catch (error) {
        console.warn(`[SyncDataService] 删除旧 Memory ${staleId} 失败:`, error);
      }
    }
  }

  /**
   * 应用远端 Memory 列表：遍历本地每本书逐一合并，最后批量更新 undelete 墓碑。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async applyDownloadedMemories(
    remoteMemories: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    gistSyncSnapshot: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    syncTime: number,
    isManualRetrieval: boolean,
    restorableItems: RestorableItem[],
  ): Promise<void> {
    const booksStore = useBooksStore();
    const settingsStore = useSettingsStore();

    const deletedMemoryIds = gistSyncSnapshot?.deletedMemoryIds || [];
    const deletedMemoryIdsMap = new Map<string, number>(
      deletedMemoryIds.map((record: any) => [record.id, record.deletedAt] as const), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    const memoryIdsToUndelete = new Set<string>();
    const remoteMemoriesListEmpty = remoteMemories.length === 0;

    // 将远程 Memory 按 bookId 分组
    const remoteMemoriesByBook = new Map<string, Map<string, Memory>>();
    for (const remoteMemory of remoteMemories as Memory[]) {
      let bookMap = remoteMemoriesByBook.get(remoteMemory.bookId);
      if (!bookMap) {
        bookMap = new Map<string, Memory>();
        remoteMemoriesByBook.set(remoteMemory.bookId, bookMap);
      }
      // 远程可能存在重复 id（历史数据问题），保留 lastAccessedAt 更大的那条
      const existing = bookMap.get(remoteMemory.id);
      if (!existing || remoteMemory.lastAccessedAt > existing.lastAccessedAt) {
        bookMap.set(remoteMemory.id, remoteMemory);
      }
    }

    for (const localBook of booksStore.books) {
      const remoteMemoryMap = remoteMemoriesByBook.get(localBook.id) ?? new Map<string, Memory>();
      await SyncDataService.applyBookMemories(
        localBook.id,
        remoteMemoryMap,
        deletedMemoryIdsMap,
        syncTime,
        isManualRetrieval,
        remoteMemoriesListEmpty,
        memoryIdsToUndelete,
        restorableItems,
      );
    }

    if (memoryIdsToUndelete.size > 0) {
      const updatedDeletedMemoryIds = (gistSyncSnapshot?.deletedMemoryIds || []).filter(
        (record: any) => !memoryIdsToUndelete.has(record.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      await settingsStore.updateGistSync({ deletedMemoryIds: updatedDeletedMemoryIds });
    }
  }

  /**
   * 应用远端 appSettings：比较 lastEdited 决定是否整体导入，同时保留本地 Gist 配置；
   * 单调语义下若远端已 dismissed 也传播到本地。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async applyDownloadedAppSettings(
    remoteAppSettings: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    isManualRetrieval: boolean,
  ): Promise<void> {
    const settingsStore = useSettingsStore();
    const localSettings = GlobalConfig.getAllSettingsSnapshot() ?? ({} as any);
    const mergedQuickStartDismissed = mergeQuickStartDismissedFlag(
      localSettings,
      remoteAppSettings,
      'download',
    );

    const shouldApplyRemoteSettings =
      isManualRetrieval ||
      SyncDataService.shouldUseRemoteByTime(localSettings.lastEdited, remoteAppSettings.lastEdited);

    if (shouldApplyRemoteSettings) {
      const currentGistSync = GlobalConfig.getGistSyncSnapshot();
      await settingsStore.importSettings({
        ...remoteAppSettings,
        quickStartDismissed: mergedQuickStartDismissed,
      });
      if (currentGistSync) {
        await settingsStore.updateGistSync(currentGistSync);
      }
    } else if (mergedQuickStartDismissed && localSettings.quickStartDismissed !== true) {
      // 即便不整体采用远程设置，也要同步“已关闭”语义，避免状态回退
      await settingsStore.importSettings({ quickStartDismissed: true });
    }
  }

  /**
   * 合并远端 appSettings.syncs 中的删除记录到本地（保留最新的删除时间戳）。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async mergeDeletionRecordsFromRemote(remoteSyncs: any[]): Promise<void> {
    const settingsStore = useSettingsStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gistSync = remoteSyncs.find((s: any) => s.syncType === 'gist');
    if (!gistSync) return;

    const localGistSync = (GlobalConfig.getGistSyncSnapshot() ?? {}) as any;

    await settingsStore.updateGistSync({
      deletedNovelIds: mergeDeletionRecords(
        localGistSync.deletedNovelIds,
        gistSync.deletedNovelIds,
      ),
      deletedModelIds: mergeDeletionRecords(
        localGistSync.deletedModelIds,
        gistSync.deletedModelIds,
      ),
      deletedCoverIds: mergeDeletionRecords(
        localGistSync.deletedCoverIds,
        gistSync.deletedCoverIds,
      ),
      deletedCoverUrls: mergeUrlDeletionRecords(
        localGistSync.deletedCoverUrls,
        gistSync.deletedCoverUrls,
      ),
      deletedMemoryIds: mergeDeletionRecords(
        localGistSync.deletedMemoryIds,
        gistSync.deletedMemoryIds,
      ),
    });
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

    if (!remoteData) return;

    if (!SyncDataService.validateRemoteData(remoteData)) {
      console.error('[SyncDataService] 远程数据验证失败，拒绝覆盖');
      throw new Error('远程数据格式无效，无法应用');
    }

    const backup = await SyncDataService.createBackup();

    try {
      await SyncDataService.clearLocalSyncedData(backup);
      await SyncDataService.writeSnapshotData(remoteData);
      await SyncDataService.restoreGistSyncConfigAfterSnapshot(remoteData.appSettings);
    } catch (error) {
      console.error('[SyncDataService] 覆盖快照时发生错误，正在回滚:', error);
      await SyncDataService.rollbackWithBackupOrThrow(backup, error, '应用快照失败');
    }
  }

  /** 清空本地已同步数据：逐本书删除旧 memories，然后清空 books / aiModels / coverHistory */
  private static async clearLocalSyncedData(backup: DataBackup): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();

    // 删除所有书籍旧 memories（使用备份的书籍列表，避免与 clearBooks 竞态）
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

    await booksStore.clearBooks();
    await aiModelsStore.clearModels();
    await coverHistoryStore.clearHistory();
  }

  /** 按快照写入书籍 / 模型 / 封面 / memories */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async writeSnapshotData(remoteData: {
    novels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    aiModels?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    coverHistory?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    memories?: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  }): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const booksStore = useBooksStore();
    const coverHistoryStore = useCoverHistoryStore();

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
  }

  /**
   * 覆盖快照后恢复本地 Gist 凭据 / lastSyncTime，并清掉所有"会主动传播删除"的状态。
   *
   * 清空字段交给 settings store 的 `clearSyncDeletionPropagationState`：
   * `deletedNovelIds` / `deletedModelIds` / `deletedMemoryIds` / `knownRemoteTombstones`。
   * 必须清这些是因为它们会被 `buildLocalSyncBundle` 合并进 manifest.tombstones 或写到
   * memories envelope.tombstones；恢复的旧条目 lastEdited 比这些墓碑 deletedAt 更早，
   * 严格复活规则不会丢墓碑 → 下次同步会把刚恢复的内容又删了。
   *
   * 保留：`deletedCoverIds` / `deletedCoverUrls`（仅上传合并过滤）+
   * `knownRemoteHashes` / `knownRemoteEntries` / `lastRemoteETag`（下一次 diff 自然会重算）。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async restoreGistSyncConfigAfterSnapshot(remoteAppSettings: any): Promise<void> {
    const settingsStore = useSettingsStore();
    const currentGistSync = GlobalConfig.getGistSyncSnapshot();

    if (remoteAppSettings) {
      await settingsStore.replaceSettingsFromSyncSnapshot(remoteAppSettings);
    }

    const cleared = getSyncDeletionPropagationStateClearedPatch();
    if (currentGistSync) {
      await settingsStore.updateGistSync({ ...currentGistSync, ...cleared });
    } else {
      await settingsStore.updateGistSync(cleared);
    }
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

    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const tombstoneMaps = SyncDataService.collectTombstoneMapsForUpload(gistSync);

    const finalModels = SyncDataService.mergeAiModelsForUpload(
      localData.aiModels,
      remoteData.aiModels || [],
      tombstoneMaps.deletedModelIdsMap,
      lastSyncTime,
    );

    const finalBooks = await SyncDataService.mergeNovelsForUpload(
      localData.novels,
      remoteData.novels || [],
      tombstoneMaps.deletedNovelIdsMap,
      lastSyncTime,
    );

    const dedupedCovers = SyncDataService.mergeCoverHistoryForUpload(
      localData.coverHistory,
      remoteData.coverHistory || [],
      tombstoneMaps.deletedCoverIdsMap,
      tombstoneMaps.deletedCoverUrlsMap,
      lastSyncTime,
    );

    const finalSettings = SyncDataService.mergeAppSettingsForUpload(
      localData.appSettings,
      remoteData.appSettings,
    );

    const finalMemories = SyncDataService.mergeMemoriesForUpload(
      localData.memories || [],
      remoteData.memories || [],
      tombstoneMaps.deletedMemoryIdsMap,
      lastSyncTime,
    );

    // 上传路径 strip：去除本地才关心的字段（embedding / embeddingModel / memoryScoreBreakdown），
    // 以及防御性去除可能残留在旧数据中的 attachedTo 字段。
    const strippedMemories = finalMemories.map((m) =>
      SyncDataService.stripLocalFieldsFromMemory(m),
    );
    const strippedBooks = finalBooks.map((b) => stripNovelLocalFields(b));

    return {
      novels: strippedBooks,
      aiModels: finalModels,
      appSettings: finalSettings,
      coverHistory: dedupedCovers,
      memories: strippedMemories,
    };
  }

  /**
   * 上传合并决策：优先本地时间戳（lastEdited 缺失时偏向本地——因为本地要上传）。
   */
  private static shouldUseRemoteForUpload(
    localLastEdited?: Date | number | string,
    remoteLastEdited?: Date | number | string,
  ): boolean {
    return SyncDataService.compareEditTimeWithFallback(localLastEdited, remoteLastEdited, false);
  }

  /**
   * 从 gistSync 快照中收集所有墓碑 id/url → deletedAt 的映射，供上传合并判断使用。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static collectTombstoneMapsForUpload(gistSync: any): {
    deletedModelIdsMap: Map<string, number>;
    deletedNovelIdsMap: Map<string, number>;
    deletedCoverIdsMap: Map<string, number>;
    deletedCoverUrlsMap: Map<string, number>;
    deletedMemoryIdsMap: Map<string, number>;
  } {
    const mapify = (arr: Array<{ id: string; deletedAt: number }> | undefined): Map<string, number> =>
      new Map((arr || []).map((r) => [r.id, r.deletedAt]));
    const urlify = (
      arr: Array<{ url: string; deletedAt: number }> | undefined,
    ): Map<string, number> =>
      new Map((arr || []).map((r) => [normalizeCoverUrl(r.url), r.deletedAt]));

    return {
      deletedModelIdsMap: mapify(gistSync?.deletedModelIds),
      deletedNovelIdsMap: mapify(gistSync?.deletedNovelIds),
      deletedCoverIdsMap: mapify(gistSync?.deletedCoverIds),
      deletedCoverUrlsMap: urlify(gistSync?.deletedCoverUrls),
      deletedMemoryIdsMap: mapify(gistSync?.deletedMemoryIds),
    };
  }

  /**
   * 合并上传时的 AI 模型列表：按 id 去重，墓碑阻止远端独有条目恢复。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mergeAiModelsForUpload(
    localModels: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    remoteModels: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    deletedModelIdsMap: Map<string, number>,
    lastSyncTime: number,
  ): any[] { // eslint-disable-line @typescript-eslint/no-explicit-any
    const finalModels: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    // 特殊情况：远端空列表但本地有模型 → 全量回传，避免远端空载覆盖
    if (remoteModels.length === 0 && localModels.length > 0) {
      finalModels.push(...localModels);
      return finalModels;
    }

    const remoteModelMap = new Map(remoteModels.map((m: any) => [m.id, m])); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const localModel of localModels) {
      const remoteModel = remoteModelMap.get(localModel.id);
      if (remoteModel) {
        finalModels.push(
          SyncDataService.shouldUseRemoteForUpload(localModel.lastEdited, remoteModel.lastEdited)
            ? remoteModel
            : localModel,
        );
      } else if (!localModel.lastEdited || checkIsNewlyAdded(localModel.lastEdited, lastSyncTime)) {
        // lastEdited 未设置时保守视为新增
        finalModels.push(localModel);
      }
    }

    // 添加远程独有的模型（未被本地删除且为远端新增）
    for (const remoteModel of remoteModels) {
      if (localModels.find((m) => m.id === remoteModel.id)) continue;
      const deletionRecord = deletedModelIdsMap.get(remoteModel.id);
      if (deletionRecord !== undefined && deletionRecord > lastSyncTime) continue;
      if (remoteModel.lastEdited && checkIsNewlyAdded(remoteModel.lastEdited, lastSyncTime)) {
        finalModels.push(remoteModel);
      }
    }

    return finalModels;
  }

  /**
   * 合并上传时的书籍列表：两边都有按时间戳选择（较新者赢），仅有一方的按墓碑/新增判定。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async mergeNovelsForUpload(
    localNovels: Novel[],
    remoteNovels: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    deletedNovelIdsMap: Map<string, number>,
    lastSyncTime: number,
  ): Promise<Novel[]> {
    const finalBooks: Novel[] = [];
    const remoteNovelMap = new Map(remoteNovels.map((n: any) => [n.id, n])); // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const localNovel of localNovels) {
      const remoteNovel = remoteNovelMap.get(localNovel.id);
      if (remoteNovel) {
        if (SyncDataService.shouldUseRemoteForUpload(localNovel.lastEdited, remoteNovel.lastEdited)) {
          const mergedNovel = await SyncDataService.mergeNovelWithLocalContent(
            remoteNovel as Novel,
            localNovel,
            lastSyncTime,
          );
          finalBooks.push(mergedNovel);
        } else {
          const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
          const mergedNovel = await mergeRemoteTranslationsIntoLocalNovel(
            localNovelWithContent,
            remoteNovel as Novel,
            lastSyncTime,
          );
          finalBooks.push(mergedNovel);
        }
      } else if (!localNovel.lastEdited || checkIsNewlyAdded(localNovel.lastEdited, lastSyncTime)) {
        // lastEdited 未设置时保守视为新增
        const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
        finalBooks.push(localNovelWithContent);
      }
    }

    for (const remoteNovel of remoteNovels) {
      if (localNovels.find((n) => n.id === remoteNovel.id)) continue;
      const deletionRecord = deletedNovelIdsMap.get(remoteNovel.id);
      if (deletionRecord !== undefined && deletionRecord > lastSyncTime) continue;
      if (checkIsNewlyAdded(remoteNovel.lastEdited, lastSyncTime)) {
        finalBooks.push(remoteNovel as Novel);
      }
    }

    return finalBooks;
  }

  /**
   * 合并上传时的封面历史，最后按 URL 去重。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mergeCoverHistoryForUpload(
    localCovers: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    remoteCovers: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
    deletedCoverIdsMap: Map<string, number>,
    deletedCoverUrlsMap: Map<string, number>,
    lastSyncTime: number,
  ): any[] { // eslint-disable-line @typescript-eslint/no-explicit-any
    const finalCovers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    // 特殊情况：远端空列表但本地有封面 → 全量回传
    if (remoteCovers.length === 0 && localCovers.length > 0) {
      finalCovers.push(...localCovers);
      return dedupeCoverHistoryByUrl(finalCovers);
    }

    const remoteCoverMap = new Map(remoteCovers.map((c: any) => [c.id, c])); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const localCover of localCovers) {
      const localUrl = normalizeCoverUrl(localCover?.url);
      const remoteCover =
        remoteCoverMap.get(localCover.id) ||
        (localUrl
          ? remoteCovers.find((c: any) => normalizeCoverUrl(c?.url) === localUrl) // eslint-disable-line @typescript-eslint/no-explicit-any
          : undefined);
      if (remoteCover) {
        finalCovers.push(
          SyncDataService.shouldUseRemoteForUpload(localCover.addedAt, remoteCover.addedAt)
            ? remoteCover
            : localCover,
        );
      } else if (checkIsNewlyAdded(localCover.addedAt, lastSyncTime)) {
        finalCovers.push(localCover);
      }
    }

    for (const remoteCover of remoteCovers) {
      const remoteUrl = normalizeCoverUrl(remoteCover?.url);
      const existsInLocal =
        !!localCovers.find((c) => c.id === remoteCover.id) ||
        (remoteUrl ? !!localCovers.find((c) => normalizeCoverUrl(c?.url) === remoteUrl) : false);
      if (existsInLocal) continue;

      const deletionRecord = SyncDataService.lookupCoverDeletionRecord(
        remoteCover.id,
        remoteUrl,
        deletedCoverIdsMap,
        deletedCoverUrlsMap,
      );
      if (deletionRecord !== undefined && deletionRecord > lastSyncTime) continue;
      if (checkIsNewlyAdded(remoteCover.addedAt, lastSyncTime)) {
        finalCovers.push(remoteCover);
      }
    }

    return dedupeCoverHistoryByUrl(finalCovers);
  }

  /**
   * 合并上传时的 Gist 同步配置：保留本地关键状态字段（lastSyncTime、墓碑等），其他字段走远端。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mergeGistSyncEntryForUpload(localGistSync: any, remoteGistSync: any): any {
    if (!localGistSync) return remoteGistSync;
    const remote = remoteGistSync ?? {};
    return {
      ...remoteGistSync,
      ...localGistSync,
      lastSyncTime: mergeSyncField(localGistSync.lastSyncTime, remote.lastSyncTime, 0),
      lastSyncedModelIds: mergeSyncField(
        localGistSync.lastSyncedModelIds,
        remote.lastSyncedModelIds,
        undefined,
      ),
      deletedNovelIds: mergeSyncField(localGistSync.deletedNovelIds, remote.deletedNovelIds, []),
      deletedModelIds: mergeSyncField(localGistSync.deletedModelIds, remote.deletedModelIds, []),
      deletedCoverIds: mergeSyncField(localGistSync.deletedCoverIds, remote.deletedCoverIds, []),
      deletedMemoryIds: mergeSyncField(
        localGistSync.deletedMemoryIds,
        remote.deletedMemoryIds,
        [],
      ),
    };
  }

  /**
   * 合并上传时的 appSettings：选较新 lastEdited 的一侧，需要时替换 syncs 数组中的 gist 条目。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mergeAppSettingsForUpload(localAppSettings: any, remoteAppSettings: any): any {
    if (!remoteAppSettings) return localAppSettings;

    const mergedQuickStartDismissed = mergeQuickStartDismissedFlag(
      localAppSettings,
      remoteAppSettings,
      'upload',
    );

    if (!SyncDataService.shouldUseRemoteForUpload(localAppSettings.lastEdited, remoteAppSettings.lastEdited)) {
      return {
        ...localAppSettings,
        quickStartDismissed: mergedQuickStartDismissed,
      };
    }

    // 使用远程设置，但保留本地 Gist 同步配置状态
    const localSyncs = localAppSettings.syncs;
    const remoteSyncs = remoteAppSettings.syncs;
    const localGistSync = Array.isArray(localSyncs)
      ? localSyncs.find((s: any) => s.syncType === 'gist') // eslint-disable-line @typescript-eslint/no-explicit-any
      : undefined;
    const remoteGistSync = Array.isArray(remoteSyncs)
      ? remoteSyncs.find((s: any) => s.syncType === 'gist') // eslint-disable-line @typescript-eslint/no-explicit-any
      : undefined;

    const mergedGistSync = SyncDataService.mergeGistSyncEntryForUpload(localGistSync, remoteGistSync);

    const mergedSyncs = Array.isArray(remoteSyncs) ? [...remoteSyncs] : [];
    const gistIndex = mergedSyncs.findIndex((s: any) => s.syncType === 'gist'); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (mergedGistSync) {
      if (gistIndex >= 0) mergedSyncs[gistIndex] = mergedGistSync;
      else mergedSyncs.push(mergedGistSync);
    }

    return {
      ...remoteAppSettings,
      syncs: mergedSyncs,
      quickStartDismissed: mergedQuickStartDismissed,
    };
  }

  /**
   * 将 Memory 加入最终列表，按内容去重——同内容保留 lastAccessedAt 更新的条目。
   */
  private static pushMemoryWithContentDedup(
    memory: Memory,
    finalMemories: Memory[],
    contentMap: Map<string, Memory>,
  ): void {
    const existingByContent = contentMap.get(memory.content);
    if (!existingByContent) {
      finalMemories.push(memory);
      contentMap.set(memory.content, memory);
      return;
    }
    if (memory.lastAccessedAt > existingByContent.lastAccessedAt) {
      const idx = finalMemories.indexOf(existingByContent);
      if (idx >= 0) finalMemories[idx] = memory;
      contentMap.set(memory.content, memory);
    }
  }

  /**
   * 合并上传时的 Memory 列表：按 id 取较新 lastAccessedAt；之后按 content 二次去重。
   */
  private static mergeMemoriesForUpload(
    localMemories: Memory[],
    remoteMemories: Memory[],
    deletedMemoryIdsMap: Map<string, number>,
    lastSyncTime: number,
  ): Memory[] {
    const finalMemories: Memory[] = [];
    const remoteMemoryMap = new Map(remoteMemories.map((m) => [m.id, m]));
    const contentMap = new Map<string, Memory>();

    for (const localMemory of localMemories) {
      const remoteMemory = remoteMemoryMap.get(localMemory.id);
      let winner: Memory;
      if (remoteMemory) {
        winner =
          remoteMemory.lastAccessedAt > localMemory.lastAccessedAt ? remoteMemory : localMemory;
        remoteMemoryMap.delete(localMemory.id);
      } else {
        winner = localMemory;
      }
      SyncDataService.pushMemoryWithContentDedup(winner, finalMemories, contentMap);
    }

    for (const remoteMemory of remoteMemoryMap.values()) {
      const deletionRecord = deletedMemoryIdsMap.get(remoteMemory.id);
      if (deletionRecord !== undefined && deletionRecord > lastSyncTime) continue;
      SyncDataService.pushMemoryWithContentDedup(remoteMemory, finalMemories, contentMap);
    }

    return finalMemories;
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
    if (SyncDataService.novelsDifferForUpload(local.novels, arrayOrEmpty(remote.novels))) {
      return true;
    }
    if (SyncDataService.aiModelsDifferForUpload(local.aiModels, arrayOrEmpty(remote.aiModels))) {
      return true;
    }
    if (SyncDataService.appSettingsDifferForUpload(local.appSettings, remote.appSettings)) {
      return true;
    }
    if (
      SyncDataService.coverHistoryDiffersForUpload(local.coverHistory, arrayOrEmpty(remote.coverHistory))
    ) {
      return true;
    }
    if (SyncDataService.memoriesDifferForUpload(local.memories, arrayOrEmpty(remote.memories))) {
      return true;
    }
    return false;
  }

  /** 书籍差异：数量不同、本地有新书、或 lastEdited 时间戳不同 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static novelsDifferForUpload(local: any[], remote: any[]): boolean {
    if (local.length !== remote.length) return true;
    const remoteNovelMap = new Map(remote.map((n) => [n.id, n]));
    for (const localNovel of local) {
      const remoteNovel = remoteNovelMap.get(localNovel.id);
      if (!remoteNovel) return true;
      if (isTimeDifferent(localNovel.lastEdited, remoteNovel.lastEdited)) return true;
    }
    return false;
  }

  /** AI 模型差异：数量不同、本地有新模型、或深度比较（忽略 apiKey/lastEdited）不等 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static aiModelsDifferForUpload(local: any[], remote: any[]): boolean {
    if (local.length !== remote.length) return true;
    const remoteModelMap = new Map(remote.map((m) => [m.id, m]));
    for (const localModel of local) {
      const remoteModel = remoteModelMap.get(localModel.id);
      if (!remoteModel) return true;
      const localForCompare = omit(localModel, 'apiKey', 'lastEdited');
      const remoteForCompare = omit(remoteModel, 'apiKey', 'lastEdited');
      if (!isEqual(localForCompare, remoteForCompare)) return true;
    }
    return false;
  }

  /**
   * 设置差异：对比 lastEdited，不同时再做深度比较（排除 syncs 中的同步状态字段和墓碑）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static appSettingsDifferForUpload(localAppSettings: any, remoteAppSettings: any): boolean {
    if (
      remoteAppSettings &&
      !isTimeDifferent(localAppSettings.lastEdited, remoteAppSettings.lastEdited)
    ) {
      return false;
    }

    const localForCompare = prepareAppSettingsForDiff(localAppSettings);
    const remoteForCompare = prepareAppSettingsForDiff(remoteAppSettings || {});

    if (isEqual(localForCompare, remoteForCompare)) return false;
    if (!remoteAppSettings && Object.keys(localAppSettings).length > 0) return true;
    return !!remoteAppSettings;
  }

  /** 封面差异：数量不同、本地有新封面、或 addedAt 时间戳不同 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static coverHistoryDiffersForUpload(local: any[], remote: any[]): boolean {
    if (local.length !== remote.length) return true;
    const remoteCoverMap = new Map(remote.map((c) => [c.id, c]));
    for (const localCover of local) {
      const remoteCover = remoteCoverMap.get(localCover.id);
      if (!remoteCover) return true;
      if (isTimeDifferent(localCover.addedAt, remoteCover.addedAt)) return true;
    }
    return false;
  }

  /** Memory 差异：数量不同、id 不匹配、lastAccessedAt 不同、或 content/summary 不同 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static memoriesDifferForUpload(local: any[], remote: any[]): boolean {
    if (local.length !== remote.length) return true;
    const remoteMemoryMap = new Map(remote.map((m) => [m.id, m]));
    for (const localMemory of local) {
      const remoteMemory = remoteMemoryMap.get(localMemory.id);
      if (!remoteMemory) return true;
      if (isTimeDifferent(localMemory.lastAccessedAt, remoteMemory.lastAccessedAt)) return true;
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
   *
   * @returns 应用失败的条目 key 列表。调用方不得把这些条目的新远端哈希记为已知，
   *   否则远端更新会被静默丢弃且下轮上传会用陈旧本地副本覆盖远端。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async applyPartialRemoteData(changedEntries: Record<string, any>): Promise<string[]> {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    const failedEntryKeys: string[] = [];
    for (const [entryKey, entry] of Object.entries(changedEntries)) {
      if (!entry || typeof entry !== 'object' || !('kind' in entry)) continue;

      const kind = (entry as { kind: string }).kind;
      try {
        switch (kind) {
          case 'settings':
            await SyncDataService.applyPartialSettingsEntry(
              (entry as { value: Record<string, unknown> }).value,
            );
            break;
          case 'ai-models':
            await SyncDataService.applyPartialAiModelsEntry(
              (entry as { value: Array<Record<string, unknown>> }).value,
            );
            break;
          case 'cover-history':
            await SyncDataService.applyPartialCoverHistoryEntry(
              (entry as { value: Array<Record<string, unknown>> }).value,
            );
            break;
          case 'novel':
            await SyncDataService.applyPartialNovelEntry((entry as { value: Novel }).value);
            break;
          case 'memories': {
            // 兼容两种 entry.value 形态：v3+ envelope 或旧 Memory[]（legacy 路径 / 测试 fixture）
            const rawValue = (entry as { value: unknown }).value;
            const envelope = Array.isArray(rawValue)
              ? { memories: rawValue as Memory[] }
              : (rawValue as {
                  memories: Memory[];
                  tombstones?: Array<{ id: string; deletedAt: number }>;
                });
            await SyncDataService.applyPartialMemoriesEntry(
              (entry as { bookId: string }).bookId,
              envelope.memories,
              envelope.tombstones,
            );
            break;
          }
          default:
            break;
        }
      } catch (error) {
        console.error(`[SyncDataService] applyPartialRemoteData 处理条目 ${entryKey} 失败:`, error);
        // 继续处理其他条目，不中止整个 apply；失败条目上报给调用方，
        // 由其保留旧的已知远端状态，下轮同步会重新拉取
        failedEntryKeys.push(entryKey);
      }
    }
    return failedEntryKeys;
  }

  /** settings 条目：若远端 lastEdited 更新则整体导入 */
  private static async applyPartialSettingsEntry(
    remoteSettings: Record<string, unknown>,
  ): Promise<void> {
    const settingsStore = useSettingsStore();
    const localSettings = settingsStore.getAllSettings();
    const localTime = localSettings.lastEdited
      ? new Date(localSettings.lastEdited as unknown as string).getTime()
      : 0;
    const remoteTime = remoteSettings.lastEdited
      ? new Date(remoteSettings.lastEdited as unknown as string).getTime()
      : 0;
    if (remoteTime > localTime) {
      // quickStartDismissed 按单调语义合并（任一端为 true 即 true），
      // 与 legacy 路径的 mergeQuickStartDismissedFlag 保持一致，
      // 避免较新的远端 settings 把本地"已关闭快速开始"回退成未关闭
      const quickStartDismissed = mergeQuickStartDismissedFlag(
        localSettings,
        remoteSettings,
        'download',
      );
      await settingsStore.importSettings({ ...remoteSettings, quickStartDismissed });
    }
  }

  /** ai-models 条目：upsert 远端 + 删除本地陈旧（跨设备删除传播） */
  private static async applyPartialAiModelsEntry(
    remoteModels: Array<Record<string, unknown>>,
  ): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;
    const deletedModelMap = new Map<string, number>(
      (gistSync?.deletedModelIds ?? []).map((r) => [r.id, r.deletedAt]),
    );

    const remoteIds = new Set<string>();
    for (const rm of remoteModels) {
      const rmId = rm.id as string;
      remoteIds.add(rmId);
      await SyncDataService.upsertOrSkipAiModel(rm, rmId, deletedModelMap, lastSyncTime);
    }

    await SyncDataService.propagateAiModelDeletions(remoteIds, lastSyncTime);
  }

  /** 单条 ai-model upsert：墓碑晚于上次同步则跳过，时间较新则覆盖本地 */
  private static async upsertOrSkipAiModel(
    rm: Record<string, unknown>,
    rmId: string,
    deletedModelMap: Map<string, number>,
    lastSyncTime: number,
  ): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const localModel = aiModelsStore.models.find((m) => m.id === rmId);
    if (!localModel) {
      const deletedAt = deletedModelMap.get(rmId);
      if (deletedAt !== undefined && deletedAt > lastSyncTime) return;
      await aiModelService.saveModel(
        rm as unknown as Parameters<typeof aiModelService.saveModel>[0],
      );
      aiModelsStore.models.push(rm as unknown as (typeof aiModelsStore.models)[number]);
      return;
    }
    const lt = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
    const rt = rm.lastEdited ? new Date(rm.lastEdited as string).getTime() : 0;
    if (rt <= lt) return;
    await aiModelService.saveModel(rm as unknown as Parameters<typeof aiModelService.saveModel>[0]);
    const idx = aiModelsStore.models.findIndex((m) => m.id === rmId);
    if (idx >= 0) {
      aiModelsStore.models[idx] = rm as unknown as (typeof aiModelsStore.models)[number];
    }
  }

  /** 对不在远端列表中且本地自上次同步后未编辑的模型，传播远端删除 */
  private static async propagateAiModelDeletions(
    remoteIds: Set<string>,
    lastSyncTime: number,
  ): Promise<void> {
    const aiModelsStore = useAIModelsStore();
    const localModelsSnapshot = [...aiModelsStore.models];
    for (const localModel of localModelsSnapshot) {
      if (remoteIds.has(localModel.id)) continue;
      const lt = localModel.lastEdited ? new Date(localModel.lastEdited).getTime() : 0;
      if (lastSyncTime === 0 || lt > lastSyncTime) continue;
      try {
        await aiModelService.deleteModel(localModel.id);
      } catch (e) {
        console.warn('[SyncDataService] 传播远端模型删除失败:', localModel.id, e);
      }
      const idx = aiModelsStore.models.findIndex((m) => m.id === localModel.id);
      if (idx >= 0) aiModelsStore.models.splice(idx, 1);
    }
  }

  /** cover-history 条目：upsert 远端 + 删除本地陈旧 */
  private static async applyPartialCoverHistoryEntry(
    remoteCovers: Array<Record<string, unknown>>,
  ): Promise<void> {
    const coverHistoryStore = useCoverHistoryStore();
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;
    const deletedCoverMap = new Map<string, number>(
      (gistSync?.deletedCoverIds ?? []).map((r) => [r.id, r.deletedAt]),
    );

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

    // 跨设备删除传播
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
  }

  /** novel 条目：合并保留本地章节内容，或回退到"本地较新 + 合入远端翻译" */
  private static async applyPartialNovelEntry(remoteNovel: Novel): Promise<void> {
    const booksStore = useBooksStore();
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;

    const localNovel = booksStore.books.find((b) => b.id === remoteNovel.id);
    if (!localNovel) {
      // 本地无此书籍——检查是否被本地删除（防止跨设备恢复）
      const deletedNovelMap = new Map<string, number>(
        (gistSync?.deletedNovelIds ?? []).map((r) => [r.id, r.deletedAt]),
      );
      const deletedAt = deletedNovelMap.get(remoteNovel.id);
      if (deletedAt !== undefined && deletedAt > lastSyncTime) return;
      await booksStore.bulkAddBooks([remoteNovel]);
      return;
    }

    const localTime = localNovel.lastEdited ? new Date(localNovel.lastEdited).getTime() : 0;
    const remoteTime = remoteNovel.lastEdited ? new Date(remoteNovel.lastEdited).getTime() : 0;
    if (remoteTime > localTime) {
      const merged = await SyncDataService.mergeNovelWithLocalContent(
        remoteNovel,
        localNovel,
        lastSyncTime,
      );
      await booksStore.bulkAddBooks([merged]);
      return;
    }

    // 本地较新：仍然防御性地把远端独有的翻译合入本地
    try {
      const localNovelWithContent = await SyncDataService.ensureNovelContentLoaded(localNovel);
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

  /**
   * 合并远端 / 本地 memory：按 id 去重取 lastAccessedAt 较大者，再按 content 去重。
   *
   * @param deletedMap 本地 deletedMemoryIds 记录（id -> deletedAt 毫秒）
   * @param remoteTombstones 远端 envelope 携带的单条 memory 墓碑（v3+），按 id 索引
   *
   * 删除冲突：
   *  - 远端 tombstone：若 `local.lastAccessedAt < deletedAt` → 删除本地；否则保留（本地编辑赢）。
   *  - 本地 tombstone：跳过远端中同 id 的活动条目（不复活）。
   */
  private static mergeMemoriesByIdAndContent(
    remoteMemories: Memory[],
    localMemories: Memory[],
    lastSyncTime: number,
    deletedMap: Map<string, number>,
    remoteTombstones?: Map<string, number>,
  ): Memory[] {
    const remoteIds = new Set(remoteMemories.map((m) => m.id));
    const finalMap = new Map<string, Memory>();
    const remoteTombs = remoteTombstones ?? new Map<string, number>();

    // 1. 远端 memory：按 id 去重（保留 lastAccessedAt 更大的）
    //    跳过情形：
    //      - 本地 deletedMemoryIds 比 lastSyncTime 新（本地最近删过，不复活）
    //      - 远端同时挂着 tombstone 且 deletedAt > rm.lastAccessedAt（损坏 envelope
    //        或 race，墓碑更新 → 墓碑赢，不上 finalMap）
    for (const rm of remoteMemories) {
      const deletion = deletedMap.get(rm.id);
      if (deletion !== undefined && deletion > lastSyncTime) continue;
      const remoteTombAt = remoteTombs.get(rm.id);
      if (remoteTombAt !== undefined && remoteTombAt > rm.lastAccessedAt) continue;
      const existing = finalMap.get(rm.id);
      if (!existing || rm.lastAccessedAt > existing.lastAccessedAt) {
        finalMap.set(rm.id, rm);
      }
    }

    // 2. 本地 memory：判断是否被远端墓碑显式删除，否则按 id/时间合并
    for (const local of localMemories) {
      const remoteTombAt = remoteTombs.get(local.id);
      if (remoteTombAt !== undefined && local.lastAccessedAt < remoteTombAt) {
        // 远端显式删除且本地未在墓碑后再访问 → 不保留
        continue;
      }
      if (remoteIds.has(local.id)) {
        const existing = finalMap.get(local.id);
        if (!existing || local.lastAccessedAt > existing.lastAccessedAt) {
          finalMap.set(local.id, local);
        }
        continue;
      }
      // 本地独有：远端 envelope 是该书的权威列表，缺席即代表"远端不持有该 id"。
      // 远端墓碑会精准告知具体 id 被删；其它 id 无墓碑就遵循"本地 lastAccessedAt
      // 晚于 lastSyncTime → 保留"的常规启发式（首次同步 / 本地新增）。
      const isFreshLocal = lastSyncTime === 0 || local.lastAccessedAt > lastSyncTime;
      if (isFreshLocal || remoteMemories.length === 0) {
        finalMap.set(local.id, local);
      }
    }

    // 内容去重：同 content 保留 lastAccessedAt 更大的
    const byContent = new Map<string, Memory>();
    for (const m of finalMap.values()) {
      const ex = byContent.get(m.content);
      if (!ex || m.lastAccessedAt > ex.lastAccessedAt) {
        byContent.set(m.content, m);
      }
    }
    return Array.from(byContent.values());
  }

  /** 将 memory 合并结果刷写到本地：删除落选 id、upsert 保留项。 */
  private static async persistMergedMemories(
    bookId: string,
    finalList: Memory[],
    localMemories: Memory[],
  ): Promise<void> {
    const finalIds = new Set(finalList.map((m) => m.id));

    // 删除不在 finalList 的本地 memory
    for (const local of localMemories) {
      if (finalIds.has(local.id)) continue;
      try {
        await MemoryService.deleteMemory(bookId, local.id);
      } catch (e) {
        console.warn(`[SyncDataService] 删除 Memory ${local.id} 失败:`, e);
      }
    }

    // 保存最终列表：按远端字段原样写入，避免时间戳钳制与 manifest hash 不一致
    for (const m of finalList) {
      await MemoryService.upsertMemoryForSync(m);
    }
  }

  /**
   * memories 条目：合并远端/本地，按 id + content 双重去重后覆盖本地该书的 memory 集。
   *
   * @param remoteMemories envelope 中的活动 memory 列表
   * @param remoteTombstones envelope 中的单条 memory 墓碑（v3+ 才有）
   */
  private static async applyPartialMemoriesEntry(
    bookId: string,
    remoteMemories: Memory[],
    remoteTombstones?: Array<{ id: string; deletedAt: number }>,
  ): Promise<void> {
    const localMemories = await MemoryService.getAllMemories(bookId);
    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;
    const deletedMap = new Map<string, number>(
      (gistSync?.deletedMemoryIds || []).map((r) => [r.id, r.deletedAt]),
    );
    const remoteTombMap = new Map<string, number>(
      (remoteTombstones ?? []).map((t) => [t.id, t.deletedAt]),
    );

    const finalList = SyncDataService.mergeMemoriesByIdAndContent(
      remoteMemories,
      localMemories,
      lastSyncTime,
      deletedMap,
      remoteTombMap,
    );

    await SyncDataService.persistMergedMemories(bookId, finalList, localMemories);
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

    const gistSync = GlobalConfig.getGistSyncSnapshot();
    const lastSyncTime = gistSync?.lastSyncTime ?? 0;

    for (const { key, deletedAt } of deletions) {
      try {
        if (key.startsWith('novel:')) {
          await SyncDataService.applyRemoteNovelDeletion(key, deletedAt, lastSyncTime);
        } else if (key.startsWith('memories:')) {
          await SyncDataService.applyRemoteMemoriesDeletion(key, deletedAt, lastSyncTime);
        } else if (key === 'ai-models' || key === 'cover-history' || key === 'settings') {
          // 聚合条目：不做整体删除，记录跳过
          console.info(`[SyncDataService] 忽略聚合条目的远端删除 ${key}（需手动确认）`);
        }
      } catch (error) {
        console.error(`[SyncDataService] applyRemoteDeletions 处理 ${key} 失败:`, error);
      }
    }
  }

  /** 计算远端删除的比较阈值：有墓碑用墓碑时间，否则回退到 lastSyncTime */
  private static deletionThreshold(deletedAt: string | undefined, lastSyncTime: number): number {
    if (deletedAt) {
      const t = new Date(deletedAt).getTime();
      if (Number.isFinite(t)) return t;
    }
    return lastSyncTime;
  }

  /** 处理 novel:<id> 远端删除：本地 lastEdited 晚于阈值时保留，否则删书 */
  private static async applyRemoteNovelDeletion(
    key: string,
    deletedAt: string | undefined,
    lastSyncTime: number,
  ): Promise<void> {
    const booksStore = useBooksStore();
    const bookId = key.slice('novel:'.length);
    const localBook = booksStore.books.find((b) => b.id === bookId);
    if (!localBook) return;

    const localTime = localBook.lastEdited ? new Date(localBook.lastEdited).getTime() : 0;
    const threshold = SyncDataService.deletionThreshold(deletedAt, lastSyncTime);
    if (localTime > threshold) {
      console.info(
        `[SyncDataService] 跳过远端删除 ${key}：本地编辑 ${new Date(localTime).toISOString()} 晚于阈值 ${new Date(threshold).toISOString()}`,
      );
      return;
    }

    try {
      await booksStore.deleteBook(bookId);
    } catch (e) {
      console.warn(`[SyncDataService] 删除本地书籍 ${bookId} 失败:`, e);
    }
  }

  /**
   * 处理 memories:<bookId> 远端 collection 级删除（整本 memories 被清空）。
   *
   * 旧策略用 `lastAccessedAt > threshold` 启发式，会被本地"打开书 → 自动 access"
   * 误触发为假阳性。现在改为：
   *
   *  - 显式墓碑（deletedAt）：用 `createdAt` 比较——只有"墓碑后才创建"的 memory
   *    会保留（视为本地真新增，不应被旧的整集合删除回收）。`lastAccessedAt`
   *    会被读取自动刷新，不能作为"本地主动持有"的依据。
   *  - 隐式删除（无墓碑、entry 直接消失，可能是迁移 / 损坏）：保守跳过，仅记录警告。
   *    单条 memory 的删除已经走 envelope tombstones 通道，这里不再做模糊回收。
   */
  private static async applyRemoteMemoriesDeletion(
    key: string,
    deletedAt: string | undefined,
    _lastSyncTime: number,
  ): Promise<void> {
    const bookId = key.slice('memories:'.length);
    const localMemories = await MemoryService.getAllMemories(bookId);
    if (localMemories.length === 0) return;

    if (!deletedAt) {
      console.warn(
        `[SyncDataService] 跳过隐式 memories 删除 ${key}：无墓碑，已转为保守保留（避免假阳性回收）`,
      );
      return;
    }

    const threshold = new Date(deletedAt).getTime();
    if (!Number.isFinite(threshold)) {
      console.warn(`[SyncDataService] memories 墓碑 ${key} deletedAt 无效，跳过删除`);
      return;
    }

    let deleted = 0;
    let kept = 0;
    for (const m of localMemories) {
      // createdAt 晚于墓碑 → 墓碑发布后用户在本地真创建的新 memory，保留
      if (m.createdAt > threshold) {
        kept += 1;
        continue;
      }
      try {
        await MemoryService.deleteMemory(bookId, m.id);
        deleted += 1;
      } catch (e) {
        console.warn(`[SyncDataService] 删除 Memory ${m.id} 失败:`, e);
      }
    }
    if (deleted || kept) {
      console.debug(
        `[SyncDataService] 应用 memories collection 墓碑 ${key}: 删除 ${deleted}，保留 ${kept}（createdAt > deletedAt）`,
      );
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
