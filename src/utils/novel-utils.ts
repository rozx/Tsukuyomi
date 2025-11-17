import type { Novel, Chapter, Volume } from 'src/types/novel';

/**
 * 计算章节的总字符数
 * @param chapter 章节对象
 * @returns 总字符数
 */
export function getChapterCharCount(chapter: Chapter): number {
  if (!chapter.content || chapter.content.length === 0) {
    return 0;
  }
  return chapter.content.reduce((total, para) => total + para.text.length, 0);
}

/**
 * 计算卷的总字符数
 * @param volume 卷对象
 * @returns 总字符数
 */
export function getVolumeCharCount(volume: Volume): number {
  if (!volume.chapters || volume.chapters.length === 0) {
    return 0;
  }
  return volume.chapters.reduce((total, chapter) => total + getChapterCharCount(chapter), 0);
}

/**
 * 计算小说的总字符数
 * @param novel 小说对象
 * @returns 总字符数
 */
export function getNovelCharCount(novel: Novel): number {
  if (!novel.volumes || novel.volumes.length === 0) {
    return 0;
  }
  return novel.volumes.reduce((total, volume) => total + getVolumeCharCount(volume), 0);
}

/**
 * 计算小说的总章节数
 * @param novel 小说对象
 * @returns 总章节数
 */
export function getTotalChapters(novel: Novel): number {
  if (!novel.volumes || novel.volumes.length === 0) {
    return 0;
  }
  return novel.volumes.reduce((total, volume) => {
    return total + (volume.chapters?.length || 0);
  }, 0);
}

/**
 * 将章节的段落内容合并为文本
 * @param chapter 章节对象
 * @returns 合并后的文本内容
 */
export function getChapterContentText(chapter: Chapter): string {
  if (!chapter.content || chapter.content.length === 0) {
    return '';
  }
  // 爬取时每一行都是一个段落，所以用单个换行符连接以匹配原始格式
  return chapter.content.map(para => para.text).join('\n');
}

