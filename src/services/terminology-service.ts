import type {
  Chapter,
  Paragraph,
  Occurrence,
  Terminology,
  Translation,
  Novel,
} from 'src/types/novel';
import { TokenizerBuilder, type LoaderConfig } from '@patdx/kuromoji';
import { useBooksStore } from 'src/stores/books';
import { UniqueIdGenerator, extractIds, generateShortId } from 'src/utils';

// 使用 any 类型来避免 Tokenizer 类型的导入问题
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tokenizer = any;

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

    // 过滤掉总出现次数少于3次的术语、包含汉字的术语、包含符号的术语、只包含长音符号的术语、单字符的术语
    const filteredTerms = new Map<string, ExtractedTermInfo>();
    for (const [key, value] of allTerms.entries()) {
      const totalCount = value.occurrences.reduce((sum, occ) => sum + occ.count, 0);
      // 应用所有过滤条件
      if (
        totalCount >= 3 &&
        key.length > 1 &&
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
      '从章节中提取的术语（过滤后，出现次数 >= 3，已过滤单字符、包含汉字、包含符号和只包含长音符号的术语）:',
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
   * 获取可用术语映射
   * 支持从章节或段落中提取术语
   * @param options 提取选项
   * @param options.chapters 章节数组（可选）
   * @param options.paragraphs 段落数组（可选，需提供 chapterId）
   * @param options.chapterId 章节 ID（当提供 paragraphs 时必需）
   * @returns 术语 Map，key 为表面形式，value 为术语信息（只包含总出现次数 >= 3 的术语）
   */
  static async getAvailableTerms(options: {
    chapters?: Chapter[];
    paragraphs?: Paragraph[];
    chapterId?: string;
  }): Promise<Map<string, ExtractedTermInfo>> {
    const { chapters, paragraphs, chapterId } = options;

    // 如果没有提供任何内容，返回空 Map
    if ((!chapters || chapters.length === 0) && (!paragraphs || paragraphs.length === 0)) {
      return new Map<string, ExtractedTermInfo>();
    }

    const allTerms = new Map<string, ExtractedTermInfo>();

    // 处理章节
    if (chapters && chapters.length > 0) {
      const chapterTerms = await this.extractWordsFromChapters(chapters);
      // 合并术语
      for (const [key, value] of chapterTerms.entries()) {
        allTerms.set(key, value);
      }
    }

    // 处理段落
    if (paragraphs && paragraphs.length > 0) {
      if (!chapterId) {
        throw new Error('当提供 paragraphs 时，必须提供 chapterId');
      }
      const paragraphTerms = await this.extractWordsFromParagraphs(paragraphs, chapterId);
      // 合并术语
      for (const [key, value] of paragraphTerms.entries()) {
        const existing = allTerms.get(key);
        if (existing) {
          // 查找该章节是否已有记录
          const chapterOccurrence = existing.occurrences.find((occ) => occ.chapterId === chapterId);
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

    // 应用过滤条件：总出现次数 >= 3，且通过其他过滤条件
    const filteredTerms = new Map<string, ExtractedTermInfo>();
    for (const [key, value] of allTerms.entries()) {
      const totalCount = value.occurrences.reduce((sum, occ) => sum + occ.count, 0);
      // 应用所有过滤条件
      if (
        totalCount >= 3 &&
        key.length > 1 &&
        !containsKanji(key) &&
        !containsSymbols(key) &&
        !containsOnlyLongVowel(key)
      ) {
        filteredTerms.set(key, value);
      }
    }

    return filteredTerms;
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
          // 过滤掉单字符的单词
          if (word && word.length > 1) {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filteredNouns = tokens.filter(
        (t: any) =>
          t.pos === '名詞' &&
          ALLOWED_POS_DETAIL_1.includes(t.pos_detail_1 as (typeof ALLOWED_POS_DETAIL_1)[number]),
      );
      console.log('文本:', text);
      console.log(
        '提取的名词:',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filteredNouns.map((t: any) => ({
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

  /**
   * 统计术语在书籍所有章节中的出现次数
   * @param book 书籍对象
   * @param termName 术语名称
   * @returns 出现记录数组
   */
  private static countTermOccurrences(book: Novel, termName: string): Occurrence[] {
    const occurrencesMap = new Map<string, number>();

    // 遍历所有卷和章节
    if (book.volumes) {
      for (const volume of book.volumes) {
        if (volume.chapters) {
          for (const chapter of volume.chapters) {
            let chapterCount = 0;

            // 从段落中统计
            if (chapter.content && Array.isArray(chapter.content)) {
              for (const paragraph of chapter.content) {
                // 使用正则表达式统计出现次数（区分大小写）
                const regex = new RegExp(termName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                const matches = paragraph.text.match(regex);
                if (matches) {
                  chapterCount += matches.length;
                }
              }
            }

            // 从原始内容中统计
            if (chapter.originalContent) {
              const regex = new RegExp(termName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              const matches = chapter.originalContent.match(regex);
              if (matches) {
                chapterCount += matches.length;
              }
            }

            // 如果该章节有出现，记录到 Map 中
            if (chapterCount > 0) {
              const existingCount = occurrencesMap.get(chapter.id) || 0;
              occurrencesMap.set(chapter.id, existingCount + chapterCount);
            }
          }
        }
      }
    }

    // 转换为 Occurrence 数组
    const occurrences: Occurrence[] = Array.from(occurrencesMap.entries()).map(
      ([chapterId, count]) => ({
        chapterId,
        count,
      }),
    );

    return occurrences;
  }

  /**
   * 添加新术语
   * @param bookId 书籍 ID
   * @param termData 术语数据
   * @param termData.name 术语名称（必需）
   * @param termData.translation 翻译文本（可选，留空时由 AI 自动翻译）
   * @param termData.description 术语描述（可选）
   * @param termData.occurrences 出现记录（可选，默认为空数组）
   * @returns 创建的术语对象
   * @throws 如果术语名称已存在，抛出错误
   */
  static async addTerminology(
    bookId: string,
    termData: {
      name: string;
      translation?: string;
      description?: string;
      occurrences?: Occurrence[];
    },
  ): Promise<Terminology> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentTerminologies = book.terminologies || [];

    // 检查是否已存在同名术语
    const existingTerm = currentTerminologies.find((t) => t.name === termData.name);
    if (existingTerm) {
      throw new Error(`术语 "${termData.name}" 已存在`);
    }

    // 生成唯一 ID
    const existingTermIds = extractIds(currentTerminologies);
    const idGenerator = new UniqueIdGenerator(existingTermIds);
    const termId = idGenerator.generate();

    // 创建 Translation 对象
    const translation: Translation = {
      id: generateShortId(),
      translation: termData.translation || '',
      aiModelId: '', // 可以后续从默认模型获取
    };

    // 统计术语出现次数（如果未提供 occurrences）
    let occurrences = termData.occurrences;
    if (!occurrences || occurrences.length === 0) {
      occurrences = this.countTermOccurrences(book, termData.name);
    }

    // 创建新术语
    const newTerminology: Terminology = {
      id: termId,
      name: termData.name,
      ...(termData.description ? { description: termData.description } : {}),
      translation,
      occurrences,
    };

    // 更新书籍
    const updatedTerminologies = [...currentTerminologies, newTerminology];
    await booksStore.updateBook(bookId, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });

    return newTerminology;
  }

  /**
   * 更新现有术语
   * @param bookId 书籍 ID
   * @param termId 术语 ID
   * @param updates 要更新的字段
   * @param updates.name 术语名称（可选）
   * @param updates.translation 翻译文本（可选）
   * @param updates.description 术语描述（可选，设置为空字符串时删除）
   * @returns 更新后的术语对象
   * @throws 如果术语不存在或名称与其他术语冲突，抛出错误
   */
  static async updateTerminology(
    bookId: string,
    termId: string,
    updates: {
      name?: string;
      translation?: string;
      description?: string;
    },
  ): Promise<Terminology> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentTerminologies = book.terminologies || [];
    const existingTerm = currentTerminologies.find((t) => t.id === termId);

    if (!existingTerm) {
      throw new Error(`术语不存在: ${termId}`);
    }

    // 如果更新名称，检查是否与其他术语冲突
    const nameChanged = updates.name && updates.name !== existingTerm.name;
    if (nameChanged) {
      const nameConflict = currentTerminologies.find(
        (t) => t.id !== termId && t.name === updates.name,
      );
      if (nameConflict) {
        throw new Error(`术语 "${updates.name}" 已存在`);
      }
    }

    // 如果名称改变，重新统计出现次数
    let occurrences = existingTerm.occurrences;
    if (nameChanged && updates.name) {
      occurrences = this.countTermOccurrences(book, updates.name);
    }

    // 更新术语
    const updatedTerm: Terminology = {
      id: existingTerm.id,
      name: updates.name ?? existingTerm.name,
      translation: {
        id: existingTerm.translation.id,
        translation: updates.translation ?? existingTerm.translation.translation,
        aiModelId: existingTerm.translation.aiModelId,
      },
      occurrences,
    };

    // 处理 description：如果有值则设置，如果为空字符串则删除属性
    if (updates.description !== undefined) {
      if (updates.description) {
        updatedTerm.description = updates.description;
      }
      // 如果为空字符串，不设置 description 属性（保持 undefined）
    } else if (existingTerm.description !== undefined) {
      // 如果没有提供 updates.description，保留原有的 description
      updatedTerm.description = existingTerm.description;
    }

    // 更新书籍
    const updatedTerminologies = currentTerminologies.map((term) =>
      term.id === termId ? updatedTerm : term,
    );
    await booksStore.updateBook(bookId, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });

    return updatedTerm;
  }

  /**
   * 删除术语
   * @param bookId 书籍 ID
   * @param termId 术语 ID
   * @throws 如果术语不存在，抛出错误
   */
  static async deleteTerminology(bookId: string, termId: string): Promise<void> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentTerminologies = book.terminologies || [];
    const termExists = currentTerminologies.some((t) => t.id === termId);

    if (!termExists) {
      throw new Error(`术语不存在: ${termId}`);
    }

    // 更新书籍，移除该术语
    const updatedTerminologies = currentTerminologies.filter((t) => t.id !== termId);
    await booksStore.updateBook(bookId, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });
  }
}
