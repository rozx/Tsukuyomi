import type { AIModel } from 'src/types/ai/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
} from 'src/types/ai/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Terminology, CharacterSetting } from 'src/types/novel';
import { AIServiceFactory } from '../index';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { ChapterService } from 'src/services/chapter-service';

/**
 * AI 工具定义
 */
export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * AI 工具调用
 */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

/**
 * AI 工具调用结果
 */
export interface AIToolCallResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string; // JSON 字符串或文本
}

/**
 * 翻译服务选项
 */
export interface TranslationServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收翻译过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => string;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => void;
    appendThinkingMessage: (id: string, text: string) => void;
    removeTask: (id: string) => void;
    activeTasks: AIProcessingTask[];
  };
}

/**
 * 翻译服务
 * 使用 AI 服务进行文本翻译，支持术语 CRUD 工具
 */
export class TranslationService {
  /**
   * 获取术语 CRUD 工具定义
   * @param bookId 书籍 ID（可选，如果提供则启用工具）
   * @returns 工具定义数组
   */
  static getTerminologyTools(bookId?: string): AITool[] {
    if (!bookId) {
      return [];
    }

    return [
      {
        type: 'function',
        function: {
          name: 'create_term',
          description: '创建新术语。当翻译过程中遇到新的术语时，可以使用此工具创建术语记录。',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '术语名称（日文原文）',
              },
              translation: {
                type: 'string',
                description: '术语的中文翻译',
              },
              description: {
                type: 'string',
                description: '术语的详细描述（可选）',
              },
            },
            required: ['name', 'translation'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_term',
          description: '根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '术语名称（日文原文）',
              },
            },
            required: ['name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_term',
          description: '更新现有术语的翻译或描述。当发现术语的翻译需要修正时，可以使用此工具更新。',
          parameters: {
            type: 'object',
            properties: {
              term_id: {
                type: 'string',
                description: '术语 ID（从 get_term 或 list_terms 获取）',
              },
              translation: {
                type: 'string',
                description: '新的翻译文本（可选）',
              },
              description: {
                type: 'string',
                description: '新的描述（可选，设置为空字符串可删除描述）',
              },
            },
            required: ['term_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_term',
          description: '删除术语。当确定某个术语不再需要时，可以使用此工具删除。',
          parameters: {
            type: 'object',
            properties: {
              term_id: {
                type: 'string',
                description: '术语 ID（从 get_term 或 list_terms 获取）',
              },
            },
            required: ['term_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_terms',
          description: '列出所有术语。在翻译开始前，可以使用此工具获取所有已存在的术语，以便在翻译时保持一致性。',
          parameters: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: '返回的术语数量限制（可选，默认返回所有）',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_occurrences_by_keywords',
          description: '根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。',
          parameters: {
            type: 'object',
            properties: {
              keywords: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: '关键词数组，可以包含一个或多个关键词',
              },
            },
            required: ['keywords'],
          },
        },
      },
    ];
  }

  /**
   * 获取角色设定 CRUD 工具定义
   * @param bookId 书籍 ID（可选，如果提供则启用工具）
   * @returns 工具定义数组
   */
  static getCharacterSettingTools(bookId?: string): AITool[] {
    if (!bookId) {
      return [];
    }

    return [
      {
        type: 'function',
        function: {
          name: 'create_character',
          description: '创建新角色设定。当翻译过程中遇到新的角色时，可以使用此工具创建角色记录。',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '角色名称（日文原文）',
              },
              translation: {
                type: 'string',
                description: '角色的中文翻译',
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
                description: '角色别名数组（可选）',
              },
            },
            required: ['name', 'translation'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_character',
          description: '根据角色名称获取角色信息。在翻译过程中，如果遇到已存在的角色，可以使用此工具查询其翻译和设定。',
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
      {
        type: 'function',
        function: {
          name: 'update_character',
          description: '更新现有角色的翻译、描述、性别或别名。当发现角色的信息需要修正时，可以使用此工具更新。',
          parameters: {
            type: 'object',
            properties: {
              character_id: {
                type: 'string',
                description: '角色 ID（从 get_character 或 list_characters 获取）',
              },
              name: {
                type: 'string',
                description: '新的角色名称（可选）',
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
                description: '新的别名数组（可选，将替换所有现有别名）',
              },
            },
            required: ['character_id'],
          },
        },
      },
      {
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
      {
        type: 'function',
        function: {
          name: 'list_characters',
          description: '列出所有角色设定。在翻译开始前，可以使用此工具获取所有已存在的角色，以便在翻译时保持一致性。',
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
    ];
  }

  /**
   * 获取段落查询工具定义
   * @param bookId 书籍 ID（可选，如果提供则启用工具）
   * @returns 工具定义数组
   */
  static getParagraphTools(bookId?: string): AITool[] {
    if (!bookId) {
      return [];
    }

    return [
      {
        type: 'function',
        function: {
          name: 'get_previous_paragraphs',
          description: '获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。',
          parameters: {
            type: 'object',
            properties: {
              paragraph_id: {
                type: 'string',
                description: '段落 ID（当前段落的 ID）',
              },
              count: {
                type: 'number',
                description: '要获取的段落数量（默认 3）',
              },
            },
            required: ['paragraph_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_next_paragraphs',
          description: '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。',
          parameters: {
            type: 'object',
            properties: {
              paragraph_id: {
                type: 'string',
                description: '段落 ID（当前段落的 ID）',
              },
              count: {
                type: 'number',
                description: '要获取的段落数量（默认 3）',
              },
            },
            required: ['paragraph_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'find_paragraph_by_keyword',
          description: '根据关键词查找包含该关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。',
          parameters: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: '搜索关键词',
              },
              chapter_id: {
                type: 'string',
                description: '可选的章节 ID，如果提供则从该章节向前搜索（包括该章节及之前的所有章节）',
              },
              max_paragraphs: {
                type: 'number',
                description: '可选的最大返回段落数量（默认 1）',
              },
            },
            required: ['keyword'],
          },
        },
      },
    ];
  }

  /**
   * 获取所有可用的工具（术语 + 角色设定 + 段落查询）
   * @param bookId 书籍 ID（可选，如果提供则启用工具）
   * @returns 工具定义数组
   */
  static getAllTools(bookId?: string): AITool[] {
    return [
      ...this.getTerminologyTools(bookId),
      ...this.getCharacterSettingTools(bookId),
      ...this.getParagraphTools(bookId),
    ];
  }

  /**
   * 处理工具调用
   * @param toolCall 工具调用对象
   * @param bookId 书籍 ID
   * @returns 工具调用结果
   */
  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
  ): Promise<AIToolCallResult> {
    try {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      switch (functionName) {
        case 'create_term': {
          const { name, translation, description } = args;
          if (!name || !translation) {
            throw new Error('术语名称和翻译不能为空');
          }

          const term = await TerminologyService.addTerminology(bookId, {
            name,
            translation,
            description,
          });

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '术语创建成功',
              term: {
                id: term.id,
                name: term.name,
                translation: term.translation.translation,
                description: term.description,
              },
            }),
          };
        }

        case 'get_term': {
          const { name } = args;
          if (!name) {
            throw new Error('术语名称不能为空');
          }

          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          const term = book.terminologies?.find((t) => t.name === name);

          if (!term) {
            return {
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify({
                success: false,
                message: `术语 "${name}" 不存在`,
              }),
            };
          }

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              term: {
                id: term.id,
                name: term.name,
                translation: term.translation.translation,
                description: term.description,
                occurrences: term.occurrences,
              },
            }),
          };
        }

        case 'update_term': {
          const { term_id, translation, description } = args;
          if (!term_id) {
            throw new Error('术语 ID 不能为空');
          }

          const updates: {
            translation?: string;
            description?: string;
          } = {};

          if (translation !== undefined) {
            updates.translation = translation;
          }
          if (description !== undefined) {
            updates.description = description;
          }

          const term = await TerminologyService.updateTerminology(bookId, term_id, updates);

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '术语更新成功',
              term: {
                id: term.id,
                name: term.name,
                translation: term.translation.translation,
                description: term.description,
              },
            }),
          };
        }

        case 'delete_term': {
          const { term_id } = args;
          if (!term_id) {
            throw new Error('术语 ID 不能为空');
          }

          await TerminologyService.deleteTerminology(bookId, term_id);

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '术语删除成功',
            }),
          };
        }

        case 'list_terms': {
          const { limit } = args;
          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          let terms: Terminology[] = book.terminologies || [];
          if (limit && limit > 0) {
            terms = terms.slice(0, limit);
          }

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              terms: terms.map((term) => ({
                id: term.id,
                name: term.name,
                translation: term.translation.translation,
                description: term.description,
                occurrences_count: term.occurrences.length,
              })),
              total: book.terminologies?.length || 0,
            }),
          };
        }

        case 'get_occurrences_by_keywords': {
          const { keywords } = args;
          if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            throw new Error('关键词数组不能为空');
          }

          const occurrencesMap = TerminologyService.getOccurrencesByKeywords(bookId, keywords);

          // 将 Map 转换为对象数组
          const occurrences = Array.from(occurrencesMap.entries()).map(([keyword, occurrences]) => ({
            keyword,
            occurrences: occurrences.map((occ) => ({
              chapterId: occ.chapterId,
              count: occ.count,
            })),
            total_count: occurrences.reduce((sum, occ) => sum + occ.count, 0),
          }));

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              occurrences,
              total_keywords: occurrences.length,
            }),
          };
        }

        case 'create_character': {
          const { name, translation, sex, description, aliases } = args;
          if (!name || !translation) {
            throw new Error('角色名称和翻译不能为空');
          }

          const character = await CharacterSettingService.addCharacterSetting(bookId, {
            name,
            translation,
            sex: sex as 'male' | 'female' | 'other' | undefined,
            description,
            aliases: aliases as Array<{ name: string; translation: string }> | undefined,
          });

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '角色创建成功',
              character: {
                id: character.id,
                name: character.name,
                translation: character.translation.translation,
                sex: character.sex,
                description: character.description,
                aliases: character.aliases?.map((alias) => ({
                  name: alias.name,
                  translation: alias.translation.translation,
                })),
                occurrences_count: character.occurrences.length,
              },
            }),
          };
        }

        case 'get_character': {
          const { name } = args;
          if (!name) {
            throw new Error('角色名称不能为空');
          }

          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          const character = book.characterSettings?.find((c) => c.name === name);

          if (!character) {
            return {
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify({
                success: false,
                message: `角色 "${name}" 不存在`,
              }),
            };
          }

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              character: {
                id: character.id,
                name: character.name,
                translation: character.translation.translation,
                sex: character.sex,
                description: character.description,
                aliases: character.aliases?.map((alias) => ({
                  name: alias.name,
                  translation: alias.translation.translation,
                })),
                occurrences: character.occurrences,
              },
            }),
          };
        }

        case 'update_character': {
          const { character_id, name, translation, sex, description, aliases } = args;
          if (!character_id) {
            throw new Error('角色 ID 不能为空');
          }

          const updates: {
            name?: string;
            sex?: 'male' | 'female' | 'other' | undefined;
            translation?: string;
            description?: string;
            aliases?: Array<{ name: string; translation: string }>;
          } = {};

          if (name !== undefined) {
            updates.name = name;
          }
          if (translation !== undefined) {
            updates.translation = translation;
          }
          if (sex !== undefined) {
            updates.sex = sex as 'male' | 'female' | 'other' | undefined;
          }
          if (description !== undefined) {
            updates.description = description;
          }
          if (aliases !== undefined) {
            updates.aliases = aliases as Array<{ name: string; translation: string }>;
          }

          const character = await CharacterSettingService.updateCharacterSetting(
            bookId,
            character_id,
            updates,
          );

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '角色更新成功',
              character: {
                id: character.id,
                name: character.name,
                translation: character.translation.translation,
                sex: character.sex,
                description: character.description,
                aliases: character.aliases?.map((alias) => ({
                  name: alias.name,
                  translation: alias.translation.translation,
                })),
                occurrences_count: character.occurrences.length,
              },
            }),
          };
        }

        case 'delete_character': {
          const { character_id } = args;
          if (!character_id) {
            throw new Error('角色 ID 不能为空');
          }

          await CharacterSettingService.deleteCharacterSetting(bookId, character_id);

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              message: '角色删除成功',
            }),
          };
        }

        case 'list_characters': {
          const { limit } = args;
          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          let characters: CharacterSetting[] = book.characterSettings || [];
          if (limit && limit > 0) {
            characters = characters.slice(0, limit);
          }

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              characters: characters.map((char) => ({
                id: char.id,
                name: char.name,
                translation: char.translation.translation,
                sex: char.sex,
                description: char.description,
                aliases: char.aliases?.map((alias) => ({
                  name: alias.name,
                  translation: alias.translation.translation,
                })),
                occurrences_count: char.occurrences.length,
              })),
              total: book.characterSettings?.length || 0,
            }),
          };
        }

        case 'get_previous_paragraphs': {
          const { paragraph_id, count = 3 } = args;
          if (!paragraph_id) {
            throw new Error('段落 ID 不能为空');
          }

          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          const results = ChapterService.getPreviousParagraphs(book, paragraph_id, count);

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              paragraphs: results.map((result) => ({
                id: result.paragraph.id,
                text: result.paragraph.text,
                translation: result.paragraph.translations.find(
                  (t) => t.id === result.paragraph.selectedTranslationId,
                )?.translation || result.paragraph.translations[0]?.translation || '',
                chapter: {
                  id: result.chapter.id,
                  title: result.chapter.title.original,
                  title_translation: result.chapter.title.translation.translation,
                },
                volume: {
                  id: result.volume.id,
                  title: result.volume.title.original,
                  title_translation: result.volume.title.translation.translation,
                },
                paragraph_index: result.paragraphIndex,
                chapter_index: result.chapterIndex,
                volume_index: result.volumeIndex,
              })),
              count: results.length,
            }),
          };
        }

        case 'get_next_paragraphs': {
          const { paragraph_id, count = 3 } = args;
          if (!paragraph_id) {
            throw new Error('段落 ID 不能为空');
          }

          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          const results = ChapterService.getNextParagraphs(book, paragraph_id, count);

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              paragraphs: results.map((result) => ({
                id: result.paragraph.id,
                text: result.paragraph.text,
                translation: result.paragraph.translations.find(
                  (t) => t.id === result.paragraph.selectedTranslationId,
                )?.translation || result.paragraph.translations[0]?.translation || '',
                chapter: {
                  id: result.chapter.id,
                  title: result.chapter.title.original,
                  title_translation: result.chapter.title.translation.translation,
                },
                volume: {
                  id: result.volume.id,
                  title: result.volume.title.original,
                  title_translation: result.volume.title.translation.translation,
                },
                paragraph_index: result.paragraphIndex,
                chapter_index: result.chapterIndex,
                volume_index: result.volumeIndex,
              })),
              count: results.length,
            }),
          };
        }

        case 'find_paragraph_by_keyword': {
          const { keyword, chapter_id, max_paragraphs = 1 } = args;
          if (!keyword) {
            throw new Error('关键词不能为空');
          }

          const booksStore = (await import('src/stores/books')).useBooksStore();
          const book = booksStore.getBookById(bookId);
          if (!book) {
            throw new Error(`书籍不存在: ${bookId}`);
          }

          const results = ChapterService.searchParagraphsByKeyword(
            book,
            keyword,
            chapter_id,
            max_paragraphs,
          );

          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({
              success: true,
              paragraphs: results.map((result) => ({
                id: result.paragraph.id,
                text: result.paragraph.text,
                translation: result.paragraph.translations.find(
                  (t) => t.id === result.paragraph.selectedTranslationId,
                )?.translation || result.paragraph.translations[0]?.translation || '',
                chapter: {
                  id: result.chapter.id,
                  title: result.chapter.title.original,
                  title_translation: result.chapter.title.translation.translation,
                },
                volume: {
                  id: result.volume.id,
                  title: result.volume.title.original,
                  title_translation: result.volume.title.translation.translation,
                },
                paragraph_index: result.paragraphIndex,
                chapter_index: result.chapterIndex,
                volume_index: result.volumeIndex,
              })),
              count: results.length,
            }),
          };
        }

        default:
          throw new Error(`未知的工具: ${functionName}`);
      }
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        }),
      };
    }
  }

  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    text: string,
    model: AIModel,
    options?: TranslationServiceOptions,
  ): Promise<{ text: string; taskId?: string }> {
    // TODO: 实现翻译逻辑，包括工具调用处理
    // 注意：此服务用于通用翻译（支持工具调用），如果需要术语翻译，请使用 TermTranslationService
    throw new Error(
      'TranslationService 尚未实现。如需术语翻译，请使用 TermTranslationService。通用翻译功能（支持工具调用）正在开发中。',
    );
  }
}

