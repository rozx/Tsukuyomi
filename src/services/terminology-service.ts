import type { Occurrence, Terminology, Translation, Novel } from 'src/models/novel';
import { flatMap, isEmpty, isArray } from 'lodash';
import { useBooksStore } from 'src/stores/books';
import {
  UniqueIdGenerator,
  extractIds,
  generateShortId,
  normalizeTranslationQuotes,
  processItemsInBatches,
  ensureChapterContentLoaded,
} from 'src/utils';

/**
 * 术语服务
 * 负责管理小说中的术语（添加、更新、删除、统计出现次数等）
 */
export class TerminologyService {
  /**
   * 统计术语在书籍所有章节中的出现次数
   * 使用分批处理避免阻塞 UI
   * @param book 书籍对象
   * @param termName 术语名称
   * @returns 出现记录数组
   */
  private static async countTermOccurrences(book: Novel, termName: string): Promise<Occurrence[]> {
    const occurrencesMap = new Map<string, number>();
    const escapedTermName = termName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTermName, 'g');

    // 扁平化所有章节
    const allChapters = flatMap(book.volumes || [], (volume) => volume.chapters || []);

    // 分批处理章节，每批之间让出主线程
    await processItemsInBatches(
      allChapters,
      async (chapter) => {
        const chapterWithContent = await ensureChapterContentLoaded(chapter);

        let chapterCount = 0;

        // 从段落中统计
        if (isArray(chapterWithContent.content) && !isEmpty(chapterWithContent.content)) {
          for (const paragraph of chapterWithContent.content) {
            const matches = paragraph.text.match(regex);
            if (matches) {
              chapterCount += matches.length;
            }
          }
        }

        // 从原始内容中统计
        if (chapterWithContent.originalContent) {
          const matches = chapterWithContent.originalContent.match(regex);
          if (matches) {
            chapterCount += matches.length;
          }
        }

        // 如果该章节有出现，记录到 Map 中
        if (chapterCount > 0) {
          const existingCount = occurrencesMap.get(chapter.id) || 0;
          occurrencesMap.set(chapter.id, existingCount + chapterCount);
        }
      },
      10, // 每批处理 10 个章节
      0, // 让出主线程的延迟时间
    );

    // 转换为 Occurrence 数组
    return Array.from(occurrencesMap.entries()).map(([chapterId, count]) => ({
      chapterId,
      count,
    }));
  }

  /**
   * 添加新术语
   * @param bookId 书籍 ID
   * @param termData 术语数据
   * @param termData.name 术语名称（必需）
   * @param termData.translation 翻译文本（可选，留空时由 AI 自动翻译）
   * @param termData.description 术语描述（可选）
   * @returns 创建的术语对象
   * @throws 如果术语名称已存在，抛出错误
   */
  static async addTerminology(
    bookId: string,
    termData: {
      name: string;
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
      translation: normalizeTranslationQuotes(termData.translation || ''),
      aiModelId: '', // 可以后续从默认模型获取
    };

    // 创建新术语
    const newTerminology: Terminology = {
      id: termId,
      name: termData.name,
      ...(termData.description ? { description: termData.description } : {}),
      translation,
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

    // 更新术语
    const updatedName = updates.name ?? existingTerm.name;
    const updatedTerm: Terminology = {
      id: existingTerm.id,
      name: updatedName,
      translation: {
        id: existingTerm.translation.id,
        translation:
          updates.translation !== undefined
            ? normalizeTranslationQuotes(updates.translation)
            : existingTerm.translation.translation,
        aiModelId: existingTerm.translation.aiModelId,
      },
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

  /**
   * 根据提供的关键词获取出现次数
   * 统计指定关键词在书籍所有章节中的出现次数
   * @param bookId 书籍 ID
   * @param keywords 关键词数组
   * @returns 关键词出现次数 Map，key 为关键词，value 为出现记录数组
   * @throws 如果书籍不存在，抛出错误
   */
  static async getOccurrencesByKeywords(
    bookId: string,
    keywords: string[],
  ): Promise<Map<string, Occurrence[]>> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    // 如果关键词数组为空，返回空 Map
    if (!keywords || keywords.length === 0) {
      return new Map<string, Occurrence[]>();
    }

    const resultMap = new Map<string, Occurrence[]>();

    // 为每个关键词统计出现次数
    for (const keyword of keywords) {
      if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
        // 跳过无效的关键词
        continue;
      }

      const occurrences = await this.countTermOccurrences(book, keyword);
      resultMap.set(keyword, occurrences);
    }

    return resultMap;
  }

  /**
   * 导出术语为 JSON 文件
   * @param terminologies 术语数组
   * @param filename 文件名（可选，默认包含日期）
   */
  static exportTerminologiesToJson(terminologies: Terminology[], filename?: string): void {
    try {
      const jsonString = JSON.stringify(terminologies, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `terminologies-${new Date().toISOString().split('T')[0]}.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '导出术语时发生未知错误');
    }
  }

  /**
   * 从文件导入术语
   * @param file 文件对象
   * @returns Promise<Terminology[]> 导入的术语数组
   */
  static importTerminologiesFromFile(file: File): Promise<Terminology[]> {
    return new Promise((resolve, reject) => {
      // 验证文件类型
      const isValidFile =
        file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');

      if (!isValidFile) {
        reject(new Error('请选择 JSON 或 TXT 格式的文件'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          let terminologies: Terminology[] = [];

          if (Array.isArray(data)) {
            // 验证每个术语的基本结构
            for (const term of data) {
              if (
                !term.id ||
                !term.name ||
                !term.translation ||
                typeof term.translation.translation !== 'string'
              ) {
                reject(new Error('文件格式错误：术语数据不完整'));
                return;
              }
            }
            terminologies = data as Terminology[];
          } else if (typeof data === 'object' && data !== null) {
            // 处理键值对格式 { "term name": "term translation" }
            terminologies = Object.entries(data).map(([name, translation]) => ({
              id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name,
              translation: {
                id: `trans-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                translation: String(translation),
                aiModelId: 'manual-import',
              },
              description: undefined,
            }));
          } else {
            reject(new Error('文件格式错误：应为术语数组或键值对对象'));
            return;
          }

          resolve(terminologies);
        } catch (error) {
          reject(
            new Error(
              error instanceof Error
                ? `解析文件时发生错误：${error.message}`
                : '解析文件时发生未知错误',
            ),
          );
        }
      };

      reader.onerror = () => {
        reject(new Error('读取文件时发生错误'));
      };

      reader.readAsText(file);
    });
  }
}
