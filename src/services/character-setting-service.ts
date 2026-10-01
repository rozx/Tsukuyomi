import { LocalizedError } from 'src/utils/localized-error';
import { v4 } from 'uuid';
import type { AppLocale } from 'src/models/locale';
import { buildNameTranslation } from './localization/selection';
import type { CharacterSetting, Alias, Terminology, Translation } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { SettingsService } from 'src/services/settings-service';
import { UniqueIdGenerator, extractIds } from 'src/utils';

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
  if (nameConflict)
    throw new LocalizedError('CHARACTER_NAME_CONFLICT', 'aiEntityFeedback.characterDuplicate', {
      name: newName,
    });
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
    throw new LocalizedError(
      kind === 'name' ? 'CHARACTER_TERM_CONFLICT' : 'ALIAS_TERM_CONFLICT',
      kind === 'name'
        ? 'aiEntityFeedback.characterConflictsTerm'
        : 'aiEntityFeedback.aliasConflictsTerm',
      { name },
    );
  }
}

function buildUpdatedCharacterAliases(
  aliasUpdates: Array<{ id?: string; name: string; translation?: string }>,
  existingChar: CharacterSetting,
  language: AppLocale,
): Alias[] {
  const out: Alias[] = [];
  for (const aliasData of aliasUpdates) {
    if (!aliasData.name.trim()) continue;
    const matches = (existingChar.aliases || []).filter((a) => a.name === aliasData.name);
    if (!aliasData.id && matches.length > 1)
      throw new LocalizedError('AMBIGUOUS_ALIAS_NAME', 'aiEntityFeedback.ambiguousAlias');
    const existingAlias = aliasData.id
      ? existingChar.aliases.find((a) => a.id === aliasData.id)
      : matches[0];
    if (aliasData.id && !existingAlias)
      throw new LocalizedError('ALIAS_MISSING', 'aiEntityFeedback.aliasMissing');
    out.push({
      ...existingAlias,
      id: existingAlias?.id ?? v4(),
      name: aliasData.name,
      translation: buildNameTranslation(existingAlias, aliasData.translation, language),
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
    ...existing,
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
  aliases?: Array<{ id?: string; name: string; translation?: string }>;
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
    targetLanguage?: AppLocale,
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      throw new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId });
    }

    const language = targetLanguage ?? book.targetLanguage ?? 'zh-CN';
    const currentSettings = book.characterSettings || [];
    const currentTerminologies = book.terminologies || [];

    // 检查是否已存在同名角色
    const existingChar = currentSettings.find((c) => c.name === charData.name);
    if (existingChar) {
      throw new LocalizedError('CHARACTER_NAME_CONFLICT', 'aiEntityFeedback.characterDuplicate', {
        name: charData.name,
      });
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
    const translation = buildNameTranslation(undefined, charData.translation, language);

    // 处理别名
    const aliases: Alias[] = [];
    if (charData.aliases && charData.aliases.length > 0) {
      for (const aliasData of charData.aliases) {
        if (!aliasData.name.trim()) continue;

        aliases.push({
          id: v4(),
          name: aliasData.name,
          translation: buildNameTranslation(undefined, aliasData.translation, language),
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
    await booksStore.updateBook(
      bookId,
      {
        characterSettings: updatedSettings,
        lastEdited: new Date(),
      },
      {
        targetLanguage: language,
        ...(targetLanguage === undefined ? { expectedBookLanguage: language } : {}),
      },
    );

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
    targetLanguage?: AppLocale,
  ): Promise<CharacterSetting> {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    if (!book)
      throw new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId });

    const language = targetLanguage ?? book.targetLanguage ?? 'zh-CN';
    const currentSettings = book.characterSettings || [];
    const currentTerminologies = book.terminologies || [];
    const existingChar = currentSettings.find((c) => c.id === charId);
    if (!existingChar)
      throw new LocalizedError('CHARACTER_NOT_FOUND', 'aiEntityFeedback.characterMissing', {
        id: charId,
      });

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

    const updatedTranslation = buildNameTranslation(existingChar, updates.translation, language);
    const updatedAliases =
      updates.aliases === undefined
        ? existingChar.aliases || []
        : buildUpdatedCharacterAliases(updates.aliases, existingChar, language);

    const updatedChar = composeUpdatedCharacter(
      existingChar,
      updates,
      updatedTranslation,
      updatedAliases,
    );

    const updatedSettings = currentSettings.map((c) => (c.id === charId ? updatedChar : c));
    await booksStore.updateBook(
      bookId,
      {
        characterSettings: updatedSettings,
        lastEdited: new Date(),
      },
      {
        targetLanguage: language,
        ...(targetLanguage === undefined ? { expectedBookLanguage: language } : {}),
      },
    );

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
      throw new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId });
    }

    const currentSettings = book.characterSettings || [];
    const charExists = currentSettings.some((c) => c.id === charId);

    if (!charExists) {
      throw new LocalizedError('CHARACTER_NOT_FOUND', 'aiEntityFeedback.characterMissing', {
        id: charId,
      });
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
      throw new LocalizedError('CHARACTER_FILE_SHAPE', 'aiEntityFeedback.characterFileShape');
    }

    for (const char of data) {
      if (
        !char.id ||
        !char.name ||
        !char.translation ||
        typeof char.translation.translation !== 'string'
      ) {
        throw new LocalizedError(
          'CHARACTER_FILE_INCOMPLETE',
          'aiEntityFeedback.characterFileIncomplete',
        );
      }
    }

    return data as CharacterSetting[];
  }
}
