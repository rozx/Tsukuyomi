import type { Novel, Chapter, Volume, Paragraph } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';

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
 * 规范化章节标题
 * 将数字（全角或半角）和汉字之间的半角空格转换为全角空格
 * 例如：
 * - ５１７话 打破停滞的战场吧 → ５１７话\u3000打破停滞的战场吧
 * - 第110话 猫屋花梨很担心姐姐 → 第110话\u3000猫屋花梨很担心姐姐
 * - 110话 猫屋花梨很担心姐姐 → 110话\u3000猫屋花梨很担心姐姐
 * @param title 标题文本
 * @returns 规范化后的标题
 */
export function normalizeChapterTitle(title: string): string {
  // 防御性检查：处理 null、undefined 和非字符串类型
  if (title == null || typeof title !== 'string') {
    return title;
  }
  
  // 空字符串直接返回
  if (title.length === 0) {
    return title;
  }
  
  // 将数字（全角或半角）和汉字之间的半角空格转换为全角空格
  // 匹配模式1：全角数字 + (可选汉字) + 半角空格 + 汉字
  // 匹配模式2：汉字 + 全角数字 + 汉字 + 半角空格 + 汉字
  // 匹配模式3：汉字 + 半角数字 + 汉字 + 半角空格 + 汉字
  // 匹配模式4：半角数字 + 汉字 + 半角空格 + 汉字（数字开头，数字后必须有汉字）
  // 全角数字范围：\uFF10-\uFF19 (０-９)
  // 半角数字范围：\u0030-\u0039 (0-9)
  // 汉字范围：\u4e00-\u9fff
  // 全角空格：\u3000
  // 注意：模式顺序很重要，先处理更具体的模式（模式2、3），再处理更通用的模式（模式1、4）
  // 这样可以避免模式1匹配到模式2的一部分
  let result = title;
  
  // 模式2：汉字 + 全角数字 + 汉字 + 半角空格 + 汉字（先处理，避免与模式1冲突）
  // 例如：第５１７话 打破 → 第５１７话　打破
  // 注意：数字后必须有汉字，避免匹配 "测试５１７ 内容" 这种情况
  result = result.replace(/([\u4e00-\u9fff]+[\uFF10-\uFF19]+[\u4e00-\u9fff]+) ([\u4e00-\u9fff])/g, '$1\u3000$2');
  
  // 模式3：汉字 + 半角数字 + 汉字 + 半角空格 + 汉字（先处理，避免与模式4冲突）
  // 例如：第110话 猫屋 → 第110话　猫屋
  // 注意：数字后必须有汉字，避免匹配 "测试110 内容" 这种情况
  result = result.replace(/([\u4e00-\u9fff]+[\u0030-\u0039]+[\u4e00-\u9fff]+) ([\u4e00-\u9fff])/g, '$1\u3000$2');
  
  // 模式1：全角数字 + (可选汉字) + 半角空格 + 汉字
  // 例如：５１７话 打破 → ５１７话　打破
  result = result.replace(/([\uFF10-\uFF19]+[\u4e00-\u9fff]*) ([\u4e00-\u9fff])/g, '$1\u3000$2');
  
  // 模式4：半角数字 + 汉字 + 半角空格 + 汉字（数字开头，数字后必须有汉字）
  // 例如：110话 猫屋 → 110话　猫屋
  // 注意：数字后必须有汉字，避免匹配 "110 测试" 这种情况
  result = result.replace(/([\u0030-\u0039]+[\u4e00-\u9fff]+) ([\u4e00-\u9fff])/g, '$1\u3000$2');
  
  return result;
}

/**
 * 获取章节的显示标题（优先使用翻译，否则使用原文）
 * @param chapter 章节对象
 * @param book 书籍对象（可选，用于获取书籍级别的设置）
 * @returns 显示标题
 */
export function getChapterDisplayTitle(chapter: Chapter, book?: Novel): string {
  // 防御性检查：确保 chapter 和 title 存在
  if (!chapter || !chapter.title) {
    return '';
  }
  
  // 兼容旧数据：如果 title 是字符串，直接返回
  if (typeof chapter.title === 'string') {
    const title: string = chapter.title;
    // 应用规范化（如果启用）
    const normalize = chapter.normalizeTitleOnDisplay ?? book?.normalizeTitleOnDisplay ?? false;
    if (normalize) {
      return normalizeChapterTitle(title);
    }
    return title;
  }
  
  // 检查是否有翻译（防御性检查，处理旧数据或未正确初始化的数据）
  let title: string = '';
  if (chapter.title.translation?.translation?.trim()) {
    title = chapter.title.translation.translation;
  } else if (chapter.title.original) {
    // 返回原文
    title = chapter.title.original;
  } else {
    // 如果既没有翻译也没有原文，返回空字符串
    return '';
  }
  
  // 应用规范化（如果启用）
  const normalize = chapter.normalizeTitleOnDisplay ?? book?.normalizeTitleOnDisplay ?? false;
  if (normalize) {
    title = normalizeChapterTitle(title);
  }
  
  return title;
}

/**
 * 计算章节的总字符数（同步版本，仅用于已加载的内容）
 * @param chapter 章节对象
 * @returns 总字符数
 */
export function getChapterCharCount(chapter: Chapter): number {
  // 优先使用已加载的 content（段落数组）
  if (chapter.content && chapter.content.length > 0) {
    return chapter.content.reduce((total, para) => total + para.text.length, 0);
  }
  
  // 如果 content 未加载，使用 originalContent（原始文本，懒加载时仍可用）
  if (chapter.originalContent) {
    return chapter.originalContent.length;
  }
  
  return 0;
}

/**
 * 计算章节的总字符数（异步版本，会从 IndexedDB 加载内容）
 * @param chapter 章节对象
 * @returns Promise<number> 总字符数
 */
export async function getChapterCharCountAsync(chapter: Chapter): Promise<number> {
  // 优先使用已加载的 content（段落数组）
  if (chapter.content && chapter.content.length > 0) {
    return chapter.content.reduce((total, para) => total + para.text.length, 0);
  }
  
  // 如果 content 未加载，使用 originalContent（原始文本，懒加载时仍可用）
  if (chapter.originalContent) {
    return chapter.originalContent.length;
  }
  
  // 如果都没有，尝试从 IndexedDB 加载内容
  const content = await ChapterContentService.loadChapterContent(chapter.id);
  if (content && content.length > 0) {
    return content.reduce((total, para) => total + para.text.length, 0);
  }
  
  return 0;
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
 * 计算卷的总字符数（异步版本）
 * @param volume 卷对象
 * @returns Promise<number> 总字符数
 */
export async function getVolumeCharCountAsync(volume: Volume): Promise<number> {
  if (!volume.chapters || volume.chapters.length === 0) {
    return 0;
  }
  const counts = await Promise.all(
    volume.chapters.map((chapter) => getChapterCharCountAsync(chapter))
  );
  return counts.reduce((total, count) => total + count, 0);
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
 * 计算小说的总字符数（异步版本，会从 IndexedDB 加载内容）
 * @param novel 小说对象
 * @returns Promise<number> 总字符数
 */
export async function getNovelCharCountAsync(novel: Novel): Promise<number> {
  if (!novel.volumes || novel.volumes.length === 0) {
    return 0;
  }
  const counts = await Promise.all(
    novel.volumes.map((volume) => getVolumeCharCountAsync(volume))
  );
  return counts.reduce((total, count) => total + count, 0);
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

/**
 * 确保章节内容已加载（如果未加载则从 IndexedDB 加载）
 * @param chapter 章节对象
 * @returns 带有已加载内容的章节对象
 */
export async function ensureChapterContentLoaded(chapter: Chapter): Promise<Chapter> {
  if (chapter.content !== undefined) {
    return chapter;
  }
  
  const content = await ChapterContentService.loadChapterContent(chapter.id);
  if (content) {
    return {
      ...chapter,
      content,
      contentLoaded: true,
    };
  }
  
  return chapter;
}
