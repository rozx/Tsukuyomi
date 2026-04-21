import { cloneDeep } from 'lodash';
import { useBooksStore } from 'src/stores/books';
import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import type { CharacterSetting, Novel } from 'src/models/novel';
import type { ToolContext } from './types';

/** 角色别名入参（工具层使用的扁平结构，翻译已是字符串） */
export interface CharacterAliasInput {
  name: string;
  translation: string;
}

/**
 * 校验别名数组：每个别名的 name 和 translation 都不能是空白字符串。
 * 不做存在性校验 —— 由调用方决定（create 要求 aliases 存在，update 允许 undefined）。
 */
export function assertAliasesNotBlank(aliases: CharacterAliasInput[] | undefined): void {
  if (!aliases || !Array.isArray(aliases)) return;
  const hasBlankAlias = aliases.some(
    (alias) => !alias?.name?.trim() || !alias?.translation?.trim(),
  );
  if (hasBlankAlias) {
    throw new Error('别名的名称和翻译不能为空');
  }
}

/**
 * 规范化别名数组：去除首尾空白并对翻译文本做引号规范化。
 * 调用前应先用 `assertAliasesNotBlank` 校验。
 */
export function normalizeAliasList(
  aliases: CharacterAliasInput[],
): CharacterAliasInput[] {
  return aliases.map((alias) => ({
    name: alias.name.trim(),
    translation: normalizeTranslationQuotes(alias.translation.trim()),
  }));
}

/**
 * 将 `CharacterSetting` 序列化为工具返回给 AI 的扁平 JSON 结构。
 * 所有 character* 工具的响应都使用这同一套字段命名（snake_case）。
 */
export function serializeCharacterForTool(char: CharacterSetting): {
  id: string;
  name: string;
  translation: string;
  sex: CharacterSetting['sex'];
  description: CharacterSetting['description'];
  speaking_style: CharacterSetting['speakingStyle'];
  aliases:
    | Array<{ name: string; translation: string }>
    | undefined;
} {
  return {
    id: char.id,
    name: char.name,
    translation: char.translation.translation,
    sex: char.sex,
    description: char.description,
    speaking_style: char.speakingStyle,
    aliases: char.aliases?.map((alias) => ({
      name: alias.name,
      translation: alias.translation.translation,
    })),
  };
}

/**
 * 查找角色并克隆原始数据，供 update / delete 工具在执行前抓取 previousData 做 revert。
 *
 * 两个 handler 之前各自重复了完全相同的四行：
 *   1. `useBooksStore()` 取 store；
 *   2. `getBookById(bookId)` 拿到书；
 *   3. 在 `book?.characterSettings` 里按 id 找角色；
 *   4. 用 `cloneDeep` 做一份原始数据快照。
 *
 * 这里统一抽出，返回 `{ book, character, previousData }` 三元组，调用方按需取用。
 */
/**
 * update_character / delete_character handler 的共用校验前置代码：
 * 从 context 读取 bookId / onAction，从 parsedArgs 读取 character_id，缺失则抛错。
 */
export function requireCharacterContext<T extends { character_id: string }>(
  context: ToolContext,
  parsedArgs: T,
): { bookId: string; onAction: ToolContext['onAction']; character_id: string } {
  const { bookId, onAction } = context;
  if (!bookId) {
    throw new Error('书籍 ID 不能为空');
  }
  const character_id = parsedArgs.character_id;
  if (!character_id) {
    throw new Error('角色 ID 不能为空');
  }
  return { bookId, onAction, character_id };
}

export function resolveCharacterForTool(
  bookId: string,
  characterId: string,
): {
  book: Novel | undefined;
  character: CharacterSetting | undefined;
  previousData: CharacterSetting | undefined;
} {
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  const character = book?.characterSettings?.find((c) => c.id === characterId);
  const previousData = character ? cloneDeep(character) : undefined;
  return { book, character, previousData };
}
