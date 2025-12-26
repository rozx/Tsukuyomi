/**
 * AI 任务服务的共享辅助函数
 * 用于消除重复代码，实现 DRY 原则
 */

import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  ChatMessage,
  AIServiceConfig,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getPostToolCallReminder } from './todo-helper';
import { getChunkingInstructions, getCurrentStatusInfo } from '../prompts';
import { useBooksStore } from 'src/stores/books';
import { findUniqueTermsInText, findUniqueCharactersInText } from 'src/utils/text-matcher';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading';

/**
 * 状态类型
 */
export type TaskStatus = 'planning' | 'working' | 'completed' | 'end';

/**
 * 解析后的 JSON 响应结果
 */
export interface ParsedResponse {
  status: TaskStatus;
  content?:
    | {
        paragraphs?: Array<{ id: string; translation: string }>;
        titleTranslation?: string;
      }
    | undefined;
  error?: string | undefined;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
}

/**
 * 规划上下文更新信息
 */
export interface PlanningContextUpdate {
  newTerms?: Array<{ name: string; translation: string }>;
  newCharacters?: Array<{ name: string; translation: string }>;
  updatedMemories?: Array<{ id: string; summary: string }>;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalTime: number;
  planningTime: number;
  workingTime: number;
  completedTime: number;
  toolCallTime: number;
  toolCallCount: number;
  averageToolCallTime: number;
  chunkProcessingTime: number[];
}

/**
 * AI 处理 Store 接口
 */
export interface AIProcessingStore {
  addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
  updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
  appendThinkingMessage: (id: string, text: string) => Promise<void>;
  appendOutputContent: (id: string, text: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  activeTasks: AIProcessingTask[];
}

/**
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
}

/**
 * 解析和验证 JSON 响应（带状态字段）
 * @param responseText AI 返回的文本
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string): ParsedResponse {
  try {
    // 尝试提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    const jsonStr = jsonMatch[0];
    const data = JSON.parse(jsonStr);

    // 验证状态字段
    if (!data.status || typeof data.status !== 'string') {
      return {
        status: 'working',
        error: 'JSON 中缺少 status 字段',
      };
    }

    const status = data.status as string;
    const validStatuses: TaskStatus[] = ['planning', 'working', 'completed', 'end'];

    if (!validStatuses.includes(status as TaskStatus)) {
      return {
        status: 'working',
        error: `无效的状态值: ${status}，必须是 planning、working、completed 或 end 之一`,
      };
    }

    // 提取内容（如果有）
    const content: ParsedResponse['content'] = {};
    if (data.paragraphs && Array.isArray(data.paragraphs)) {
      content.paragraphs = data.paragraphs;
    }
    if (data.titleTranslation && typeof data.titleTranslation === 'string') {
      content.titleTranslation = data.titleTranslation;
    }

    return {
      status: status as TaskStatus,
      content: Object.keys(content).length > 0 ? content : undefined,
    };
  } catch (e) {
    return {
      status: 'working',
      error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}

/**
 * 生产性工具列表（用于状态循环检测）
 * 这些工具调用表示 AI 正在积极获取上下文信息
 */
const PRODUCTIVE_TOOLS = [
  'list_terms',
  'list_characters',
  'search_memory_by_keywords',
  'get_chapter_info',
  'get_book_info',
  'get_term',
  'get_character',
  'get_memory',
  'get_recent_memories',
];

/**
 * 工具调用限制配置（基于工具类型）
 */
const TOOL_CALL_LIMITS: Record<string, number> = {
  list_terms: 3, // 术语表最多调用 3 次
  list_characters: 3, // 角色表最多调用 3 次（允许在 planning、working、completed 阶段各调用一次）
  get_chapter_info: 2, // 章节信息最多调用 2 次
  get_book_info: 2, // 书籍信息最多调用 2 次
  list_chapters: 1, // 章节列表最多调用 1 次
  search_memory_by_keywords: 5, // 记忆搜索可以多调用几次
  default: Infinity, // 其他工具无限制
};

/**
 * 工具结果截断的最大长度配置
 */
const TOOL_RESULT_MAX_LENGTHS: Record<string, number> = {
  list_terms: 2000,
  list_characters: 2000,
  search_memory_by_keywords: 1000,
  get_chapter_info: 800,
  get_book_info: 800,
  default: 500,
} as const;

/**
 * 智能截断工具结果
 * 根据工具类型使用不同的截断策略，保留关键信息
 * @param tool 工具名称
 * @param result 工具结果
 * @returns 截断后的结果
 */
export function truncateToolResult(tool: string, result: string): string {
  const maxLength = TOOL_RESULT_MAX_LENGTHS[tool] ?? TOOL_RESULT_MAX_LENGTHS.default;
  const safeMaxLength = typeof maxLength === 'number' ? maxLength : 500;

  // 如果结果长度在限制内，直接返回
  if (result.length <= safeMaxLength) {
    return result;
  }

  // 对于结构化数据（术语表、角色表），尝试智能截断
  if (tool === 'list_terms' || tool === 'list_characters') {
    try {
      const data = JSON.parse(result) as unknown[];
      if (Array.isArray(data) && data.length > 0) {
        // 保留所有条目，但每个条目只保留关键字段
        const truncated = data
          .filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          )
          .map((item) => {
            const truncatedItem: Record<string, unknown> = {
              id: item.id,
              name: item.name,
              translation: item.translation,
            };

            // 保留其他关键字段，但截断描述等长字段
            if (item.description && typeof item.description === 'string') {
              truncatedItem.description =
                item.description.length > 100
                  ? item.description.slice(0, 100) + '...'
                  : item.description;
            }

            // 保留别名（但限制数量）
            if (item.aliases && Array.isArray(item.aliases)) {
              truncatedItem.aliases = item.aliases.slice(0, 5); // 最多保留 5 个别名
              if (item.aliases.length > 5) {
                truncatedItem.aliases_note = `（共 ${item.aliases.length} 个别名，仅显示前 5 个）`;
              }
            }

            // 保留其他重要字段
            if (item.speaking_style) {
              truncatedItem.speaking_style = item.speaking_style;
            }
            if (item.relationship) {
              truncatedItem.relationship = item.relationship;
            }

            return truncatedItem;
          });

        const truncatedJson = JSON.stringify(truncated);
        // 如果截断后的 JSON 仍然太长，使用摘要（但包装为 JSON 格式）
        if (truncatedJson.length > safeMaxLength) {
          const summaryItems = truncated.slice(0, 10).map((item) => {
            const nameValue = item.name;
            let name = '';
            if (typeof nameValue === 'string') {
              name = nameValue;
            } else if (nameValue !== null && nameValue !== undefined) {
              if (typeof nameValue === 'number' || typeof nameValue === 'boolean') {
                name = String(nameValue);
              } else {
                name = JSON.stringify(nameValue);
              }
            }

            const translationValue = item.translation;
            let translation = '(无翻译)';
            if (typeof translationValue === 'string') {
              translation = translationValue;
            } else if (translationValue !== null && translationValue !== undefined) {
              if (typeof translationValue === 'number' || typeof translationValue === 'boolean') {
                translation = String(translationValue);
              } else {
                translation = JSON.stringify(translationValue);
              }
            }

            return `${name} → ${translation}`;
          });
          // 将摘要包装为 JSON 格式，确保可以被正确解析
          const summaryText = `共 ${data.length} 项：${summaryItems.join(', ')}${data.length > 10 ? ` 等 ${data.length} 项` : ''}`;
          return JSON.stringify({
            _truncated: true,
            _summary: summaryText,
            _totalCount: data.length,
            _displayedCount: Math.min(10, data.length),
          });
        }

        return truncatedJson;
      }
    } catch {
      // 如果不是 JSON，使用普通截断
    }
  }

  // 对于其他工具，尝试智能截断 JSON
  // 首先尝试解析为 JSON，如果是有效的 JSON，进行智能截断
  try {
    const data = JSON.parse(result);

    // 如果是对象，尝试智能截断
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;

      // 递归截断对象中的长字符串字段
      const truncateObject = (
        obj: Record<string, unknown>,
        maxLen: number,
      ): Record<string, unknown> => {
        const truncated: Record<string, unknown> = {};
        let currentLen = 2; // 开始和结束的大括号

        for (const [key, value] of Object.entries(obj)) {
          // 估算添加这个字段后的长度
          let valueStr = '';
          if (value === null) {
            valueStr = 'null';
          } else if (typeof value === 'string') {
            // 字符串值需要转义和引号
            // 如果字符串太长，截断它
            if (value.length > 200) {
              valueStr = JSON.stringify(value.slice(0, 150) + '...(已截断)');
            } else {
              valueStr = JSON.stringify(value);
            }
          } else if (typeof value === 'object') {
            // 嵌套对象或数组，递归处理
            if (Array.isArray(value)) {
              // 对于数组，如果太长，只保留前几项
              const arrayStr = JSON.stringify(value);
              if (arrayStr.length > 300) {
                const truncatedArray = value.slice(0, 5);
                valueStr = JSON.stringify(truncatedArray) + '...(数组已截断)';
              } else {
                valueStr = arrayStr;
              }
            } else {
              // 嵌套对象，递归截断
              valueStr = JSON.stringify(truncateObject(value as Record<string, unknown>, maxLen));
            }
          } else {
            valueStr = JSON.stringify(value);
          }

          const keyStr = `"${key}":`;
          const fieldStr = `${keyStr}${valueStr}`;
          const fieldLen = fieldStr.length + (currentLen > 2 ? 1 : 0); // +1 是逗号

          // 如果添加这个字段会超过限制，停止
          if (currentLen + fieldLen > maxLen - 20) {
            // 添加截断标记
            truncated._truncated = true;
            truncated._truncatedFields =
              Object.keys(obj).length - Object.keys(truncated).length + 1;
            break;
          }

          truncated[key] = value;
          currentLen += fieldLen;
        }

        return truncated;
      };

      // 使用更保守的截断长度（留出 10% 的缓冲空间）
      const conservativeMaxLen = Math.floor(safeMaxLength * 0.9);
      const truncated = truncateObject(obj, conservativeMaxLen);
      let truncatedJson = JSON.stringify(truncated);

      // 如果截断后的 JSON 仍然太长，逐步减少内容直到符合限制
      if (truncatedJson.length > safeMaxLength) {
        // 尝试进一步截断：移除一些非关键字段
        const keyFields = ['success', 'id', 'title', 'name', 'error', 'description'];
        const minimal: Record<string, unknown> = {
          _truncated: true,
        };

        // 只保留关键字段
        for (const key of keyFields) {
          if (key in truncated) {
            minimal[key] = truncated[key];
          }
        }

        truncatedJson = JSON.stringify(minimal);

        // 如果仍然太长，使用摘要
        if (truncatedJson.length > safeMaxLength) {
          const summary: Record<string, unknown> = {
            _truncated: true,
            _summary: `内容过长（${result.length} 字符），已截断`,
          };

          // 只保留最关键的字段
          const criticalFields = ['success', 'id', 'title', 'name', 'error'];
          for (const key of criticalFields) {
            if (key in obj) {
              const value = obj[key];
              // 如果值是字符串且太长，截断它
              if (typeof value === 'string' && value.length > 50) {
                summary[key] = value.slice(0, 50) + '...';
              } else {
                summary[key] = value;
              }
            }
          }

          truncatedJson = JSON.stringify(summary);
        }
      }

      // 最终验证：确保 JSON 在限制内
      if (truncatedJson.length > safeMaxLength) {
        // 如果仍然超过限制，使用最小摘要
        return JSON.stringify({
          _truncated: true,
          _summary: `内容过长（${result.length} 字符），已截断`,
          _tool: tool,
        });
      }

      return truncatedJson;
    }

    // 如果是数组，但不在特殊处理列表中，也尝试截断
    if (Array.isArray(data)) {
      const truncated = data.slice(0, Math.floor(safeMaxLength / 100)); // 粗略估算
      const truncatedJson = JSON.stringify(truncated);
      if (truncatedJson.length > safeMaxLength) {
        return JSON.stringify({
          _truncated: true,
          _summary: `数组过长（${data.length} 项），已截断`,
          _totalCount: data.length,
          _displayedCount: truncated.length,
        });
      }
      return truncatedJson;
    }

    // 如果是其他类型，直接返回（不应该发生）
    return JSON.stringify(data);
  } catch {
    // 如果不是 JSON 或解析失败，使用普通截断（但确保不会破坏 JSON 结构）
    // 尝试找到最后一个完整的 JSON 结构
    const truncated = result.slice(0, safeMaxLength);

    // 尝试修复被截断的 JSON（如果可能）
    // 查找最后一个完整的键值对或字符串值
    // 匹配模式：完整的键值对（包括字符串、数字、布尔值、null、对象、数组）
    const patterns = [
      /"[^"]*"\s*:\s*"[^"]*"(\s*[,}])/g, // 字符串值
      /"[^"]*"\s*:\s*\d+(\s*[,}])/g, // 数字值
      /"[^"]*"\s*:\s*(true|false|null)(\s*[,}])/g, // 布尔值或 null
      /"[^"]*"\s*:\s*\{[^}]*\}(\s*[,}])/g, // 简单对象值
    ];

    let fixedTruncated: string | null = null;
    for (const pattern of patterns) {
      const matches = truncated.match(pattern);
      if (matches && matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        if (lastMatch) {
          const lastIndex = truncated.lastIndexOf(lastMatch);
          if (lastIndex > 0) {
            let candidate = truncated.slice(0, lastIndex + lastMatch.length);
            // 尝试闭合 JSON 结构
            const openBraces = (candidate.match(/{/g) || []).length;
            const closeBraces = (candidate.match(/}/g) || []).length;
            const missingBraces = openBraces - closeBraces;
            if (missingBraces > 0) {
              candidate += '}'.repeat(missingBraces);
            }
            // 尝试验证是否为有效的 JSON
            try {
              JSON.parse(candidate);
              // 添加截断标记（如果还没有）
              if (!candidate.includes('_truncated')) {
                candidate = candidate.slice(0, -1) + ',"_truncated":true}';
              }
              fixedTruncated = candidate;
              break;
            } catch {
              // 继续尝试下一个模式
            }
          }
        }
      }
    }

    // 如果修复成功，返回修复后的 JSON
    if (fixedTruncated) {
      return fixedTruncated;
    }

    // 如果修复失败，包装为有效的 JSON 对象
    // 确保内容被正确转义
    const escapedContent = truncated
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    return JSON.stringify({
      _truncated: true,
      _content: escapedContent.slice(0, safeMaxLength - 100), // 确保总长度在限制内
      _originalLength: result.length,
      _tool: tool,
    });
  }
}

/**
 * 检测规划上下文是否需要更新
 * @param actions 收集的 actions
 * @returns 规划上下文更新信息（如果需要更新）
 */
export function detectPlanningContextUpdate(
  actions: ActionInfo[],
): PlanningContextUpdate | undefined {
  const newTerms: Array<{ name: string; translation: string }> = [];
  const newCharacters: Array<{ name: string; translation: string }> = [];
  const updatedMemories: Array<{ id: string; summary: string }> = [];

  for (const action of actions) {
    // 检测新创建的术语
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'term' &&
      'name' in action.data
    ) {
      const termData = action.data as { name: string; translation?: string };
      const translation =
        typeof termData.translation === 'string'
          ? termData.translation
          : typeof termData.translation === 'object' && termData.translation !== null
            ? (termData.translation as { text?: string }).text || ''
            : '';
      newTerms.push({
        name: termData.name,
        translation,
      });
    }

    // 检测新创建的角色
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'character' &&
      'name' in action.data
    ) {
      const charData = action.data as { name: string; translation?: string };
      const translation =
        typeof charData.translation === 'string'
          ? charData.translation
          : typeof charData.translation === 'object' && charData.translation !== null
            ? (charData.translation as { text?: string }).text || ''
            : '';
      newCharacters.push({
        name: charData.name,
        translation,
      });
    }

    // 检测新创建的记忆
    if (
      action.type === 'create' &&
      action.entity === 'memory' &&
      'summary' in action.data &&
      'id' in action.data
    ) {
      const memoryData = action.data as { id: string; summary?: string };
      updatedMemories.push({
        id: memoryData.id,
        summary: memoryData.summary || '',
      });
    }
  }

  // 如果有任何更新，返回更新信息
  if (newTerms.length > 0 || newCharacters.length > 0 || updatedMemories.length > 0) {
    return {
      ...(newTerms.length > 0 ? { newTerms } : {}),
      ...(newCharacters.length > 0 ? { newCharacters } : {}),
      ...(updatedMemories.length > 0 ? { updatedMemories } : {}),
    };
  }

  return undefined;
}

/**
 * 创建流式处理回调函数
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const { taskId, aiProcessingStore, originalText, logLabel } = config;
  let accumulatedText = '';

  return (c) => {
    // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
    if (aiProcessingStore && taskId && c.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
    }

    // 处理流式输出
    if (c.text) {
      // 累积文本用于检测重复字符
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendOutputContent(taskId, c.text);
      }

      // 检测重复字符（AI降级检测），传入原文进行比较
      if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
        throw new Error(`AI降级检测：检测到重复字符，停止${logLabel.replace('Service', '')}`);
      }
    }
    return Promise.resolve();
  };
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
    );
  }
}

/**
 * 构建维护提醒（用于每个文本块）- 精简版
 */
export function buildMaintenanceReminder(taskType: TaskType): string {
  const reminders = {
    translation: `\n[警告] 只返回JSON，状态可独立返回，系统会检查缺失段落。注意：空段落已被过滤，不包含在内容中`,
    proofreading: `\n[警告] 只返回JSON，只返回有变化段落，系统会检查。注意：空段落已被过滤，不包含在内容中`,
    polish: `\n[警告] 只返回JSON，只返回有变化段落，系统会检查。注意：空段落已被过滤，不包含在内容中`,
  };
  return reminders[taskType];
}

/**
 * 构建初始用户提示的基础部分 - 精简版
 */
export function buildInitialUserPromptBase(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', proofreading: '校对', polish: '润色' };
  const taskLabel = taskLabels[taskType];
  const chunkingInstructions = getChunkingInstructions(taskType);
  return `开始${taskLabel}。[警告] 只返回JSON，状态可独立返回：{"status": "planning"}，系统会自动检查缺失段落

${chunkingInstructions}`;
}

/**
 * 构建章节上下文信息（用于系统提示词）
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选）
 * @returns 格式化的章节上下文字符串，如果都没有则返回空字符串
 */
export function buildChapterContextSection(chapterId?: string, chapterTitle?: string): string {
  const parts: string[] = [];
  if (chapterId) {
    parts.push(`**当前章节 ID**: \`${chapterId}\``);
  }
  if (chapterTitle) {
    parts.push(`**当前章节标题**: ${chapterTitle}`);
  }
  return parts.length > 0 ? `\n\n【当前章节信息】\n${parts.join('\n')}\n` : '';
}

/**
 * 构建书籍上下文信息（用于系统提示词）
 * - 翻译相关任务：提供书名、简介、标签，帮助模型统一风格与用词
 */
export function buildBookContextSectionFromBook(book: {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
}): string {
  const title = typeof book.title === 'string' ? book.title.trim() : '';
  const description = typeof book.description === 'string' ? book.description.trim() : '';
  const tags = Array.isArray(book.tags)
    ? book.tags.filter((t) => typeof t === 'string' && t.trim())
    : [];

  // 如果都没有，返回空字符串
  if (!title && !description && tags.length === 0) {
    return '';
  }

  // 简介可能很长，做一个保守截断（避免提示词过长）
  const MAX_DESC_LEN = 600;
  const normalizedDesc =
    description.length > MAX_DESC_LEN
      ? `${description.slice(0, MAX_DESC_LEN)}...(已截断)`
      : description;

  const parts: string[] = [];
  if (title) {
    parts.push(`**书名**: ${title}`);
  }
  if (normalizedDesc) {
    parts.push(`**简介**: ${normalizedDesc}`);
  }
  if (tags.length > 0) {
    parts.push(`**标签**: ${tags.join('、')}`);
  }

  return `\n\n【书籍信息】\n${parts.join('\n')}\n`;
}

/**
 * 获取书籍上下文信息（从 store 获取；必要时回退到 BookService）
 * @param bookId 书籍 ID
 */
export async function buildBookContextSection(bookId?: string): Promise<string> {
  if (!bookId) return '';

  try {
    // 动态导入，避免循环依赖与在测试环境中提前初始化 pinia
    const booksStore = (await import('src/stores/books')).useBooksStore();
    const storeBook = booksStore.getBookById(bookId);
    if (storeBook) {
      return buildBookContextSectionFromBook({
        title: storeBook.title,
        description: storeBook.description,
        tags: storeBook.tags,
      });
    }

    // 回退：直接从 IndexedDB 获取（不加载章节内容）
    const { BookService } = await import('src/services/book-service');
    const dbBook = await BookService.getBookById(bookId, false);
    if (dbBook) {
      return buildBookContextSectionFromBook({
        title: dbBook.title,
        description: dbBook.description,
        tags: dbBook.tags,
      });
    }
  } catch (e) {
    console.warn(
      `[buildBookContextSection] ⚠️ 获取书籍上下文失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
  }

  return '';
}

/**
 * 添加章节上下文到初始提示
 * 注意：工具使用说明已在系统提示词中提供，这里只保留章节ID和简要提醒
 */
export function addChapterContext(
  prompt: string,
  chapterId: string,
  _taskType: TaskType,
  chapterTitle?: string,
): string {
  const titleLine = chapterTitle ? `**当前章节标题**: ${chapterTitle}\n` : '';
  return (
    `${prompt}\n\n**当前章节 ID**: \`${chapterId}\`\n${titleLine}` +
    `[警告] **重要提醒**: 工具**仅用于获取上下文信息**，你只需要处理**当前任务中直接提供给你的段落**。`
  );
}

/**
 * 添加段落上下文到初始提示
 */
export function addParagraphContext(
  prompt: string,
  paragraphId: string,
  taskType: TaskType,
): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  const tools =
    taskType === 'proofreading'
      ? 'find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs'
      : 'find_paragraph_by_keywords、get_chapter_info';

  return (
    `${prompt}\n\n**当前段落 ID**: ${paragraphId}\n` +
    `你可以使用工具（如 ${tools} 等）获取该段落的前后上下文，` +
    `以确保${taskLabel}的一致性和连贯性。\n\n` +
    `[警告] **重要提醒**: 这些工具**仅用于获取上下文信息**，` +
    `不要用来获取待${taskLabel}的段落！你只需要处理**当前任务中直接提供给你的段落**，` +
    `不要尝试翻译工具返回的段落内容。`
  );
}

/**
 * 添加任务规划建议到初始提示 - 精简版
 */
export function addTaskPlanningSuggestions(prompt: string, _taskType: TaskType): string {
  return `${prompt}\n\n可用 \`create_todo\` 规划复杂任务`;
}

/**
 * 构建执行要点/清单（任务特定）- 精简版
 */
export function buildExecutionSection(taskType: TaskType, chapterId?: string): string {
  const chapterNote = chapterId ? `（传chapter_id: ${chapterId}）` : '';

  if (taskType === 'translation') {
    return `\n【执行】planning→获取上下文${chapterNote} | working→1:1翻译 | completed→验证 | end`;
  }

  if (taskType === 'proofreading') {
    return `\n【执行】只返回有变化段落，忽略空段落`;
  }

  if (taskType === 'polish') {
    return `\n【执行】只返回有变化段落${chapterNote}，参考历史翻译`;
  }

  return '';
}

/**
 * 构建输出内容后的后续操作提示 - 精简版
 */
export function buildPostOutputPrompt(taskType: TaskType, taskId?: string): string {
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  // 翻译相关任务：在 completed 阶段额外提醒可回到 working 更新既有译文
  const canGoBackToWorkingReminder =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? '如果你想更新任何已输出的译文/润色/校对结果，请将状态改回 `{"status":"working"}` 并只返回需要更新的段落；'
      : '';

  return `完成。${todosReminder}${canGoBackToWorkingReminder}如需后续操作请调用工具，否则返回 \`{"status": "end"}\``;
}

/**
 * 构建独立的 chunk 提示（避免 max token 问题）
 * 每个 chunk 独立，提醒 AI 使用工具获取上下文
 * @param taskType 任务类型
 * @param chunkIndex 当前 chunk 索引（从 0 开始）
 * @param totalChunks 总 chunk 数
 * @param chunkText chunk 文本内容
 * @param paragraphCountNote 段落数量提示
 * @param maintenanceReminder 维护提醒
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选，仅第一个 chunk）
 * @param bookId 书籍 ID（可选，用于提取当前 chunk 中的术语和角色）
 * @returns 独立的 chunk 提示
 */
export function buildIndependentChunkPrompt(
  taskType: TaskType,
  chunkIndex: number,
  totalChunks: number,
  chunkText: string,
  paragraphCountNote: string,
  maintenanceReminder: string,
  chapterId?: string,
  chapterTitle?: string,
  bookId?: string,
): string {
  const taskLabels = { translation: '翻译', proofreading: '校对', polish: '润色' };
  const taskLabel = taskLabels[taskType];

  // 工具提示：避免与 system prompt 重复，只保留最小必要提醒
  const contextToolsReminder = `\n\n[警告] **上下文获取**：如需上下文信息可调用工具获取；工具返回内容**不要**当作${taskLabel}结果直接输出。`;

  // 提取当前 chunk 中出现的术语和角色
  // 注意：每次调用时都从 store 重新获取书籍数据，确保包含在前一个 chunk 中创建/更新的术语和角色
  let currentChunkContext = '';
  if (bookId && chunkText) {
    const booksStore = useBooksStore();
    // 从 store 获取最新的书籍数据（包含所有已创建/更新的术语和角色）
    const book = booksStore.getBookById(bookId);
    if (book) {
      // 从当前 chunk 文本中提取出现的术语和角色
      // 这会自动包含在前一个 chunk 中创建的新术语和角色（因为它们已经在 store 中更新了）
      const terms = findUniqueTermsInText(chunkText, book.terminologies || []);
      const characters = findUniqueCharactersInText(chunkText, book.characterSettings || []);

      const contextParts: string[] = [];

      if (terms.length > 0) {
        const termList = terms.map((t) => `${t.name} → ${t.translation.translation}`).join('、');
        contextParts.push(`**术语**：${termList}`);
      }

      if (characters.length > 0) {
        const characterDetails = characters.map((c) => {
          const parts: string[] = [];
          parts.push(`${c.name} → ${c.translation.translation}`);

          if (c.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            parts.push(`性别：${sexLabels[c.sex] || c.sex}`);
          }

          if (c.description) {
            parts.push(`描述：${c.description}`);
          }

          if (c.speakingStyle) {
            parts.push(`说话风格：${c.speakingStyle}`);
          }

          if (c.aliases && c.aliases.length > 0) {
            const aliasList = c.aliases
              .map((a) => `${a.name} → ${a.translation.translation}`)
              .join('、');
            parts.push(`别名：${aliasList}`);
          }

          return parts.join(' | ');
        });

        contextParts.push(`**角色**：\n${characterDetails.map((d) => `  - ${d}`).join('\n')}`);
      }

      if (contextParts.length > 0) {
        currentChunkContext = `\n\n【当前部分出现的术语和角色】\n${contextParts.join('\n')}\n`;
      }
    }
  }

  // 第一个 chunk：完整规划阶段
  // 注意：章节 ID 已在系统提示词中提供
  if (chunkIndex === 0) {
    // 如果有章节标题，添加明确的翻译指令
    const titleInstruction =
      chapterTitle && taskType === 'translation'
        ? `\n\n**章节标题翻译**：请翻译以下章节标题，并在输出 JSON 中包含 \`titleTranslation\` 字段：
【章节标题】${chapterTitle}`
        : '';

    return `开始${taskLabel}任务。**请先将状态设置为 "planning" 开始规划**（返回 \`{"status": "planning"}\`）。${titleInstruction}${currentChunkContext}

以下是第一部分内容（第 ${chunkIndex + 1}/${totalChunks} 部分）：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}${contextToolsReminder}`;
  } else {
    // 后续 chunk：简短规划阶段，包含当前 chunk 中出现的术语和角色
    const briefPlanningNote = currentChunkContext
      ? '以上是当前部分中出现的术语和角色，请确保翻译时使用这些术语和角色的正确翻译。'
      : '';

    return `继续${taskLabel}任务（第 ${chunkIndex + 1}/${totalChunks} 部分）。${currentChunkContext}

**[警告] 重要：简短规划阶段**
${briefPlanningNote}**请直接确认收到上下文**（返回 \`{"status": "planning"}\`），然后立即将状态设置为 "working" 并开始${taskLabel}。

以下是待${taskLabel}内容：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}`;
  }
}

/**
 * 处理工具调用循环
 */
export interface ToolCallLoopConfig {
  history: ChatMessage[];
  tools: AITool[];
  generateText: (
    config: AIServiceConfig,
    request: TextGenerationRequest,
    callback: TextGenerationStreamCallback,
  ) => Promise<{
    text: string;
    toolCalls?: AIToolCall[];
    reasoningContent?: string;
  }>;
  aiServiceConfig: AIServiceConfig;
  taskType: TaskType;
  chunkText: string;
  paragraphIds: string[] | undefined;
  bookId: string;
  handleAction: (action: ActionInfo) => void;
  onToast: ToastCallback | undefined;
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  logLabel: string;
  maxTurns?: number;
  /**
   * 验证回调：用于服务特定的验证逻辑
   * @param expectedIds 期望的段落 ID 列表
   * @param receivedTranslations 已收到的翻译
   * @returns 验证结果
   */
  verifyCompleteness?: (
    expectedIds: string[],
    receivedTranslations: Map<string, string>,
  ) => VerificationResult;
  /**
   * 段落翻译提取回调：每当从 AI 响应中提取到段落翻译时立即调用
   * 用于实时更新 UI，不等待整个循环完成
   */
  onParagraphsExtracted?:
    | ((paragraphs: { id: string; translation: string }[]) => void | Promise<void>)
    | undefined;
  /**
   * 标题翻译提取回调：每当从 AI 响应中提取到标题翻译时立即调用
   */
  onTitleExtracted?: ((title: string) => void | Promise<void>) | undefined;
  /**
   * 是否为简短规划模式（用于后续 chunk，已继承前一个 chunk 的规划上下文）
   * 当为 true 时，AI 会收到简化的规划指令，无需重复获取术语/角色信息
   */
  isBriefPlanning?: boolean;
  /**
   * 收集的 actions（用于检测规划上下文更新）
   */
  collectedActions?: ActionInfo[];
}

/**
 * 执行工具调用循环（基于状态的流程）
 * 返回最终响应文本和状态信息
 */
export interface ToolCallLoopResult {
  responseText: string | null;
  status: TaskStatus;
  paragraphs: Map<string, string>;
  titleTranslation?: string | undefined;
  /**
   * 规划阶段的摘要信息（用于在多个 chunk 之间共享上下文）
   * 包含 AI 在规划阶段的决策、获取的术语/角色信息等
   */
  planningSummary?: string | undefined;
  /**
   * 规划上下文更新信息（用于后续 chunk 更新共享上下文）
   */
  planningContextUpdate?: PlanningContextUpdate | undefined;
  /**
   * 性能指标
   */
  metrics?: PerformanceMetrics | undefined;
}

export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<ToolCallLoopResult> {
  const {
    history,
    tools,
    generateText,
    aiServiceConfig,
    taskType,
    chunkText,
    paragraphIds,
    bookId,
    handleAction,
    onToast,
    taskId,
    aiProcessingStore,
    logLabel,
    maxTurns = Infinity,
    verifyCompleteness,
    onParagraphsExtracted,
    onTitleExtracted,
    isBriefPlanning = false,
    collectedActions = [],
  } = config;

  let currentTurnCount = 0;
  let currentStatus: TaskStatus = 'planning';
  const accumulatedParagraphs = new Map<string, string>();
  let titleTranslation: string | undefined;
  let finalResponseText: string | null = null;

  // 用于检测状态循环：记录每个状态连续出现的次数
  let consecutivePlanningCount = 0;
  let consecutiveWorkingCount = 0;
  let consecutiveCompletedCount = 0;
  const MAX_CONSECUTIVE_STATUS = 2; // 同一状态最多连续出现 2 次（加速流程）

  // 用于收集规划阶段的信息（在 planning → working 转换时提取摘要）
  let planningSummary: string | undefined;
  const planningResponses: string[] = []; // 收集 AI 在规划阶段的响应
  const planningToolResults: { tool: string; result: string }[] = []; // 收集规划阶段的工具结果

  // 性能监控
  const metrics: PerformanceMetrics = {
    totalTime: 0,
    planningTime: 0,
    workingTime: 0,
    completedTime: 0,
    toolCallTime: 0,
    toolCallCount: 0,
    averageToolCallTime: 0,
    chunkProcessingTime: [],
  };
  const startTime = Date.now();
  let statusStartTime = Date.now();

  // 工具调用计数（用于限制）
  const toolCallCounts = new Map<string, number>();
  // 允许的工具名称集合（严格限制：只能调用本次请求提供的 tools）
  const allowedToolNames = new Set(tools.map((t) => t.function.name));

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskTypeLabels[taskType];

  while (maxTurns === Infinity || currentTurnCount < maxTurns) {
    currentTurnCount++;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // 创建流式处理回调
    const streamCallback = createStreamCallback({
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
    });

    // 调用 AI
    const result = await generateText(aiServiceConfig, request, streamCallback);

    // 保存思考内容
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // 检查是否有工具调用
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 工具调用在所有状态阶段都允许
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      history.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoningContent || null, // DeepSeek 要求此字段必须存在
      });

      // 执行工具
      let hasProductiveTool = false;
      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.function.name;

        // [警告] 严格限制：只能调用本次会话提供的 tools
        if (!allowedToolNames.has(toolName)) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 未在本次会话提供的 tools 列表中，已拒绝执行`,
          );
          history.push({
            role: 'tool',
            content:
              `[警告] 工具 ${toolName} 未在本次会话提供的 tools 列表中，禁止调用。` +
              `请改用可用工具或基于已有上下文继续${taskLabel}。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 检查工具调用限制
        const currentCount = toolCallCounts.get(toolName) || 0;
        const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
        const safeLimit = typeof limit === 'number' ? limit : Infinity;

        if (safeLimit !== Infinity && currentCount >= safeLimit) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 调用次数已达上限（${safeLimit}），跳过此次调用`,
          );
          // 添加工具结果，告知 AI 已达到限制
          history.push({
            role: 'tool',
            content: `[警告] 工具 ${toolName} 调用次数已达上限（${safeLimit} 次），请使用已获取的信息继续工作。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 更新工具调用计数
        toolCallCounts.set(toolName, currentCount + 1);

        // 检查是否为生产性工具
        if (PRODUCTIVE_TOOLS.includes(toolName)) {
          hasProductiveTool = true;
        }

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(taskId, `\n[调用工具: ${toolName}]\n`);
        }

        // 记录工具调用开始时间
        const toolCallStartTime = Date.now();

        const toolResult = await ToolRegistry.handleToolCall(
          toolCall,
          bookId,
          handleAction,
          onToast,
          taskId,
        );

        // 记录工具调用耗时
        const toolCallDuration = Date.now() - toolCallStartTime;
        metrics.toolCallTime += toolCallDuration;
        metrics.toolCallCount++;

        // 直接使用工具结果，不进行截断
        const toolResultContent = toolResult.content;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResultContent.slice(0, 100)}...]\n`,
          );
        }

        // 在规划阶段收集工具结果（用于后续 chunk 的上下文共享）
        if (currentStatus === 'planning') {
          // 只收集关键工具的结果（术语、角色、记忆等）
          const keyTools = [
            'list_terms',
            'list_characters',
            'search_memory_by_keywords',
            'get_chapter_info',
            'get_book_info',
            'list_chapters',
          ];
          if (keyTools.includes(toolName)) {
            // 如果是简短规划模式且调用了已获取的工具，给出警告
            if (isBriefPlanning) {
              console.warn(
                `[${logLabel}] ⚠️ 简短规划模式下检测到重复工具调用: ${toolName}，该工具的结果已在规划上下文中提供`,
              );
              // 在工具结果后添加警告信息，提醒 AI 这些信息已经在上下文中
              const warningMessage = `\n\n[警告] **注意**：此工具的结果已在规划上下文中提供，后续 chunk 无需重复调用此工具。`;
              history.push({
                role: 'tool',
                content: toolResultContent + warningMessage,
                tool_call_id: toolCall.id,
                name: toolName,
              });
              // 跳过正常的工具结果推送，因为已经推送了带警告的版本
              continue;
            }
            planningToolResults.push({
              tool: toolName,
              result: toolResultContent, // 使用完整结果
            });
          }
        }

        // 注意：如果已经在上面推送了带警告的工具结果，这里会跳过（通过 continue）
        // 否则正常推送工具结果（使用完整结果）
        history.push({
          role: 'tool',
          content: toolResultContent,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }

      // 只有生产性工具调用才重置循环检测计数器
      // 这样可以避免在 AI 合法地使用工具获取信息时触发误报
      if (hasProductiveTool) {
        consecutivePlanningCount = 0;
        consecutiveWorkingCount = 0;
        consecutiveCompletedCount = 0;
      }

      // 工具调用完成后，直接继续循环，让 AI 基于工具结果自然继续
      continue;
    }

    // 没有工具调用，解析响应
    const responseText = result.text || '';
    finalResponseText = responseText;

    // 检测重复字符
    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(`AI降级检测：最终响应中检测到重复字符`);
    }

    // 解析状态响应
    const parsed = parseStatusResponse(responseText);

    if (parsed.error) {
      // JSON 解析失败，要求重试
      console.warn(`[${logLabel}] ⚠️ ${parsed.error}`);
      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content:
          `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
          `响应格式错误：${parsed.error}。[警告] 只返回JSON，状态可独立返回：` +
          `\`{"status": "planning"}\`，无需包含paragraphs。系统会自动检查缺失段落。`,
      });
      continue;
    }

    // 验证状态转换是否有效
    const newStatus: TaskStatus = parsed.status;
    const previousStatus: TaskStatus = currentStatus;

    // 记录状态转换时间
    if (previousStatus !== newStatus) {
      const statusDuration = Date.now() - statusStartTime;
      switch (previousStatus) {
        case 'planning':
          metrics.planningTime += statusDuration;
          break;
        case 'working':
          metrics.workingTime += statusDuration;
          break;
        case 'completed':
          metrics.completedTime += statusDuration;
          break;
      }
      statusStartTime = Date.now();
    }

    // 定义允许的状态转换
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      planning: ['working'], // planning 只能转换到 working
      working: ['completed'], // working 只能转换到 completed
      completed: ['end', 'working'], // completed 可以转换到 end 或回到 working（如果需要补充缺失段落、编辑/优化已翻译的段落）
      end: [], // end 是终态，不能再转换
    };

    // 检查状态转换是否有效
    if (previousStatus !== newStatus) {
      const allowedNextStatuses: TaskStatus[] | undefined = validTransitions[previousStatus];
      if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
        // 无效的状态转换，提醒AI
        const statusLabels: Record<TaskStatus, string> = {
          planning: '规划阶段 (planning)',
          working: `${taskLabel}中 (working)`,
          completed: '验证阶段 (completed)',
          end: '完成 (end)',
        };

        console.warn(
          `[${logLabel}] ⚠️ 检测到无效的状态转换：${statusLabels[previousStatus]} → ${statusLabels[newStatus]}`,
        );

        const expectedNextStatus: TaskStatus =
          (allowedNextStatuses?.[0] as TaskStatus) || 'working';
        const expectedStatusLabel = statusLabels[expectedNextStatus];

        history.push({
          role: 'assistant',
          content: responseText,
        });

        history.push({
          role: 'user',
          content:
            `[警告] **状态转换错误**：你试图从 "${statusLabels[previousStatus]}" 直接转换到 "${statusLabels[newStatus]}"，这是**禁止的**。\n\n` +
            `**正确的状态转换顺序**：planning → working → completed → end\n\n` +
            `你当前处于 "${statusLabels[previousStatus]}"，应该先转换到 "${expectedStatusLabel}"。\n\n` +
            `请重新返回正确的状态：{"status": "${expectedNextStatus}"}${newStatus === 'working' && previousStatus === 'planning' ? ' 或包含内容时 {"status": "working", "paragraphs": [...]}' : ''}`,
        });

        // 不更新状态，继续循环让AI重新响应
        continue;
      }
    }

    // 检测 planning → working 状态转换，提取规划摘要
    if (previousStatus === 'planning' && newStatus === 'working' && !planningSummary) {
      // 构建规划摘要
      const summaryParts: string[] = [];

      // 添加 AI 的规划响应摘要（包括之前的规划响应）
      if (planningResponses.length > 0) {
        summaryParts.push('【AI规划决策】');
        summaryParts.push(planningResponses.join('\n'));
      }

      // 添加当前转换响应（从 planning 到 working 的响应，这是最终的规划决策）
      if (responseText && responseText.trim().length > 0) {
        if (summaryParts.length === 0) {
          summaryParts.push('【AI规划决策】');
        }
        summaryParts.push(responseText);
      }

      // 添加关键工具结果摘要
      if (planningToolResults.length > 0) {
        summaryParts.push('\n【已获取的上下文信息】');
        for (const { tool, result } of planningToolResults) {
          // 使用完整的工具结果
          summaryParts.push(`- ${tool}: ${result}`);
        }
      }

      if (summaryParts.length > 0) {
        planningSummary = summaryParts.join('\n');
        console.log(`[${logLabel}] ✅ 已提取规划摘要（${planningSummary.length} 字符）`);
      }
    }

    // 更新状态
    currentStatus = newStatus;

    // 提取内容
    // 注意：必须先处理标题翻译，确保标题更新后再处理段落
    // 这样段落处理时可以读取到最新的标题
    if (parsed.content) {
      // 1. 先处理标题翻译（必须等待完成）
      if (parsed.content.titleTranslation) {
        // 允许标题翻译在同一任务中被更新（以最新为准）
        if (titleTranslation !== parsed.content.titleTranslation) {
          titleTranslation = parsed.content.titleTranslation;
          // 立即调用标题回调，并等待完成
          if (onTitleExtracted) {
            try {
              await Promise.resolve(onTitleExtracted(titleTranslation));
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
            }
          }
        }
      }

      // 2. 再处理段落翻译（此时标题已更新）
      if (parsed.content.paragraphs) {
        const newParagraphs: { id: string; translation: string }[] = [];
        for (const para of parsed.content.paragraphs) {
          // 只处理有效的段落翻译（有ID且翻译内容不为空）
          if (para.id && para.translation && para.translation.trim().length > 0) {
            // 允许同一段落在同一任务中被"纠错/改写"
            // 策略：当翻译内容发生变化时，以最新输出为准（last-write-wins）
            const prev = accumulatedParagraphs.get(para.id);
            if (prev !== para.translation) {
              accumulatedParagraphs.set(para.id, para.translation);
              newParagraphs.push({ id: para.id, translation: para.translation });
            }
          }
        }
        if (newParagraphs.length > 0) {
          // 立即调用回调，不等待循环完成（但标题已更新）
          if (onParagraphsExtracted) {
            try {
              void Promise.resolve(onParagraphsExtracted(newParagraphs)).catch((error) => {
                console.error(`[${logLabel}] ⚠️ onParagraphsExtracted 回调失败:`, error);
              });
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onParagraphsExtracted 回调失败:`, error);
            }
          }
        }
      }
    }

    // 将响应添加到历史
    history.push({
      role: 'assistant',
      content: responseText,
    });

    // 根据状态处理
    if (currentStatus === 'planning') {
      // 更新连续状态计数
      consecutivePlanningCount++;
      consecutiveWorkingCount = 0; // 重置其他状态计数
      consecutiveCompletedCount = 0; // 重置其他状态计数

      // 收集规划阶段的 AI 响应（用于后续 chunk 的上下文共享）
      if (responseText && responseText.trim().length > 0) {
        planningResponses.push(responseText);
      }

      // 检测循环：如果连续处于 planning 状态超过阈值，强制要求开始工作
      if (consecutivePlanningCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 planning 状态循环（连续 ${consecutivePlanningCount} 次），强制要求开始工作`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
            `[警告] **立即开始${taskLabel}**！你已经在规划阶段停留过久。` +
            `**现在必须**将状态设置为 "working" 并**立即输出${taskLabel}结果**。` +
            `不要再返回 planning 状态，直接开始${taskLabel}工作。` +
            `返回格式：\`{"status": "working", "paragraphs": [...]}\``,
        });
      } else {
        // 正常的 planning 响应 - 使用更明确的指令
        // 如果是简短规划模式，强烈提醒 AI 已有上下文信息，无需重复获取
        const planningInstruction = isBriefPlanning
          ? `收到。你已继承前一部分的规划上下文（包括术语、角色、记忆等信息），**请直接使用这些信息**。` +
            `**[警告] 禁止重复调用** \`list_terms\`、\`list_characters\`、\`get_chapter_info\`、\`get_book_info\` 等已在上下文中提供的工具。` +
            `只有在需要获取当前段落的前后文上下文时，才可以使用 \`get_previous_paragraphs\`、\`get_next_paragraphs\` 等工具。` +
            `仍然注意敬语翻译流程，确保翻译结果准确。`
          : `收到。如果你已获取必要信息，` +
            `**现在**将状态设置为 "working" 并开始输出${taskLabel}结果。` +
            `如果还需要使用工具获取信息，请调用工具后再更新状态。`;
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n${planningInstruction}`,
        });
      }
      continue;
    } else if (currentStatus === 'working') {
      // 更新连续状态计数
      consecutiveWorkingCount++;
      consecutivePlanningCount = 0; // 重置其他状态计数
      consecutiveCompletedCount = 0; // 重置其他状态计数

      // 检测循环：如果连续处于 working 状态超过阈值且没有输出段落，强制要求完成
      if (consecutiveWorkingCount >= MAX_CONSECUTIVE_STATUS && accumulatedParagraphs.size === 0) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 working 状态循环（连续 ${consecutiveWorkingCount} 次且无输出），强制要求输出内容`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。` +
            `**现在必须**输出${taskLabel}结果。` +
            `返回格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\``,
        });
      } else {
        // 检查是否所有段落都已返回
        let allParagraphsReturned = false;
        if (paragraphIds && paragraphIds.length > 0) {
          const verification = verifyCompleteness
            ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
            : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);
          allParagraphsReturned = verification.allComplete;
        }

        if (allParagraphsReturned) {
          // 所有段落都已返回，提醒 AI 可以将状态改为 "completed"
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `所有段落${taskLabel}已完成。如果不需要继续${taskLabel}，可以将状态设置为 "completed"。`,
          });
        } else {
          // 正常的 working 响应 - 使用更明确的指令
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `收到。继续${taskLabel}，完成后设为 "completed"。无需检查缺失段落，系统会自动验证。`,
          });
        }
      }
      continue;
    } else if (currentStatus === 'completed') {
      // 更新连续状态计数
      consecutiveCompletedCount++;
      consecutivePlanningCount = 0;
      consecutiveWorkingCount = 0;

      // 完成阶段：验证完整性
      if (paragraphIds && paragraphIds.length > 0) {
        const verification = verifyCompleteness
          ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
          : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);

        if (!verification.allComplete && verification.missingIds.length > 0) {
          // 缺少段落，要求继续工作
          const missingIdsList = verification.missingIds.slice(0, 10).join(', ');
          const hasMore = verification.missingIds.length > 10;
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `检测到以下段落缺少${taskLabel}：${missingIdsList}` +
              `${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。` +
              `请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
          });
          currentStatus = 'working';
          consecutiveCompletedCount = 0; // 重置计数，因为状态回到 working
          continue;
        }
      }

      // 检测循环：如果连续处于 completed 状态超过阈值，强制要求完成
      if (consecutiveCompletedCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 completed 状态循环（连续 ${consecutiveCompletedCount} 次），强制要求完成`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] 你已经在完成阶段停留过久。` +
            `如果你还想更新任何已输出的${taskLabel}结果，请将状态改回 \`{"status":"working"}\` 并提交需要更新的段落；` +
            `如果不需要后续操作，请**立即**返回 \`{"status": "end"}\`。`,
        });
      } else {
        // 所有段落都完整，询问后续操作
        const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus)}\n\n${postOutputPrompt}`,
        });
      }
      continue;
    } else if (currentStatus === 'end') {
      // 完成：退出循环
      break;
    }
  }

  // 检查是否达到最大回合数（仅在设置了有限值时才检查）
  if (currentStatus !== 'end' && maxTurns !== Infinity && currentTurnCount >= maxTurns) {
    throw new Error(
      `AI在${maxTurns}回合内未完成${taskLabel}任务（当前状态: ${currentStatus}）。请重试。`,
    );
  }

  // 计算总耗时和平均工具调用时间
  metrics.totalTime = Date.now() - startTime;
  metrics.averageToolCallTime =
    metrics.toolCallCount > 0 ? metrics.toolCallTime / metrics.toolCallCount : 0;

  // 检测规划上下文更新
  const planningContextUpdate = detectPlanningContextUpdate(collectedActions);

  // 输出性能日志
  if (aiProcessingStore && taskId) {
    console.log(`[${logLabel}] 📊 性能指标:`, {
      总耗时: `${metrics.totalTime}ms`,
      规划阶段: `${metrics.planningTime}ms`,
      工作阶段: `${metrics.workingTime}ms`,
      验证阶段: `${metrics.completedTime}ms`,
      工具调用: `${metrics.toolCallCount} 次，平均 ${metrics.averageToolCallTime.toFixed(2)}ms`,
    });
  }

  return {
    responseText: finalResponseText,
    status: currentStatus,
    paragraphs: accumulatedParagraphs,
    titleTranslation,
    planningSummary,
    planningContextUpdate,
    metrics,
  };
}

/**
 * 检查是否达到最大回合数限制（已废弃，状态检查在 executeToolCallLoop 中处理）
 * 保留此函数以保持向后兼容性
 */
export function checkMaxTurnsReached(
  finalResponseText: string | null,
  maxTurns: number,
  taskType: TaskType,
): asserts finalResponseText is string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${taskTypeLabels[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}

// ============================================================================
// 以下是新增的共享工具函数（用于减少三个服务的代码重复）
// ============================================================================

/**
 * 创建统一的 AbortController，同时监听多个 signal
 * @param signal 外部传入的取消信号
 * @param taskAbortController 任务的取消控制器
 * @returns 统一的控制器和清理函数
 */
export function createUnifiedAbortController(
  signal?: AbortSignal,
  taskAbortController?: AbortController,
): { controller: AbortController; cleanup: () => void } {
  const internalController = new AbortController();

  const abortHandler = () => {
    internalController.abort();
  };

  // 监听外部 signal
  if (signal) {
    if (signal.aborted) {
      internalController.abort();
    } else {
      signal.addEventListener('abort', abortHandler);
    }
  }

  // 监听任务的 abortController
  if (taskAbortController) {
    if (taskAbortController.signal.aborted) {
      internalController.abort();
    } else {
      taskAbortController.signal.addEventListener('abort', abortHandler);
    }
  }

  // 返回清理函数
  const cleanup = () => {
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    if (taskAbortController) {
      taskAbortController.signal.removeEventListener('abort', abortHandler);
    }
  };

  return { controller: internalController, cleanup };
}

/**
 * 初始化 AI 任务
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 * @param modelName 模型名称
 * @returns 任务 ID 和取消控制器
 */
export async function initializeTask(
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
  modelName: string,
  context?: {
    bookId?: string;
    chapterId?: string;
    chapterTitle?: string;
  },
): Promise<{ taskId?: string; abortController?: AbortController }> {
  if (!aiProcessingStore) {
    return {};
  }

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  const taskId = await aiProcessingStore.addTask({
    type: taskType,
    modelName,
    status: 'thinking',
    message: `正在初始化${taskTypeLabels[taskType]}会话...`,
    thinkingMessage: '',
    ...(context?.bookId ? { bookId: context.bookId } : {}),
    ...(context?.chapterId ? { chapterId: context.chapterId } : {}),
    ...(context?.chapterTitle ? { chapterTitle: context.chapterTitle } : {}),
  });

  // 获取任务的 abortController
  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  const abortController = task?.abortController;

  // 避免 exactOptionalPropertyTypes 问题：只有当 abortController 存在时才包含它
  if (abortController) {
    return { taskId, abortController };
  }
  return { taskId };
}

/**
 * 构建特殊指令部分（用于系统提示词）
 * @param specialInstructions 特殊指令字符串（如果存在）
 * @returns 格式化的特殊指令部分，如果没有则返回空字符串
 */
export function buildSpecialInstructionsSection(specialInstructions?: string): string {
  return specialInstructions
    ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
    : '';
}

/**
 * 获取特殊指令（书籍级别或章节级别）
 * @param bookId 书籍 ID
 * @param chapterId 章节 ID
 * @param taskType 任务类型
 * @returns 特殊指令字符串（如果存在）
 */
export async function getSpecialInstructions(
  bookId: string | undefined,
  chapterId: string | undefined,
  taskType: TaskType,
): Promise<string | undefined> {
  if (!bookId) {
    return undefined;
  }

  try {
    // 动态导入 store 以避免循环依赖
    const booksStore = (await import('src/stores/books')).useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      return undefined;
    }

    // 如果提供了章节ID，获取章节数据以获取章节级别的特殊指令
    let chapter;
    if (chapterId) {
      for (const volume of book.volumes || []) {
        const foundChapter = volume.chapters?.find((c) => c.id === chapterId);
        if (foundChapter) {
          chapter = foundChapter;
          break;
        }
      }
    }

    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    switch (taskType) {
      case 'translation':
        return chapter?.translationInstructions || book.translationInstructions;
      case 'polish':
        return chapter?.polishInstructions || book.polishInstructions;
      case 'proofreading':
        return chapter?.proofreadingInstructions || book.proofreadingInstructions;
      default:
        return undefined;
    }
  } catch (e) {
    console.warn(
      `[getSpecialInstructions] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 段落格式化函数类型
 */
export type ParagraphFormatter<T> = (item: T) => string;

/**
 * 文本块结构
 */
export interface TextChunk {
  text: string;
  paragraphIds: string[];
}

/**
 * 构建文本块
 * 将段落列表按大小分割成多个文本块
 * @param content 段落列表
 * @param chunkSize 每个块的最大字符数
 * @param formatParagraph 段落格式化函数
 * @param filterParagraph 段落过滤函数（可选，默认过滤空段落）
 * @returns 文本块数组
 */
export function buildChunks<T extends { id: string; text?: string }>(
  content: T[],
  chunkSize: number,
  formatParagraph: ParagraphFormatter<T>,
  filterParagraph?: (item: T) => boolean,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 默认过滤空段落
  const shouldInclude = filterParagraph || ((item: T) => !!item.text?.trim());

  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of content) {
    // 应用过滤条件
    if (!shouldInclude(paragraph)) {
      continue;
    }

    // 格式化段落
    const paragraphText = formatParagraph(paragraph);

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: [...currentChunkParagraphIds],
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
    }

    currentChunkText += paragraphText;
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 检查文本是否只包含符号（不是真正的文本内容）
 * @param text 要检查的文本
 * @returns 如果只包含符号，返回 true
 */
export function isOnlySymbols(text: string): boolean {
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
 * 通用的 chunk 接口（所有 chunk 类型都必须有 text 和 paragraphIds）
 */
export interface BaseChunk {
  text: string;
  paragraphIds?: string[];
}

/**
 * 过滤并处理 chunk，排除已处理的段落
 * @param chunk 当前 chunk
 * @param processedParagraphIds 已处理的段落 ID 集合
 * @param logLabel 日志标签（用于输出日志）
 * @param chunkIndex 当前 chunk 索引
 * @param totalChunks 总 chunk 数
 * @returns 如果所有段落都已处理，返回 null；否则返回过滤后的未处理段落 ID 列表
 */
export function filterProcessedParagraphs(
  chunk: BaseChunk,
  processedParagraphIds: Set<string>,
  logLabel: string,
  chunkIndex: number,
  totalChunks: number,
): string[] | null {
  const unprocessedParagraphIds = (chunk.paragraphIds || []).filter(
    (id) => !processedParagraphIds.has(id),
  );

  if (unprocessedParagraphIds.length === 0) {
    console.log(`[${logLabel}] ⚠️ 块 ${chunkIndex + 1}/${totalChunks} 的所有段落都已被处理，跳过`);
    return null;
  }

  return unprocessedParagraphIds;
}

/**
 * 标记已处理的段落
 * @param paragraphs 段落翻译数组
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphs(
  paragraphs: { id: string; translation: string }[],
  processedParagraphIds: Set<string>,
): void {
  for (const para of paragraphs) {
    if (para.id) {
      processedParagraphIds.add(para.id);
    }
  }
}

/**
 * 从段落翻译 Map 中标记已处理的段落
 * @param paragraphMap 段落翻译 Map
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphsFromMap(
  paragraphMap: Map<string, string>,
  processedParagraphIds: Set<string>,
): void {
  for (const [paraId] of paragraphMap) {
    processedParagraphIds.add(paraId);
  }
}

/**
 * 处理任务错误
 * @param error 错误对象
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function handleTaskError(
  error: unknown,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  // 检查是否是取消错误
  const isCancelled =
    error instanceof Error && (error.message === '请求已取消' || error.message.includes('aborted'));

  if (isCancelled) {
    await aiProcessingStore.updateTask(taskId, {
      status: 'cancelled',
      message: '已取消',
    });
  } else {
    await aiProcessingStore.updateTask(taskId, {
      status: 'error',
      message: error instanceof Error ? error.message : `${taskTypeLabels[taskType]}出错`,
    });
  }
}

/**
 * 完成任务
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function completeTask(
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  await aiProcessingStore.updateTask(taskId, {
    status: 'completed',
    message: `${taskTypeLabels[taskType]}完成`,
  });
}
