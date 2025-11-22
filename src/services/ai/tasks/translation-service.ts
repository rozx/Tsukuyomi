import type { AIModel } from 'src/types/ai/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AITool,
  AIToolCall,
  AIToolCallResult,
  ChatMessage,
} from 'src/types/ai/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Terminology, CharacterSetting, Paragraph, Novel } from 'src/types/novel';
import { AIServiceFactory } from '../index';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { ChapterService } from 'src/services/chapter-service';

export interface ActionInfo {
  type: 'create' | 'update' | 'delete';
  entity: 'term' | 'character';
  data: Terminology | CharacterSetting | { id: string };
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
   * 进度回调函数，用于接收翻译进度更新
   * @param progress 进度信息
   */
  onProgress?: (progress: { total: number; current: number; currentParagraphs?: string[] }) => void;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
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
  static readonly CHUNK_SIZE = 1500;

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
          description:
            '根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。',
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
          description:
            '列出所有术语。在翻译开始前，可以使用此工具获取所有已存在的术语，以便在翻译时保持一致性。',
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
          description:
            '根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。',
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
      {
        type: 'function',
        function: {
          name: 'update_character',
          description:
            '更新现有角色的翻译、描述、性别或别名。当发现角色的信息需要修正时，可以使用此工具更新。',
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
          description:
            '获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。',
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
          description:
            '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。',
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
          description:
            '根据关键词查找包含该关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。',
          parameters: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: '搜索关键词',
              },
              chapter_id: {
                type: 'string',
                description:
                  '可选的章节 ID，如果提供则从该章节向前搜索（包括该章节及之前的所有章节）',
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
   * @param onAction 操作回调
   * @returns 工具调用结果
   */
  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
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

          if (onAction) {
            onAction({
              type: 'create',
              entity: 'term',
              data: term,
            });
          }

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

          if (onAction) {
            onAction({
              type: 'update',
              entity: 'term',
              data: term,
            });
          }

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

          if (onAction) {
            onAction({
              type: 'delete',
              entity: 'term',
              data: { id: term_id },
            });
          }

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
          const occurrences = Array.from(occurrencesMap.entries()).map(
            ([keyword, occurrences]) => ({
              keyword,
              occurrences: occurrences.map((occ) => ({
                chapterId: occ.chapterId,
                count: occ.count,
              })),
              total_count: occurrences.reduce((sum, occ) => sum + occ.count, 0),
            }),
          );

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

          const characterData: {
            name: string;
            translation: string;
            sex?: 'male' | 'female' | 'other';
            description?: string;
            aliases?: Array<{ name: string; translation: string }>;
          } = {
            name,
            translation,
          };

          if (sex) characterData.sex = sex as 'male' | 'female' | 'other';
          if (description) characterData.description = description;
          if (aliases)
            characterData.aliases = aliases as Array<{ name: string; translation: string }>;

          const character = await CharacterSettingService.addCharacterSetting(
            bookId,
            characterData,
          );

          if (onAction) {
            onAction({
              type: 'create',
              entity: 'character',
              data: character,
            });
          }

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

          if (onAction) {
            onAction({
              type: 'update',
              entity: 'character',
              data: character,
            });
          }

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

          if (onAction) {
            onAction({
              type: 'delete',
              entity: 'character',
              data: { id: character_id },
            });
          }

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
                translation:
                  result.paragraph.translations.find(
                    (t) => t.id === result.paragraph.selectedTranslationId,
                  )?.translation ||
                  result.paragraph.translations[0]?.translation ||
                  '',
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
                translation:
                  result.paragraph.translations.find(
                    (t) => t.id === result.paragraph.selectedTranslationId,
                  )?.translation ||
                  result.paragraph.translations[0]?.translation ||
                  '',
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
                translation:
                  result.paragraph.translations.find(
                    (t) => t.id === result.paragraph.selectedTranslationId,
                  )?.translation ||
                  result.paragraph.translations[0]?.translation ||
                  '',
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
   * @param content 要翻译的段落列表
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    content: Paragraph[],
    model: AIModel,
    options?: TranslationServiceOptions,
  ): Promise<{ text: string; taskId?: string }> {
    console.debug('[TranslationService] 开始翻译', {
      contentLength: content?.length,
      modelName: model.name,
      bookId: options?.bookId,
    });

    const { onChunk, onProgress, signal, bookId, aiProcessingStore, onAction } = options || {};

    if (!content || content.length === 0) {
      throw new Error('要翻译的内容不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = aiProcessingStore.addTask({
        type: 'translation',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化翻译会话...',
        thinkingMessage: '',
      });

      // 获取任务的 abortController
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      abortController = task?.abortController;
    }

    // 使用任务的 abortController 或提供的 signal
    const finalSignal = signal || abortController?.signal;

    try {
      const service = AIServiceFactory.getService(model.provider);
      const tools = this.getAllTools(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.translation?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const systemPrompt =
        '你是一个专业的日轻小说翻译助手，擅长将日语小说翻译成流畅、优美的简体中文。\n' +
        '我会提供必要的工具（CRUD 术语/角色设定、查询段落等）来辅助你的翻译工作。\n' +
        '你可以在需要时使用这些工具来查询、创建、更新或删除术语和角色设定。\n' +
        '重要提示：你可以随时使用工具来获取更多关于术语、角色或段落的上下文信息，以确保翻译的准确性。\n' +
        '特别是 "find_paragraph_by_keyword" 工具，你可以用它来搜索关键词在之前段落中的翻译，以保持用词一致。\n' +
        '在决定是否添加新术语或角色时，可以使用 "get_occurrences_by_keywords" 工具查询其在全文中的出现频率。\n' +
        '请注意：只在确实需要时才添加新术语（例如具有特殊含义的词汇），不要添加仅由汉字组成且无特殊含义的普通词汇。\n' +
        '对于不确定的术语，务必先查询或查看上下文（使用 get_previous_paragraphs/get_next_paragraphs）。\n' +
        '每次我给你一段文本（可能包含段落ID），你需要：\n' +
        '1. 分析文本，如果发现可能的术语或角色，或者需要更多上下文，可以使用工具进行确认或查询。\n' +
        '2. 将文本翻译成简体中文。\n' +
        '3. 返回翻译结果，格式为 JSON：{ "translation": "翻译后的文本" }。\n' +
        '4. 提取文本中的术语和角色，如果需要，使用工具进行确认或查询。\n' +
        '5. 在每段翻译后，如果你发现需要更新术语表或角色设定，请使用工具进行操作。\n' +
        '请确保翻译风格符合轻小说习惯，自然流畅。';

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      const initialUserPrompt =
        '我将开始提供小说段落。请准备好。\n' +
        '在每段翻译后，如果你发现需要更新术语表或角色设定，请使用工具进行操作。\n' +
        '准备好了吗？';

      if (aiProcessingStore && taskId) {
        aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = TranslationService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        context?: string;
        paragraphIds?: string[];
      }> = [];

      // 获取书籍数据以提取上下文（仅当提供了 bookId 时）
      let book: Novel | undefined;
      if (bookId) {
        try {
          // 动态导入 store 以避免循环依赖
          const booksStore = (await import('src/stores/books')).useBooksStore();
          book = booksStore.getBookById(bookId);
        } catch (e) {
          console.warn('获取书籍数据失败，将跳过上下文提取', e);
        }
      }

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];

      // 辅助函数：提取上下文
      const getContext = (paragraphs: Paragraph[], bookData?: Novel): string => {
        if (!bookData || paragraphs.length === 0) return '';

        const textContent = paragraphs.map((p) => p.text).join('\n');
        const contextParts: string[] = [];

        // 查找相关术语
        const relevantTerms =
          bookData.terminologies?.filter((t) => textContent.includes(t.name)) || [];
        if (relevantTerms.length > 0) {
          console.debug(
            '[TranslationService] 发现相关术语:',
            relevantTerms.map((t) => t.name),
          );
          contextParts.push('【相关术语参考】');
          contextParts.push(
            relevantTerms
              .map(
                (t) =>
                  `- [ID: ${t.id}] ${t.name}: ${t.translation.translation}${t.description ? ` (${t.description})` : ''}`,
              )
              .join('\n'),
          );
        }

        // 查找相关角色
        const relevantCharacters =
          bookData.characterSettings?.filter(
            (c) =>
              textContent.includes(c.name) || c.aliases.some((a) => textContent.includes(a.name)),
          ) || [];
        if (relevantCharacters.length > 0) {
          console.debug(
            '[TranslationService] 发现相关角色:',
            relevantCharacters.map((c) => c.name),
          );
          contextParts.push('【相关角色参考】');
          contextParts.push(
            relevantCharacters
              .map(
                (c) =>
                  `- [ID: ${c.id}] ${c.name}: ${c.translation.translation}${c.description ? ` (${c.description})` : ''}`,
              )
              .join('\n'),
          );
        }

        return contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : '';
      };

      for (const paragraph of content) {
        // 格式化段落：[ID: {id}] {text}
        const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n\n`;

        // 预测加入新段落后的上下文
        const nextParagraphs = [...currentChunkParagraphs, paragraph];
        const nextContext = getContext(nextParagraphs, book);

        // 如果当前块加上新段落和上下文超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length + nextContext.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
            context: getContext(currentChunkParagraphs, book),
            paragraphIds: currentChunkParagraphs.map((p) => p.id),
          });
          currentChunkText = '';
          currentChunkParagraphs = [];
        }
        currentChunkText += paragraphText;
        currentChunkParagraphs.push(paragraph);
      }
      // 添加最后一个块
      if (currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText,
          context: getContext(currentChunkParagraphs, book),
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
        });
      }

      console.debug('[TranslationService] 文本已切分为块:', chunks.length);

      let translatedText = '';

      // 3. 循环处理每个块
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        console.debug(`[TranslationService] 正在处理第 ${i + 1}/${chunks.length} 块`, {
          paragraphCount: chunk.paragraphIds?.length,
          contextLength: chunk.context?.length,
          textLength: chunk.text.length,
        });

        const chunkText = chunk.text;
        const chunkContext = chunk.context || '';

        if (aiProcessingStore && taskId) {
          aiProcessingStore.updateTask(taskId, {
            message: `正在翻译第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
        }

        if (onProgress) {
          const progress: {
            total: number;
            current: number;
            currentParagraphs?: string[];
          } = {
            total: chunks.length,
            current: i + 1,
          };
          if (chunk.paragraphIds) {
            progress.currentParagraphs = chunk.paragraphIds;
          }
          onProgress(progress);
        }

        // 构建当前消息
        let content = '';
        if (i === 0) {
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${chunkContext}${chunkText}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}`;
        }

        history.push({ role: 'user', content });

        let currentTurnCount = 0;
        const MAX_TURNS = 5; // 防止工具调用死循环
        let finalResponseText = '';

        // 工具调用循环
        while (currentTurnCount < MAX_TURNS) {
          currentTurnCount++;

          const request: TextGenerationRequest = {
            messages: history,
          };

          if (tools.length > 0) {
            request.tools = tools;
          }

          // 调用 AI
          let chunkReceived = false;
          console.debug('[TranslationService] 发送请求给 AI', {
            messagesCount: request.messages?.length,
            toolsCount: request.tools?.length,
          });

          const result = await service.generateText(config, request, (c) => {
            // 处理流式输出
            if (c.text) {
              if (!chunkReceived && aiProcessingStore && taskId) {
                chunkReceived = true;
              }
              // 累积思考消息
              if (aiProcessingStore && taskId) {
                aiProcessingStore.appendThinkingMessage(taskId, c.text);
              }
            }
            return Promise.resolve();
          });

          // 检查是否有工具调用
          if (result.toolCalls && result.toolCalls.length > 0) {
            console.debug('[TranslationService] AI 请求调用工具:', result.toolCalls);
            // 将助手的回复（包含工具调用）添加到历史
            history.push({
              role: 'assistant',
              content: result.text || null,
              tool_calls: result.toolCalls,
            });

            // 执行工具
            for (const toolCall of result.toolCalls) {
              if (aiProcessingStore && taskId) {
                aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `\n[调用工具: ${toolCall.function.name}]\n`,
                );
              }

              // 执行工具
              const toolResult = await TranslationService.handleToolCall(
                toolCall,
                bookId || '',
                onAction,
              );
              console.debug('[TranslationService] 工具执行结果:', toolResult);

              // 添加工具结果到历史
              history.push({
                role: 'tool',
                content: toolResult.content,
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });

              if (aiProcessingStore && taskId) {
                aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
                );
              }
            }
            // 继续循环，将工具结果发送给 AI
          } else {
            console.debug('[TranslationService] 收到 AI 响应 (无工具调用)');
            // 没有工具调用，这是最终回复
            finalResponseText = result.text;
            history.push({ role: 'assistant', content: finalResponseText });
            break;
          }
        }

        // 解析 JSON 响应
        try {
          console.debug('[TranslationService] 解析 AI 响应:', finalResponseText);
          // 尝试提取 JSON
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const data = JSON.parse(jsonStr);
            if (data.translation) {
              const chunkTranslation = data.translation;
              translatedText += chunkTranslation;
              if (onChunk) {
                await onChunk({ text: chunkTranslation, done: false });
              }
            } else {
              console.warn('AI 响应中未找到 translation 字段，使用原始文本');
              translatedText += finalResponseText;
              if (onChunk) await onChunk({ text: finalResponseText, done: false });
            }
          } else {
            // 不是 JSON，直接追加
            translatedText += finalResponseText;
            if (onChunk) await onChunk({ text: finalResponseText, done: false });
          }
        } catch (e) {
          console.warn('解析 AI 响应 JSON 失败', e);
          translatedText += finalResponseText;
          if (onChunk) await onChunk({ text: finalResponseText, done: false });
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      if (aiProcessingStore && taskId) {
        aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '翻译完成',
        });
        setTimeout(() => {
          if (taskId) aiProcessingStore.removeTask(taskId);
        }, 1000);
      }

      return { text: translatedText, ...(taskId ? { taskId } : {}) };
    } catch (error) {
      if (aiProcessingStore && taskId) {
        // 检查是否是取消错误
        const isCancelled =
          error instanceof Error &&
          (error.message === '请求已取消' || error.message.includes('aborted'));

        if (isCancelled) {
          aiProcessingStore.updateTask(taskId, {
            status: 'cancelled',
            message: '已取消',
          });
        } else {
          aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '翻译出错',
          });
        }
      }
      throw error;
    }
  }
}
