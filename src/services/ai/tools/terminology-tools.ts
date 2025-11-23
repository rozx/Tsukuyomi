import { TerminologyService } from 'src/services/terminology-service';
import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import { useBooksStore } from 'src/stores/books';
import type { Terminology } from 'src/models/novel';
import type { ToolDefinition } from './types';

export const terminologyTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_term',
        description: '鍒涘缓鏂版湳璇€傚綋缈昏瘧杩囩▼涓亣鍒版柊鐨勬湳璇椂锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鍒涘缓鏈璁板綍銆?,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '鏈鍚嶇О锛堟棩鏂囧師鏂囷級',
            },
            translation: {
              type: 'string',
              description: '鏈鐨勪腑鏂囩炕璇?,
            },
            description: {
              type: 'string',
              description: '鏈鐨勮缁嗘弿杩帮紙鍙€夛級',
            },
          },
          required: ['name', 'translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { name, translation, description } = args;
      if (!name || !translation) {
        throw new Error('鏈鍚嶇О鍜岀炕璇戜笉鑳戒负绌?);
      }

      const term = await TerminologyService.addTerminology(bookId, {
        name,
        translation: normalizeTranslationQuotes(translation),
        description,
      });

      if (onAction) {
        onAction({
          type: 'create',
          entity: 'term',
          data: term,
        });
      }

      return JSON.stringify({
        success: true,
        message: '鏈鍒涘缓鎴愬姛',
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_term',
        description:
          '鏍规嵁鏈鍚嶇О鑾峰彇鏈淇℃伅銆傚湪缈昏瘧杩囩▼涓紝濡傛灉閬囧埌宸插瓨鍦ㄧ殑鏈锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鏌ヨ鍏剁炕璇戙€?,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '鏈鍚嶇О锛堟棩鏂囧師鏂囷級',
            },
          },
          required: ['name'],
        },
      },
    },
    handler: (args, { bookId }) => {
      const { name } = args;
      if (!name) {
        throw new Error('鏈鍚嶇О涓嶈兘涓虹┖');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`涔︾睄涓嶅瓨鍦? ${bookId}`);
      }

      const term = book.terminologies?.find((t) => t.name === name);

      if (!term) {
        return JSON.stringify({
          success: false,
          message: `鏈 "${name}" 涓嶅瓨鍦╜,
        });
      }

      return JSON.stringify({
        success: true,
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
          occurrences: term.occurrences,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_term',
        description: '鏇存柊鐜版湁鏈鐨勭炕璇戞垨鎻忚堪銆傚綋鍙戠幇鏈鐨勭炕璇戦渶瑕佷慨姝ｆ椂锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鏇存柊銆?,
        parameters: {
          type: 'object',
          properties: {
            term_id: {
              type: 'string',
              description: '鏈 ID锛堜粠 get_term 鎴?list_terms 鑾峰彇锛?,
            },
            translation: {
              type: 'string',
              description: '鏂扮殑缈昏瘧鏂囨湰锛堝彲閫夛級',
            },
            description: {
              type: 'string',
              description: '鏂扮殑鎻忚堪锛堝彲閫夛紝璁剧疆涓虹┖瀛楃涓插彲鍒犻櫎鎻忚堪锛?,
            },
          },
          required: ['term_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { term_id, translation, description } = args;
      if (!term_id) {
        throw new Error('鏈 ID 涓嶈兘涓虹┖');
      }

      const updates: {
        translation?: string;
        description?: string;
      } = {};

      if (translation !== undefined) {
        updates.translation = normalizeTranslationQuotes(translation);
      }
      if (description !== undefined) {
        updates.description = description;
      }

      const term = await TerminologyService.updateTerminology(bookId, term_id, updates);

      if (onAction) {
        onAction({
          type: 'update',
          entity: 'term',
          data: term,
        });
      }

      return JSON.stringify({
        success: true,
        message: '鏈鏇存柊鎴愬姛',
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_term',
        description: '鍒犻櫎鏈銆傚綋纭畾鏌愪釜鏈涓嶅啀闇€瑕佹椂锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鍒犻櫎銆?,
        parameters: {
          type: 'object',
          properties: {
            term_id: {
              type: 'string',
              description: '鏈 ID锛堜粠 get_term 鎴?list_terms 鑾峰彇锛?,
            },
          },
          required: ['term_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const { term_id } = args;
      if (!term_id) {
        throw new Error('鏈 ID 涓嶈兘涓虹┖');
      }

      // 鍦ㄥ垹闄ゅ墠鑾峰彇鏈淇℃伅锛屼互渚垮湪 toast 涓樉绀鸿缁嗕俊鎭?
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const term = book?.terminologies?.find((t) => t.id === term_id);

      await TerminologyService.deleteTerminology(bookId, term_id);

      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'term',
          data: term ? { id: term_id, name: term.name } : { id: term_id },
        });
      }

      return JSON.stringify({
        success: true,
        message: '鏈鍒犻櫎鎴愬姛',
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_terms',
        description:
          '鍒楀嚭鎵€鏈夋湳璇€傚湪缈昏瘧寮€濮嬪墠锛屽彲浠ヤ娇鐢ㄦ宸ュ叿鑾峰彇鎵€鏈夊凡瀛樺湪鐨勬湳璇紝浠ヤ究鍦ㄧ炕璇戞椂淇濇寔涓€鑷存€с€?,
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '杩斿洖鐨勬湳璇暟閲忛檺鍒讹紙鍙€夛紝榛樿杩斿洖鎵€鏈夛級',
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

      let terms: Terminology[] = book.terminologies || [];
      if (limit && limit > 0) {
        terms = terms.slice(0, limit);
      }

      return JSON.stringify({
        success: true,
        terms: terms.map((term) => ({
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
          occurrences_count: term.occurrences.length,
        })),
        total: book.terminologies?.length || 0,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_terms_by_keyword',
        description:
          '鏍规嵁鍏抽敭璇嶆悳绱㈡湳璇€傚彲浠ユ悳绱㈡湳璇悕绉版垨缈昏瘧銆傛敮鎸佸彲閫夊弬鏁?translationOnly 鍙繑鍥炴湁缈昏瘧鐨勬湳璇€?,
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '鎼滅储鍏抽敭璇?,
            },
            translation_only: {
              type: 'boolean',
              description: '鏄惁鍙繑鍥炴湁缈昏瘧鐨勬湳璇紙榛樿 false锛?,
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

      const terms = TerminologyService.searchByKeyword(bookId, keyword, {
        translationOnly: translation_only,
      });

      return JSON.stringify({
        success: true,
        terms: terms.map((term) => ({
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
          occurrences_count: term.occurrences.length,
        })),
        count: terms.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_occurrences_by_keywords',
        description:
          '鏍规嵁鎻愪緵鐨勫叧閿瘝鑾峰彇鍏跺湪涔︾睄鍚勭珷鑺備腑鐨勫嚭鐜版鏁般€傜敤浜庣粺璁＄壒瀹氳瘝姹囧湪鏂囨湰涓殑鍒嗗竷鎯呭喌锛屽府鍔╃悊瑙ｈ瘝姹囩殑浣跨敤棰戠巼鍜屼笂涓嬫枃銆?,
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '鍏抽敭璇嶆暟缁勶紝鍙互鍖呭惈涓€涓垨澶氫釜鍏抽敭璇?,
            },
          },
          required: ['keywords'],
        },
      },
    },
    handler: (args, { bookId }) => {
      const { keywords } = args;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('鍏抽敭璇嶆暟缁勪笉鑳戒负绌?);
      }

      const occurrencesMap = TerminologyService.getOccurrencesByKeywords(bookId, keywords);

      // 灏?Map 杞崲涓哄璞℃暟缁?
      const occurrences = Array.from(occurrencesMap.entries()).map(([keyword, occurrences]) => ({
        keyword,
        occurrences: occurrences.map((occ) => ({
          chapterId: occ.chapterId,
          count: occ.count,
        })),
        total_count: occurrences.reduce((sum, occ) => sum + occ.count, 0),
      }));

      return JSON.stringify({
        success: true,
        occurrences,
        total_keywords: occurrences.length,
      });
    },
  },
];
