import type {
  CharacterSetting,
  Alias,
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
   * @param charData.sex 性别（可选）
   * @param charData.translation 翻译文本（可选）
   * @param charData.description 角色描述（可选）
   * @param charData.aliases 别名数组（可选，包含名称和翻译的对象数组）
   * @returns 创建的角色设定对象
   * @throws 如果角色名称已存在，抛出错误
   */
  static async addCharacterSetting(
    bookId: string,
    charData: {
      name: string;
      sex?: 'male' | 'female' | 'other' | undefined;
      translation?: string;
      description?: string;
      aliases?: Array<{ name: string; translation: string }>;
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
    // Alias no longer has ID, so we don't need to collect alias IDs
    
    const idGenerator = new UniqueIdGenerator(Array.from(allIds));
    const charId = idGenerator.generate();

    // 创建 Translation 对象
    const translation: Translation = {
      id: generateShortId(),
      translation: charData.translation || '',
      aiModelId: '', // 默认为空
    };

    // 统计角色出现次数
    const occurrences = this.countNameOccurrences(book, charData.name);

    // 处理别名
    const aliases: Alias[] = [];
    if (charData.aliases && charData.aliases.length > 0) {
      for (const aliasData of charData.aliases) {
        if (!aliasData.name.trim()) continue;
        
        aliases.push({
          name: aliasData.name,
          translation: {
            id: generateShortId(),
            translation: aliasData.translation || aliasData.name, // 使用提供的翻译，如果没有则使用名称
            aiModelId: '',
          },
        });
      }
    }

    // 创建新角色设定
    const newCharacter: CharacterSetting = {
      id: charId,
      name: charData.name,
      sex: charData.sex,
      ...(charData.description ? { description: charData.description } : {}),
      translation,
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
      sex?: 'male' | 'female' | 'other' | undefined;
      translation?: string;
      description?: string;
      aliases?: Array<{ name: string; translation: string }>;
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
    let updatedTranslation = existingChar.translation;
    if (updates.translation !== undefined) {
      // 保留原有的 ID 和 aiModelId，只更新翻译文本
      updatedTranslation = {
        id: existingChar.translation.id,
        translation: updates.translation,
        aiModelId: existingChar.translation.aiModelId,
      };
    }

    // 处理别名更新
    let updatedAliases = existingChar.aliases;
    if (updates.aliases !== undefined) {
      updatedAliases = [];
      for (const aliasData of updates.aliases) {
         if (!aliasData.name.trim()) continue;

         // 尝试查找现有的别名（按名称匹配）
         const existingAlias = existingChar.aliases.find(a => a.name === aliasData.name);
         
         if (existingAlias) {
           // 保留现有别名，但更新翻译
           updatedAliases.push({
             name: aliasData.name,
             translation: {
               id: existingAlias.translation.id, // 保留原有 ID
               translation: aliasData.translation || aliasData.name,
               aiModelId: existingAlias.translation.aiModelId,
             },
           });
         } else {
           // 创建新别名
           updatedAliases.push({
             name: aliasData.name,
             translation: {
                id: generateShortId(),
                translation: aliasData.translation || aliasData.name,
                aiModelId: '',
             },
           });
         }
      }
    }

    const updatedChar: CharacterSetting = {
      id: existingChar.id,
      name: updatedName,
      sex: updates.sex !== undefined ? updates.sex : existingChar.sex,
      translation: updatedTranslation,
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

