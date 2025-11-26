import type { Novel, Chapter, Volume, Paragraph } from 'src/models/novel';

/**
 * 获取卷的显示标题（优先使用翻译，否则使用原文）
 * @param volume 卷对象
 * @returns 显示标题
 */
export function getVolumeDisplayTitle(volume: Volume): string {
  // 防御性检查：确保 title 存在
  if (!volume.title) {
    return '';
  }
  
  // 兼容旧数据：如果 title 是字符串，直接返回
  if (typeof volume.title === 'string') {
    return volume.title;
  }
  
  // 检查是否有翻译（防御性检查，处理旧数据或未正确初始化的数据）
  if (volume.title.translation?.translation?.trim()) {
    return volume.title.translation.translation;
  }
  
  // 返回原文
  return volume.title.original || '';
}

/**
 * 获取章节的显示标题（优先使用翻译，否则使用原文）
 * @param chapter 章节对象
 * @returns 显示标题
 */
export function getChapterDisplayTitle(chapter: Chapter): string {
  // 防御性检查：确保 title 存在
  if (!chapter.title) {
    return '';
  }
  
  // 兼容旧数据：如果 title 是字符串，直接返回
  if (typeof chapter.title === 'string') {
    return chapter.title;
  }
  
  // 检查是否有翻译（防御性检查，处理旧数据或未正确初始化的数据）
  if (chapter.title.translation?.translation?.trim()) {
    return chapter.title.translation.translation;
  }
  
  // 返回原文
  return chapter.title.original || '';
}

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

/**
 * 获取角色名称的所有变体（用于匹配）
 * 包括：原文、去空格版本、分割后的部分
 * @param name 角色名称
 * @returns 名称变体数组
 */
export function getCharacterNameVariants(name: string): string[] {
  if (!name || !name.trim()) {
    return [];
  }

  const variants = new Set<string>();
  const trimmedName = name.trim();
  
  // 1. 添加原文
  variants.add(trimmedName);
  
  // 2. 添加去空格/符号版本 (只移除空格和常见分隔符，保留其他内容)
  // 移除空格 (全角/半角)、点、中间点
  const noSeparatorName = trimmedName.replace(/[\s\u3000・.,]+/g, '');
  if (noSeparatorName && noSeparatorName !== trimmedName) {
    variants.add(noSeparatorName);
  }

  // 3. 分割部分
  // 按空格、中间点等分割
  const parts = trimmedName.split(/[\s\u3000・.,]+/);
  if (parts.length > 1) {
    parts.forEach(part => {
      if (part && part.trim().length > 0) { // 避免空字符串
         // 过滤掉过短的纯数字/符号部分可能更好，但名字部分可能只有1-2个字，如 "桜"
         // 这里不做过多的长度过滤，相信用户输入的名称
        variants.add(part.trim());
      }
    });
  }

  return Array.from(variants);
}

/**
 * 检查段落是否为空（无内容或只有空白字符）
 * @param paragraph 段落对象
 * @returns 如果段落为空返回 true，否则返回 false
 */
export function isEmptyParagraph(paragraph: Paragraph): boolean {
  if (!paragraph.text) {
    return true;
  }
  return paragraph.text.trim().length === 0;
}

/**
 * 检查段落是否有翻译
 * @param paragraph 段落对象
 * @returns 如果段落有翻译返回 true，否则返回 false
 */
export function hasParagraphTranslation(paragraph: Paragraph): boolean {
  return !!(
    paragraph.selectedTranslationId &&
    paragraph.translations &&
    paragraph.translations.some((t) => t.id === paragraph.selectedTranslationId)
  );
}
