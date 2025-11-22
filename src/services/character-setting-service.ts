import type {
  CharacterSetting,
  Occurrence,
  Translation,
  Novel,
} from 'src/types/novel';
import { useBooksStore } from 'src/stores/books';
import { UniqueIdGenerator, extractIds, generateShortId } from 'src/utils';

/**
 * 角色设定服务
 * 负责管理小说中的角色设定（添加、更新、删除）
 */
export class CharacterSettingService {
  /**
   * 统计名称在书籍所有章节中的出现次数
   * @param book 书籍对象
   * @param name 角色名称
   * @returns 出现记录数组
   */
  private static countNameOccurrences(book: Novel, name: string): Occurrence[] {
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
                // 注意：这里简单的字符串匹配可能不完全准确，但在当前阶段够用
                const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                const matches = paragraph.text.match(regex);
                if (matches) {
                  chapterCount += matches.length;
                }
              }
            }

            // 从原始内容中统计
            if (chapter.originalContent) {
              const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
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
   * 添加新角色设定
   * @param bookId 书籍 ID
   * @param charData 角色数据
   * @param charData.name 角色名称（必需）
   * @param charData.translations 翻译文本数组（可选）
   * @param charData.description 角色描述（可选）
   * @param charData.aliases 别名数组（可选，字符串数组）
   * @returns 创建的角色设定对象
   * @throws 如果角色名称已存在，抛出错误
   */
  static async addCharacterSetting(
    bookId: string,
    charData: {
      name: string;
      translations?: string[];
      description?: string;
      aliases?: string[];
    },
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentSettings = book.characterSettings || [];

    // 检查是否已存在同名角色
    const existingChar = currentSettings.find((c) => c.name === charData.name);
    if (existingChar) {
      throw new Error(`角色 "${charData.name}" 已存在`);
    }

    // 生成唯一 ID
    const existingIds = extractIds(currentSettings);
    // 还需要收集所有子项（别名）的 ID 以确保唯一性，虽然目前 UniqueIdGenerator 主要是针对顶层 ID
    // 为了安全起见，最好是全局唯一
    const allIds = new Set(existingIds);
    currentSettings.forEach(c => {
      if (c.aliases) {
        c.aliases.forEach(a => allIds.add(a.id));
      }
    });
    
    const idGenerator = new UniqueIdGenerator(Array.from(allIds));
    const charId = idGenerator.generate();

    // 创建 Translation 对象数组
    const translations: Translation[] = (charData.translations || []).map(text => ({
      id: generateShortId(),
      translation: text,
      aiModelId: '', // 默认为空
    }));

    // 统计角色出现次数
    const occurrences = this.countNameOccurrences(book, charData.name);

    // 处理别名
    const aliases: CharacterSetting[] = [];
    if (charData.aliases && charData.aliases.length > 0) {
      for (const aliasName of charData.aliases) {
        if (!aliasName.trim()) continue;
        
        // 为别名生成 ID
        const aliasId = idGenerator.generate();
        
        // 统计别名出现次数
        const aliasOccurrences = this.countNameOccurrences(book, aliasName);
        
        aliases.push({
          id: aliasId,
          name: aliasName,
          translation: [], // 别名通常没有单独的翻译列表，或者可以继承主角色的？暂时为空
          aliases: [], // 别名不嵌套别名
          occurrences: aliasOccurrences,
        });
      }
    }

    // 创建新角色设定
    const newCharacter: CharacterSetting = {
      id: charId,
      name: charData.name,
      ...(charData.description ? { description: charData.description } : {}),
      translation: translations,
      aliases,
      occurrences,
    };

    // 更新书籍
    const updatedSettings = [...currentSettings, newCharacter];
    await booksStore.updateBook(bookId, {
      characterSettings: updatedSettings,
      lastEdited: new Date(),
    });

    return newCharacter;
  }

  /**
   * 更新现有角色设定
   * @param bookId 书籍 ID
   * @param charId 角色 ID
   * @param updates 要更新的字段
   * @returns 更新后的角色设定对象
   */
  static async updateCharacterSetting(
    bookId: string,
    charId: string,
    updates: {
      name?: string;
      translations?: string[];
      description?: string;
      aliases?: string[];
    },
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentSettings = book.characterSettings || [];
    const existingChar = currentSettings.find((c) => c.id === charId);

    if (!existingChar) {
      throw new Error(`角色不存在: ${charId}`);
    }

    // 如果更新名称，检查是否与其他角色冲突
    const nameChanged = updates.name && updates.name !== existingChar.name;
    if (nameChanged) {
      const nameConflict = currentSettings.find(
        (c) => c.id !== charId && c.name === updates.name,
      );
      if (nameConflict) {
        throw new Error(`角色 "${updates.name}" 已存在`);
      }
    }

    // 准备更新后的数据
    const updatedName = updates.name ?? existingChar.name;
    
    // 如果名称改变，重新统计出现次数
    let occurrences = existingChar.occurrences;
    if (nameChanged && updates.name) {
      occurrences = this.countNameOccurrences(book, updates.name);
    }

    // 处理翻译更新
    let updatedTranslations = existingChar.translation;
    if (updates.translations !== undefined) {
      // 简单的全量替换策略：
      // 保留已有的翻译对象如果文本匹配（为了保留 id 和 aiModelId），否则创建新的
      // 但为了简化，这里我们重新创建 Translation 对象列表
      // 如果需要保留 ID，逻辑会复杂一些。考虑到翻译只是简单的字符串列表展示在 UI，重新生成 ID 影响不大
      // 除非有其他地方引用了具体的 Translation ID。
      // 让我们尝试保留 ID：
      updatedTranslations = updates.translations.map(text => {
        const existing = existingChar.translation.find(t => t.translation === text);
        if (existing) return existing;
        return {
          id: generateShortId(),
          translation: text,
          aiModelId: '',
        };
      });
    }

    // 处理别名更新
    let updatedAliases = existingChar.aliases;
    if (updates.aliases !== undefined) {
      // 收集所有现有 ID 以避免冲突
      const existingIds = extractIds(currentSettings);
       const allIds = new Set(existingIds);
       currentSettings.forEach(c => {
        if (c.aliases) {
          c.aliases.forEach(a => allIds.add(a.id));
        }
      });
      const idGenerator = new UniqueIdGenerator(Array.from(allIds));

      updatedAliases = [];
      for (const aliasName of updates.aliases) {
         if (!aliasName.trim()) continue;

         // 尝试查找现有的别名以保留 ID
         const existingAlias = existingChar.aliases.find(a => a.name === aliasName);
         
         if (existingAlias) {
           updatedAliases.push(existingAlias);
         } else {
           // 创建新别名
           const aliasId = idGenerator.generate();
           const aliasOccurrences = this.countNameOccurrences(book, aliasName);
           updatedAliases.push({
             id: aliasId,
             name: aliasName,
             translation: [],
             aliases: [],
             occurrences: aliasOccurrences,
           });
         }
      }
    }

    const updatedChar: CharacterSetting = {
      id: existingChar.id,
      name: updatedName,
      translation: updatedTranslations,
      aliases: updatedAliases,
      occurrences: occurrences,
      description: existingChar.description, // 默认保留
    };

    // 处理 description
    if (updates.description !== undefined) {
      if (updates.description) {
        updatedChar.description = updates.description;
      } else {
        delete updatedChar.description;
      }
    }

    // 更新书籍
    const updatedSettings = currentSettings.map((c) =>
      c.id === charId ? updatedChar : c,
    );
    await booksStore.updateBook(bookId, {
      characterSettings: updatedSettings,
      lastEdited: new Date(),
    });

    return updatedChar;
  }

  /**
   * 删除角色设定
   * @param bookId 书籍 ID
   * @param charId 角色 ID
   */
  static async deleteCharacterSetting(bookId: string, charId: string): Promise<void> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentSettings = book.characterSettings || [];
    const charExists = currentSettings.some((c) => c.id === charId);

    if (!charExists) {
      throw new Error(`角色不存在: ${charId}`);
    }

    const updatedSettings = currentSettings.filter((c) => c.id !== charId);
    await booksStore.updateBook(bookId, {
      characterSettings: updatedSettings,
      lastEdited: new Date(),
    });
  }
}

