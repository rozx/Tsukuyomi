import type { Chapter, Volume } from 'src/models/novel';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';

/**
 * 获取章节原文标题。兼容 string | { original, translation } 两种形态。
 */
export function getChapterTitleOriginal(chapter: Chapter): string {
  return typeof chapter.title === 'string' ? chapter.title : chapter.title.original || '';
}

/**
 * 获取章节翻译标题。若标题仍为纯 string 则返回空串。
 */
export function getChapterTitleTranslation(chapter: Chapter): string {
  return typeof chapter.title === 'string' ? '' : chapter.title.translation?.translation || '';
}

/**
 * 获取卷原文标题。空卷返回空串。
 */
export function getVolumeTitleOriginal(volume: Volume | null | undefined): string {
  if (!volume) return '';
  return typeof volume.title === 'string' ? volume.title : volume.title.original || '';
}

/**
 * 获取卷翻译标题。空卷或纯 string 标题返回空串。
 */
export function getVolumeTitleTranslation(volume: Volume | null | undefined): string {
  if (!volume) return '';
  return typeof volume.title === 'string' ? '' : volume.title.translation?.translation || '';
}

/**
 * 章节标题摘要结构：AI 工具响应里回传给模型的标准章节头。
 */
export interface ChapterTitleSummary {
  id: string;
  title: string;
  title_original: string;
  title_translation: string;
}

/**
 * 构造 AI 工具响应里标准的章节标题摘要（id + 显示标题 + 原文 + 译文）。
 */
export function buildChapterTitleSummary(chapter: Chapter): ChapterTitleSummary {
  return {
    id: chapter.id,
    title: getChapterDisplayTitle(chapter),
    title_original: getChapterTitleOriginal(chapter),
    title_translation: getChapterTitleTranslation(chapter),
  };
}

/**
 * 卷标题摘要结构：AI 工具响应里回传给模型的标准卷头。
 */
export interface VolumeTitleSummary {
  id: string;
  title: string;
  title_translation: string;
}

/**
 * 构造 AI 工具响应里标准的卷标题摘要；volume 不存在时返回 null。
 */
export function buildVolumeTitleSummary(
  volume: Volume | null | undefined,
): VolumeTitleSummary | null {
  if (!volume) return null;
  return {
    id: volume.id,
    title: getVolumeTitleOriginal(volume),
    title_translation: getVolumeTitleTranslation(volume),
  };
}
