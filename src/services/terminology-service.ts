import type { Chapter, Paragraph, Occurrence } from 'src/types/novel';
import {
  TokenizerBuilder,
  type Tokenizer,
  type IpadicFeatures,
  type LoaderConfig,
} from '@patdx/kuromoji';

/**
 * 允许的品词细分类1
 */
const ALLOWED_POS_DETAIL_1 = ['サ変接続', '固有名詞', '一般'] as const;

/**
 * 检查字符串是否包含汉字
 */
function containsKanji(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }
  // 汉字范围：CJK统一汉字 \u4E00-\u9FAF
  // 如果包含任何汉字，返回 true
  const kanjiRegex = /[\u4E00-\u9FAF]/;
  return kanjiRegex.test(text);
}

/**
 * 检查字符串是否只包含长音符号
 */
function containsOnlyLongVowel(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }
  // 长音符号：\u30FC（全角）、\uFF70（半角）
  // 如果只包含长音符号，返回 true
  const longVowelRegex = /^[\u30FC\uFF70]+$/;
  return longVowelRegex.test(text);
}

/**
 * 检查字符串是否包含符号（标点、数字、空格、特殊字符等）
 */
function containsSymbols(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }
  // 允许的字符：汉字、平假名、片假名、长音符号（ー）
  // 汉字：\u4E00-\u9FAF
  // 平假名：\u3040-\u309F
  // 片假名：\u30A0-\u30FF
  // 半角片假名：\uFF65-\uFF9F
  // 长音符号：\u30FC（全角）、\uFF70（半角）
  const allowedCharsRegex = /^[\u4E00-\u9FAF\u3040-\u309F\u30A0-\u30FF\uFF65-\uFF9F\u30FC\uFF70]+$/;

  // 如果包含不允许的字符（符号），返回 true
  return !allowedCharsRegex.test(text);
}

/**
 * 提取的术语信息
 */
export interface ExtractedTermInfo {
  /** 表面形式（单词本身） */
  surfaceForm: string;
  /** 词性 */
  pos: string;
  /** 品词细分类1 */
  posDetail1: string;
  /** 品词细分类2 */
  posDetail2: string;
  /** 品词细分类3 */
  posDetail3: string;
  /** 出现记录（按章节） */
  occurrences: Occurrence[];
}

/**
 * 术语服务
 * 从章节/段落中提取和拆分单词
 */
export class TerminologyService {
  private static tokenizer: Tokenizer | null = null;
  private static initializing = false;
  private static initPromise: Promise<Tokenizer> | null = null;

  /**
   * 初始化 Kuromoji tokenizer
   * @returns Promise<Tokenizer>
   */
  private static async initializeTokenizer(): Promise<Tokenizer> {
    if (this.tokenizer) {
      return this.tokenizer;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (this.initializing) {
        return this.initPromise!;
      }

      this.initializing = true;

      try {
        // @patdx/kuromoji 使用 Promise API，自动处理字典加载
        // 使用 CDN 加载字典文件（@aiktb/kuromoji 提供未压缩的字典文件）
        const dicPath = 'https://cdn.jsdelivr.net/npm/@aiktb/kuromoji@1.0.2/dict';

        // 自定义 loader：去掉 .gz 后缀，从 CDN 加载未压缩的文件
        const loader: LoaderConfig = {
          async loadArrayBuffer(url: string): Promise<ArrayBufferLike> {
            // 去掉 .gz 后缀，因为 CDN 上的文件是未压缩的
            const cleanUrl = url.replace('.gz', '');
            const fullUrl = `${dicPath}/${cleanUrl}`;
            const response = await fetch(fullUrl);
            if (!response.ok) {
              throw new Error(
                `Failed to load dictionary file: ${fullUrl}, status: ${response.status}`,
              );
            }
            return response.arrayBuffer();
          },
        };

        const builder = new TokenizerBuilder({
          loader: loader,
        });
        this.tokenizer = await builder.build();
        this.initializing = false;
        return this.tokenizer;
      } catch (error) {
        this.initializing = false;
        console.error('Kuromoji 初始化失败:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }
  /**
   * 从章节中提取单词
   * @param chapters 章节数组
   * @returns 术语 Map，key 为表面形式，value 为术语信息（只包含总出现次数 >= 3 的术语）
   */
  static async extractWordsFromChapters(
    chapters: Chapter[],
  ): Promise<Map<string, ExtractedTermInfo>> {
    const allTerms = new Map<string, ExtractedTermInfo>();

    for (const chapter of chapters) {
      const terms = await this.extractWordsFromChapter(chapter);
      // 合并术语，按章节记录出现次数
      for (const [key, value] of terms.entries()) {
        const existing = allTerms.get(key);
        if (existing) {
          // 查找该章节是否已有记录
          const chapterOccurrence = existing.occurrences.find(
            (occ) => occ.chapterId === chapter.id,
          );
          if (chapterOccurrence) {
            // 累加该章节的出现次数
            chapterOccurrence.count += value.occurrences[0]?.count || 0;
          } else {
            // 添加新章节记录
            existing.occurrences.push(...value.occurrences);
          }
        } else {
          allTerms.set(key, { ...value });
        }
      }
    }

    // 过滤掉总出现次数少于3次的术语、包含汉字的术语、包含符号的术语、只包含长音符号的术语
    const filteredTerms = new Map<string, ExtractedTermInfo>();
    for (const [key, value] of allTerms.entries()) {
      const totalCount = value.occurrences.reduce((sum, occ) => sum + occ.count, 0);
      // 应用所有过滤条件
      if (
        totalCount >= 3 &&
        !containsKanji(key) &&
        !containsSymbols(key) &&
        !containsOnlyLongVowel(key)
      ) {
        filteredTerms.set(key, value);
      }
    }

    console.log(
      '从章节中提取的术语（过滤前）:',
      Array.from(allTerms.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    );
    console.log('过滤前术语总数:', allTerms.size);
    console.log(
      '从章节中提取的术语（过滤后，出现次数 >= 3，已过滤包含汉字、包含符号和只包含长音符号的术语）:',
      Array.from(filteredTerms.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    );
    console.log('过滤后术语总数:', filteredTerms.size);
    return filteredTerms;
  }

  /**
   * 从单个章节中提取单词
   * @param chapter 章节对象
   * @returns 术语 Map，key 为表面形式，value 为术语信息
   */
  static async extractWordsFromChapter(chapter: Chapter): Promise<Map<string, ExtractedTermInfo>> {
    const terms = new Map<string, ExtractedTermInfo>();

    // 从段落中提取
    if (chapter.content && Array.isArray(chapter.content)) {
      for (const paragraph of chapter.content) {
        const paragraphTerms = await this.extractWordsFromParagraph(paragraph, chapter.id);
        // 合并术语，累加出现次数
        for (const [key, value] of paragraphTerms.entries()) {
          const existing = terms.get(key);
          if (existing) {
            // 累加该章节的出现次数
            const chapterOccurrence = existing.occurrences.find(
              (occ) => occ.chapterId === chapter.id,
            );
            if (chapterOccurrence) {
              chapterOccurrence.count += value.occurrences[0]?.count || 0;
            } else {
              existing.occurrences.push(...value.occurrences);
            }
          } else {
            terms.set(key, { ...value });
          }
        }
      }
    }

    // 从原始内容中提取（如果有）
    if (chapter.originalContent) {
      const originalTerms = await this.splitWords(chapter.originalContent, chapter.id);
      // 合并术语，累加出现次数
      for (const [key, value] of originalTerms.entries()) {
        const existing = terms.get(key);
        if (existing) {
          // 累加该章节的出现次数
          const chapterOccurrence = existing.occurrences.find(
            (occ) => occ.chapterId === chapter.id,
          );
          if (chapterOccurrence) {
            chapterOccurrence.count += value.occurrences[0]?.count || 0;
          } else {
            existing.occurrences.push(...value.occurrences);
          }
        } else {
          terms.set(key, { ...value });
        }
      }
    }

    return terms;
  }

  /**
   * 从段落中提取单词
   * @param paragraphs 段落数组
   * @param chapterId 章节 ID
   * @returns 术语 Map，key 为表面形式，value 为术语信息
   */
  static async extractWordsFromParagraphs(
    paragraphs: Paragraph[],
    chapterId: string,
  ): Promise<Map<string, ExtractedTermInfo>> {
    const allTerms = new Map<string, ExtractedTermInfo>();

    for (const paragraph of paragraphs) {
      const terms = await this.extractWordsFromParagraph(paragraph, chapterId);
      // 合并术语，按章节记录出现次数
      for (const [key, value] of terms.entries()) {
        const existing = allTerms.get(key);
        if (existing) {
          // 累加该章节的出现次数
          const chapterOccurrence = existing.occurrences.find((occ) => occ.chapterId === chapterId);
          if (chapterOccurrence) {
            chapterOccurrence.count += value.occurrences[0]?.count || 0;
          } else {
            existing.occurrences.push(...value.occurrences);
          }
        } else {
          allTerms.set(key, { ...value });
        }
      }
    }

    console.log(
      '从段落中提取的术语:',
      Array.from(allTerms.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    );
    console.log('术语总数:', allTerms.size);
    return allTerms;
  }

  /**
   * 从单个段落中提取单词
   * @param paragraph 段落对象
   * @param chapterId 章节 ID
   * @returns 术语 Map，key 为表面形式，value 为术语信息
   */
  static async extractWordsFromParagraph(
    paragraph: Paragraph,
    chapterId: string,
  ): Promise<Map<string, ExtractedTermInfo>> {
    return this.splitWords(paragraph.text, chapterId);
  }

  /**
   * 拆分文本为单词
   * 使用 @patdx/kuromoji 进行日语形态素分析
   * @param text 要拆分的文本
   * @param chapterId 章节 ID
   * @returns 术语 Map，key 为表面形式，value 为术语信息
   */
  private static async splitWords(
    text: string,
    chapterId: string,
  ): Promise<Map<string, ExtractedTermInfo>> {
    if (!text || typeof text !== 'string') {
      return new Map();
    }

    const terms = new Map<string, ExtractedTermInfo>();

    try {
      // 初始化 tokenizer
      const tokenizer = await this.initializeTokenizer();

      // 使用 @patdx/kuromoji 进行分词
      const tokens = tokenizer.tokenize(text);

      // 只提取名词（名詞），且 posDetail1 为允许的值
      for (const token of tokens) {
        // 检查词性是否为名词，且 posDetail1 是否在允许列表中
        if (
          token.pos === '名詞' &&
          ALLOWED_POS_DETAIL_1.includes(token.pos_detail_1 as (typeof ALLOWED_POS_DETAIL_1)[number])
        ) {
          // 使用表面形式（surface_form）作为单词
          const word = token.surface_form;
          if (word && word.length > 0) {
            const existing = terms.get(word);
            if (existing) {
              // 如果已存在，增加该章节的出现次数
              const chapterOccurrence = existing.occurrences.find(
                (occ) => occ.chapterId === chapterId,
              );
              if (chapterOccurrence) {
                chapterOccurrence.count += 1;
              } else {
                existing.occurrences.push({ chapterId, count: 1 });
              }
            } else {
              // 如果不存在，创建新条目
              terms.set(word, {
                surfaceForm: word,
                pos: token.pos,
                posDetail1: token.pos_detail_1,
                posDetail2: token.pos_detail_2,
                posDetail3: token.pos_detail_3,
                occurrences: [{ chapterId, count: 1 }],
              });
            }
          }
        }
      }

      // 在控制台输出详细信息（只显示符合条件的名词）
      const filteredNouns = tokens.filter(
        (t) =>
          t.pos === '名詞' &&
          ALLOWED_POS_DETAIL_1.includes(t.pos_detail_1 as (typeof ALLOWED_POS_DETAIL_1)[number]),
      );
      console.log('文本:', text);
      console.log(
        '提取的名词:',
        filteredNouns.map((t) => ({
          表面形式: t.surface_form,
          基本形: t.basic_form,
          词性: t.pos,
          品词细分类1: t.pos_detail_1,
          品词细分类2: t.pos_detail_2,
          品词细分类3: t.pos_detail_3,
          读音: t.reading,
        })),
      );
    } catch (error) {
      console.error('分词失败:', error);
      // 如果分词失败，返回空 Map
    }

    return terms;
  }
}
