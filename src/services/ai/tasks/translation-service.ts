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
   * 段落翻译回调函数，用于接收每个块完成后的段落翻译结果
   * @param translations 段落翻译数组，包含段落ID和翻译文本
   */
  onParagraphTranslation?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
  /**
   * 章节标题（可选），如果提供，将一起翻译
   */
  chapterTitle?: string;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
}

export interface TranslationResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  titleTranslation?: string;
  actions?: ActionInfo[];
}

/**
 * 翻译服务
 * 使用 AI 服务进行文本翻译，支持术语 CRUD 工具
 */
export class TranslationService {
  static readonly CHUNK_SIZE = 1500;
  // 重复字符检测配置
  private static readonly REPEAT_THRESHOLD = 80; // 连续重复字符的阈值
  private static readonly REPEAT_CHECK_WINDOW = 100; // 检查窗口大小（最近N个字符）

  /**
   * 检查文本是否只包含符号（不是真正的文本内容）
   * @param text 要检查的文本
   * @returns 如果只包含符号，返回true
   */
  private static isOnlySymbols(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return true;
    }

    // 移除所有空白字符
    const trimmed = text.trim();

    // 检查是否只包含标点符号、数字、特殊符号等
    // 允许的字符：日文假名、汉字、英文字母
    const hasContent =
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u20000-\u2A6DFa-zA-Z]/.test(trimmed);

    return !hasContent;
  }

  /**
   * 检测文本中是否有过多的重复字符（AI降级检测）
   * @param text 要检测的文本（翻译结果）
   * @param originalText 原文（用于比较，如果原文也有重复则不认为是降级）
   * @returns 如果检测到重复，返回true
   */
  private static detectRepeatingCharacters(text: string, originalText?: string): boolean {
    if (!text || text.length < this.REPEAT_CHECK_WINDOW) {
      return false;
    }

    // 检查最近N个字符
    const recentText = text.slice(-this.REPEAT_CHECK_WINDOW);

    // 检查是否有单个字符重复超过阈值
    for (let i = 0; i < recentText.length; i++) {
      const char = recentText[i];
      if (!char) continue;

      // 计算从当前位置开始的连续重复次数
      let repeatCount = 1;
      for (let j = i + 1; j < recentText.length; j++) {
        if (recentText[j] === char) {
          repeatCount++;
        } else {
          break;
        }
      }

      // 如果连续重复超过阈值，检查原文是否也有类似重复
      if (repeatCount >= this.REPEAT_THRESHOLD) {
        // 如果提供了原文，检查原文中是否也有类似的重复
        if (originalText) {
          const originalRecent = originalText.slice(-this.REPEAT_CHECK_WINDOW);
          let originalRepeatCount = 1;
          for (let j = 1; j < originalRecent.length; j++) {
            if (originalRecent[j] === originalRecent[j - 1]) {
              originalRepeatCount++;
            } else {
              break;
            }
          }
          // 如果原文也有类似的重复，不认为是降级
          if (originalRepeatCount >= this.REPEAT_THRESHOLD * 0.5) {
            continue;
          }
        }
        console.warn(
          `[TranslationService] 检测到AI降级：字符 "${char}" 连续重复 ${repeatCount} 次`,
        );
        return true;
      }
    }

    // 检查是否有短模式重复（如 "ababab..." 或 "abcabc..."）
    // 检查2-5字符的模式
    const PATTERN_REPEAT_THRESHOLD = 30; // 模式重复阈值
    for (let patternLen = 2; patternLen <= 5; patternLen++) {
      if (recentText.length < patternLen * 10) continue;

      const pattern = recentText.slice(-patternLen);
      let patternRepeatCount = 1;

      // 检查模式是否重复
      for (let i = recentText.length - patternLen * 2; i >= 0; i -= patternLen) {
        const candidate = recentText.slice(i, i + patternLen);
        if (candidate === pattern) {
          patternRepeatCount++;
        } else {
          break;
        }
      }

      // 如果模式重复超过阈值，检查原文是否也有类似重复
      if (patternRepeatCount >= PATTERN_REPEAT_THRESHOLD) {
        // 如果提供了原文，检查原文中是否也有类似的重复模式
        if (originalText) {
          const originalRecent = originalText.slice(-this.REPEAT_CHECK_WINDOW);
          let originalPatternRepeatCount = 1;

          // 检查原文中是否有相同的模式重复
          const originalPattern = originalRecent.slice(-patternLen);
          for (let i = originalRecent.length - patternLen * 2; i >= 0; i -= patternLen) {
            const candidate = originalRecent.slice(i, i + patternLen);
            if (candidate === originalPattern) {
              originalPatternRepeatCount++;
            } else {
              break;
            }
          }

          // 如果原文也有类似的重复（至少是翻译的一半），不认为是降级
          if (originalPatternRepeatCount >= PATTERN_REPEAT_THRESHOLD * 0.5) {
            continue;
          }
        }
        console.warn(
          `[TranslationService] 检测到AI降级：模式 "${pattern}" 重复 ${patternRepeatCount} 次`,
        );
        return true;
      }
    }

    return false;
  }

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
          description:
            '创建新角色设定。⚠️ 重要：在创建新角色之前，必须使用 list_characters 或 get_character 工具检查该角色是否已存在，或者是否应该是已存在角色的别名。如果发现该角色实际上是已存在角色的别名，应该使用 update_character 工具将新名称添加为别名，而不是创建新角色。',
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
              speaking_style: {
                type: 'string',
                description: '角色的说话口吻（可选）。例如：傲娇、古风、口癖(desu/nya)等',
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
            translation,
          };

          if (sex) characterData.sex = sex as 'male' | 'female' | 'other';
          if (description) characterData.description = description;
          if (speaking_style) characterData.speakingStyle = speaking_style;
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
                speaking_style: character.speakingStyle,
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
                speaking_style: character.speakingStyle,
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
          const { character_id, name, translation, sex, description, speaking_style, aliases } =
            args;
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
            updates.translation = translation;
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
                speaking_style: character.speakingStyle,
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
                speaking_style: char.speakingStyle,
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
  ): Promise<TranslationResult> {
    console.log('[TranslationService] 开始翻译', {
      contentLength: content?.length,
      modelName: model.name,
      bookId: options?.bookId,
    });

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      chapterTitle,
      aiProcessingStore,
      onParagraphTranslation,
    } = options || {};
    const actions: ActionInfo[] = [];
    let titleTranslation: string | undefined;

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

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
      taskId = await aiProcessingStore.addTask({
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

    // 创建一个合并的 AbortSignal，同时监听 signal 和 task.abortController
    const internalController = new AbortController();
    const finalSignal = internalController.signal;

    // 监听信号并触发内部 controller
    const abortHandler = () => {
      internalController.abort();
    };

    if (signal) {
      if (signal.aborted) {
        internalController.abort();
      } else {
        signal.addEventListener('abort', abortHandler);
      }
    }

    if (abortController) {
      if (abortController.signal.aborted) {
        internalController.abort();
      } else {
        abortController.signal.addEventListener('abort', abortHandler);
      }
    }

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
        '\n' +
        '【工具使用说明】\n' +
        '我会提供必要的工具（CRUD 术语/角色设定、查询段落等）来辅助你的翻译工作。\n' +
        '重要：在每个翻译块中，我会自动提供【相关术语参考】和【相关角色参考】，这些是当前段落中出现的术语和角色。\n' +
        '- 你可以直接使用这些提供的术语和角色，无需调用工具查询。\n' +
        '- 如果你需要查看所有术语或所有角色（而不仅仅是当前段落相关的），可以使用 list_terms 或 list_characters 工具。\n' +
        '- 你可以随时使用工具来创建、更新或删除术语和角色设定。\n' +
        '- ⚠️ 术语表和角色设定表必须严格分离：术语表中绝对不能有角色（人名），角色表中绝对不能有术语。如果发现混淆，必须立即纠正。\n' +
        '\n' +
        '【其他可用工具】\n' +
        '- "find_paragraph_by_keyword" 工具：搜索关键词在之前段落中的翻译，以保持用词一致。\n' +
        '- "get_occurrences_by_keywords" 工具：查询关键词在全文中的出现频率，帮助决定是否添加新术语或删除无用术语。\n' +
        '- "get_previous_paragraphs" / "get_next_paragraphs" 工具：查看上下文段落，确保翻译准确性。\n' +
        '\n' +
        '【⚠️ 术语和角色严格分离 - 必须遵守】\n' +
        '术语表和角色设定表是完全独立的两个表，绝对不能混淆！\n' +
        '- 术语表中绝对不能包含任何角色名称或角色相关信息。\n' +
        '- 角色设定表中绝对不能包含任何术语。\n' +
        '- 如果你发现术语表中有角色（人名），必须立即使用 delete_term 工具删除它，然后使用 create_character 工具在角色表中创建。\n' +
        '- 如果你发现角色表中有术语，必须立即使用 delete_character 工具删除它，然后使用 create_term 工具在术语表中创建。\n' +
        '- 在每次翻译前，请检查提供的【相关术语参考】和【相关角色参考】，确保它们分类正确。如果发现错误，必须立即纠正。\n' +
        '\n' +
        '【术语管理原则 - 必须严格执行】\n' +
        '1. 创建新术语：\n' +
        '   - 只在确实需要时才添加新术语（例如具有特殊含义的词汇、专有名词、特殊概念等）。\n' +
        '   - 不要添加仅由汉字组成且无特殊含义的普通词汇。\n' +
        '   - 对于不确定的术语，务必先使用 get_occurrences_by_keywords 查询出现频率，或使用 find_paragraph_by_keyword 查看上下文。\n' +
        '   - 人名、角色名称必须放在角色设定表中，不能放在术语表中。\n' +
        '\n' +
        '2. 更新空术语（必须执行）：\n' +
        '   - 如果发现术语的翻译（translation）为空、空白或只有占位符（如"待翻译"、"TODO"等），必须立即使用 update_term 工具补充翻译。\n' +
        '   - 如果发现术语的描述（description）为空但应该补充，可以使用 update_term 工具添加描述。\n' +
        '   - 在翻译过程中，如果遇到术语但发现其翻译为空，必须根据上下文和翻译结果，使用 update_term 工具更新该术语的翻译。\n' +
        '   - 优先使用 get_term 工具查询术语的当前状态，确认是否需要更新。\n' +
        '\n' +
        '3. 删除无用术语（必须执行）：\n' +
        '   - 在翻译过程中，如果发现术语表中存在以下类型的无用术语，必须立即使用 delete_term 工具删除：\n' +
        '     * 非固有名词、无特殊含义的普通词汇（如"的"、"了"、"在"等常见助词、介词）\n' +
        '     * 仅由汉字组成且无特殊含义的普通词汇（如"学校"、"学生"等通用词汇）\n' +
        '     * 出现次数少于3次的词汇（使用 get_occurrences_by_keywords 工具查询确认）\n' +
        '     * 误分类的角色名称（人名），应删除后使用 create_character 在角色表中创建\n' +
        '     * 重复的术语（相同含义但不同名称）\n' +
        '   - 在每次翻译块处理前，建议使用 list_terms 工具查看所有术语，识别并删除无用术语。\n' +
        '   - 如果提供的【相关术语参考】中包含无用术语，在翻译完成后应删除它们。\n' +
        '\n' +
        '4. 术语维护流程：\n' +
        '   - 翻译前：检查【相关术语参考】，确认术语分类正确（术语/角色分离）。\n' +
        '   - 翻译中：如发现术语翻译为空，立即更新；如发现无用术语，标记待删除。\n' +
        '   - 翻译后：删除所有标记的无用术语，确保术语表干净整洁。\n' +
        '\n' +
        '【角色管理原则 - 必须严格执行】\n' +
        '1. 创建新角色（⚠️ 必须检查是否为别名）：\n' +
        '   - 当遇到新的人名或角色名称时，⚠️ 必须先使用 list_characters 或 get_character 工具检查该角色是否已存在。\n' +
        '   - ⚠️ 如果发现该名称实际上是已存在角色的别名（例如：已存在"田中太郎"，新遇到"太郎"或"田中"），必须使用 update_character 工具将该名称添加为已存在角色的别名，而不是创建新角色。\n' +
        '   - ⚠️ 如果发现已存在重复的角色记录（相同角色但不同名称），必须删除重复的角色，并将其中一个名称添加为另一个角色的别名。\n' +
        '   - 只有在确认是真正的新角色（不是别名，也不存在重复）时，才使用 create_character 工具创建角色记录。\n' +
        '   - 角色名称必须放在角色设定表中，不能放在术语表中。\n' +
        '   - 创建角色时，应尽可能提供完整的翻译、性别、描述、说话口吻和别名信息。\n' +
        '\n' +
        '2. 更新空角色翻译（必须执行）：\n' +
        '   - 如果发现角色的翻译（translation）为空、空白或只有占位符（如"待翻译"、"TODO"等），必须立即使用 update_character 工具补充翻译。\n' +
        '   - 在翻译过程中，如果遇到角色但发现其翻译为空，必须根据上下文和翻译结果，使用 update_character 工具更新该角色的翻译。\n' +
        '   - 优先使用 get_character 工具查询角色的当前状态，确认是否需要更新。\n' +
        '\n' +
        '3. 更新角色别名（必须执行）：\n' +
        '   - 在翻译过程中，如果发现文本中出现了某个角色的别名（例如：角色原名是"田中太郎"，但文本中出现了"太郎"或"田中"等称呼），必须使用 update_character 工具将该别名添加到角色的别名列表中。\n' +
        '   - 如果发现别名已经存在但翻译为空或不正确，必须使用 update_character 工具更新别名的翻译。\n' +
        '   - 别名必须包含日文原文和中文翻译，确保翻译一致性。\n' +
        '   - 使用 get_character 工具查询角色当前信息，确认别名是否已存在，避免重复添加。\n' +
        '\n' +
        '4. 更新角色描述（必须执行）：\n' +
        '   - 在翻译过程中，如果发现角色的描述（description）为空但应该补充（例如：文本中提到了角色的身份、关系、特征等重要信息），必须使用 update_character 工具添加或更新描述。\n' +
        '   - 如果发现现有描述不完整或不准确，应根据文本中的新信息使用 update_character 工具更新描述。\n' +
        '   - 描述应包含角色的重要特征、身份、关系等信息，有助于后续翻译的一致性。\n' +
        '\n' +
        '5. 更新角色说话口吻（必须执行）：\n' +
        '   - 在翻译过程中，如果发现角色的说话口吻（speaking_style）为空但应该补充（例如：角色有独特的语气、口癖、古风、方言等），必须使用 update_character 工具添加或更新说话口吻。\n' +
        '   - 如果发现现有说话口吻不完整或不准确，应根据文本中的新信息使用 update_character 工具更新。\n' +
        '   - 说话口吻有助于保持角色个性的一致性。\n' +
        '\n' +
        '6. 删除无用角色和合并重复角色（必须执行）：\n' +
        '   - 如果发现角色表中存在误分类的术语（非人名），必须使用 delete_character 删除，然后使用 create_term 在术语表中创建。\n' +
        '   - ⚠️ 如果发现重复的角色记录（相同角色但不同名称），必须删除其中一个角色，并将被删除角色的名称添加为保留角色的别名。例如：如果存在"田中太郎"和"太郎"两个角色记录，应删除"太郎"，并将"太郎"添加为"田中太郎"的别名。\n' +
        '   - ⚠️ 如果发现新创建的角色实际上是已存在角色的别名，必须立即删除新创建的角色，并使用 update_character 将名称添加为已存在角色的别名。\n' +
        '\n' +
        '7. 角色维护流程：\n' +
        '   - 翻译前：检查【相关角色参考】，确认角色分类正确（术语/角色分离）。\n' +
        '   - 翻译中：\n' +
        '     * ⚠️ 创建新角色前，必须先检查是否已存在该角色或是否为已存在角色的别名。\n' +
        '     * 如发现角色翻译为空，立即更新。\n' +
        '     * 如发现别名出现，立即添加。\n' +
        '     * 如发现描述或说话口吻需要补充，立即更新。\n' +
        '     * 如发现重复角色，删除重复项并添加为别名。\n' +
        '   - 翻译后：检查所有角色信息是否完整，确保翻译、别名、描述、说话口吻都已正确更新；检查是否有重复角色需要合并。\n' +
        '\n' +
        '【重要格式要求】\n' +
        '每次我给你一段文本（包含段落ID，格式为 [ID: xxx] 原文），你需要：\n' +
        '1. 如果提供了【章节标题】，请先翻译章节标题，然后在 JSON 的 "titleTranslation" 字段中返回标题翻译。\n' +
        '2. 检查【相关术语参考】和【相关角色参考】：\n' +
        '   - 确认术语和角色分类正确（术语/角色分离）\n' +
        '   - 检查是否有空翻译的术语或角色，如有则使用工具更新\n' +
        '   - ⚠️ 创建新角色前，必须先使用 list_characters 检查是否已存在该角色或是否为已存在角色的别名\n' +
        '   - 检查角色是否有别名出现，如有则使用 update_character 添加别名\n' +
        '   - 检查是否有重复角色需要合并（删除重复项并添加为别名）\n' +
        '   - 检查角色描述和说话口吻是否需要补充或更新，如有则使用 update_character 更新\n' +
        '   - 识别无用术语，在翻译完成后删除\n' +
        '3. 分析文本，使用提供的【相关术语参考】和【相关角色参考】进行翻译。\n' +
        '4. 将文本翻译成简体中文，严格保证每个段落一一对应（1个原文段落 = 1个翻译段落）。\n' +
        '5. 返回格式必须是有效的 JSON 对象，结构如下：\n' +
        '   {\n' +
        '     "titleTranslation": "章节标题的翻译（如果有标题）",\n' +
        '     "translation": "完整的翻译文本（所有段落合并，段落之间用两个换行符分隔）",\n' +
        '     "paragraphs": [\n' +
        '       { "id": "段落ID1", "translation": "段落1的翻译" },\n' +
        '       { "id": "段落ID2", "translation": "段落2的翻译" },\n' +
        '       ...\n' +
        '     ]\n' +
        '   }\n' +
        '6. 如果提供了章节标题，必须在 JSON 中包含 "titleTranslation" 字段。\n' +
        '7. paragraphs 数组中的每个对象必须包含 "id" 和 "translation" 字段。\n' +
        '8. paragraphs 数组中的段落ID必须与原文中的段落ID完全一致，且数量必须相等（1:1对应）。\n' +
        '9. translation 字段包含所有段落的合并文本，段落之间用两个换行符（\\n\\n）分隔。\n' +
        '10. 在翻译过程中，如果发现需要创建、更新或删除术语/角色，请使用相应的工具进行操作。\n' +
        '11. ⚠️ 在创建或更新术语/角色前，必须检查它们是否在正确的表中。如果发现术语表中有角色（人名），必须立即删除并移到角色表；反之亦然。\n' +
        '12. ⚠️ 在创建新角色前，必须使用 list_characters 或 get_character 检查该角色是否已存在，或是否为已存在角色的别名。如果是别名，应使用 update_character 添加为别名，而不是创建新角色。\n' +
        '13. ⚠️ 翻译完成后，必须检查并删除所有无用术语，更新所有空翻译的术语；同时检查并更新所有空翻译的角色、添加出现的别名、补充或更新角色描述和说话口吻；检查并合并重复角色（删除重复项并添加为别名）。\n' +
        '\n' +
        '请确保翻译风格符合轻小说习惯，自然流畅。';

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      const initialUserPrompt =
        '我将开始提供小说段落。请按照系统提示中的要求进行翻译。\n' +
        '\n' +
        '请记住：\n' +
        '- 检查并更新空翻译的术语和角色\n' +
        '- 删除无用术语\n' +
        '- ⚠️ 创建新角色前，必须先检查是否已存在该角色或是否为已存在角色的别名\n' +
        '- 当发现角色别名出现时，使用 update_character 添加别名\n' +
        '- 当发现重复角色时，删除重复项并添加为别名\n' +
        '- 当角色描述或说话口吻需要补充时，使用 update_character 更新\n' +
        '- 确保术语和角色严格分离\n' +
        '- 返回符合格式要求的 JSON\n' +
        '\n' +
        '准备好了吗？';

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
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
          console.log(
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
          console.log(
            '[TranslationService] 发现相关角色:',
            relevantCharacters.map((c) => c.name),
          );
          contextParts.push('【相关角色参考】');
          contextParts.push(
            relevantCharacters
              .map(
                (c) =>
                  `- [ID: ${c.id}] ${c.name}: ${c.translation.translation}${c.description ? ` (${c.description})` : ''}${c.speakingStyle ? ` [口吻: ${c.speakingStyle}]` : ''}`,
              )
              .join('\n'),
          );
        }

        return contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : '';
      };

      for (const paragraph of content) {
        // 跳过空段落（原始文本为空或只有空白字符）
        if (!paragraph.text || paragraph.text.trim().length === 0) {
          continue;
        }

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

      console.log('[TranslationService] 文本已切分为块:', chunks.length);

      let translatedText = '';
      const paragraphTranslations: { id: string; translation: string }[] = [];

      // 3. 循环处理每个块（带重试机制）
      const MAX_RETRIES = 2; // 最大重试次数
      for (let i = 0; i < chunks.length; i++) {
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('请求已取消');
        }

        const chunk = chunks[i];
        if (!chunk) continue;

        console.log(`[TranslationService] 正在处理第 ${i + 1}/${chunks.length} 块`, {
          paragraphCount: chunk.paragraphIds?.length,
          contextLength: chunk.context?.length,
          textLength: chunk.text.length,
        });

        const chunkText = chunk.text;
        const chunkContext = chunk.context || '';

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
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
        const maintenanceReminder =
          '\n⚠️ 提醒：创建新角色前必须先检查是否已存在该角色或是否为已存在角色的别名；检查并更新空翻译的术语和角色，删除无用术语；当发现角色别名出现时添加别名，当发现重复角色时删除重复项并添加为别名；当角色描述或说话口吻需要补充时更新。\n';
        if (i === 0) {
          // 如果有标题，在第一个块中包含标题翻译
          const titleSection = chapterTitle ? `【章节标题】\n${chapterTitle}\n\n` : '';
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${titleSection}${chunkContext}${chunkText}${maintenanceReminder}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        }

        // 重试循环
        let retryCount = 0;
        let chunkProcessed = false;
        let finalResponseText = '';

        while (retryCount <= MAX_RETRIES && !chunkProcessed) {
          try {
            // 如果是重试，移除上次失败的消息
            if (retryCount > 0) {
              // 移除上次的用户消息和助手回复（如果有）
              if (history.length > 0 && history[history.length - 1]?.role === 'user') {
                history.pop();
              }
              if (history.length > 0 && history[history.length - 1]?.role === 'assistant') {
                history.pop();
              }

              console.warn(
                `[TranslationService] 检测到AI降级，重试第 ${retryCount}/${MAX_RETRIES} 次...`,
              );

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                });
              }
            }

            history.push({ role: 'user', content });

            let currentTurnCount = 0;
            const MAX_TURNS = 5; // 防止工具调用死循环

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
              let accumulatedText = ''; // 用于检测重复字符
              console.log('[TranslationService] 发送请求给 AI', {
                messagesCount: request.messages?.length,
                toolsCount: request.tools?.length,
                retryCount,
              });

              const result = await service.generateText(config, request, (c) => {
                // 处理流式输出
                if (c.text) {
                  if (!chunkReceived && aiProcessingStore && taskId) {
                    chunkReceived = true;
                  }

                  // 累积文本用于检测重复字符
                  accumulatedText += c.text;

                  // 检测重复字符（AI降级检测），传入原文进行比较
                  if (this.detectRepeatingCharacters(accumulatedText, chunkText)) {
                    throw new Error('AI降级检测：检测到重复字符，停止翻译');
                  }

                  // 累积思考消息
                  if (aiProcessingStore && taskId) {
                    void aiProcessingStore.appendThinkingMessage(taskId, c.text);
                  }
                }
                return Promise.resolve();
              });

              // 检查是否有工具调用
              if (result.toolCalls && result.toolCalls.length > 0) {
                console.log('[TranslationService] AI 请求调用工具:', result.toolCalls);
                // 将助手的回复（包含工具调用）添加到历史
                history.push({
                  role: 'assistant',
                  content: result.text || null,
                  tool_calls: result.toolCalls,
                });

                // 执行工具
                for (const toolCall of result.toolCalls) {
                  if (aiProcessingStore && taskId) {
                    void aiProcessingStore.appendThinkingMessage(
                      taskId,
                      `\n[调用工具: ${toolCall.function.name}]\n`,
                    );
                  }

                  // 执行工具
                  const toolResult = await TranslationService.handleToolCall(
                    toolCall,
                    bookId || '',
                    handleAction,
                  );
                  console.log('[TranslationService] 工具执行结果:', toolResult);

                  // 添加工具结果到历史
                  history.push({
                    role: 'tool',
                    content: toolResult.content,
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                  });

                  if (aiProcessingStore && taskId) {
                    void aiProcessingStore.appendThinkingMessage(
                      taskId,
                      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
                    );
                  }
                }
                // 继续循环，将工具结果发送给 AI
              } else {
                console.log('[TranslationService] 收到 AI 响应 (无工具调用)');
                // 没有工具调用，这是最终回复
                finalResponseText = result.text;

                // 再次检测最终响应中的重复字符，传入原文进行比较
                if (this.detectRepeatingCharacters(finalResponseText, chunkText)) {
                  throw new Error('AI降级检测：最终响应中检测到重复字符');
                }

                history.push({ role: 'assistant', content: finalResponseText });
                break;
              }
            }

            // 标记块已成功处理
            chunkProcessed = true;

            // 解析 JSON 响应
            try {
              console.log('[TranslationService] 解析 AI 响应:', finalResponseText);
              // 尝试提取 JSON
              const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
              let chunkTranslation = '';
              const extractedTranslations: Map<string, string> = new Map();

              if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                try {
                  const data = JSON.parse(jsonStr);

                  // 如果是第一个块且有标题，提取标题翻译
                  if (i === 0 && chapterTitle && data.titleTranslation) {
                    titleTranslation = data.titleTranslation;
                    console.log('[TranslationService] 提取到标题翻译:', titleTranslation);
                  }

                  // 优先使用 paragraphs 数组（结构化数据）
                  if (data.paragraphs && Array.isArray(data.paragraphs)) {
                    console.log('[TranslationService] 使用 paragraphs 数组解析翻译');
                    for (const para of data.paragraphs) {
                      if (para.id && para.translation) {
                        extractedTranslations.set(para.id, para.translation);
                      }
                    }

                    // 使用 translation 字段作为完整文本，如果没有则从 paragraphs 构建
                    if (data.translation) {
                      chunkTranslation = data.translation;
                    } else if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                      // 从 paragraphs 数组构建完整文本
                      const orderedTexts: string[] = [];
                      for (const paraId of chunk.paragraphIds) {
                        const translation = extractedTranslations.get(paraId);
                        if (translation) {
                          orderedTexts.push(translation);
                        }
                      }
                      chunkTranslation = orderedTexts.join('\n\n');
                    }
                  } else if (data.translation) {
                    // 后备方案：只有 translation 字段，尝试从字符串中提取段落ID
                    console.warn(
                      '[TranslationService] JSON 中未找到 paragraphs 数组，尝试从 translation 字符串中提取',
                    );
                    chunkTranslation = data.translation;

                    // 尝试从字符串中提取段落ID（兼容旧格式）
                    const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
                    idPattern.lastIndex = 0;
                    let match;
                    while ((match = idPattern.exec(chunkTranslation)) !== null) {
                      const paragraphId = match[1]?.trim();
                      const translation = match[2]?.trim();
                      if (paragraphId && translation) {
                        extractedTranslations.set(paragraphId, translation);
                      }
                    }
                  } else {
                    console.warn('AI 响应中未找到 translation 或 paragraphs 字段，使用原始文本');
                    chunkTranslation = finalResponseText;
                  }
                } catch (e) {
                  console.warn('解析 AI 响应 JSON 失败', e);
                  // JSON 解析失败，回退到原始文本处理
                  chunkTranslation = finalResponseText;
                }
              } else {
                // 不是 JSON，直接使用原始文本
                console.warn('[TranslationService] AI 响应不是 JSON 格式，使用原始文本');
                chunkTranslation = finalResponseText;
              }

              // 验证：检查当前块中的所有段落是否都有翻译
              const missingIds: string[] = [];
              if (chunk.paragraphIds && chunk.paragraphIds.length > 0) {
                for (const paraId of chunk.paragraphIds) {
                  if (!extractedTranslations.has(paraId)) {
                    missingIds.push(paraId);
                  }
                }
              }

              if (missingIds.length > 0) {
                console.warn(
                  `[TranslationService] 警告：以下段落ID在翻译结果中缺失: ${missingIds.join(', ')}`,
                );
                // 如果缺少段落ID，使用完整翻译文本作为后备方案
                if (extractedTranslations.size === 0) {
                  console.warn('[TranslationService] 未找到任何段落ID，将整个翻译文本作为后备方案');
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                } else {
                  // 部分段落有ID，按顺序处理
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  if (chunk.paragraphIds) {
                    for (const paraId of chunk.paragraphIds) {
                      const translation = extractedTranslations.get(paraId);
                      if (translation) {
                        orderedTranslations.push(translation);
                        const paraTranslation = { id: paraId, translation };
                        paragraphTranslations.push(paraTranslation);
                        chunkParagraphTranslations.push(paraTranslation);
                      }
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText || chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: orderedText || chunkTranslation, done: false });
                  }
                  // 通知段落翻译完成（即使只有部分段落）
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    onParagraphTranslation(chunkParagraphTranslations);
                  }
                }
              } else {
                // 所有段落都有翻译，按顺序组织
                if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  for (const paraId of chunk.paragraphIds) {
                    const translation = extractedTranslations.get(paraId);
                    if (translation) {
                      orderedTranslations.push(translation);
                      const paraTranslation = { id: paraId, translation };
                      paragraphTranslations.push(paraTranslation);
                      chunkParagraphTranslations.push(paraTranslation);
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText;
                  if (onChunk) {
                    await onChunk({ text: orderedText, done: false });
                  }
                  // 通知段落翻译完成
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    onParagraphTranslation(chunkParagraphTranslations);
                  }
                } else {
                  // 没有提取到段落翻译，使用完整文本
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                }
              }
            } catch (e) {
              console.warn('解析 AI 响应失败', e);
              translatedText += finalResponseText;
              if (onChunk) await onChunk({ text: finalResponseText, done: false });
            }
          } catch (error) {
            // 检查是否是AI降级错误
            const isDegradedError =
              error instanceof Error &&
              (error.message.includes('AI降级检测') || error.message.includes('重复字符'));

            if (isDegradedError) {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                // 重试次数用尽，抛出错误
                console.error(
                  `[TranslationService] AI降级检测失败，已重试 ${MAX_RETRIES} 次，停止翻译`,
                );
                throw new Error(
                  `AI降级：检测到重复字符，已重试 ${MAX_RETRIES} 次仍失败。请检查AI服务状态或稍后重试。`,
                );
              }
              // 继续重试循环
              continue;
            } else {
              // 其他错误，直接抛出
              throw error;
            }
          }
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      // 最终验证：确保所有段落都有翻译（排除原始文本为空的段落或只包含符号的段落）
      const paragraphsWithText = content.filter((p) => {
        if (!p.text || p.text.trim().length === 0) {
          return false;
        }
        // 排除只包含符号的段落
        return !this.isOnlySymbols(p.text);
      });
      const allParagraphIds = new Set(paragraphsWithText.map((p) => p.id));
      const translatedParagraphIds = new Set(paragraphTranslations.map((pt) => pt.id));
      const missingParagraphIds = Array.from(allParagraphIds).filter(
        (id) => !translatedParagraphIds.has(id),
      );

      // 如果有缺失翻译的段落，重新翻译它们
      if (missingParagraphIds.length > 0) {
        console.warn(
          `[TranslationService] 警告：以下段落缺少翻译: ${missingParagraphIds.join(', ')}，将重新翻译`,
        );

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `发现 ${missingParagraphIds.length} 个段落缺少翻译，正在重新翻译...`,
            status: 'processing',
          });
        }

        // 获取需要重新翻译的段落
        const missingParagraphs = paragraphsWithText.filter((p) =>
          missingParagraphIds.includes(p.id),
        );

        // 重新翻译缺失的段落
        try {
          const missingChunkText = missingParagraphs
            .map((p) => `[ID: ${p.id}] ${p.text}\n\n`)
            .join('');
          const missingChunkContext = getContext(missingParagraphs, book);

          // 构建翻译请求
          const retryContent = `以下段落缺少翻译，请为每个段落提供翻译：\n\n${missingChunkContext}${missingChunkText}`;
          history.push({ role: 'user', content: retryContent });

          let currentTurnCount = 0;
          const MAX_TURNS = 5;
          let finalResponseText = '';

          while (currentTurnCount < MAX_TURNS) {
            currentTurnCount++;

            const request: TextGenerationRequest = {
              messages: history,
            };

            if (tools.length > 0) {
              request.tools = tools;
            }

            let accumulatedText = '';
            const result = await service.generateText(config, request, (c) => {
              if (c.text) {
                accumulatedText += c.text;
                if (this.detectRepeatingCharacters(accumulatedText, missingChunkText)) {
                  throw new Error('AI降级检测：检测到重复字符，停止翻译');
                }
                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(taskId, c.text);
                }
              }
              return Promise.resolve();
            });

            if (result.toolCalls && result.toolCalls.length > 0) {
              history.push({
                role: 'assistant',
                content: result.text || null,
                tool_calls: result.toolCalls,
              });

              for (const toolCall of result.toolCalls) {
                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(
                    taskId,
                    `\n[调用工具: ${toolCall.function.name}]\n`,
                  );
                }

                const toolResult = await TranslationService.handleToolCall(
                  toolCall,
                  bookId || '',
                  handleAction,
                );

                history.push({
                  role: 'tool',
                  content: toolResult.content,
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                });

                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(
                    taskId,
                    `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
                  );
                }
              }
            } else {
              finalResponseText = result.text;
              if (this.detectRepeatingCharacters(finalResponseText, missingChunkText)) {
                throw new Error('AI降级检测：最终响应中检测到重复字符');
              }
              history.push({ role: 'assistant', content: finalResponseText });
              break;
            }
          }

          // 解析重新翻译的结果
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          const retranslatedParagraphs: { id: string; translation: string }[] = [];
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              if (data.paragraphs && Array.isArray(data.paragraphs)) {
                for (const para of data.paragraphs) {
                  if (para.id && para.translation && missingParagraphIds.includes(para.id)) {
                    const paraTranslation = {
                      id: para.id,
                      translation: para.translation,
                    };
                    // 检查是否已存在，如果存在则更新，否则添加
                    const existingIndex = paragraphTranslations.findIndex(
                      (pt) => pt.id === para.id,
                    );
                    if (existingIndex >= 0) {
                      paragraphTranslations[existingIndex] = paraTranslation;
                    } else {
                      paragraphTranslations.push(paraTranslation);
                    }
                    retranslatedParagraphs.push(paraTranslation);
                  }
                }
              }
            } catch (e) {
              console.warn('[TranslationService] 解析重新翻译结果失败', e);
            }
          }
          // 通知重新翻译的段落完成
          if (onParagraphTranslation && retranslatedParagraphs.length > 0) {
            onParagraphTranslation(retranslatedParagraphs);
          }

          console.log(`[TranslationService] 已重新翻译 ${missingParagraphIds.length} 个缺失的段落`);
        } catch (error) {
          console.error('[TranslationService] 重新翻译缺失段落失败', error);
          // 即使重新翻译失败，也继续执行，至少我们已经记录了警告
        }
      } else {
        console.log(
          `[TranslationService] 验证通过：所有 ${paragraphsWithText.length} 个有内容的段落都有翻译`,
        );
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '翻译完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
      }

      return {
        text: translatedText,
        paragraphTranslations,
        ...(titleTranslation ? { titleTranslation } : {}),
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      if (aiProcessingStore && taskId) {
        // 检查是否是取消错误
        const isCancelled =
          error instanceof Error &&
          (error.message === '请求已取消' || error.message.includes('aborted'));

        if (isCancelled) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'cancelled',
            message: '已取消',
          });
        } else {
          void aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '翻译出错',
          });
        }
      }
      throw error;
    } finally {
      // 清理事件监听器
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
