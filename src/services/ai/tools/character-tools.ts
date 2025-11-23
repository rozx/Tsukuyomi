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
          '鍒涘缓鏂拌鑹茶瀹氥€傗殸锔?閲嶈锛氬湪鍒涘缓鏂拌鑹蹭箣鍓嶏紝蹇呴』浣跨敤 list_characters 鎴?get_character 宸ュ叿妫€鏌ヨ瑙掕壊鏄惁宸插瓨鍦紝鎴栬€呮槸鍚﹀簲璇ユ槸宸插瓨鍦ㄨ鑹茬殑鍒悕銆傚鏋滃彂鐜拌瑙掕壊瀹為檯涓婃槸宸插瓨鍦ㄨ鑹茬殑鍒悕锛屽簲璇ヤ娇鐢?update_character 宸ュ叿灏嗘柊鍚嶇О娣诲姞涓哄埆鍚嶏紝鑰屼笉鏄垱寤烘柊瑙掕壊銆?,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '瑙掕壊鍚嶇О锛堟棩鏂囧師鏂囷紝蹇呴』鏄叏鍚嶏紝渚嬪"鐢颁腑澶儙"鑰屼笉鏄?鐢颁腑"鎴?澶儙"锛?,
            },
            translation: {
              type: 'string',
              description: '瑙掕壊鐨勪腑鏂囩炕璇戯紙鍏ㄥ悕鐨勭炕璇戯級',
            },
            sex: {
              type: 'string',
              enum: ['male', 'female', 'other'],
              description: '瑙掕壊鎬у埆锛堝彲閫夛級',
            },
            description: {
              type: 'string',
              description: '瑙掕壊鐨勮缁嗘弿杩帮紙鍙€夛級',
            },
            speaking_style: {
              type: 'string',
              description: '瑙掕壊鐨勮璇濆彛鍚伙紙鍙€夛級銆備緥濡傦細鍌插▏銆佸彜椋庛€佸彛鐧?desu/nya)绛?,
            },
            aliases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description:
                      '鍒悕鍚嶇О锛堟棩鏂囧師鏂囷紝閫氬父鏄悕瀛楁垨濮撴皬鐨勫崟鐙儴鍒嗭紝渚嬪"鐢颁腑"銆?澶儙"锛?,
                  },
                  translation: {
                    type: 'string',
                    description: '鍒悕鐨勪腑鏂囩炕璇?,
                  },
                },
                required: ['name', 'translation'],
              },
              description:
                '瑙掕壊鍒悕鏁扮粍锛堝彲閫夛級銆傚埆鍚嶅簲璇ュ寘鎷鑹茬殑鍚嶅瓧鍜屽姘忕殑鍗曠嫭閮ㄥ垎锛屼緥濡傚鏋滆鑹插叏鍚嶆槸"鐢颁腑澶儙"锛屽埆鍚嶅簲璇ュ寘鎷?鐢颁腑"鍜?澶儙"',
            },
          },
          required: ['name', 'translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { name, translation, sex, description, speaking_style, aliases } = args;
      if (!name || !translation) {
        throw new Error('瑙掕壊鍚嶇О鍜岀炕璇戜笉鑳戒负绌?);
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

      // 瑙勮寖鍖栧埆鍚嶇炕璇?      if (aliases && Array.isArray(aliases)) {
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
        message: '瑙掕壊鍒涘缓鎴愬姛',
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
          '鏍规嵁瑙掕壊鍚嶇О鑾峰彇瑙掕壊淇℃伅銆傚湪缈昏瘧杩囩▼涓紝濡傛灉閬囧埌宸插瓨鍦ㄧ殑瑙掕壊锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鏌ヨ鍏剁炕璇戝拰璁惧畾銆?,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '瑙掕壊鍚嶇О锛堟棩鏂囧師鏂囷級',
            },
          },
          required: ['name'],
        },
      },
    },
    handler: (args, { bookId }) => {
      const { name } = args;
      if (!name) {
        throw new Error('瑙掕壊鍚嶇О涓嶈兘涓虹┖');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`涔︾睄涓嶅瓨鍦? ${bookId}`);
      }

      const character = book.characterSettings?.find((c) => c.name === name);

      if (!character) {
        return JSON.stringify({
          success: false,
          message: `瑙掕壊 "${name}" 涓嶅瓨鍦╜,
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
          '鏇存柊鐜版湁瑙掕壊鐨勭炕璇戙€佹弿杩般€佹€у埆鎴栧埆鍚嶃€傚綋鍙戠幇瑙掕壊鐨勪俊鎭渶瑕佷慨姝ｆ椂锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鏇存柊銆傗殸锔?閲嶈锛氬湪鏇存柊鍒悕鏃讹紝蹇呴』纭繚鎻愪緵鐨勫埆鍚嶆暟缁勫彧鍖呭惈璇ヨ鑹茶嚜宸辩殑鍒悕锛屼笉鑳藉寘鍚叾浠栬鑹茬殑鍚嶇О鎴栧埆鍚嶃€傚湪鏇存柊鍓嶏紝搴斾娇鐢?list_characters 鎴?get_character 宸ュ叿妫€鏌ユ瘡涓埆鍚嶆槸鍚﹀睘浜庡叾浠栬鑹层€?,
        parameters: {
          type: 'object',
          properties: {
            character_id: {
              type: 'string',
              description: '瑙掕壊 ID锛堜粠 get_character 鎴?list_characters 鑾峰彇锛?,
            },
            name: {
              type: 'string',
              description: '鏂扮殑瑙掕壊鍚嶇О锛堝彲閫夛紝蹇呴』鏄叏鍚嶏紝渚嬪"鐢颁腑澶儙"鑰屼笉鏄?鐢颁腑"鎴?澶儙"锛?,
            },
            translation: {
              type: 'string',
              description: '鏂扮殑缈昏瘧鏂囨湰锛堝彲閫夛級',
            },
            sex: {
              type: 'string',
              enum: ['male', 'female', 'other'],
              description: '鏂扮殑鎬у埆锛堝彲閫夛級',
            },
            description: {
              type: 'string',
              description: '鏂扮殑鎻忚堪锛堝彲閫夛紝璁剧疆涓虹┖瀛楃涓插彲鍒犻櫎鎻忚堪锛?,
            },
            speaking_style: {
              type: 'string',
              description: '鏂扮殑璇磋瘽鍙ｅ惢锛堝彲閫夛紝璁剧疆涓虹┖瀛楃涓插彲鍒犻櫎鍙ｅ惢锛?,
            },
            aliases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: '鍒悕鍚嶇О锛堟棩鏂囧師鏂囷級',
                  },
                  translation: {
                    type: 'string',
                    description: '鍒悕鐨勪腑鏂囩炕璇?,
                  },
                },
                required: ['name', 'translation'],
              },
              description:
                '鏂扮殑鍒悕鏁扮粍锛堝彲閫夛紝灏嗘浛鎹㈡墍鏈夌幇鏈夊埆鍚嶏級銆傚埆鍚嶅簲璇ュ寘鎷鑹茬殑鍚嶅瓧鍜屽姘忕殑鍗曠嫭閮ㄥ垎锛屼緥濡傚鏋滆鑹插叏鍚嶆槸"鐢颁腑澶儙"锛屽埆鍚嶅簲璇ュ寘鎷?鐢颁腑"鍜?澶儙"銆傗殸锔?閲嶈锛氬繀椤荤‘淇濇暟缁勪腑鐨勬瘡涓埆鍚嶉兘灞炰簬褰撳墠瑙掕壊锛屼笉鑳藉寘鍚叾浠栬鑹茬殑鍚嶇О鎴栧埆鍚嶃€傚湪鏇存柊鍓嶅簲浣跨敤 list_characters 妫€鏌ユ瘡涓埆鍚嶆槸鍚﹀睘浜庡叾浠栬鑹层€?,
            },
          },
          required: ['character_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { character_id, name, translation, sex, description, speaking_style, aliases } = args;
      if (!character_id) {
        throw new Error('瑙掕壊 ID 涓嶈兘涓虹┖');
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
        message: '瑙掕壊鏇存柊鎴愬姛',
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
        description: '鍒犻櫎瑙掕壊璁惧畾銆傚綋纭畾鏌愪釜瑙掕壊涓嶅啀闇€瑕佹椂锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鍒犻櫎銆?,
        parameters: {
          type: 'object',
          properties: {
            character_id: {
              type: 'string',
              description: '瑙掕壊 ID锛堜粠 get_character 鎴?list_characters 鑾峰彇锛?,
            },
          },
          required: ['character_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { character_id } = args;
      if (!character_id) {
        throw new Error('瑙掕壊 ID 涓嶈兘涓虹┖');
      }

      // 鍦ㄥ垹闄ゅ墠鑾峰彇瑙掕壊淇℃伅锛屼互渚垮湪 toast 涓樉绀鸿缁嗕俊鎭?      const booksStore = useBooksStore();
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
        message: '瑙掕壊鍒犻櫎鎴愬姛',
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_characters_by_keyword',
        description:
          '鏍规嵁鍏抽敭璇嶆悳绱㈣鑹层€傚彲浠ユ悳绱㈣鑹蹭富鍚嶇О銆佸埆鍚嶆垨缈昏瘧銆傛敮鎸佸彲閫夊弬鏁?translationOnly 鍙繑鍥炴湁缈昏瘧鐨勮鑹层€?,
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '鎼滅储鍏抽敭璇?,
            },
            translation_only: {
              type: 'boolean',
              description: '鏄惁鍙繑鍥炴湁缈昏瘧鐨勮鑹诧紙榛樿 false锛?,
            },
          },
          required: ['keyword'],
        },
      },
    },
    handler: (args, { bookId }) => {
      const { keyword, translation_only = false } = args;
      if (keyword === undefined || keyword === null) {
        throw new Error('鍏抽敭璇嶄笉鑳戒负绌?);
      }

      const characters = CharacterSettingService.searchByKeyword(bookId, keyword, {
        translationOnly: translation_only,
      });

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
        count: characters.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_characters',
        description:
          '鍒楀嚭鎵€鏈夎鑹茶瀹氥€傚湪缈昏瘧寮€濮嬪墠锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鑾峰彇鎵€鏈夊凡瀛樺湪鐨勮鑹诧紝浠ヤ究鍦ㄧ炕璇戞椂淇濇寔涓€鑷存€с€?,
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '杩斿洖鐨勮鑹叉暟閲忛檺鍒讹紙鍙€夛紝榛樿杩斿洖鎵€鏈夛級',
            },
          },
          required: [],
        },
      },
    },
    handler: (args, { bookId }) => {
      const { limit } = args;
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`涔︾睄涓嶅瓨鍦? ${bookId}`);
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
