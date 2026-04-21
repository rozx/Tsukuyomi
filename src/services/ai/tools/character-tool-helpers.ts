import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import type { CharacterSetting } from 'src/models/novel';

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
