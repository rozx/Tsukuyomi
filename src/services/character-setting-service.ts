import type {
  CharacterSetting,
  Alias,
  Occurrence,
  Translation,
  Novel,
} from 'src/types/novel';
import { flatMap, isEmpty, isArray, isEqual, sortBy } from 'lodash';
import { useBooksStore } from 'src/stores/books';
import { UniqueIdGenerator, extractIds, generateShortId } from 'src/utils';

/**
 * 角色设定服务
 * 负责管理小说中的角色设定（添加、更新、删除）
 */
export class CharacterSettingService {
  /**
   * 统计角色（包括主名称和所有别名）在书籍所有章节中的出现次数
   * 优先匹配较长的名称，避免子串重复计数问题
   * @param book 书籍对象
   * @param character 角色对象
   * @returns 出现记录数组
   */
  private static countCharacterOccurrences(
    book: Novel,
    character: CharacterSetting,
  ): Occurrence[] {
    const occurrencesMap = new Map<string, number>();

    // 收集所有名称（主名称 + 所有别名）
    const allNames: Array<{ name: string; escaped: string }> = [
      {
        name: character.name,
        escaped: character.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      },
    ];

    if (character.aliases && character.aliases.length > 0) {
      for (const alias of character.aliases) {
        allNames.push({
          name: alias.name,
          escaped: alias.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        });
      }
    }

    // 按长度降序排序，优先匹配较长的名称
    allNames.sort((a, b) => b.name.length - a.name.length);

    // 扁平化所有章节
    const allChapters = flatMap(book.volumes || [], (volume) => volume.chapters || []);

    // 遍历所有章节
    for (const chapter of allChapters) {
      let chapterCount = 0;

      // 处理段落内容
      if (isArray(chapter.content) && !isEmpty(chapter.content)) {
        for (const paragraph of chapter.content) {
          chapterCount += this.countNamesInText(paragraph.text, allNames);
        }
      }

      // 处理原始内容
      if (chapter.originalContent) {
        chapterCount += this.countNamesInText(chapter.originalContent, allNames);
      }

      // 如果该章节有出现，记录到 Map 中
      if (chapterCount > 0) {
        const existingCount = occurrencesMap.get(chapter.id) || 0;
        occurrencesMap.set(chapter.id, existingCount + chapterCount);
      }
    }

    // 转换为 Occurrence 数组
    return Array.from(occurrencesMap.entries()).map(([chapterId, count]) => ({
      chapterId,
      count,
    }));
  }

  /**
   * 在文本中统计名称出现次数，优先匹配较长的名称以避免重复计数
   * @param text 要搜索的文本
   * @param names 名称数组（已按长度降序排序）
   * @returns 出现次数
   */
  private static countNamesInText(
    text: string,
    names: Array<{ name: string; escaped: string }>,
  ): number {
    if (!text || text.length === 0) {
      return 0;
    }

    let count = 0;
    // 用于标记已匹配的位置，避免重复计数
    const matchedPositions = new Set<number>();

    // 从左到右扫描文本
    let i = 0;
    while (i < text.length) {
      // 如果当前位置已被匹配，跳过
      if (matchedPositions.has(i)) {
        i++;
        continue;
      }

      let matched = false;

      // 按顺序尝试匹配所有名称（已按长度降序排序）
      for (const nameInfo of names) {
        // 使用预编译的正则表达式，但需要从当前位置开始匹配
        const remainingText = text.substring(i);
        const matchPattern = new RegExp(`^${nameInfo.escaped}`);
        const match = remainingText.match(matchPattern);
        
        if (match && match.index === 0) {
          // 找到匹配
          count++;
          const matchLength = nameInfo.name.length;
          // 标记这个匹配的所有位置为已使用
          for (let j = i; j < i + matchLength; j++) {
            matchedPositions.add(j);
          }
          // 跳过匹配的长度，继续扫描
          i += matchLength;
          matched = true;
          break; // 只匹配第一个找到的（最长的）
        }
      }

      // 如果没有匹配任何名称，移动到下一个位置
      if (!matched) {
        i++;
      }
    }

    return count;
  }

  /**
   * 统计名称在书籍所有章节中的出现次数
   * @param book 书籍对象
   * @param name 角色名称
   * @returns 出现记录数组
   */
  private static countNameOccurrences(book: Novel, name: string): Occurrence[] {
    const occurrencesMap = new Map<string, number>();
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedName, 'g');

    // 扁平化所有章节
    const allChapters = flatMap(book.volumes || [], (volume) => volume.chapters || []);

    // 遍历所有章节
    for (const chapter of allChapters) {
      let chapterCount = 0;

      // 从段落中统计
      if (isArray(chapter.content) && !isEmpty(chapter.content)) {
        for (const paragraph of chapter.content) {
          const matches = paragraph.text.match(regex);
          if (matches) {
            chapterCount += matches.length;
          }
        }
      }

      // 从原始内容中统计
      if (chapter.originalContent) {
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

    // 转换为 Occurrence 数组
    return Array.from(occurrencesMap.entries()).map(([chapterId, count]) => ({
      chapterId,
      count,
    }));
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
      speakingStyle?: string;
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
    const idGenerator = new UniqueIdGenerator(existingIds);
    const charId = idGenerator.generate();

    // 创建 Translation 对象
    const translation: Translation = {
      id: generateShortId(),
      translation: charData.translation || '',
      aiModelId: '', // 默认为空
    };

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

    // 构建临时角色对象用于统计（包括别名）
    const tempCharacter: CharacterSetting = {
      id: charId,
      name: charData.name,
      sex: charData.sex,
      translation,
      aliases,
      occurrences: [],
    };
    // 统计角色出现次数（包括主名称和所有别名）
    const occurrences = this.countCharacterOccurrences(book, tempCharacter);

    // 创建新角色设定
    const newCharacter: CharacterSetting = {
      id: charId,
      name: charData.name,
      sex: charData.sex,
      ...(charData.description ? { description: charData.description } : {}),
      ...(charData.speakingStyle ? { speakingStyle: charData.speakingStyle } : {}),
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
      speakingStyle?: string;
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
    
    // 检查别名是否改变（比较别名名称的集合，不考虑顺序）
    const existingAliasNames = sortBy(existingChar.aliases || [], 'name').map((a) => a.name);
    const newAliasNames =
      updates.aliases !== undefined
        ? sortBy(updates.aliases, 'name').map((a) => a.name)
        : existingAliasNames;
    const aliasesChanged =
      updates.aliases !== undefined && !isEqual(existingAliasNames, newAliasNames);
    
    // 如果名称改变或别名改变，需要重新统计
    // 构建临时角色对象用于统计（使用更新后的数据）
    let occurrences = existingChar.occurrences;
    if ((nameChanged && updates.name) || aliasesChanged) {
      // 构建临时别名数组用于统计
      const tempAliases: Alias[] = [];
      if (updates.aliases !== undefined) {
        // 使用更新后的别名
        for (const aliasData of updates.aliases) {
          if (!aliasData.name.trim()) continue;
          const existingAlias = existingChar.aliases?.find((a) => a.name === aliasData.name);
          if (existingAlias) {
            tempAliases.push(existingAlias);
          } else {
            // 新别名，使用临时对象
            tempAliases.push({
              name: aliasData.name,
              translation: {
                id: generateShortId(),
                translation: aliasData.translation || aliasData.name,
                aiModelId: '',
              },
            });
          }
        }
      } else {
        // 使用现有别名
        if (existingChar.aliases && existingChar.aliases.length > 0) {
          tempAliases.push(...existingChar.aliases);
        }
      }
      
      // 构建临时角色对象用于统计
      const tempCharacter: CharacterSetting = {
        ...existingChar,
        name: updatedName,
        aliases: tempAliases,
      };
      
      // 使用 countCharacterOccurrences 统计（包括主名称和所有别名）
      occurrences = this.countCharacterOccurrences(book, tempCharacter);
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
    let updatedAliases = existingChar.aliases || [];
    if (updates.aliases !== undefined) {
      updatedAliases = [];
      for (const aliasData of updates.aliases) {
         if (!aliasData.name.trim()) continue;

         // 检查该别名是否属于其他角色（作为主名称或别名）
         const aliasBelongsToOtherCharacter = currentSettings.some((c) => {
           if (c.id === charId) return false; // 跳过当前角色
           // 检查是否与其他角色的主名称冲突
           if (c.name === aliasData.name) return true;
           // 检查是否与其他角色的别名冲突
           if (c.aliases?.some((a) => a.name === aliasData.name)) return true;
           return false;
         });

         // 如果别名属于其他角色，跳过该别名
         if (aliasBelongsToOtherCharacter) {
           console.warn(
             `[CharacterSettingService] 跳过别名 "${aliasData.name}"，因为它已属于其他角色`,
           );
           continue;
         }

         // 尝试查找现有的别名（按名称匹配）
         const existingAlias = (existingChar.aliases || []).find(a => a.name === aliasData.name);
         
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
      speakingStyle: existingChar.speakingStyle, // 默认保留
    };

    // 处理 description
    if (updates.description !== undefined) {
      if (updates.description) {
        updatedChar.description = updates.description;
      } else {
        delete updatedChar.description;
      }
    }

    // 处理 speakingStyle
    if (updates.speakingStyle !== undefined) {
      if (updates.speakingStyle) {
        updatedChar.speakingStyle = updates.speakingStyle;
      } else {
        delete updatedChar.speakingStyle;
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

  /**
   * 刷新所有角色的出现次数
   * 当章节内容更新后调用此方法来重新统计所有角色（包括别名）的出现次数
   * @param bookId 书籍 ID
   */
  static async refreshAllCharacterOccurrences(bookId: string): Promise<void> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const characterSettings = book.characterSettings || [];
    if (characterSettings.length === 0) {
      return;
    }

    const updatedCharacterSettings = characterSettings.map((char) => {
      // 使用 countCharacterOccurrences 统计（包括主名称和所有别名）
      const occurrences = this.countCharacterOccurrences(book, char);
      const occurrencesChanged = !isEqual(char.occurrences, occurrences);
      if (occurrencesChanged) {
        return {
          ...char,
          occurrences,
        };
      }
      return char;
    });

    // 检查是否有任何角色被更新
    const hasChanges = updatedCharacterSettings.some((char, index) =>
      !isEqual(char, characterSettings[index]),
    );
    if (hasChanges) {
      await booksStore.updateBook(bookId, {
        characterSettings: updatedCharacterSettings,
        lastEdited: new Date(),
      });
    }
  }
}

