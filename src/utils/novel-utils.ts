import type { Novel, Chapter, Volume, Paragraph } from 'src/models/novel';
import { loadChapterContent } from 'src/utils/chapter-content-loader';

/**
 * 通过章节 ID 查找章节及其在小说中的位置。
 *
 * 纯函数，不做任何 IO。供 chapter-service 与 full-text-index-service
 * 等共享，避免双方为此互相 import 形成循环依赖。
 */
export function findChapterById(
  novel: Novel | null | undefined,
  chapterId: string,
): { chapter: Chapter; volume: Volume; volumeIndex: number; chapterIndex: number } | null {
  if (!novel || !novel.volumes || !chapterId) {
    return null;
  }

  for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
    const volume = novel.volumes[vIndex];
    if (volume && volume.chapters) {
      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (chapter && chapter.id === chapterId) {
          return { chapter, volume, volumeIndex: vIndex, chapterIndex: cIndex };
        }
      }
    }
  }

  return null;
}

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
 * 将数字（全角或半角）和汉字之间的半角空格转换为全角空格（\u3000）
 * 例如：
 * - "５１７话 打破停滞的战场吧" → "５１７话[u3000]打破停滞的战场吧"
 * - "第110话 猫屋花梨很担心姐姐" → "第110话[u3000]猫屋花梨很担心姐姐"
 * - "110话 猫屋花梨很担心姐姐" → "110话[u3000]猫屋花梨很担心姐姐"
 * - "74 埃斯佩兰萨教" → "74[u3000]埃斯佩兰萨教"
 * - "♪26 数字发行限定" → "♪26[u3000]数字发行限定"
 * @param title 标题文本
 * @returns 规范化后的标题，如果输入为 null 或 undefined 则返回空字符串
 */
export function normalizeChapterTitle(title: string): string {
  // 防御性检查：处理 null、undefined 和非字符串类型
  // 对于无效输入，返回空字符串以确保一致的字符串返回类型
  if (title == null || typeof title !== 'string') {
    return '';
  }

  // 空字符串直接返回
  if (title.length === 0) {
    return title;
  }

  // 将"章节号标记"与后续内容之间的半角空格转换为全角空格。
  //
  // 规则（对应测试用例）：
  // - 支持带后缀的格式：例如 "第110话 X"、"110话 X"、"５１７话 X"
  // - 支持不带后缀的格式：例如 "74 X"、"♪26 X"（符号+数字）
  // - 章节号标记后面的内容必须以【中日文字符】开头（避免 "110 Chapter" 这种英文标题被转换）
  // - 章节号标记前面不能是汉字、数字、英文字母或半角空格（避免误匹配 "Test 110 内容"）
  // - 注意：全角空格（\u3000）不在排除范围内，因此转换后可以继续匹配后续章节号
  //
  // 数字范围：
  // - 全角数字：\uFF10-\uFF19 (０-９)
  // - 半角数字：\u0030-\u0039 (0-9)
  // 中日文字符范围：
  // - 汉字：\u4e00-\u9fff
  // - 平假名：\u3040-\u309F
  // - 片假名：\u30A0-\u30FF
  // 全角空格：\u3000
  // 负向后行断言确保"章节号标记"不处在汉字、数字、英文字母或半角空格后面，
  // 从而避免把 "Test 110 内容"、"测试110 内容" 这类普通文本误判为章节号。
  // 符号（如 ♪）后面的数字会被正确识别。
  const chapterNumberToken =
    /(?<![\u4e00-\u9fff\u3040-\u309F\u30A0-\u30FF\u0030-\u0039\uFF10-\uFF19a-zA-Z ])((?:第)?(?:[\u0030-\u0039]+|[\uFF10-\uFF19]+)(?:话|話|章|节|節|卷|巻)?) (?=[\u4e00-\u9fff\u3040-\u309F\u30A0-\u30FF])/g;

  return title.replace(chapterNumberToken, '$1\u3000');
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
 * 同步 / 异步 char-count 共用的内存优先路径：若已加载 content 或 originalContent，
 * 就地返回长度；否则返回 null，由调用方决定是否继续走异步 IndexedDB 加载。
 */
function getChapterCharCountFromMemory(chapter: Chapter): number | null {
  if (chapter.content && chapter.content.length > 0) {
    return chapter.content.reduce((total, para) => total + para.text.length, 0);
  }
  if (chapter.originalContent) {
    return chapter.originalContent.length;
  }
  return null;
}

/**
 * 计算章节的总字符数（同步版本，仅用于已加载的内容）
 * @param chapter 章节对象
 * @returns 总字符数
 */
export function getChapterCharCount(chapter: Chapter): number {
  return getChapterCharCountFromMemory(chapter) ?? 0;
}

/**
 * 计算章节的总字符数（异步版本，会从 IndexedDB 加载内容）
 * @param chapter 章节对象
 * @returns Promise<number> 总字符数
 */
export async function getChapterCharCountAsync(chapter: Chapter): Promise<number> {
  const fromMemory = getChapterCharCountFromMemory(chapter);
  if (fromMemory !== null) return fromMemory;

  // 内存中没有，按需从 IndexedDB 加载
  const content = await loadChapterContent(chapter.id);
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
function getVolumeCharCount(volume: Volume): number {
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
async function getVolumeCharCountAsync(volume: Volume): Promise<number> {
  if (!volume.chapters || volume.chapters.length === 0) {
    return 0;
  }
  const counts = await Promise.all(
    volume.chapters.map((chapter) => getChapterCharCountAsync(chapter)),
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
  const counts = await Promise.all(novel.volumes.map((volume) => getVolumeCharCountAsync(volume)));
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
  return chapter.content.map((para) => para.text).join('\n');
}

/**
 * 判断字符的 Unicode 脚本类型
 */
type ScriptType = 'kanji' | 'hiragana' | 'katakana' | 'other';

function getScriptType(char: string): ScriptType {
  const code = char.charCodeAt(0);
  if (code >= 0x3040 && code <= 0x309f) return 'hiragana';
  if (code >= 0x30a0 && code <= 0x30ff) return 'katakana';
  if (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  )
    return 'kanji';
  return 'other';
}

/**
 * 获取角色名称的所有变体（用于匹配）
 * 包括：原文、去空格版本、去除括号内注音版本、分割后的部分、文字种别境界分割
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

  // 3. 添加去除括号内注音的版本
  // 匹配日文注音格式：汉字（假名）或 漢字(仮名)
  // 例如：鵜（う）飼（かい）→ 鵜飼
  const noFuriganaName = trimmedName.replace(/[（(][^）)]*[）)]/g, '');
  if (noFuriganaName && noFuriganaName !== trimmedName) {
    variants.add(noFuriganaName);
  }

  // 4. 分割部分
  // 按空格、中间点等分割
  const parts = trimmedName.split(/[\s\u3000・.,]+/);
  if (parts.length > 1) {
    parts.forEach((part) => {
      if (part && part.trim().length > 0) {
        // 避免空字符串
        // 过滤掉过短的纯数字/符号部分可能更好，但名字部分可能只有1-2个字，如 "桜"
        // 这里不做过多的长度过滤，相信用户输入的名称
        variants.add(part.trim());
      }
    });
  }

  // 5. 按文字种别境界分割（漢字↔仮名）
  // 日语名称通常由「姓（漢字）＋名（仮名）」或「姓（漢字）＋名（漢字）」组成
  // 对于没有明确分隔符的名称（如「郷津ありす」），在漢字和仮名的切换处进行分割
  // 使用去注音后的名称进行分析（避免注音干扰）
  const nameForScriptSplit = noFuriganaName || trimmedName;
  if (nameForScriptSplit.length >= 4) {
    const scriptBoundaries: number[] = [];
    for (let i = 1; i < nameForScriptSplit.length; i++) {
      const prevChar = nameForScriptSplit[i - 1];
      const currChar = nameForScriptSplit[i];
      if (!prevChar || !currChar) continue;
      const prevScript = getScriptType(prevChar);
      const currScript = getScriptType(currChar);
      if (
        prevScript !== 'other' &&
        currScript !== 'other' &&
        prevScript !== currScript &&
        // 只在漢字↔仮名之间分割（不在平假名↔片假名之间分割）
        (prevScript === 'kanji' || currScript === 'kanji')
      ) {
        scriptBoundaries.push(i);
      }
    }
    // 仅在恰好有一个边界时分割，两个部分都必须 ≥ 2 个字符
    if (scriptBoundaries.length === 1 && scriptBoundaries[0] !== undefined) {
      const boundaryIndex = scriptBoundaries[0];
      const part1 = nameForScriptSplit.substring(0, boundaryIndex);
      const part2 = nameForScriptSplit.substring(boundaryIndex);
      if (part1.length >= 2 && part2.length >= 2) {
        variants.add(part1);
        variants.add(part2);
      }
    }
  }

  return Array.from(variants);
}

/**
 * 统计章节段落的翻译进度：忽略纯空白段落，返回有实际文本的段落总数 + 已有翻译的段落数。
 */
export function getChapterTranslationStats(paragraphs: Paragraph[] | null | undefined): {
  total: number;
  translated: number;
} {
  const paras = paragraphs || [];
  const nonEmpty = paras.filter((p) => (p.text ?? '').trim().length > 0);
  return {
    total: nonEmpty.length,
    translated: nonEmpty.filter((p) => (p.translations?.length ?? 0) > 0).length,
  };
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

  const content = await loadChapterContent(chapter.id);
  if (content) {
    return {
      ...chapter,
      content,
      contentLoaded: true,
    };
  }

  return chapter;
}
