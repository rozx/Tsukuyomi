import type {
  CharacterSetting,
  Alias,
  Occurrence,
  Translation,
  Novel,
} from 'src/models/novel';
import { flatMap, isEmpty, isArray, isEqual, sortBy } from 'lodash';
import { useBooksStore } from 'src/stores/books';
import {
  UniqueIdGenerator,
  extractIds,
  generateShortId,
  normalizeTranslationQuotes,
  getCharacterNameVariants,
  processItemsInBatches,
  ensureChapterContentLoaded,
} from 'src/utils';
import { matchCharactersInText, calculateCharacterScores } from 'src/utils/text-matcher';

/**
 * 角色设定服务
 * 负责管理小说中的角色设定（添加、更新、删除）
 */
export class CharacterSettingService {
  /**
   * 统计角色（包括主名称和所有别名）在书籍所有章节中的出现次数
   * 使用 text-matcher.ts 中的 matchCharactersInText 进行匹配，支持名称消歧义
   * 使用分批处理避免阻塞 UI
   * @param book 书籍对象
   * @param character 角色对象
   * @returns 出现记录数组
   */
  private static async countCharacterOccurrences(
    book: Novel,
    character: CharacterSetting,
  ): Promise<Occurrence[]> {
    const occurrencesMap = new Map<string, number>();

    // 扁平化所有章节
    const allChapters = flatMap(book.volumes || [], (volume) => volume.chapters || []);

    // 为了更好的消歧义，先计算所有章节的上下文得分
    // 收集所有章节的文本内容（分批处理以避免阻塞）
    let fullText = '';
    await processItemsInBatches(
      allChapters,
      async (chapter) => {
        const chapterWithContent = await ensureChapterContentLoaded(chapter);

        // 处理段落内容
        if (isArray(chapterWithContent.content) && !isEmpty(chapterWithContent.content)) {
          for (const paragraph of chapterWithContent.content) {
            fullText += paragraph.text + '\n';
          }
        }
        // 处理原始内容
        if (chapterWithContent.originalContent) {
          fullText += chapterWithContent.originalContent + '\n';
        }
      },
      10, // 每批处理 10 个章节
      0, // 让出主线程的延迟时间
    );

    // 计算上下文得分（使用所有角色，以便更好地消歧义）
    const allCharacters = book.characterSettings || [];
    // 确保当前角色包含在匹配列表中（可能尚未添加到 book.characterSettings）
    const charactersToMatch = allCharacters.some((c) => c.id === character.id)
      ? allCharacters
      : [...allCharacters, character];
    const contextScores = calculateCharacterScores(fullText, charactersToMatch);

    // 遍历所有章节，统计当前角色的出现次数（分批处理）
    await processItemsInBatches(
      allChapters,
      async (chapter) => {
        const chapterWithContent = await ensureChapterContentLoaded(chapter);

        let chapterText = '';

        // 处理段落内容
        if (isArray(chapterWithContent.content) && !isEmpty(chapterWithContent.content)) {
          for (const paragraph of chapterWithContent.content) {
            chapterText += paragraph.text + '\n';
          }
        }

        // 处理原始内容
        if (chapterWithContent.originalContent) {
          chapterText += chapterWithContent.originalContent + '\n';
        }

        if (!chapterText.trim()) {
          return;
        }

        // 使用 matchCharactersInText 匹配所有角色（包括主名称和所有别名）
        // 传入所有角色和上下文得分以支持名称消歧义
        // 然后过滤出当前角色的匹配
        const allMatches = matchCharactersInText(chapterText, charactersToMatch, contextScores);

        // 只统计当前角色的匹配次数
        const characterMatches = allMatches.filter((m) => m.item.id === character.id);
        const chapterCount = characterMatches.length;

        // 如果该章节有出现，记录到 Map 中
        if (chapterCount > 0) {
          occurrencesMap.set(chapter.id, chapterCount);
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
   * 统计名称在书籍所有章节中的出现次数
   * 使用分批处理避免阻塞 UI
   * @param book 书籍对象
   * @param name 角色名称
   * @returns 出现记录数组
   */
  private static async countNameOccurrences(book: Novel, name: string): Promise<Occurrence[]> {
    const occurrencesMap = new Map<string, number>();
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedName, 'g');

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
      translation: normalizeTranslationQuotes(charData.translation || ''),
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
            translation: normalizeTranslationQuotes(aliasData.translation || aliasData.name), // 使用提供的翻译，如果没有则使用名称
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
    const occurrences = await this.countCharacterOccurrences(book, tempCharacter);

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
                translation: normalizeTranslationQuotes(aliasData.translation || aliasData.name),
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
      occurrences = await this.countCharacterOccurrences(book, tempCharacter);
    }

    // 处理翻译更新
    let updatedTranslation = existingChar.translation;
    if (updates.translation !== undefined) {
      // 保留原有的 ID 和 aiModelId，只更新翻译文本
      updatedTranslation = {
        id: existingChar.translation.id,
        translation: normalizeTranslationQuotes(updates.translation),
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
               translation: normalizeTranslationQuotes(aliasData.translation || aliasData.name),
               aiModelId: existingAlias.translation.aiModelId,
             },
           });
         } else {
           // 创建新别名
           updatedAliases.push({
             name: aliasData.name,
             translation: {
                id: generateShortId(),
                translation: normalizeTranslationQuotes(aliasData.translation || aliasData.name),
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
   * 使用分批处理避免阻塞 UI
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

    // 分批处理角色，每批之间让出主线程
    const updatedCharacterSettings = await processItemsInBatches(
      characterSettings,
      async (char) => {
        // 使用 countCharacterOccurrences 统计（包括主名称和所有别名）
        const occurrences = await this.countCharacterOccurrences(book, char);
        const occurrencesChanged = !isEqual(char.occurrences, occurrences);
        if (occurrencesChanged) {
          return {
            ...char,
            occurrences,
          };
        }
        return char;
      },
      3, // 每批处理 3 个角色
      0, // 让出主线程的延迟时间
    );

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

  /**
   * 导出角色设定为 JSON 文件
   * @param characterSettings 角色设定数组
   * @param filename 文件名（可选，默认包含日期）
   */
  static exportCharacterSettingsToJson(
    characterSettings: CharacterSetting[],
    filename?: string,
  ): void {
    try {
      const jsonString = JSON.stringify(characterSettings, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `characters-${new Date().toISOString().split('T')[0]}.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '导出角色设定时发生未知错误');
    }
  }

  /**
   * 从文件导入角色设定
   * @param file 文件对象
   * @returns Promise<CharacterSetting[]> 导入的角色设定数组
   */
  static importCharacterSettingsFromFile(file: File): Promise<CharacterSetting[]> {
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

          // 验证数据格式
          if (!Array.isArray(data)) {
            reject(new Error('文件格式错误：应为角色设定数组'));
            return;
          }

          // 验证每个角色的基本结构
          for (const char of data) {
            if (
              !char.id ||
              !char.name ||
              !char.translation ||
              typeof char.translation.translation !== 'string'
            ) {
              reject(new Error('文件格式错误：角色设定数据不完整'));
              return;
            }
          }

          resolve(data as CharacterSetting[]);
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
