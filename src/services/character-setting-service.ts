import type { CharacterSetting, Alias, Terminology, Translation } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { SettingsService } from 'src/services/settings-service';
import {
  UniqueIdGenerator,
  extractIds,
  generateShortId,
  normalizeTranslationQuotes,
} from 'src/utils';

/**
 * 角色设定服务
 * 负责管理小说中的角色设定（添加、更新、删除）
 */
function assertCharacterNameAvailable(
  currentSettings: CharacterSetting[],
  charId: string,
  newName: string | undefined,
  existingName: string,
): void {
  if (!newName || newName === existingName) return;
  const nameConflict = currentSettings.find((c) => c.id !== charId && c.name === newName);
  if (nameConflict) throw new Error(`角色 "${newName}" 已存在`);
}

/**
 * 校验角色主名 / 别名不与已有术语同名。术语和角色都是给同一个名字打标签 ——
 * 同名会让翻译上下文产生歧义，所以双向都禁。
 */
function assertNameNotTerm(
  terminologies: Terminology[],
  name: string,
  kind: 'name' | 'alias',
): void {
  if (terminologies.some((t) => t.name === name)) {
    const label = kind === 'name' ? '角色' : '角色别名';
    throw new Error(`${label} "${name}" 与已有术语重复`);
  }
}

function buildUpdatedCharacterTranslation(
  existing: CharacterSetting,
  translationUpdate: string | undefined,
): Translation {
  if (translationUpdate === undefined) return existing.translation;
  return {
    id: existing.translation.id,
    translation: normalizeTranslationQuotes(translationUpdate),
    aiModelId: existing.translation.aiModelId,
  };
}

function buildUpdatedCharacterAliases(
  aliasUpdates: Array<{ name: string; translation: string }>,
  existingChar: CharacterSetting,
): Alias[] {
  const out: Alias[] = [];
  for (const aliasData of aliasUpdates) {
    if (!aliasData.name.trim()) continue;
    const existingAlias = (existingChar.aliases || []).find((a) => a.name === aliasData.name);
    out.push({
      name: aliasData.name,
      translation: {
        id: existingAlias?.translation.id ?? generateShortId(),
        translation: normalizeTranslationQuotes(aliasData.translation || aliasData.name),
        aiModelId: existingAlias?.translation.aiModelId ?? '',
      },
    });
  }
  return out;
}

function composeUpdatedCharacter(
  existing: CharacterSetting,
  updates: {
    name?: string;
    sex?: 'male' | 'female' | 'other' | undefined;
    description?: string;
    speakingStyle?: string;
  },
  updatedTranslation: Translation,
  updatedAliases: Alias[],
): CharacterSetting {
  const updatedChar: CharacterSetting = {
    id: existing.id,
    name: updates.name ?? existing.name,
    sex: updates.sex !== undefined ? updates.sex : existing.sex,
    translation: updatedTranslation,
    aliases: updatedAliases,
    description: existing.description,
    speakingStyle: existing.speakingStyle,
  };
  if (updates.description !== undefined) {
    if (updates.description) updatedChar.description = updates.description;
    else delete updatedChar.description;
  }
  if (updates.speakingStyle !== undefined) {
    if (updates.speakingStyle) updatedChar.speakingStyle = updates.speakingStyle;
    else delete updatedChar.speakingStyle;
  }
  return updatedChar;
}

/**
 * add/update 角色设定共用的扁平数据形状（别名里 translation 已拉平成字符串）。
 * add 需要 name，update 全部字段都是可选的 — 通过 Partial 派生 update 的入参类型。
 */
type CharacterMutationFields = {
  name: string;
  sex?: 'male' | 'female' | 'other' | undefined;
  translation?: string;
  description?: string;
  speakingStyle?: string;
  aliases?: Array<{ name: string; translation: string }>;
};

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
    charData: CharacterMutationFields,
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const currentSettings = book.characterSettings || [];
    const currentTerminologies = book.terminologies || [];

    // 检查是否已存在同名角色
    const existingChar = currentSettings.find((c) => c.name === charData.name);
    if (existingChar) {
      throw new Error(`角色 "${charData.name}" 已存在`);
    }

    // 检查角色主名 / 别名不与已有术语重复
    assertNameNotTerm(currentTerminologies, charData.name, 'name');
    if (charData.aliases) {
      for (const aliasData of charData.aliases) {
        const aliasName = aliasData.name.trim();
        if (!aliasName) continue;
        assertNameNotTerm(currentTerminologies, aliasName, 'alias');
      }
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
    updates: Partial<CharacterMutationFields>,
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    if (!book) throw new Error(`书籍不存在: ${bookId}`);

    const currentSettings = book.characterSettings || [];
    const currentTerminologies = book.terminologies || [];
    const existingChar = currentSettings.find((c) => c.id === charId);
    if (!existingChar) throw new Error(`角色不存在: ${charId}`);

    assertCharacterNameAvailable(currentSettings, charId, updates.name, existingChar.name);

    // 改名 / 别名变更时，校验不与已有术语重复
    if (updates.name && updates.name !== existingChar.name) {
      assertNameNotTerm(currentTerminologies, updates.name, 'name');
    }
    if (updates.aliases) {
      for (const aliasData of updates.aliases) {
        const aliasName = aliasData.name.trim();
        if (!aliasName) continue;
        assertNameNotTerm(currentTerminologies, aliasName, 'alias');
      }
    }

    const updatedTranslation = buildUpdatedCharacterTranslation(existingChar, updates.translation);
    const updatedAliases =
      updates.aliases === undefined
        ? existingChar.aliases || []
        : buildUpdatedCharacterAliases(updates.aliases, existingChar);

    const updatedChar = composeUpdatedCharacter(existingChar, updates, updatedTranslation, updatedAliases);

    const updatedSettings = currentSettings.map((c) => (c.id === charId ? updatedChar : c));
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
    SettingsService.downloadJson(
      characterSettings,
      filename || `characters-${new Date().toISOString().split('T')[0]}.json`,
    );
  }

  static async importCharacterSettingsFromFile(file: File): Promise<CharacterSetting[]> {
    const data = await SettingsService.readJsonFile(file);

    if (!Array.isArray(data)) {
      throw new Error('文件格式错误：应为角色设定数组');
    }

    for (const char of data) {
      if (
        !char.id ||
        !char.name ||
        !char.translation ||
        typeof char.translation.translation !== 'string'
      ) {
        throw new Error('文件格式错误：角色设定数据不完整');
      }
    }

    return data as CharacterSetting[];
  }
}
