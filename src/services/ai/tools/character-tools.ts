import { CharacterSettingService } from 'src/services/character-setting-service';
import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import { useBooksStore } from 'src/stores/books';
import type { CharacterSetting } from 'src/models/novel';
import type { ToolDefinition } from './types';

export const characterTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_character',
        description:
          '创建新角色设定。⚠️ 重要：在创建新角色之前，必须使用 list_characters 或 get_character 工具检查该角色是否已存在，或者是否应该是已存在角色的别名。如果发现该角色实际上是已存在角色的别名，应该使用 update_character 工具将新名称添加为别名，而不是创建新角色。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '角色名称（日文原文，必须是全名，例如"田中太郎"而不是"田中"或"太郎"）',
            },
            translation: {
              type: 'string',
              description: '角色的中文翻译（全名的翻译）',
            },
            sex: {
              type: 'string',
              enum: ['male', 'female', 'other'],
              description: '角色性别（可选）',
            },
            description: {
              type: 'string',
              description: '角色的详细描述（可选）',
            },
            speaking_style: {
              type: 'string',
              description: '角色的说话口吻（可选）。例如：粗鲁、古风、口癖(desu/nya)等',
            },
            aliases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description:
                      '别名名称（日文原文，通常是名字或姓氏的单独部分，例如"田中"、"太郎"）',
                  },
                  translation: {
                    type: 'string',
                    description: '别名的中文翻译',
                  },
                },
                required: ['name', 'translation'],
              },
              description:
                '角色别名数组（可选）。别名应该包括角色的名字和姓氏的单独部分，例如如果角色全名是"田中太郎"，别名应该包括"田中"和"太郎"',
            },
          },
          required: ['name', 'translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { name, translation, sex, description, speaking_style, aliases } = args;
      if (!name || !translation) {
        throw new Error('角色名称和翻译不能为空');
      }

      const characterData: {
        name: string;
        translation: string;
        sex?: 'male' | 'female' | 'other';
        description?: string;
        speakingStyle?: string;
        aliases?: Array<{ name: string; translation: string }>;
      } = {
        name,
        translation: normalizeTranslationQuotes(translation),
      };

      // 规范化别名翻译
      if (aliases && Array.isArray(aliases)) {
        characterData.aliases = aliases.map((alias) => ({
          name: alias.name,
          translation: normalizeTranslationQuotes(alias.translation),
        }));
      }

      if (sex) characterData.sex = sex as 'male' | 'female' | 'other';
      if (description) characterData.description = description;
      if (speaking_style) characterData.speakingStyle = speaking_style;

      const character = await CharacterSettingService.addCharacterSetting(bookId, characterData);

      if (onAction) {
        onAction({
          type: 'create',
          entity: 'character',
          data: character,
        });
      }

      return JSON.stringify({
        success: true,
        message: '角色创建成功',
        character: {
          id: character.id,
          name: character.name,
          translation: character.translation.translation,
          sex: character.sex,
          description: character.description,
          speaking_style: character.speakingStyle,
          aliases: character.aliases?.map((alias) => ({
            name: alias.name,
            translation: alias.translation.translation,
          })),
          occurrences_count: character.occurrences.length,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_character',
        description:
          '根据角色名称获取角色信息。在翻译过程中，如果遇到已存在的角色，可以使用此工具查询其翻译和设定。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '角色名称（日文原文）',
            },
          },
          required: ['name'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { name } = args;
      if (!name) {
        throw new Error('角色名称不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const character = book.characterSettings?.find((c) => c.name === name);

      if (!character) {
        return JSON.stringify({
          success: false,
          message: `角色 "${name}" 不存在`,
        });
      }

      return JSON.stringify({
        success: true,
        character: {
          id: character.id,
          name: character.name,
          translation: character.translation.translation,
          sex: character.sex,
          description: character.description,
          speaking_style: character.speakingStyle,
          aliases: character.aliases?.map((alias) => ({
            name: alias.name,
            translation: alias.translation.translation,
          })),
          occurrences: character.occurrences,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_character',
        description:
          '更新现有角色的翻译、描述、性别或别名。当发现角色的信息需要修正时，可以使用此工具更新。⚠️ 重要：在更新别名时，必须确保提供的别名数组只包含该角色自己的别名，不能包含其他角色的名称或别名。在更新前，应使用 list_characters 或 get_character 工具检查每个别名是否属于其他角色。',
        parameters: {
          type: 'object',
          properties: {
            character_id: {
              type: 'string',
              description: '角色 ID（从 get_character 或 list_characters 获取）',
            },
            name: {
              type: 'string',
              description: '新的角色名称（可选，必须是全名，例如"田中太郎"而不是"田中"或"太郎"）',
            },
            translation: {
              type: 'string',
              description: '新的翻译文本（可选）',
            },
            sex: {
              type: 'string',
              enum: ['male', 'female', 'other'],
              description: '新的性别（可选）',
            },
            description: {
              type: 'string',
              description: '新的描述（可选，设置为空字符串可删除描述）',
            },
            speaking_style: {
              type: 'string',
              description: '新的说话口吻（可选，设置为空字符串可删除口吻）',
            },
            aliases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: '别名名称（日文原文）',
                  },
                  translation: {
                    type: 'string',
                    description: '别名的中文翻译',
                  },
                },
                required: ['name', 'translation'],
              },
              description:
                '新的别名数组（可选，将替换所有现有别名）。别名应该包括角色的名字和姓氏的单独部分，例如如果角色全名是"田中太郎"，别名应该包括"田中"和"太郎"。⚠️ 重要：必须确保数组中的每个别名都属于当前角色，不能包含其他角色的名称或别名。在更新前应使用 list_characters 检查每个别名是否属于其他角色。',
            },
          },
          required: ['character_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { character_id, name, translation, sex, description, speaking_style, aliases } = args;
      if (!character_id) {
        throw new Error('角色 ID 不能为空');
      }

      const updates: {
        name?: string;
        sex?: 'male' | 'female' | 'other' | undefined;
        translation?: string;
        description?: string;
        speakingStyle?: string;
        aliases?: Array<{ name: string; translation: string }>;
      } = {};

      if (name !== undefined) {
        updates.name = name;
      }
      if (translation !== undefined) {
        updates.translation = normalizeTranslationQuotes(translation);
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
        updates.aliases = (aliases as Array<{ name: string; translation: string }>).map(
          (alias) => ({
            name: alias.name,
            translation: normalizeTranslationQuotes(alias.translation),
          }),
        );
      }

      const character = await CharacterSettingService.updateCharacterSetting(
        bookId,
        character_id,
        updates,
      );

      if (onAction) {
        onAction({
          type: 'update',
          entity: 'character',
          data: character,
        });
      }

      return JSON.stringify({
        success: true,
        message: '角色更新成功',
        character: {
          id: character.id,
          name: character.name,
          translation: character.translation.translation,
          sex: character.sex,
          description: character.description,
          speaking_style: character.speakingStyle,
          aliases: character.aliases?.map((alias) => ({
            name: alias.name,
            translation: alias.translation.translation,
          })),
          occurrences_count: character.occurrences.length,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_character',
        description: '删除角色设定。当确定某个角色不再需要时，可以使用此工具删除。',
        parameters: {
          type: 'object',
          properties: {
            character_id: {
              type: 'string',
              description: '角色 ID（从 get_character 或 list_characters 获取）',
            },
          },
          required: ['character_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { character_id } = args;
      if (!character_id) {
        throw new Error('角色 ID 不能为空');
      }

      // 在删除前获取角色信息，以便在 toast 中显示详细信息
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const character = book?.characterSettings?.find((c) => c.id === character_id);

      await CharacterSettingService.deleteCharacterSetting(bookId, character_id);

      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'character',
          data: character ? { id: character_id, name: character.name } : { id: character_id },
        });
      }

      return JSON.stringify({
        success: true,
        message: '角色删除成功',
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_characters_by_keyword',
        description:
          '根据关键词搜索角色。可以搜索角色主名称、别名或翻译。支持可选参数 translationOnly 只返回有翻译的角色。',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '搜索关键词',
            },
            translation_only: {
              type: 'boolean',
              description: '是否只返回有翻译的角色（默认 false）',
            },
          },
          required: ['keyword'],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { keyword, translation_only = false } = args;
      if (keyword === undefined || keyword === null) {
        throw new Error('关键词不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const allCharacters = book.characterSettings || [];
      const keywordLower = keyword.toLowerCase();

      const filteredCharacters = allCharacters.filter((char) => {
        // 搜索角色名称
        const nameMatch = char.name.toLowerCase().includes(keywordLower);
        // 搜索翻译
        const translationMatch = char.translation?.translation
          ?.toLowerCase()
          .includes(keywordLower);
        // 搜索别名
        const aliasMatch = char.aliases?.some(
          (alias) =>
            alias.name.toLowerCase().includes(keywordLower) ||
            alias.translation?.translation?.toLowerCase().includes(keywordLower),
        );

        if (translation_only) {
          // 如果设置了只返回有翻译的，则必须同时有翻译且匹配
          return (translationMatch || aliasMatch) && char.translation?.translation;
        }

        // 否则只要名称、翻译或别名匹配即可
        return nameMatch || translationMatch || aliasMatch;
      });

      return JSON.stringify({
        success: true,
        characters: filteredCharacters.map((char: CharacterSetting) => ({
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
          occurrences_count: char.occurrences.length,
        })),
        count: filteredCharacters.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_characters',
        description:
          '列出所有角色设定。在翻译开始前，可以使用此工具获取所有已存在的角色，以便在翻译时保持一致性。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '返回的角色数量限制（可选，默认返回所有）',
            },
          },
          required: [],
        },
      },
    },
    handler: (args, { bookId }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { limit } = args;
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      let characters: CharacterSetting[] = book.characterSettings || [];
      if (limit && limit > 0) {
        characters = characters.slice(0, limit);
      }

      return JSON.stringify({
        success: true,
        characters: characters.map((char) => ({
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
          occurrences_count: char.occurrences.length,
        })),
        total: book.characterSettings?.length || 0,
      });
    },
  },
];
