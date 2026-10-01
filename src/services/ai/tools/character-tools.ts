import { singleIdToolParameters } from './tool-localization';
import { bookToolContext, fuzzyMatches } from './tool-feedback';
import { toolDefinition } from './tool-localization';
import { AGENT_LOCALE, translateText } from 'src/i18n/translate';
import { LocalizedError } from 'src/utils/localized-error';
import { describeTool, stringToolParameter } from './tool-localization';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { useBooksStore } from 'src/stores/books';
import type { CharacterSetting } from 'src/models/novel';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';
import { findUniqueCharactersInText } from 'src/utils/text-matcher';
import { searchRelatedMemoriesHybrid } from './memory-helper';
import {
  filterEntitiesForChapter,
  requireValidKeywords,
  resolveBookSync,
} from './chapter-scope-helpers';
import {
  assertAliasesNotBlank,
  normalizeAliasList,
  characterEditContext,
  resolveCharacterForTool,
  serializeCharacterForTool,
} from './character-tool-helpers';

/** 回退搜索最大返回条目数，避免 token 膨胀 */
const MAX_FALLBACK_RESULTS = 10;

function savedCharacter(bookId: string, id: string): CharacterSetting {
  const character = resolveCharacterForTool(bookId, id).character;
  if (!character)
    throw new LocalizedError('CHARACTER_WRITE_REJECTED', 'aiEntityFeedback.characterWriteRejected');
  return character;
}

export const characterTools: ToolDefinition[] = [
  {
    definition: toolDefinition('create_character', {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: describeTool('create_character.parameters.properties.name'),
        },
        translation: {
          type: 'string',
          description: describeTool('create_character.parameters.properties.translation'),
        },
        sex: {
          type: 'string',
          enum: ['male', 'female', 'other'],
          description: describeTool('create_character.parameters.properties.sex'),
        },
        description: {
          type: 'string',
          description: describeTool('create_character.parameters.properties.description'),
        },
        speaking_style: {
          type: 'string',
          description: describeTool('create_character.parameters.properties.speaking_style'),
        },
        aliases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: describeTool(
                  'create_character.parameters.properties.aliases.items.properties.id',
                ),
              },
              name: {
                type: 'string',
                description: describeTool(
                  'create_character.parameters.properties.aliases.items.properties.name',
                ),
              },
              translation: {
                type: 'string',
                description: describeTool(
                  'create_character.parameters.properties.aliases.items.properties.translation',
                ),
              },
            },
            required: ['name', 'translation'],
          },
          description: describeTool('create_character.parameters.properties.aliases'),
        },
      },
      required: ['name', 'translation'],
    }),
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, language } = bookToolContext(context);
      const parsedArgs = parseToolArgs<{
        name: string;
        translation: string;
        sex?: string;
        description?: string;
        speaking_style?: string;
        aliases?: Array<{ id?: string; name: string; translation: string }>;
      }>(args);
      const { name, translation, sex, description, speaking_style, aliases } = parsedArgs;
      if (!name?.trim() || !translation?.trim()) {
        throw new LocalizedError(
          'CHARACTER_FIELDS_REQUIRED',
          'aiEntityFeedback.characterNameAndTranslation',
          {},
        );
      }
      assertAliasesNotBlank(aliases);

      const characterData: {
        name: string;
        translation: string;
        sex?: 'male' | 'female' | 'other';
        description?: string;
        speakingStyle?: string;
        aliases?: Array<{ id?: string; name: string; translation: string }>;
      } = {
        name: name.trim(),
        translation: translation.trim(),
      };

      // 规范化别名翻译
      if (aliases && Array.isArray(aliases)) {
        characterData.aliases = normalizeAliasList(aliases, language);
      }

      if (sex) characterData.sex = sex as 'male' | 'female' | 'other';
      if (description) characterData.description = description;
      if (speaking_style) characterData.speakingStyle = speaking_style;

      const created = await CharacterSettingService.addCharacterSetting(
        bookId,
        characterData,
        language,
      );

      const character = savedCharacter(bookId, created.id);

      if (onAction) {
        onAction({
          type: 'create',
          entity: 'character',
          data: character,
        });
      }

      return JSON.stringify({
        success: true,
        message: translateText(AGENT_LOCALE, 'aiEntityFeedback.characterCreated'),
        character: serializeCharacterForTool(character, language),
      });
    },
  },
  {
    definition: toolDefinition('get_character', {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: describeTool('get_character.parameters.properties.name'),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool('get_character.parameters.properties.include_memory'),
        },
      },
      required: ['name'],
    }),
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, language } = bookToolContext(context);
      const parsedArgs = parseToolArgs<{ name: string; include_memory?: boolean }>(args);
      const { include_memory = true } = parsedArgs;
      // 类型守卫：确保 name 为有效字符串
      const name = typeof parsedArgs.name === 'string' ? parsedArgs.name.trim() : '';
      if (!name) {
        throw new LocalizedError(
          'CHARACTER_NAME_REQUIRED',
          'aiEntityFeedback.characterNameRequired',
          {},
        );
      }

      const book = resolveBookSync(bookId);

      const exactMatches = book.characterSettings?.filter((c) => c.name === name) ?? [];
      if (exactMatches.length > 1)
        throw new LocalizedError(
          'AMBIGUOUS_CHARACTER_NAME',
          'aiEntityFeedback.ambiguousCharacter',
          {},
        );
      const character = exactMatches[0];

      if (!character) {
        // Fallback search
        const keywordLower = name.toLowerCase();
        const allCharacters = book.characterSettings || [];
        const fallbackMatches = allCharacters.filter((char) => {
          if (char.name.toLowerCase().includes(keywordLower)) return true;
          if (getNameTranslation(char, language)?.translation.toLowerCase().includes(keywordLower))
            return true;
          if (
            char.aliases?.some(
              (alias) =>
                alias.name.toLowerCase().includes(keywordLower) ||
                getNameTranslation(alias, language)
                  ?.translation.toLowerCase()
                  .includes(keywordLower),
            )
          ) {
            return true;
          }
          return false;
        });

        if (fallbackMatches.length > 0) {
          if (onAction) {
            onAction({
              type: 'read',
              entity: 'character',
              data: {
                character_name: name,
                tool_name: 'get_character (fallback search)',
              },
            });
          }

          // 限制返回条目数，避免 token 膨胀
          const { items: limitedMatches, ...matchSummary } = fuzzyMatches(
            fallbackMatches,
            MAX_FALLBACK_RESULTS,
            name,
          );

          return JSON.stringify({
            ...matchSummary,
            characters: limitedMatches.map((char) => serializeCharacterForTool(char, language)),
          });
        }

        return JSON.stringify({
          success: false,
          error_code: 'CHARACTER_NOT_FOUND',
          message: translateText(AGENT_LOCALE, 'aiEntityFeedback.characterNoMatch', { name }),
        });
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'character',
          data: {
            character_name: name,
            tool_name: 'get_character',
          },
        });
      }

      // 搜索相关记忆
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        const aliasKeywords = character.aliases?.map((alias) => alias.name) || [];
        relatedMemories = await searchRelatedMemoriesHybrid(
          bookId,
          [{ type: 'character', id: character.id }],
          [name, ...aliasKeywords],
          5,
          language,
        );
      }

      return JSON.stringify({
        success: true,
        character: serializeCharacterForTool(character, language),
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
      });
    },
  },
  {
    definition: toolDefinition('update_character', {
      type: 'object',
      properties: {
        character_id: stringToolParameter('update_character.parameters.properties.character_id'),
        name: {
          type: 'string',
          description: describeTool('update_character.parameters.properties.name'),
        },
        translation: {
          type: 'string',
          description: describeTool('update_character.parameters.properties.translation'),
        },
        sex: {
          type: 'string',
          enum: ['male', 'female', 'other'],
          description: describeTool('update_character.parameters.properties.sex'),
        },
        description: {
          type: 'string',
          description: describeTool('update_character.parameters.properties.description'),
        },
        speaking_style: {
          type: 'string',
          description: describeTool('update_character.parameters.properties.speaking_style'),
        },
        aliases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: describeTool(
                  'update_character.parameters.properties.aliases.items.properties.id',
                ),
              },
              name: {
                type: 'string',
                description: describeTool(
                  'update_character.parameters.properties.aliases.items.properties.name',
                ),
              },
              translation: {
                type: 'string',
                description: describeTool(
                  'update_character.parameters.properties.aliases.items.properties.translation',
                ),
              },
            },
            required: ['name', 'translation'],
          },
          description: describeTool('update_character.parameters.properties.aliases'),
        },
      },
      required: ['character_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const { parsedArgs, bookId, onAction, language, character_id } = characterEditContext<{
        character_id: string;
        name?: string;
        translation?: string;
        sex?: string;
        description?: string;
        speaking_style?: string;
        aliases?: Array<{ id?: string; name: string; translation: string }>;
      }>(args, context);
      const { name, translation, sex, description, speaking_style, aliases } = parsedArgs;
      if (name !== undefined && !name.trim()) {
        throw new LocalizedError(
          'CHARACTER_NAME_REQUIRED',
          'aiEntityFeedback.characterNameRequired',
          {},
        );
      }
      if (translation !== undefined && translation !== '' && !translation.trim()) {
        throw new LocalizedError(
          'CHARACTER_TRANSLATION_REQUIRED',
          'aiEntityFeedback.characterTranslationRequired',
          {},
        );
      }

      if (aliases !== undefined) {
        assertAliasesNotBlank(aliases);
      }

      // 在更新前获取原始数据，用于 revert
      const { previousData } = resolveCharacterForTool(bookId, character_id);

      const updates: {
        name?: string;
        sex?: 'male' | 'female' | 'other' | undefined;
        translation?: string;
        description?: string;
        speakingStyle?: string;
        aliases?: Array<{ id?: string; name: string; translation: string }>;
      } = {};

      if (name !== undefined) {
        updates.name = name.trim();
      }
      if (translation !== undefined) {
        updates.translation = translation.trim();
      }
      if (sex !== undefined) {
        updates.sex = sex as 'male' | 'female' | 'other' | undefined;
      }
      if (description !== undefined) {
        updates.description = description;
      }
      if (speaking_style !== undefined) {
        updates.speakingStyle = speaking_style;
      }
      if (aliases !== undefined) {
        updates.aliases = normalizeAliasList(aliases, language);
      }

      const changed = await CharacterSettingService.updateCharacterSetting(
        bookId,
        character_id,
        updates,
        language,
      );

      const character = savedCharacter(bookId, changed.id);

      if (onAction) {
        onAction({
          type: 'update',
          entity: 'character',
          data: character,
          ...(previousData !== undefined ? { previousData } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: translateText(AGENT_LOCALE, 'aiEntityFeedback.characterUpdated'),
        character: serializeCharacterForTool(character, language),
      });
    },
  },
  {
    definition: toolDefinition(
      'delete_character',
      singleIdToolParameters('delete_character', 'character_id'),
    ),
    handler: async (args, context: ToolContext) => {
      const { parsedArgs, bookId, onAction, language, character_id } = characterEditContext<{
        character_id: string;
      }>(args, context);

      // 在删除前获取角色信息，以便在 toast 中显示详细信息和 revert
      const { character, previousData } = resolveCharacterForTool(bookId, character_id);

      await CharacterSettingService.deleteCharacterSetting(bookId, character_id);

      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'character',
          data: character ? { id: character_id, name: character.name } : { id: character_id },
          ...(previousData !== undefined ? { previousData } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: translateText(AGENT_LOCALE, 'aiEntityFeedback.characterDeleted'),
      });
    },
  },
  {
    definition: toolDefinition('search_characters_by_keywords', {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('search_characters_by_keywords.parameters.properties.keywords'),
        },
        translation_only: {
          type: 'boolean',
          description: describeTool(
            'search_characters_by_keywords.parameters.properties.translation_only',
          ),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool(
            'search_characters_by_keywords.parameters.properties.include_memory',
          ),
        },
      },
      required: ['keywords'],
    }),
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, language } = bookToolContext(context);
      const parsedArgs = parseToolArgs<{
        keywords: string[];
        translation_only?: boolean;
        include_memory?: boolean;
      }>(args);
      const { keywords, translation_only = false, include_memory = true } = parsedArgs;
      const validKeywords = requireValidKeywords(keywords);

      const book = resolveBookSync(bookId);

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'character',
          data: {
            tool_name: 'search_characters_by_keywords',
            keywords: validKeywords,
          },
        });
      }

      const allCharacters = book.characterSettings || [];
      const keywordsLower = validKeywords.map((k) => k.toLowerCase());

      const filteredCharacters = allCharacters.filter((char) => {
        // 搜索角色名称
        const nameMatch = keywordsLower.some((keyword) =>
          char.name.toLowerCase().includes(keyword),
        );
        // 搜索翻译
        const translationMatch = keywordsLower.some((keyword) =>
          getNameTranslation(char, language)?.translation.toLowerCase().includes(keyword),
        );
        // 搜索别名
        const aliasMatch = char.aliases?.some((alias) =>
          keywordsLower.some(
            (keyword) =>
              alias.name.toLowerCase().includes(keyword) ||
              getNameTranslation(alias, language)?.translation.toLowerCase().includes(keyword),
          ),
        );

        if (translation_only) {
          // 如果设置了只返回有翻译的，则必须同时有翻译且匹配
          return (
            (translationMatch || aliasMatch) && getNameTranslation(char, language)?.translation
          );
        }

        // 否则只要名称、翻译或别名匹配任一关键词即可（OR 逻辑）
        return nameMatch || translationMatch || aliasMatch;
      });

      // 搜索相关记忆
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        const attachments = filteredCharacters.map((char) => ({
          type: 'character' as const,
          id: char.id,
        }));
        relatedMemories = await searchRelatedMemoriesHybrid(
          bookId,
          attachments,
          validKeywords,
          5,
          language,
        );
      }

      return JSON.stringify({
        success: true,
        characters: filteredCharacters.map((char: CharacterSetting) =>
          serializeCharacterForTool(char, language),
        ),
        count: filteredCharacters.length,
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
      });
    },
  },
  {
    definition: toolDefinition('list_characters', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('list_characters.parameters.properties.chapter_id'),
        },
        all_chapters: {
          type: 'boolean',
          description: describeTool('list_characters.parameters.properties.all_chapters'),
        },
        limit: {
          type: 'number',
          description: describeTool('list_characters.parameters.properties.limit'),
        },
      },
      required: [],
    }),
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, language } = bookToolContext(context);
      const parsedArgs = parseToolArgs<{
        chapter_id?: string;
        all_chapters?: boolean;
        limit?: number;
      }>(args);
      const { chapter_id, all_chapters = false, limit } = parsedArgs;
      const book = resolveBookSync(bookId);

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'character',
          data: {
            tool_name: 'list_characters',
            chapter_id,
          },
        });
      }

      let characters: CharacterSetting[] = book.characterSettings || [];

      // 如果 all_chapters 为 false 且提供了 chapter_id，按章节文本过滤
      if (!all_chapters && chapter_id) {
        characters = await filterEntitiesForChapter(
          book,
          chapter_id,
          characters,
          findUniqueCharactersInText,
        );
      }

      if (limit && limit > 0) {
        characters = characters.slice(0, limit);
      }

      return JSON.stringify({
        success: true,
        characters: characters.map((char) => serializeCharacterForTool(char, language)),
        total: characters.length,
        all_characters_count: book.characterSettings?.length || 0,
        ...(chapter_id ? { chapter_id } : {}),
        ...(all_chapters ? { all_chapters: true } : {}),
      });
    },
  },
];
