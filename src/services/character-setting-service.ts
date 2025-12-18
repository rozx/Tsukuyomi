import type {
  CharacterSetting,
  Alias,
  Translation,
  Novel,
} from 'src/models/novel';
import { flatMap, isEmpty, isArray, sortBy, isEqual } from 'lodash';
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

    // 创建新角色设定
    const newCharacter: CharacterSetting = {
      id: charId,
      name: charData.name,
      sex: charData.sex,
      ...(charData.description ? { description: charData.description } : {}),
      ...(charData.speakingStyle ? { speakingStyle: charData.speakingStyle } : {}),
      translation,
      aliases,
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
