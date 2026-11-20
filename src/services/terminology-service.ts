import { LocalizedError } from 'src/utils/localized-error';
import type { AppLocale } from 'src/models/locale';
import { buildNameTranslation } from './localization/selection';
import type { CharacterSetting, Terminology, Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { SettingsService } from 'src/services/settings-service';
import { UniqueIdGenerator, extractIds } from 'src/utils';

/**
 * 术语服务
 * 负责管理小说中的术语（添加、更新、删除、统计出现次数等）
 */
type TerminologyMutationFields = { name: string; translation?: string; description?: string };

export class TerminologyService {
  /**
   * 根据书籍 ID 读取当前术语列表，集中处理"书籍不存在"校验与
   * `terminologies ?? []` 兜底，避免在每个 CRUD 方法里重复 5 行模板。
   * @param bookId 书籍 ID
   * @returns Pinia books store 以及该书籍当前的 Terminology 数组
   * @throws 书籍不存在时抛出统一错误
   */
  private static loadBookTerminologies(
    bookId: string,
    targetLanguage?: AppLocale,
  ): {
    book: Novel;
    language: AppLocale;
    booksStore: ReturnType<typeof useBooksStore>;
    currentTerminologies: Terminology[];
    characterSettings: CharacterSetting[];
  } {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId });
    }

    return {
      book,
      language: targetLanguage ?? book.targetLanguage ?? 'zh-CN',
      booksStore,
      currentTerminologies: book.terminologies || [],
      characterSettings: book.characterSettings || [],
    };
  }

  /**
   * 校验术语名是否与任何角色的主名或别名重复。
   * 术语和角色都是给同一个名字打标签 —— 同名会让翻译上下文产生歧义，所以禁止重复。
   */
  private static assertTermNameNotCharacter(
    characterSettings: CharacterSetting[],
    termName: string,
  ): void {
    for (const ch of characterSettings) {
      if (ch.name === termName) {
        throw new LocalizedError(
          'TERM_CHARACTER_CONFLICT',
          'aiEntityFeedback.termConflictsCharacter',
          { name: termName },
        );
      }
      if (ch.aliases?.some((a) => a.name === termName)) {
        throw new LocalizedError('TERM_ALIAS_CONFLICT', 'aiEntityFeedback.termConflictsAlias', {
          name: termName,
        });
      }
    }
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
    termData: TerminologyMutationFields,
    targetLanguage?: AppLocale,
  ): Promise<Terminology> {
    const { language, booksStore, currentTerminologies, characterSettings } =
      this.loadBookTerminologies(bookId, targetLanguage);

    // 检查是否已存在同名术语
    const existingTerm = currentTerminologies.find((t) => t.name === termData.name);
    if (existingTerm) {
      throw new LocalizedError('TERM_NAME_CONFLICT', 'aiEntityFeedback.termDuplicate', {
        name: termData.name,
      });
    }

    // 检查是否与角色（主名或别名）冲突
    this.assertTermNameNotCharacter(characterSettings, termData.name);

    // 生成唯一 ID
    const existingTermIds = extractIds(currentTerminologies);
    const idGenerator = new UniqueIdGenerator(existingTermIds);
    const termId = idGenerator.generate();

    // 创建 Translation 对象
    const translation = buildNameTranslation(undefined, termData.translation, language);

    // 创建新术语
    const newTerminology: Terminology = {
      id: termId,
      name: termData.name,
      ...(termData.description ? { description: termData.description } : {}),
      translation,
    };

    // 更新书籍
    const updatedTerminologies = [...currentTerminologies, newTerminology];
    await booksStore.updateBook(
      bookId,
      {
        terminologies: updatedTerminologies,
        lastEdited: new Date(),
      },
      {
        targetLanguage: language,
        ...(targetLanguage === undefined ? { expectedBookLanguage: language } : {}),
      },
    );

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
    updates: Partial<TerminologyMutationFields>,
    targetLanguage?: AppLocale,
  ): Promise<Terminology> {
    const { language, booksStore, currentTerminologies, characterSettings } =
      this.loadBookTerminologies(bookId, targetLanguage);
    const existingTerm = currentTerminologies.find((t) => t.id === termId);

    if (!existingTerm) {
      throw new LocalizedError('TERM_NOT_FOUND', 'aiEntityFeedback.termMissing', { id: termId });
    }

    // 如果更新名称，检查是否与其他术语 / 角色冲突
    const nameChanged = updates.name && updates.name !== existingTerm.name;
    if (nameChanged && updates.name) {
      const nameConflict = currentTerminologies.find(
        (t) => t.id !== termId && t.name === updates.name,
      );
      if (nameConflict) {
        throw new LocalizedError('TERM_NAME_CONFLICT', 'aiEntityFeedback.termDuplicate', {
          name: updates.name,
        });
      }
      this.assertTermNameNotCharacter(characterSettings, updates.name);
    }

    // 更新术语
    const updatedName = updates.name ?? existingTerm.name;
    const updatedTerm: Terminology = {
      ...existingTerm,
      id: existingTerm.id,
      name: updatedName,
      translation: buildNameTranslation(existingTerm, updates.translation, language),
    };

    // 处理 description：如果有值则设置，如果为空字符串则删除属性
    if (updates.description !== undefined) {
      if (updates.description) {
        updatedTerm.description = updates.description;
      } else delete updatedTerm.description;
    } else if (existingTerm.description !== undefined) {
      // 如果没有提供 updates.description，保留原有的 description
      updatedTerm.description = existingTerm.description;
    }

    // 更新书籍
    const updatedTerminologies = currentTerminologies.map((term) =>
      term.id === termId ? updatedTerm : term,
    );
    await booksStore.updateBook(
      bookId,
      {
        terminologies: updatedTerminologies,
        lastEdited: new Date(),
      },
      {
        targetLanguage: language,
        ...(targetLanguage === undefined ? { expectedBookLanguage: language } : {}),
      },
    );

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
      throw new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId });
    }

    const currentTerminologies = book.terminologies || [];
    const termExists = currentTerminologies.some((t) => t.id === termId);

    if (!termExists) {
      throw new LocalizedError('TERM_NOT_FOUND', 'aiEntityFeedback.termMissing', { id: termId });
    }

    // 更新书籍，移除该术语
    const updatedTerminologies = currentTerminologies.filter((t) => t.id !== termId);
    await booksStore.updateBook(bookId, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });
  }

  /**
   * 导出术语为 JSON 文件
   * @param terminologies 术语数组
   * @param filename 文件名（可选，默认包含日期）
   */
  static exportTerminologiesToJson(terminologies: Terminology[], filename?: string): void {
    SettingsService.downloadJson(
      terminologies,
      filename || `terminologies-${new Date().toISOString().split('T')[0]}.json`,
    );
  }

  static async importTerminologiesFromFile(file: File): Promise<Terminology[]> {
    const data = await SettingsService.readJsonFile(file);

    let terminologies: Terminology[] = [];

    if (Array.isArray(data)) {
      for (const term of data) {
        if (
          !term.id ||
          !term.name ||
          !term.translation ||
          typeof term.translation.translation !== 'string'
        ) {
          throw new LocalizedError('TERM_FILE_INCOMPLETE', 'aiEntityFeedback.termFileIncomplete');
        }
      }
      terminologies = data as Terminology[];
    } else if (typeof data === 'object' && data !== null) {
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
      throw new LocalizedError('TERM_FILE_SHAPE', 'aiEntityFeedback.termFileShape');
    }

    return terminologies;
  }
}
