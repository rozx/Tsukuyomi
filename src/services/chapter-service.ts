import type { Novel, Volume, Chapter, Paragraph, Translation } from 'src/models/novel';
import { UniqueIdGenerator, extractIds, generateShortId } from 'src/utils/id-generator';
import {
  findChapterById,
  getChapterContentText,
  getChapterDisplayTitle,
  normalizeChapterTitle,
} from 'src/utils/novel-utils';
import { hasNonEmptyTranslation } from 'src/utils/text-utils';
import { formatTranslationForDisplay } from 'src/utils/translation-utils';
import { ChapterContentService } from './chapter-content-service';
import type { ParagraphSearchResult } from 'src/models/paragraph-search';

export type { ParagraphSearchResult };

/**
 * 获取段落的翻译文本
 * @param paragraph 段落对象
 * @returns 翻译文本，如果没有则返回空字符串
 */
function getParagraphTranslationText(paragraph: Paragraph): string {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
}

/**
 * 检查段落是否有内容（文本不为空）
 * @param paragraph 段落对象
 * @returns 如果段落有内容（text 存在且去除空白后不为空）则返回 true
 */
function hasParagraphContent(paragraph: Paragraph | null | undefined): boolean {
  return !!paragraph?.text && paragraph.text.trim().length > 0;
}

function resolveExportChapterTitle(
  chapter: Chapter,
  type: 'original' | 'translation' | 'bilingual',
  book?: Novel,
): string {
  if (type !== 'original') return getChapterDisplayTitle(chapter, book);
  let title = '';
  if (chapter.title) {
    title = typeof chapter.title === 'string' ? chapter.title : chapter.title.original || '';
  }
  const normalizeEnabled =
    chapter.normalizeTitleOnDisplay ?? book?.normalizeTitleOnDisplay ?? false;
  return normalizeEnabled ? normalizeChapterTitle(title) : title;
}

function buildOriginalExportBody(paragraphs: Paragraph[]): string {
  return paragraphs.reduce((acc, p, idx) => {
    const text = p.text || '';
    acc += text;
    const isLast = idx === paragraphs.length - 1;
    if (isLast) return acc;
    if (text.trim() === '') return `${acc}\n`;
    if (!acc.endsWith('\n')) return `${acc}\n`;
    return acc;
  }, '');
}

function buildTranslationExportBody(
  paragraphs: Paragraph[],
  book: Novel | undefined,
  chapter: Chapter,
): string {
  let consecutiveReturnParagraphs = 0;
  return paragraphs.reduce((acc, paragraph, idx, arr) => {
    let translation = getParagraphTranslationText(paragraph);
    translation = formatTranslationForDisplay(translation, book, chapter) ?? '';
    const isLast = idx === arr.length - 1;
    const isOriginalEmpty = !paragraph.text || paragraph.text.trim().length === 0;
    const isReturnParagraph = isOriginalEmpty && translation.trim().length === 0;

    let next = acc;
    if (!isReturnParagraph && consecutiveReturnParagraphs > 0) {
      next += '\n';
      consecutiveReturnParagraphs = 0;
    }
    next += translation;

    if (!isLast) {
      const translationTrailingBreaks = countTrailingLineBreaks(translation);
      const originalTrailingBreaks = countTrailingLineBreaks(paragraph.text);
      const targetBreaks = Math.max(originalTrailingBreaks + 1, 1);
      const missingBreaks = targetBreaks - translationTrailingBreaks;
      if (missingBreaks > 0) next += '\n'.repeat(missingBreaks);
    }

    if (isReturnParagraph) {
      consecutiveReturnParagraphs++;
      if (isLast) {
        next += '\n';
        consecutiveReturnParagraphs = 0;
      }
    }
    return next;
  }, '');
}

function buildBilingualExportLines(
  paragraphs: Paragraph[],
  book: Novel | undefined,
  chapter: Chapter,
): string {
  const lines = paragraphs.map((p) => {
    const original = p.text;
    let translation = getParagraphTranslationText(p);
    translation = formatTranslationForDisplay(translation, book, chapter);
    let normalizedTranslation = translation || original;
    const originalTrailingNewlines = countTrailingLineBreaks(original);
    normalizedTranslation = normalizedTranslation.replace(/\n+$/, '');
    normalizedTranslation += '\n'.repeat(originalTrailingNewlines);
    return `${original}\n${normalizedTranslation}\n`;
  });
  const processedLines = lines.map((line) => {
    if (line.trim() === '') return '\n\n';
    return line.endsWith('\n') ? line : `${line}\n`;
  });
  return processedLines.join('');
}

function buildExportChapterContent(
  chapterWithContent: Chapter,
  chapterTitle: string,
  type: 'original' | 'translation' | 'bilingual',
  format: 'txt' | 'json' | 'clipboard',
  book?: Novel,
): string {
  const paragraphs = chapterWithContent.content || [];
  if (format === 'json') {
    const data = paragraphs.map((p) => ({
      original: p.text,
      translation: formatTranslationForDisplay(
        getParagraphTranslationText(p),
        book,
        chapterWithContent,
      ),
    }));
    return JSON.stringify({ title: chapterTitle, content: data }, null, 2);
  }
  if (type === 'original') {
    return `${chapterTitle}\n\n${buildOriginalExportBody(paragraphs)}`;
  }
  if (type === 'translation') {
    return `${chapterTitle}\n\n${buildTranslationExportBody(paragraphs, book, chapterWithContent)}`;
  }
  return `${chapterTitle}\n\n${buildBilingualExportLines(paragraphs, book, chapterWithContent)}`;
}

async function performChapterExportAction(
  content: string,
  format: 'txt' | 'json' | 'clipboard',
  chapterTitle: string,
): Promise<void> {
  if (format === 'clipboard') {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? `复制到剪贴板失败：${err.message}`
          : '复制到剪贴板失败：请重试或检查权限',
      );
    }
    return;
  }
  const isWindows =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? /Windows/i.test(navigator.userAgent)
      : false;
  const fileContent =
    format === 'txt' && isWindows
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content;
  const blob = new Blob([fileContent], {
    type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${chapterTitle}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildParagraphSearchResult(
  paragraph: Paragraph,
  paragraphIndex: number,
  chapter: Chapter,
  chapterIndex: number,
  volume: Volume,
  volumeIndex: number,
): ParagraphSearchResult {
  return { paragraph, paragraphIndex, chapter, chapterIndex, volume, volumeIndex };
}

function findParagraphInLoadedChapters(
  novel: Novel,
  paragraphId: string,
  chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[],
): ParagraphSearchResult | null {
  const volumes = novel.volumes || [];
  for (let vIndex = 0; vIndex < volumes.length; vIndex++) {
    const volume = volumes[vIndex];
    if (!volume?.chapters) continue;
    for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
      const chapter = volume.chapters[cIndex];
      if (!chapter) continue;
      if (chapter.content === undefined) {
        chaptersToLoad.push({ chapter, vIndex, cIndex });
        continue;
      }
      if (!chapter.content) continue;
      for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
        const paragraph = chapter.content[pIndex];
        if (paragraph && paragraph.id === paragraphId) {
          return buildParagraphSearchResult(paragraph, pIndex, chapter, cIndex, volume, vIndex);
        }
      }
    }
  }
  return null;
}

function findParagraphInBatchLoadedChapters(
  novel: Novel,
  paragraphId: string,
  chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[],
  contentsMap: Map<string, Paragraph[] | undefined>,
): ParagraphSearchResult | null {
  const volumes = novel.volumes || [];
  for (const { chapter, vIndex, cIndex } of chaptersToLoad) {
    const content = contentsMap.get(chapter.id);
    chapter.content = content || [];
    chapter.contentLoaded = true;
    if (!chapter.content) continue;
    for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
      const paragraph = chapter.content[pIndex];
      if (!paragraph || paragraph.id !== paragraphId) continue;
      const volume = volumes[vIndex];
      if (!volume) continue;
      return buildParagraphSearchResult(paragraph, pIndex, chapter, cIndex, volume, vIndex);
    }
  }
  return null;
}

function shouldPreserveExistingContent(existing: Chapter, incoming: Chapter): boolean {
  if (existing.content === undefined || existing.content === null) return false;
  if (incoming.content === undefined || incoming.content === null) return true;
  return Array.isArray(incoming.content) && incoming.content.length === 0;
}

function applyChapterReplace(existing: Chapter, incoming: Chapter): Chapter {
  const lastUpdated = incoming.lastUpdated ?? existing.lastUpdated;
  const updated: Chapter = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    lastEdited: new Date(),
  };
  if (lastUpdated !== undefined) updated.lastUpdated = lastUpdated;
  return updated;
}

function applyChapterMerge(existing: Chapter, incoming: Chapter): Chapter {
  const lastUpdated = incoming.lastUpdated ?? existing.lastUpdated;
  const preserveContent = shouldPreserveExistingContent(existing, incoming);
  const updated: Chapter = {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    lastEdited: new Date(),
    ...(preserveContent ? { content: existing.content } : {}),
  };
  if (lastUpdated !== undefined) updated.lastUpdated = lastUpdated;
  return updated;
}

function mergeChapterInto(
  mergedChapters: Chapter[],
  newChapter: Chapter,
  updateStrategy: 'replace' | 'merge',
): void {
  if (!newChapter.webUrl) {
    mergedChapters.push(newChapter);
    return;
  }
  const existingIndex = mergedChapters.findIndex((ch) => ch.webUrl === newChapter.webUrl);
  if (existingIndex < 0) {
    mergedChapters.push(newChapter);
    return;
  }
  const existing = mergedChapters[existingIndex];
  if (!existing) return;
  mergedChapters[existingIndex] =
    updateStrategy === 'replace'
      ? applyChapterReplace(existing, newChapter)
      : applyChapterMerge(existing, newChapter);
}

/**
 * 统计文本末尾的换行符数量（统一按 LF 计数）
 * @param text 输入文本
 * @returns 末尾连续换行符数量
 */
function countTrailingLineBreaks(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  const normalized = text.replace(/\r\n?/g, '\n');
  const match = normalized.match(/\n+$/);
  return match ? match[0].length : 0;
}

/**
 * 扫描单个章节内所有段落，将命中项追加到 `results`。
 *
 * 由 `searchParagraphsSyncShared` / `searchParagraphsAsyncShared` 共用，封装了：
 *   - 章节内容未加载时直接跳过（`chapter.content` falsy）
 *   - 逐段落调用 `match(paragraph)` 判定命中
 *   - 可选的 `onlyWithTranslation` 过滤（段落需至少有一条非空翻译）
 *   - 达到 `maxParagraphs` 后立即停止并返回 true，供调用方在外层循环中一并中断
 *
 * @returns 若结果数量已达到 `maxParagraphs` 返回 true，表示外层应停止继续扫描。
 */
function collectParagraphMatchesInChapter(
  chapter: Chapter,
  volume: Volume,
  vIndex: number,
  cIndex: number,
  match: (paragraph: Paragraph) => boolean,
  onlyWithTranslation: boolean,
  maxParagraphs: number,
  results: ParagraphSearchResult[],
): boolean {
  if (!chapter.content) return false;

  for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
    // 如果已达到最大返回数量，停止搜索
    if (results.length >= maxParagraphs) {
      return true;
    }

    const paragraph = chapter.content[pIndex];
    if (!paragraph) continue;

    if (!match(paragraph)) continue;

    // 如果要求只返回有翻译的段落，检查段落是否有翻译
    if (onlyWithTranslation && !hasNonEmptyTranslation(paragraph)) {
      continue;
    }

    results.push({
      paragraph,
      paragraphIndex: pIndex,
      chapter,
      chapterIndex: cIndex,
      volume,
      volumeIndex: vIndex,
    });

    // 如果已达到最大返回数量，停止搜索
    if (results.length >= maxParagraphs) {
      return true;
    }
  }

  return false;
}

/**
 * 根据 chapterId 定位目标卷/章索引。未提供 chapterId 时返回 `{}`；找不到则返回 null。
 */
function locateSearchTarget(
  volumes: Volume[],
  chapterId: string | undefined,
): { targetVolumeIndex: number | null; targetChapterIndex: number | null } | null {
  if (!chapterId) {
    return { targetVolumeIndex: null, targetChapterIndex: null };
  }
  for (let vIndex = 0; vIndex < volumes.length; vIndex++) {
    const volume = volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    const cIndex = volume.chapters.findIndex((c) => c.id === chapterId);
    if (cIndex !== -1) {
      return { targetVolumeIndex: vIndex, targetChapterIndex: cIndex };
    }
  }
  return null;
}

/**
 * 根据是否指定了目标位置，返回卷/章节的遍历范围。
 * 未指定时遍历全部；指定时只返回单卷 / 单章。
 */
function computeScanRange(
  volumeCount: number,
  targetVolumeIndex: number | null,
): { start: number; end: number } {
  if (targetVolumeIndex !== null) {
    return { start: targetVolumeIndex, end: targetVolumeIndex };
  }
  return { start: 0, end: volumeCount - 1 };
}

/**
 * 确保单个章节内容已加载：未加载时从 IndexedDB 读取并回填 content / contentLoaded。
 * 导出供 paragraph-tools 等共用，避免多处重复抄写单章懒加载样板。
 */
export async function ensureSingleChapterContentLoaded(
  chapter: Chapter | null | undefined,
): Promise<void> {
  if (!chapter || chapter.content !== undefined) return;
  const content = await ChapterContentService.loadChapterContent(chapter.id);
  chapter.content = content || [];
  chapter.contentLoaded = true;
}

/**
 * 批量加载一组待加载章节的内容，回填到 chapter.content / contentLoaded。
 * 导出供 paragraph-tools 等共用，避免多处重复抄写批量加载样板。
 */
export async function bulkLoadMissingChapters(
  chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[],
): Promise<void> {
  if (chaptersToLoad.length === 0) return;
  const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
  const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);
  for (const { chapter } of chaptersToLoad) {
    const content = contentsMap.get(chapter.id);
    chapter.content = content || [];
    chapter.contentLoaded = true;
  }
}

/**
 * 计算单卷内要遍历的章节范围：若指定 targetChapterIndex 则退化为单章。
 */
function resolveChapterRange(
  volume: Volume,
  targetChapterIndex: number | null,
): { start: number; end: number } {
  if (targetChapterIndex !== null) {
    return { start: targetChapterIndex, end: targetChapterIndex };
  }
  return { start: 0, end: (volume.chapters?.length ?? 1) - 1 };
}

/**
 * 遍历 [startV, endV] × [startC, endC] 内每个合法章节，逐个调用 visit。
 * visit 返回 'stop-chapter' 中断章节循环、'stop-all' 中断整个遍历。供 pass 1/2 共用。
 */
function forEachChapterInRange(
  volumes: Volume[],
  startVolumeIndex: number,
  endVolumeIndex: number,
  targetChapterIndex: number | null,
  visit: (ctx: { chapter: Chapter; volume: Volume; vIndex: number; cIndex: number }) => void | 'stop-chapter' | 'stop-all',
): void {
  for (let vIndex = startVolumeIndex; vIndex <= endVolumeIndex; vIndex++) {
    const volume = volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    const { start: startC, end: endC } = resolveChapterRange(volume, targetChapterIndex);
    let stopAll = false;
    for (let cIndex = startC; cIndex <= endC; cIndex++) {
      const chapter = volume.chapters[cIndex];
      if (!chapter) continue;
      const token = visit({ chapter, volume, vIndex, cIndex });
      if (token === 'stop-all') {
        stopAll = true;
        break;
      }
      if (token === 'stop-chapter') break;
    }
    if (stopAll) break;
  }
}

/**
 * pass 1：扫描 `[startV, endV]` / `[startC, endC]` 范围内未加载的章节。
 */
function collectChaptersNeedingLoad(
  volumes: Volume[],
  startVolumeIndex: number,
  endVolumeIndex: number,
  targetChapterIndex: number | null,
): { chapter: Chapter; vIndex: number; cIndex: number }[] {
  const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];
  forEachChapterInRange(
    volumes,
    startVolumeIndex,
    endVolumeIndex,
    targetChapterIndex,
    ({ chapter, vIndex, cIndex }) => {
      if (chapter.content === undefined) {
        chaptersToLoad.push({ chapter, vIndex, cIndex });
      }
    },
  );
  return chaptersToLoad;
}

/**
 * pass 2：在指定范围内逐段落匹配、收集结果；超过 maxParagraphs 时提前退出。
 */
async function scanChaptersForMatches(
  volumes: Volume[],
  startVolumeIndex: number,
  endVolumeIndex: number,
  targetChapterIndex: number | null,
  match: (paragraph: Paragraph) => boolean,
  onlyWithTranslation: boolean,
  maxParagraphs: number,
): Promise<ParagraphSearchResult[]> {
  const results: ParagraphSearchResult[] = [];
  // 预加载未加载的章节（pass 2 之前可能有新章节未 pass 1 扫描到）
  for (let vIndex = startVolumeIndex; vIndex <= endVolumeIndex; vIndex++) {
    const volume = volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    const { start: startC, end: endC } = resolveChapterRange(volume, targetChapterIndex);
    let reachedLimit = false;
    for (let cIndex = startC; cIndex <= endC; cIndex++) {
      const chapter = volume.chapters[cIndex];
      if (!chapter) continue;
      // 如果仍未加载，按需加载（可能是在第一遍之后添加的新章节）
      await ensureSingleChapterContentLoaded(chapter);
      reachedLimit = collectParagraphMatchesInChapter(
        chapter,
        volume,
        vIndex,
        cIndex,
        match,
        onlyWithTranslation,
        maxParagraphs,
        results,
      );
      if (reachedLimit) break;
    }
    if (results.length >= maxParagraphs) break;
  }
  return results;
}

/**
 * `searchParagraphsByKeywordAsync` / `searchParagraphsByRegexAsync` 共享的扫描逻辑。
 * 负责：
 *   1. 根据 chapterId 定位目标卷/章索引（若提供）
 *   2. 批量按需加载未加载的章节内容
 *   3. 遍历指定范围的章节，对每个段落调用 `match(paragraph)` 决定是否命中
 *   4. 应用 `onlyWithTranslation` 过滤、收集结果并在达到 `maxParagraphs` 时提前退出
 *
 * 行为与原内联实现完全等价；不同的匹配策略通过 `match` 回调注入。
 */
async function searchParagraphsAsyncShared(
  novel: Novel,
  chapterId: string | undefined,
  maxParagraphs: number,
  onlyWithTranslation: boolean,
  match: (paragraph: Paragraph) => boolean,
): Promise<ParagraphSearchResult[]> {
  // 调用方已保证 novel.volumes 非空（两个调用点都做了前置判断）
  const volumes = novel.volumes ?? [];

  // 如果提供了 chapterId，需要找到该章节的位置
  const target = locateSearchTarget(volumes, chapterId);
  if (!target) return [];
  const { targetVolumeIndex, targetChapterIndex } = target;

  // 计算卷遍历范围（若指定 chapterId 则退化为单卷）
  const { start: startVolumeIndex, end: endVolumeIndex } = computeScanRange(
    volumes.length,
    targetVolumeIndex,
  );

  // pass 1：收集需要加载的章节并批量加载
  const chaptersToLoad = collectChaptersNeedingLoad(
    volumes,
    startVolumeIndex,
    endVolumeIndex,
    targetChapterIndex,
  );
  await bulkLoadMissingChapters(chaptersToLoad);

  // pass 2：在加载的章节中搜索
  return scanChaptersForMatches(
    volumes,
    startVolumeIndex,
    endVolumeIndex,
    targetChapterIndex,
    match,
    onlyWithTranslation,
    maxParagraphs,
  );
}

/**
 * 章节服务
 * 提供章节获取、更新、合并等通用功能
 */
export class ChapterService {
  /**
   * 通过 URL 查找章节
   * @param novel 小说对象
   * @param chapterUrl 章节 URL
   * @returns 找到的章节，如果不存在则返回 null
   */
  static findChapterByUrl(novel: Novel | null | undefined, chapterUrl: string): Chapter | null {
    if (!novel || !novel.volumes || !chapterUrl) {
      return null;
    }

    for (const volume of novel.volumes) {
      if (volume.chapters) {
        for (const chapter of volume.chapters) {
          if (chapter.webUrl === chapterUrl) {
            return chapter;
          }
        }
      }
    }

    return null;
  }

  /**
   * 检查章节是否已存在于小说中
   * @param novel 小说对象
   * @param chapter 要检查的章节
   * @returns 章节是否已存在
   */
  static isChapterImported(novel: Novel | null | undefined, chapter: Chapter): boolean {
    if (!chapter.webUrl) {
      return false;
    }
    return ChapterService.findChapterByUrl(novel, chapter.webUrl) !== null;
  }

  /**
   * 通过章节 ID 查找章节（委托给 utils/novel-utils 的纯函数）。
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @returns 找到的章节及其位置信息，如果不存在则返回 null
   */
  static findChapterById = findChapterById;

  /**
   * 按指定方向查找相邻章节（同卷内相邻优先，否则跨卷找对端非空卷的首/末章节）
   * - direction = -1：向前（同卷 chapterIndex-1，跨卷回溯找上一非空卷的**最后**一章）
   * - direction = +1：向后（同卷 chapterIndex+1，跨卷前进找下一非空卷的**第一**章）
   */
  private static findAdjacentChapter(
    novel: Novel | null | undefined,
    chapterId: string,
    direction: -1 | 1,
  ): { chapter: Chapter; volume: Volume; volumeIndex: number; chapterIndex: number } | null {
    const current = ChapterService.locateCurrentChapter(novel, chapterId);
    if (!current) return null;
    const { volumeIndex, chapterIndex } = current;
    const volumes = novel?.volumes;
    if (!volumes) return null;

    // 同卷内相邻章节
    const currentVolume = volumes[volumeIndex];
    const nextInVolume = chapterIndex + direction;
    const inBounds =
      direction === -1
        ? nextInVolume >= 0
        : nextInVolume < (currentVolume?.chapters?.length ?? 0);
    if (currentVolume && inBounds) {
      const chapter = currentVolume.chapters?.[nextInVolume];
      if (chapter) {
        return { chapter, volume: currentVolume, volumeIndex, chapterIndex: nextInVolume };
      }
    }

    // 跨卷查找：-1 找上一非空卷的末章，+1 找下一非空卷的首章
    const end = direction === -1 ? -1 : volumes.length;
    for (let vIdx = volumeIndex + direction; vIdx !== end; vIdx += direction) {
      const volume = volumes[vIdx];
      if (volume && volume.chapters && volume.chapters.length > 0) {
        const cIdx = direction === -1 ? volume.chapters.length - 1 : 0;
        const chapter = volume.chapters[cIdx];
        if (chapter) {
          return { chapter, volume, volumeIndex: vIdx, chapterIndex: cIdx };
        }
      }
    }

    return null;
  }

  /**
   * 获取指定章节的前一个章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @returns 前一个章节及其位置信息，如果不存在则返回 null
   */
  static getPreviousChapter(
    novel: Novel | null | undefined,
    chapterId: string,
  ): { chapter: Chapter; volume: Volume; volumeIndex: number; chapterIndex: number } | null {
    return ChapterService.findAdjacentChapter(novel, chapterId, -1);
  }

  /**
   * 获取指定章节的下一个章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @returns 下一个章节及其位置信息，如果不存在则返回 null
   */
  static getNextChapter(
    novel: Novel | null | undefined,
    chapterId: string,
  ): { chapter: Chapter; volume: Volume; volumeIndex: number; chapterIndex: number } | null {
    return ChapterService.findAdjacentChapter(novel, chapterId, 1);
  }

  /**
   * 比较两个日期，返回远程是否比本地更新
   * @param remoteDate 远程日期
   * @param localDate 本地日期
   * @returns 远程是否更新
   */
  static isRemoteNewer(
    remoteDate: Date | string | undefined,
    localDate: Date | string | undefined,
  ): boolean {
    if (!remoteDate) return false;
    if (!localDate) return true; // 如果本地没有日期，认为远程更新

    const remote = remoteDate instanceof Date ? remoteDate : new Date(remoteDate);
    const local = localDate instanceof Date ? localDate : new Date(localDate);

    // 检查日期是否有效
    if (isNaN(remote.getTime()) || isNaN(local.getTime())) {
      return false;
    }

    // 比较时间戳，远程更新则返回 true
    return remote.getTime() > local.getTime();
  }

  /**
   * 检查章节是否需要更新（已导入但远程更新）
   * @param novel 小说对象
   * @param chapter 远程章节
   * @returns 是否需要更新
   */
  static shouldUpdateChapter(novel: Novel | null | undefined, chapter: Chapter): boolean {
    if (!ChapterService.isChapterImported(novel, chapter)) {
      return false; // 未导入的章节由其他逻辑处理
    }

    const importedChapter = ChapterService.findChapterByUrl(novel, chapter.webUrl || '');
    if (!importedChapter) {
      return false;
    }

    // 宽松策略：远程无 lastUpdated 时无法判断，不标记更新
    if (!chapter.lastUpdated) {
      return false;
    }

    // 优先比较远程和本地的 lastUpdated
    if (importedChapter.lastUpdated) {
      return ChapterService.isRemoteNewer(chapter.lastUpdated, importedChapter.lastUpdated);
    }

    // 回退：本地无 lastUpdated 时，对比远程 lastUpdated 与本地 createdAt（导入日期）
    return ChapterService.isRemoteNewer(chapter.lastUpdated, importedChapter.createdAt);
  }

  /**
   * 检查远程章节内容是否与本地已导入的章节内容不同
   * @param importedChapter 本地已导入的章节
   * @param remoteContent 远程加载的内容文本
   * @returns 内容是否有变化。如果本地无 originalContent，保守返回 true
   */
  static hasContentChanged(importedChapter: Chapter, remoteContent: string): boolean {
    if (!importedChapter.originalContent) {
      // 本地没有 originalContent 记录（如手动创建或早期导入），无法对比
      // 保守处理：认为有变化
      return true;
    }
    // trim 后直接字符串对比
    return importedChapter.originalContent.trim() !== remoteContent.trim();
  }

  /**
   * 合并章节到现有章节数组
   * @param existingChapters 现有章节数组
   * @param newChapters 新章节数组
   * @param updateStrategy 更新策略：'replace' 替换整个章节，'merge' 合并章节属性（默认）
   * @returns 合并后的章节数组
   */
  static mergeChapters(
    existingChapters: Chapter[],
    newChapters: Chapter[],
    updateStrategy: 'replace' | 'merge' = 'merge',
  ): Chapter[] {
    const mergedChapters = [...existingChapters];
    for (const newChapter of newChapters) {
      mergeChapterInto(mergedChapters, newChapter, updateStrategy);
    }
    return mergedChapters;
  }

  /**
   * 合并卷和章节到现有小说
   * @param existingNovel 现有小说数据（可以是部分数据）
   * @param newNovel 新获取的小说数据
   * @param options 合并选项
   * @returns 合并后的小说数据
   * @note 在合并卷时，通过比较 title.original（原始标题）来匹配现有卷，
   *       确保即使卷标题被翻译了，也能正确匹配到相同的卷
   */
  static mergeNovelData(
    existingNovel: Partial<Novel>,
    newNovel: Novel,
    options: {
      updateTitle?: boolean; // 是否更新标题（如果现有标题为空则总是更新）
      updateAuthor?: boolean; // 是否更新作者
      updateDescription?: boolean; // 是否更新描述
      updateTags?: boolean; // 是否更新标签
      updateWebUrl?: boolean; // 是否更新 URL
      chapterUpdateStrategy?: 'replace' | 'merge'; // 章节更新策略
    } = {},
  ): Partial<Novel> {
    const {
      updateTitle = true,
      updateAuthor = true,
      updateDescription = true,
      updateTags = true,
      updateWebUrl = true,
      chapterUpdateStrategy = 'merge',
    } = options;

    const merged: Partial<Novel> = { ...existingNovel };

    // 更新标题（只有当现有标题为空时才覆盖）
    if (updateTitle && newNovel.title) {
      if (!merged.title?.trim()) {
        merged.title = newNovel.title;
      }
    }

    // 更新作者
    if (updateAuthor && newNovel.author) {
      merged.author = newNovel.author;
    }

    // 更新描述
    if (updateDescription && newNovel.description) {
      merged.description = newNovel.description;
    }

    // 合并标签
    if (updateTags && newNovel.tags && newNovel.tags.length > 0) {
      const existingTags = merged.tags || [];
      merged.tags = [
        ...existingTags,
        ...newNovel.tags.filter((tag) => !existingTags.includes(tag)),
      ];
    }

    // 合并 URL
    if (updateWebUrl && newNovel.webUrl && newNovel.webUrl.length > 0) {
      const existingUrls = merged.webUrl || [];
      merged.webUrl = [
        ...existingUrls,
        ...newNovel.webUrl.filter((url) => !existingUrls.includes(url)),
      ];
    }

    // 合并 volumes 和 chapters
    if (newNovel.volumes && newNovel.volumes.length > 0) {
      const existingVolumes = merged.volumes || [];

      if (existingVolumes.length === 0) {
        // 如果没有现有卷，直接使用新的
        merged.volumes = newNovel.volumes;
      } else {
        // 合并卷和章节
        const mergedVolumes: Volume[] = [...existingVolumes];

        newNovel.volumes.forEach((newVolume) => {
          // 查找同标题的现有卷（比较原文标题）
          // 兼容旧数据格式：如果 title 是字符串，直接比较字符串；否则比较 original
          const newVolumeOriginalTitle =
            typeof newVolume.title === 'string' ? newVolume.title : newVolume.title.original;
          const existingVolumeIndex = mergedVolumes.findIndex((v) => {
            if (typeof v.title === 'string') {
              return v.title === newVolumeOriginalTitle;
            }
            return v.title.original === newVolumeOriginalTitle;
          });

          if (existingVolumeIndex >= 0) {
            // 卷已存在，合并章节
            const existingVolume = mergedVolumes[existingVolumeIndex];
            const existingChapters = existingVolume?.chapters || [];
            const newChapters = newVolume.chapters || [];

            if (existingChapters.length === 0) {
              // 如果现有卷没有章节，直接使用新章节
              if (existingVolume) {
                existingVolume.chapters = newChapters;
              }
            } else {
              // 合并章节
              if (existingVolume) {
                existingVolume.chapters = ChapterService.mergeChapters(
                  existingChapters,
                  newChapters,
                  chapterUpdateStrategy,
                );
              }
            }
          } else {
            // 卷不存在，添加新卷
            mergedVolumes.push(newVolume);
          }
        });

        merged.volumes = mergedVolumes;
      }
    }

    return merged;
  }

  /**
   * 将章节内容文本转换为段落数组
   * @param content 章节内容文本
   * @returns 段落数组
   */
  static convertContentToParagraphs(content: string): Paragraph[] {
    const idGenerator = new UniqueIdGenerator();
    return content.split('\n').map((text) => {
      const paragraph: Paragraph = {
        id: idGenerator.generate(),
        text: text, // 不使用 trim()，保留原始格式（包括开头空格和空行）
        selectedTranslationId: '',
        translations: [],
      };
      return paragraph;
    });
  }

  /**
   * 获取章节的内容文本
   * @param chapter 章节对象
   * @returns 章节内容文本，如果没有内容则返回空字符串
   */
  static getChapterContentText(chapter: Chapter): string {
    return getChapterContentText(chapter);
  }

  /**
   * 获取章节的导入状态信息
   * @param novel 小说对象
   * @param chapter 章节对象
   * @returns 导入状态信息，如果未导入则返回 null
   */
  static getChapterImportStatus(
    novel: Novel | null | undefined,
    chapter: Chapter,
  ): { text: string; class: string } | null {
    if (!ChapterService.isChapterImported(novel, chapter)) {
      return null;
    }

    const isNewer = ChapterService.shouldUpdateChapter(novel, chapter);
    if (isNewer) {
      return {
        text: '已导入（有更新）',
        class: 'px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded flex-shrink-0',
      };
    } else {
      return {
        text: '已导入',
        class: 'px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded flex-shrink-0',
      };
    }
  }

  // --- CRUD 操作 ---

  /**
   * 添加新卷
   * @param novel 小说对象
   * @param title 卷标题
   * @returns 更新后的卷列表
   */
  static addVolume(novel: Novel, title: string): Volume[] {
    const existingVolumes = novel.volumes || [];
    const volumeIds = extractIds(existingVolumes);
    const idGenerator = new UniqueIdGenerator(volumeIds);

    const trimmedTitle = title.trim();
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const newVolume: Volume = {
      id: idGenerator.generate(),
      title: {
        original: trimmedTitle,
        translation,
      },
      chapters: [],
    };

    return [...existingVolumes, newVolume];
  }

  /**
   * 更新卷信息
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @param data 更新的数据（如果 data.title 是字符串，则更新 title.original）
   * @returns 更新后的卷列表
   */
  static updateVolume(
    novel: Novel,
    volumeId: string,
    data: Omit<Partial<Volume>, 'title'> & { title?: string | Volume['title'] },
  ): Volume[] {
    const existingVolumes = novel.volumes || [];
    const index = existingVolumes.findIndex((v) => v.id === volumeId);
    if (index === -1) return existingVolumes;

    const updatedVolumes = [...existingVolumes];
    const existingVolume = updatedVolumes[index];
    if (existingVolume) {
      // 处理 title 更新：如果传入的是字符串，更新 title.original
      const { title: titleData, ...restData } = data;
      const updateData: Partial<Volume> = { ...restData };
      if (titleData) {
        if (typeof titleData === 'string') {
          // 兼容旧数据格式：如果现有 title 是字符串，创建新的翻译对象
          let existingTranslation;
          if (typeof existingVolume.title === 'string') {
            // 旧数据格式，创建新的翻译对象
            existingTranslation = {
              id: generateShortId(),
              translation: '',
              aiModelId: '',
            };
          } else {
            // 新数据格式，保留原有翻译
            existingTranslation = existingVolume.title.translation;
          }
          updateData.title = {
            original: titleData.trim(),
            translation: existingTranslation,
          };
        } else {
          updateData.title = titleData;
        }
      }
      updatedVolumes[index] = { ...existingVolume, ...updateData };
    }
    return updatedVolumes;
  }

  /**
   * 删除卷
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @returns 更新后的卷列表
   */
  static deleteVolume(novel: Novel, volumeId: string): Volume[] {
    const existingVolumes = novel.volumes || [];
    return existingVolumes.filter((v) => v.id !== volumeId);
  }

  /**
   * 添加新章节
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @param title 章节标题
   * @param content 章节内容（可选）
   * @returns 更新后的卷列表
   */
  static addChapter(
    novel: Novel,
    volumeId: string,
    title: string,
    content?: Paragraph[],
  ): Volume[] {
    const existingVolumes = novel.volumes || [];
    const volumeIndex = existingVolumes.findIndex((v) => v.id === volumeId);
    if (volumeIndex === -1) return existingVolumes;

    const volume = existingVolumes[volumeIndex];
    if (!volume) return existingVolumes;

    const existingChapters = volume.chapters || [];
    // 优化：直接使用 Set 来检查唯一性，避免创建完整的ID数组
    // 只在必要时生成新ID（如果发生冲突，概率极低）
    const existingIdsSet = new Set(existingChapters.map((ch) => ch.id));
    let newChapterId = generateShortId();
    // 如果发生冲突（概率极低），生成新ID
    let attempts = 0;
    while (existingIdsSet.has(newChapterId) && attempts < 10) {
      newChapterId = generateShortId();
      attempts++;
    }
    const now = new Date();

    const trimmedTitle = title.trim();
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const newChapter: Chapter = {
      id: newChapterId,
      title: {
        original: trimmedTitle,
        translation,
      },
      lastEdited: now,
      createdAt: now,
      content: content,
    };

    const updatedChapters = [...existingChapters, newChapter];
    const updatedVolumes = [...existingVolumes];
    updatedVolumes[volumeIndex] = { ...volume, chapters: updatedChapters };

    return updatedVolumes;
  }

  /**
   * 更新章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @param data 更新的数据
   * @param targetVolumeId 目标卷 ID（如果需要移动）
   * @returns 更新后的卷列表
   */
  static updateChapter(
    this: void,
    novel: Novel,
    chapterId: string,
    data: Omit<Partial<Chapter>, 'title'> & { title?: string | Chapter['title'] },
    targetVolumeId?: string,
  ): Volume[] {
    const existingVolumes = [...(novel.volumes || [])];
    const {
      sourceVolumeIndex,
      chapterIndex,
      chapter: chapterToUpdate,
    } = ChapterService.findChapterSourceIndex(existingVolumes, chapterId);

    if (!chapterToUpdate || sourceVolumeIndex === -1) return existingVolumes;

    // 处理 title 更新：如果传入的是字符串，更新 title.original
    const { title: titleData, ...restData } = data;
    const updateData: Partial<Chapter> = { ...restData };
    if (titleData) {
      if (typeof titleData === 'string') {
        // 兼容旧数据格式：如果现有 title 是字符串，创建新的翻译对象
        let existingTranslation;
        if (typeof chapterToUpdate.title === 'string') {
          // 旧数据格式，创建新的翻译对象
          existingTranslation = {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          };
        } else {
          // 新数据格式，保留原有翻译
          existingTranslation = chapterToUpdate.title.translation;
        }
        updateData.title = {
          original: titleData.trim(),
          translation: existingTranslation,
        };
      } else {
        updateData.title = titleData;
      }
    }

    // 更新基本信息
    const updatedChapter: Chapter = {
      ...chapterToUpdate,
      ...updateData,
      lastEdited: new Date(), // 总是更新编辑时间
    };

    const sourceVolume = existingVolumes[sourceVolumeIndex];
    if (!sourceVolume) return existingVolumes;

    // 如果不需要移动，或者目标卷和源卷相同
    if (!targetVolumeId || targetVolumeId === sourceVolume.id) {
      const updatedChapters = [...(sourceVolume.chapters || [])];
      updatedChapters[chapterIndex] = updatedChapter;
      existingVolumes[sourceVolumeIndex] = { ...sourceVolume, chapters: updatedChapters };
      return existingVolumes;
    }

    // 如果需要移动到不同卷
    const targetVolumeIndex = existingVolumes.findIndex((v) => v.id === targetVolumeId);
    if (targetVolumeIndex === -1) return existingVolumes;

    const moved = ChapterService.spliceSourceAndCloneTargetChapters(
      existingVolumes,
      sourceVolumeIndex,
      sourceVolume,
      chapterIndex,
      targetVolumeIndex,
    );
    if (!moved) return existingVolumes;

    // 添加到目标卷
    moved.targetChapters.push(updatedChapter);
    existingVolumes[targetVolumeIndex] = { ...moved.targetVolume, chapters: moved.targetChapters };

    return existingVolumes;
  }

  /**
   * 删除章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @returns 更新后的卷列表
   */
  static deleteChapter(novel: Novel, chapterId: string): Volume[] {
    const existingVolumes = novel.volumes || [];

    // 优化：直接找到包含该章节的卷，避免遍历所有卷
    for (let i = 0; i < existingVolumes.length; i++) {
      const volume = existingVolumes[i];
      if (volume?.chapters) {
        const chapterIndex = volume.chapters.findIndex((c) => c.id === chapterId);
        if (chapterIndex !== -1) {
          // 找到包含该章节的卷，只修改这个卷
          const updatedVolumes = [...existingVolumes];
          updatedVolumes[i] = {
            ...volume,
            chapters: volume.chapters.filter((c) => c.id !== chapterId),
          };
          return updatedVolumes;
        }
      }
    }

    // 如果没有找到章节，返回原始卷列表
    return existingVolumes;
  }

  /**
   * 移动章节（拖拽排序）
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @param targetVolumeId 目标卷 ID
   * @param targetIndex 目标索引（可选，如果不传则添加到末尾）
   * @returns 更新后的卷列表
   */
  static moveChapter(
    novel: Novel,
    chapterId: string,
    targetVolumeId: string,
    targetIndex?: number,
  ): Volume[] {
    const existingVolumes = [...(novel.volumes || [])];
    const {
      sourceVolumeIndex,
      chapterIndex,
      chapter: chapterToMove,
    } = ChapterService.findChapterSourceIndex(existingVolumes, chapterId);

    if (!chapterToMove || sourceVolumeIndex === -1) return existingVolumes;

    // 1. 验证目标卷是否存在
    const targetVolumeIndex = existingVolumes.findIndex((v) => v.id === targetVolumeId);
    if (targetVolumeIndex === -1) return existingVolumes;

    // 2. 从源卷移除 + 克隆目标卷 chapters
    // 注意：如果源卷和目标卷相同，helper 内部会读取 splice 后写回 existingVolumes 的新对象
    const sourceVolume = existingVolumes[sourceVolumeIndex];
    if (!sourceVolume) return existingVolumes;

    const moved = ChapterService.spliceSourceAndCloneTargetChapters(
      existingVolumes,
      sourceVolumeIndex,
      sourceVolume,
      chapterIndex,
      targetVolumeIndex,
    );
    if (!moved) return existingVolumes;

    // 3. 按指定位置插入目标章节
    const insertIndex =
      targetIndex !== undefined && targetIndex !== null
        ? targetIndex
        : moved.targetChapters.length;

    moved.targetChapters.splice(insertIndex, 0, chapterToMove);
    existingVolumes[targetVolumeIndex] = { ...moved.targetVolume, chapters: moved.targetChapters };

    return existingVolumes;
  }

  /**
   * 按关键词搜索段落
   * @param novel 小说对象
   * @param keyword 搜索关键词
   * @param chapterId 可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）
   * @param maxParagraphs 可选的最大返回段落数量，默认为 1
   * @param onlyWithTranslation 是否只返回有翻译的段落，默认为 false
   * @returns 搜索结果数组，包含匹配的段落及其所在位置信息
   */
  /**
   * 根据关键词搜索段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param keyword 搜索关键词
   * @param chapterId 可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）
   * @param maxParagraphs 最大返回段落数量
   * @param onlyWithTranslation 是否只返回有翻译的段落
   * @returns 段落位置信息数组
   */
  static async searchParagraphsByKeywordAsync(
    novel: Novel | null | undefined,
    keyword: string,
    chapterId?: string,
    maxParagraphs: number = 1,
    onlyWithTranslation: boolean = false,
  ): Promise<ParagraphSearchResult[]> {
    if (!novel || !novel.volumes || !keyword.trim()) {
      return [];
    }

    // 尝试使用全文索引
    try {
      const { FullTextIndexService } = await import('src/services/full-text-index-service');
      const searchOptions: Parameters<typeof FullTextIndexService.search>[2] = {
        maxResults: maxParagraphs,
        onlyWithTranslation,
        searchInOriginal: true,
        searchInTranslations: false, // 只搜索原文
        // 传入当前 novel 引用，确保返回的段落/章节对象与调用方一致
        novel,
      };
      if (chapterId) {
        searchOptions.chapterId = chapterId;
      }
      const results = await FullTextIndexService.search(novel.id, [keyword.trim()], searchOptions);

      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      // 如果索引不可用，回退到线性搜索
      console.warn('Full-text index search failed, falling back to linear search:', error);
    }

    // 回退到线性搜索
    const trimmedKeyword = keyword.trim().toLowerCase();

    return searchParagraphsAsyncShared(
      novel,
      chapterId,
      maxParagraphs,
      onlyWithTranslation,
      (paragraph) => paragraph.text.toLowerCase().includes(trimmedKeyword),
    );
  }

  /**
   * 使用正则表达式异步搜索段落（按需加载章节内容，优化性能）
   * @param novel 小说对象
   * @param regexPattern 正则表达式模式（字符串）
   * @param chapterId 可选的章节 ID，如果提供则仅在该章节内搜索
   * @param maxParagraphs 最大返回段落数量（默认 1）
   * @param onlyWithTranslation 是否只返回有翻译的段落（默认 false）
   * @param searchInTranslation 是否在翻译文本中搜索（默认 false，在原文中搜索）
   * @returns 匹配的段落搜索结果数组
   */
  static async searchParagraphsByRegexAsync(
    novel: Novel | null | undefined,
    regexPattern: string,
    chapterId?: string,
    maxParagraphs: number = 1,
    onlyWithTranslation: boolean = false,
    searchInTranslation: boolean = false,
  ): Promise<ParagraphSearchResult[]> {
    if (!novel || !novel.volumes || !regexPattern.trim()) {
      return [];
    }

    // 验证并编译正则表达式（不使用 'g' 标志，因为我们只是测试匹配，不提取）
    let regex: RegExp;
    try {
      regex = new RegExp(regexPattern.trim());
    } catch (error) {
      // 如果正则表达式无效，返回空结果
      console.error('Invalid regex pattern:', regexPattern, error);
      return [];
    }

    return searchParagraphsAsyncShared(
      novel,
      chapterId,
      maxParagraphs,
      onlyWithTranslation,
      (paragraph) => {
        // 确定要搜索的文本
        let searchText: string;
        if (searchInTranslation) {
          // 在翻译文本中搜索
          if (!paragraph.translations || paragraph.translations.length === 0) {
            return false; // 如果没有翻译，跳过
          }
          // 使用选中的翻译，如果没有则使用第一个翻译
          const selectedTranslation = paragraph.translations.find(
            (t) => t.id === paragraph.selectedTranslationId,
          );
          searchText =
            selectedTranslation?.translation || paragraph.translations[0]?.translation || '';
        } else {
          // 在原文中搜索
          searchText = paragraph.text;
        }

        // 使用正则表达式测试
        return regex.test(searchText);
      },
    );
  }

  /**
   * 通过段落 ID 查找段落位置信息
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @returns 段落位置信息，如果未找到则返回 null
   */
  /**
   * 查找段落位置（按需加载章节内容，优化性能，使用批量加载）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @returns 段落位置信息，如果不存在则返回 null
   */
  static async findParagraphLocationAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
  ): Promise<ParagraphSearchResult | null> {
    if (!novel || !novel.volumes || !paragraphId) return null;

    const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];
    const loadedHit = findParagraphInLoadedChapters(novel, paragraphId, chaptersToLoad);
    if (loadedHit) return loadedHit;
    if (chaptersToLoad.length === 0) return null;

    const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
    const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);
    return findParagraphInBatchLoadedChapters(novel, paragraphId, chaptersToLoad, contentsMap);
  }

  static findParagraphLocation(
    novel: Novel | null | undefined,
    paragraphId: string,
  ): ParagraphSearchResult | null {
    if (!novel || !novel.volumes || !paragraphId) {
      return null;
    }

    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter || !chapter.content) continue;

        for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
          const paragraph = chapter.content[pIndex];
          if (paragraph && paragraph.id === paragraphId) {
            return {
              paragraph,
              paragraphIndex: pIndex,
              chapter,
              chapterIndex: cIndex,
              volume,
              volumeIndex: vIndex,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * 批量加载 chaptersToLoad 中记录的章节内容，并写回 chapterMap 里引用的 chapter 对象。
   * 被 getPreviousParagraphsAsync / getNextParagraphsAsync 的第二遍扫描前共用。
   */
  private static async batchLoadCollectedChapters(
    chaptersToLoad: Set<string>,
    chapterMap: Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>,
  ): Promise<void> {
    if (chaptersToLoad.size === 0) return;

    const chapterIds = Array.from(chaptersToLoad);
    const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

    for (const [chapterId, content] of contentsMap) {
      const chapterInfo = chapterMap.get(chapterId);
      if (chapterInfo) {
        chapterInfo.chapter.content = content || [];
        chapterInfo.chapter.contentLoaded = true;
      }
    }
  }

  /**
   * updateChapter / moveChapter 跨卷搬运的共用块：
   *   1) 从源卷克隆一份 chapters 并 splice 掉第 chapterIndex 项，写回 existingVolumes；
   *   2) 定位目标卷并克隆其 chapters 数组返回，供调用方 push 或 splice 插入。
   * 若目标卷下标无效则返回 null，调用方应返回 existingVolumes。
   */
  private static spliceSourceAndCloneTargetChapters(
    existingVolumes: Volume[],
    sourceVolumeIndex: number,
    sourceVolume: Volume,
    chapterIndex: number,
    targetVolumeIndex: number,
  ): { targetVolume: Volume; targetChapters: Chapter[] } | null {
    // 1. 从源卷移除
    const sourceChapters = [...(sourceVolume.chapters || [])];
    sourceChapters.splice(chapterIndex, 1);
    existingVolumes[sourceVolumeIndex] = { ...sourceVolume, chapters: sourceChapters };

    // 2. 定位目标卷（若源卷和目标卷相同，使用 splice 后的新对象）
    const targetVolume = existingVolumes[targetVolumeIndex];
    if (!targetVolume) return null;

    const targetChapters = [...(targetVolume.chapters || [])];
    return { targetVolume, targetChapters };
  }

  /**
   * `getPreviousChapter` / `getNextChapter` 共用的定位前言：
   * 通过 chapterId 找到当前章节位置，不存在则返回 null。
   */
  private static locateCurrentChapter(
    novel: Novel | null | undefined,
    chapterId: string,
  ): { volumeIndex: number; chapterIndex: number } | null {
    const current = ChapterService.findChapterById(novel, chapterId);
    if (!current) return null;
    const { volumeIndex, chapterIndex } = current;
    return { volumeIndex, chapterIndex };
  }

  /**
   * 在 `existingVolumes` 里查找某章所在的卷下标 / 章下标 / 章对象。
   * updateChapter / moveChapter 等多个 mutation 入口共用。
   */
  private static findChapterSourceIndex(
    existingVolumes: Volume[],
    chapterId: string,
  ): { sourceVolumeIndex: number; chapterIndex: number; chapter: Chapter | null } {
    for (let i = 0; i < existingVolumes.length; i++) {
      const volume = existingVolumes[i];
      if (volume && volume.chapters) {
        const index = volume.chapters.findIndex((c) => c.id === chapterId);
        if (index !== -1) {
          return {
            sourceVolumeIndex: i,
            chapterIndex: index,
            chapter: volume.chapters[index] || null,
          };
        }
      }
    }
    return { sourceVolumeIndex: -1, chapterIndex: -1, chapter: null };
  }

  /**
   * 第一遍扫描的共用动作：若 chapter 内容未加载，则记入待加载集合，返回是否新增计数。
   * 由 getPreviousParagraphsAsync / getNextParagraphsAsync 的 pass 1 使用。
   */
  private static collectChapterForLoad(
    chapter: Chapter | null | undefined,
    vIndex: number,
    cIndex: number,
    chaptersToLoad: Set<string>,
    chapterMap: Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>,
  ): boolean {
    if (chapter && chapter.content === undefined) {
      chaptersToLoad.add(chapter.id);
      chapterMap.set(chapter.id, { chapter, vIndex, cIndex });
      return true;
    }
    return false;
  }

  /**
   * 第二遍扫描的共用动作：若 chapter 内容仍未加载，则按需懒加载。
   * 由 getPreviousParagraphsAsync / getNextParagraphsAsync 的 pass 2 使用。
   */
  private static async ensureChapterLoaded(chapter: Chapter | null | undefined): Promise<void> {
    await ensureSingleChapterContentLoaded(chapter);
  }

  /**
   * 计算向后遍历时、刚进入某章节应使用的 pIdx（指向该章节最后一段；章节无内容时返回 -1）。
   */
  private static lastParagraphIndexOf(chapter: Chapter | null | undefined): number {
    return chapter && chapter.content ? chapter.content.length - 1 : -1;
  }

  /**
   * 向前跨卷：将 state.vIdx 回退到上一个非空卷，把 state.cIdx 指向该卷最后一章，state.pIdx 指向该章最后一段。
   * 若已无更早的卷，返回 done=true。若跳过的卷本身是空的，会将 cIdx/pIdx 置 -1 并返回 chapter=null 交给调用方 continue。
   *
   * 共用于 getPreviousParagraphsAsync 的两遍扫描，封装原来重复出现的「vIdx-- + 空卷兜底 + cIdx=last + pIdx=last」样板。
   */
  private static jumpToPrevVolumeLastChapter(
    state: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
  ): { done: boolean; chapter: Chapter | null } {
    state.vIdx--;
    if (state.vIdx < 0) {
      return { done: true, chapter: null };
    }
    const prevVolume = novel.volumes?.[state.vIdx];
    if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
      state.cIdx = -1;
      state.pIdx = -1;
      return { done: false, chapter: null };
    }
    state.cIdx = prevVolume.chapters.length - 1;
    const prevChapter = prevVolume.chapters[state.cIdx] ?? null;
    state.pIdx = ChapterService.lastParagraphIndexOf(prevChapter);
    return { done: false, chapter: prevChapter };
  }

  /**
   * 向后跨卷：将 state.vIdx 前进到下一个卷，把 state.cIdx/pIdx 置零。
   * 若已无更晚的卷，返回 done=true。
   *
   * 共用于 getNextParagraphsAsync 的两遍扫描。
   */
  private static jumpToNextVolumeFirstChapter(
    state: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
  ): { done: boolean } {
    state.vIdx++;
    if (!novel.volumes || state.vIdx >= novel.volumes.length) {
      return { done: true };
    }
    state.cIdx = 0;
    state.pIdx = 0;
    return { done: false };
  }

  /**
   * 向后扫描循环中的共用模板：当 cIdx 已越过当前卷末尾时，调用
   * jumpToNextVolumeFirstChapter 跳到下一卷首章，并把状态写回外层游标。
   * 返回 'done'（外层应 break）或 'continue'（外层应 continue）。
   *
   * 共用于 getNextParagraphsAsync 两遍扫描中的 3 处跨卷前进分支。
   */
  private static advanceToNextVolumeOrDone(
    cursor: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
  ): 'done' | 'continue' {
    const state = { vIdx: cursor.vIdx, cIdx: cursor.cIdx, pIdx: cursor.pIdx };
    const step = ChapterService.jumpToNextVolumeFirstChapter(state, novel);
    cursor.vIdx = state.vIdx;
    cursor.cIdx = state.cIdx;
    cursor.pIdx = state.pIdx;
    return step.done ? 'done' : 'continue';
  }

  /**
   * getPreviousParagraphsAsync / getNextParagraphsAsync 共用的前言：
   * 校验入参、异步定位段落位置，返回初始结果容器与起始游标。
   * 返回 null 表示无需搜索（调用方应直接返回空数组）。
   */
  private static async resolveParagraphSearchStart(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): Promise<{
    results: ParagraphSearchResult[];
    volumeIndex: number;
    chapterIndex: number;
    paragraphIndex: number;
  } | null> {
    if (!novel || !novel.volumes || !paragraphId || count <= 0) {
      return null;
    }
    const location = await ChapterService.findParagraphLocationAsync(novel, paragraphId);
    if (!location) {
      return null;
    }
    const { volumeIndex, chapterIndex, paragraphIndex } = location;
    return { results: [], volumeIndex, chapterIndex, paragraphIndex };
  }

  /**
   * 向前跨卷 + 针对新章节执行一次 onChapter 动作（可同步可异步）。
   * 动作完成后会重算 state.pIdx（兼容 onChapter 把 undefined 的 content 填成 []）。
   *
   * 用于统一 getPreviousParagraphsAsync 两遍扫描里 cIdx<0 / pIdx<0 跨卷分支的「jumpToPrev + 动作 + pIdx 重算」样板。
   */
  private static async crossToPrevVolumeWithAction(
    state: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
    onChapter: (chapter: Chapter) => void | Promise<void>,
  ): Promise<{ done: boolean }> {
    const step = ChapterService.jumpToPrevVolumeLastChapter(state, novel);
    if (step.done) return { done: true };
    if (step.chapter) {
      await onChapter(step.chapter);
      state.pIdx = ChapterService.lastParagraphIndexOf(step.chapter);
    }
    return { done: false };
  }

  /**
   * 将当前游标位置的段落（若非空）追加到 results，参数顺序与 ParagraphSearchResult 对齐。
   * 供 gatherPrev/NextPassTwoParagraphs 共用。
   */
  private static pushCursorParagraphToResults(
    results: ParagraphSearchResult[],
    paragraph: Paragraph | undefined,
    chapter: Chapter,
    volume: Volume,
    cursor: { vIdx: number; cIdx: number; pIdx: number },
  ): void {
    if (paragraph && hasParagraphContent(paragraph)) {
      results.push({
        paragraph,
        paragraphIndex: cursor.pIdx,
        chapter,
        chapterIndex: cursor.cIdx,
        volume,
        volumeIndex: cursor.vIdx,
      });
    }
  }

  /**
   * 两遍扫描共用：当前卷无效时退一步（把 cIdx 指到上一卷最后一章，或 -1），清空 pIdx。
   */
  private static stepBackToPrevVolume(
    cursor: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
  ): void {
    cursor.vIdx--;
    const prevVolume = cursor.vIdx >= 0 ? novel.volumes?.[cursor.vIdx] : undefined;
    cursor.cIdx = prevVolume?.chapters?.length ? prevVolume.chapters.length - 1 : -1;
    cursor.pIdx = -1;
  }

  /**
   * getPreviousParagraphsAsync pass 1：从起点向前扫描，记录所有需加载的章节。
   * 直到 collected 达到 count*2 或 vIdx 跑完为止。
   */
  private static async collectPrevPassOneChapters(
    novel: Novel,
    start: { volumeIndex: number; chapterIndex: number; paragraphIndex: number },
    count: number,
    chaptersToLoad: Set<string>,
    chapterMap: Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>,
  ): Promise<void> {
    const cursor = {
      vIdx: start.volumeIndex,
      cIdx: start.chapterIndex,
      pIdx: start.paragraphIndex,
    };
    let collected = 0;

    const collectOnce = (chapter: Chapter, vi: number, ci: number): void => {
      if (ChapterService.collectChapterForLoad(chapter, vi, ci, chaptersToLoad, chapterMap)) {
        collected++;
      }
    };

    const crossToPrevAndCollect = async (): Promise<{ done: boolean }> => {
      return ChapterService.crossToPrevVolumeWithAction(cursor, novel, (ch) =>
        collectOnce(ch, cursor.vIdx, cursor.cIdx),
      );
    };

    while (collected < count * 2 && cursor.vIdx >= 0) {
      const volume = novel.volumes![cursor.vIdx];
      if (!volume || !volume.chapters) {
        ChapterService.stepBackToPrevVolume(cursor, novel);
        continue;
      }
      if (cursor.cIdx < 0) {
        const { done } = await crossToPrevAndCollect();
        if (done) break;
        continue;
      }
      const chapter = volume.chapters[cursor.cIdx];
      if (!chapter) {
        cursor.cIdx--;
        cursor.pIdx = -1;
        continue;
      }
      collectOnce(chapter, cursor.vIdx, cursor.cIdx);
      if (cursor.pIdx < 0) {
        cursor.cIdx--;
        if (cursor.cIdx < 0) {
          const { done } = await crossToPrevAndCollect();
          if (done) break;
          continue;
        }
        const prevChapter = volume.chapters[cursor.cIdx];
        if (prevChapter) {
          collectOnce(prevChapter, cursor.vIdx, cursor.cIdx);
        }
        cursor.pIdx = ChapterService.lastParagraphIndexOf(prevChapter);
        continue;
      }
      cursor.pIdx--;
    }
  }

  /**
   * getPreviousParagraphsAsync pass 2：从起点向前扫描、收集段落到 results。
   */
  private static async gatherPrevPassTwoParagraphs(
    novel: Novel,
    start: { volumeIndex: number; chapterIndex: number; paragraphIndex: number },
    count: number,
    results: ParagraphSearchResult[],
  ): Promise<void> {
    const cursor = {
      vIdx: start.volumeIndex,
      cIdx: start.chapterIndex,
      pIdx: start.paragraphIndex,
    };
    const loadOnce = (chapter: Chapter): Promise<void> =>
      ChapterService.ensureChapterLoaded(chapter);
    const crossToPrevAndLoad = async (): Promise<{ done: boolean }> => {
      return ChapterService.crossToPrevVolumeWithAction(cursor, novel, loadOnce);
    };

    while (results.length < count && cursor.vIdx >= 0) {
      const volume = novel.volumes![cursor.vIdx];
      if (!volume || !volume.chapters) {
        ChapterService.stepBackToPrevVolume(cursor, novel);
        continue;
      }
      if (cursor.cIdx < 0) {
        const { done } = await crossToPrevAndLoad();
        if (done) break;
        continue;
      }
      const chapter = volume.chapters[cursor.cIdx];
      if (!chapter) {
        cursor.cIdx--;
        cursor.pIdx = -1;
        continue;
      }
      await ChapterService.ensureChapterLoaded(chapter);
      if (!chapter.content) {
        cursor.cIdx--;
        cursor.pIdx = -1;
        continue;
      }
      if (cursor.pIdx < 0) {
        cursor.cIdx--;
        if (cursor.cIdx < 0) {
          const { done } = await crossToPrevAndLoad();
          if (done) break;
          continue;
        }
        const prevChapter = volume.chapters[cursor.cIdx];
        await ChapterService.ensureChapterLoaded(prevChapter);
        cursor.pIdx = ChapterService.lastParagraphIndexOf(prevChapter);
        continue;
      }
      ChapterService.pushCursorParagraphToResults(
        results,
        chapter.content[cursor.pIdx],
        chapter,
        volume,
        cursor,
      );
      cursor.pIdx--;
    }
  }

  /**
   * getPreviousParagraphsAsync / getNextParagraphsAsync 的共享外层：
   *   1. 解析起点；2. 构造 startCursor；3. pass1 收集 + 批量加载；4. pass2 扫描出 results。
   * direction 决定初始 paragraphIndex 的偏移与 pass1 / pass2 的方向。
   */
  private static async runDirectionalParagraphScan(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
    direction: 'prev' | 'next',
  ): Promise<ParagraphSearchResult[]> {
    const start = await ChapterService.resolveParagraphSearchStart(novel, paragraphId, count);
    if (!start || !novel || !novel.volumes) {
      return [];
    }
    const { results, volumeIndex, chapterIndex } = start;
    const startCursor = {
      volumeIndex,
      chapterIndex,
      paragraphIndex: start.paragraphIndex + (direction === 'prev' ? -1 : 1),
    };

    const chaptersToLoad = new Set<string>();
    const chapterMap = new Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>();

    if (direction === 'prev') {
      await ChapterService.collectPrevPassOneChapters(
        novel,
        startCursor,
        count,
        chaptersToLoad,
        chapterMap,
      );
    } else {
      ChapterService.collectNextPassOneChapters(
        novel,
        startCursor,
        count,
        chaptersToLoad,
        chapterMap,
      );
    }

    await ChapterService.batchLoadCollectedChapters(chaptersToLoad, chapterMap);

    if (direction === 'prev') {
      await ChapterService.gatherPrevPassTwoParagraphs(novel, startCursor, count, results);
    } else {
      await ChapterService.gatherNextPassTwoParagraphs(novel, startCursor, count, results);
    }

    return results;
  }

  /**
   * 获取指定段落之前的 x 个段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从远到近的顺序排列（最远的在前）
   */
  static async getPreviousParagraphsAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): Promise<ParagraphSearchResult[]> {
    return ChapterService.runDirectionalParagraphScan(novel, paragraphId, count, 'prev');
  }

  /**
   * 获取指定段落之后的 x 个段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从近到远的顺序排列（最近的在前）
   */
  /**
   * 向后扫描循环头：按 cursor 当前位置取下一个可处理章节。
   * 返回 'break' / 'continue' 或就绪的 { volume, chapter }（volume.chapters 已保证非空）。
   */
  private static nextChapterOrControl(
    cursor: { vIdx: number; cIdx: number; pIdx: number },
    novel: Novel,
  ):
    | { kind: 'break' }
    | { kind: 'continue' }
    | { kind: 'ready'; volume: Volume & { chapters: Chapter[] }; chapter: Chapter } {
    const volume = novel.volumes![cursor.vIdx];
    if (!volume || !volume.chapters) {
      cursor.vIdx++;
      cursor.cIdx = 0;
      cursor.pIdx = 0;
      return { kind: 'continue' };
    }
    if (cursor.cIdx >= volume.chapters.length) {
      const token = ChapterService.advanceToNextVolumeOrDone(cursor, novel);
      return token === 'done' ? { kind: 'break' } : { kind: 'continue' };
    }
    const chapter = volume.chapters[cursor.cIdx];
    if (!chapter) {
      cursor.cIdx++;
      cursor.pIdx = 0;
      return { kind: 'continue' };
    }
    return { kind: 'ready', volume: volume as Volume & { chapters: Chapter[] }, chapter };
  }

  /**
   * getNextParagraphsAsync pass 1：向后扫描、累积待加载章节，直到 collected 达到 count*2。
   */
  private static collectNextPassOneChapters(
    novel: Novel,
    start: { volumeIndex: number; chapterIndex: number; paragraphIndex: number },
    count: number,
    chaptersToLoad: Set<string>,
    chapterMap: Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>,
  ): void {
    const cursor = {
      vIdx: start.volumeIndex,
      cIdx: start.chapterIndex,
      pIdx: start.paragraphIndex,
    };
    let collected = 0;
    while (collected < count * 2 && cursor.vIdx < novel.volumes!.length) {
      const step = ChapterService.nextChapterOrControl(cursor, novel);
      if (step.kind === 'break') break;
      if (step.kind === 'continue') continue;
      const { chapter } = step;

      if (
        ChapterService.collectChapterForLoad(
          chapter,
          cursor.vIdx,
          cursor.cIdx,
          chaptersToLoad,
          chapterMap,
        )
      ) {
        collected++;
      }

      if (cursor.pIdx >= (chapter.content?.length || 0)) {
        cursor.cIdx++;
        if (cursor.cIdx >= step.volume.chapters.length) {
          if (ChapterService.advanceToNextVolumeOrDone(cursor, novel) === 'done') break;
          continue;
        }
        const nextChapter = step.volume.chapters[cursor.cIdx];
        if (
          ChapterService.collectChapterForLoad(
            nextChapter,
            cursor.vIdx,
            cursor.cIdx,
            chaptersToLoad,
            chapterMap,
          )
        ) {
          collected++;
        }
        cursor.pIdx = 0;
        continue;
      }
      cursor.pIdx++;
    }
  }

  /**
   * getNextParagraphsAsync pass 2：从起点向后扫描、收集段落到 results。
   */
  private static async gatherNextPassTwoParagraphs(
    novel: Novel,
    start: { volumeIndex: number; chapterIndex: number; paragraphIndex: number },
    count: number,
    results: ParagraphSearchResult[],
  ): Promise<void> {
    const cursor = {
      vIdx: start.volumeIndex,
      cIdx: start.chapterIndex,
      pIdx: start.paragraphIndex,
    };
    while (results.length < count && cursor.vIdx < novel.volumes!.length) {
      const step = ChapterService.nextChapterOrControl(cursor, novel);
      if (step.kind === 'break') break;
      if (step.kind === 'continue') continue;
      const { volume, chapter } = step;

      await ChapterService.ensureChapterLoaded(chapter);
      if (!chapter.content) {
        cursor.cIdx++;
        cursor.pIdx = 0;
        continue;
      }

      if (cursor.pIdx >= chapter.content.length) {
        cursor.cIdx++;
        if (cursor.cIdx >= volume.chapters.length) {
          cursor.vIdx++;
          if (cursor.vIdx >= novel.volumes!.length) break;
          cursor.cIdx = 0;
        }
        const nextChapter = volume.chapters[cursor.cIdx];
        await ChapterService.ensureChapterLoaded(nextChapter);
        cursor.pIdx = 0;
        continue;
      }

      ChapterService.pushCursorParagraphToResults(
        results,
        chapter.content[cursor.pIdx],
        chapter,
        volume,
        cursor,
      );
      cursor.pIdx++;
    }
  }

  static async getNextParagraphsAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): Promise<ParagraphSearchResult[]> {
    return ChapterService.runDirectionalParagraphScan(novel, paragraphId, count, 'next');
  }

  /**
   * 添加段落翻译，并限制最多保留5个翻译版本
   * 新翻译添加到末尾，如果超过5个则删除最旧的（数组开头的）
   * @param existingTranslations 现有的翻译数组
   * @param newTranslation 新的翻译对象
   * @returns 更新后的翻译数组（最多5个）
   */
  static addParagraphTranslation(
    existingTranslations: Translation[],
    newTranslation: Translation,
  ): Translation[] {
    const MAX_TRANSLATIONS = 5;
    const updated = [...(existingTranslations || []), newTranslation];
    // 如果超过最大数量，只保留最后5个（最新的）
    return updated.slice(-MAX_TRANSLATIONS);
  }

  /**
   * 导出章节内容
   * @param chapter 章节对象
   * @param type 导出类型：'original' 原文、'translation' 翻译、'bilingual' 双语
   * @param format 导出格式：'txt' 文本文件、'json' JSON 文件、'clipboard' 剪贴板
   * @param book 书籍对象（可选，用于应用缩进过滤设置）
   * @returns Promise，当 format 为 'clipboard' 时返回 Promise，否则返回 void
   */
  static async exportChapter(
    chapter: Chapter,
    type: 'original' | 'translation' | 'bilingual',
    format: 'txt' | 'json' | 'clipboard',
    book?: Novel,
  ): Promise<void> {
    if (!chapter) throw new Error('章节内容为空，无法导出');
    const chapterWithContent = await this.loadChapterContent(chapter);
    if (!chapterWithContent.content || chapterWithContent.content.length === 0) {
      throw new Error('章节内容为空，无法导出');
    }

    const chapterTitle = resolveExportChapterTitle(chapter, type, book);
    const content = buildExportChapterContent(chapterWithContent, chapterTitle, type, format, book);
    await performChapterExportAction(content, format, chapterTitle);
  }

  // --- 懒加载相关方法 ---

  /**
   * 加载章节内容（懒加载）
   * @param chapter 章节对象（可能没有内容）
   * @returns 包含内容的章节对象
   */
  static async loadChapterContent(chapter: Chapter): Promise<Chapter> {
    // 如果内容已存在，直接返回
    if (chapter.content !== undefined) {
      return chapter;
    }

    // 从独立存储加载
    const content = await ChapterContentService.loadChapterContent(chapter.id);

    return {
      ...chapter,
      content: content || [],
      contentLoaded: true,
    };
  }

  /**
   * 保存章节内容到独立存储
   * @param chapter 章节对象
   * @param bookId 所属书籍 ID（用于全文索引失效，必填）
   */
  static async saveChapterContent(chapter: Chapter, bookId: string): Promise<void> {
    if (chapter.content && chapter.content.length > 0) {
      await ChapterContentService.saveChapterContent(chapter.id, chapter.content, { bookId });
    }
  }

  /**
   * 删除章节内容（从独立存储）
   * @param chapterId 章节 ID
   * @param bookId 所属书籍 ID（用于全文索引失效，必填）
   */
  static async deleteChapterContent(chapterId: string, bookId: string): Promise<void> {
    await ChapterContentService.deleteChapterContent(chapterId, { bookId });
  }

  /**
   * 获取章节内容（优先使用已加载的内容）
   * @param chapter 章节对象
   * @param loadedChapter 已加载内容的章节对象（如果存在）
   * @returns 章节内容数组
   */
  static getChapterContentForUpdate(
    chapter: Chapter,
    loadedChapter: Chapter | null | undefined,
  ): Paragraph[] | undefined {
    // 优先使用已加载的章节内容
    if (loadedChapter && chapter.id === loadedChapter.id && loadedChapter.content) {
      return loadedChapter.content;
    }
    // 否则使用章节对象中的内容
    return chapter.content;
  }

  /**
   * 更新章节内容并确保 lastEdited 被更新
   * 这是批量更新章节内容时的辅助函数
   * @param volumes 卷列表
   * @param targetChapterId 目标章节 ID
   * @param loadedChapter 已加载内容的章节对象（如果存在）
   * @param contentUpdater 内容更新函数，接收段落数组，返回更新后的段落数组
   * @returns 更新后的卷列表
   */
  static updateChapterContentInVolumes(
    volumes: Volume[],
    targetChapterId: string,
    loadedChapter: Chapter | null | undefined,
    contentUpdater: (content: Paragraph[]) => Paragraph[],
  ): Volume[] {
    return volumes.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== targetChapterId) return chapter;

        // 获取章节内容
        const content = ChapterService.getChapterContentForUpdate(chapter, loadedChapter);
        if (!content) return chapter;

        // 更新内容
        const updatedContent = contentUpdater(content);

        // 使用 ChapterService.updateChapter 确保更新 lastEdited 时间
        // 但由于这是在批量操作中，我们直接返回更新后的章节
        // 批量操作会在最后统一通过 ChapterService 处理
        return {
          ...chapter,
          content: updatedContent,
          lastEdited: new Date(), // 确保更新 lastEdited
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });
  }
}
