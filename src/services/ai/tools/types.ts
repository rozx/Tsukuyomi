import type { Terminology, CharacterSetting, Translation } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { TodoItem } from 'src/services/todo-list-service';
import type { AITool } from 'src/services/ai/types/ai-service';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import type { ToastCallback } from './toast-helper';

export interface ActionInfo {
  type:
    | 'create'
    | 'update'
    | 'delete'
    | 'web_search'
    | 'web_fetch'
    | 'read'
    | 'navigate'
    | 'ask'
    | 'search';
  entity:
    | 'term'
    | 'character'
    | 'web'
    | 'translation'
    | 'chapter'
    | 'paragraph'
    | 'book'
    | 'memory'
    | 'todo'
    | 'user'
    | 'help_doc';
  data:
    | Terminology
    | CharacterSetting
    | TodoItem
    | { id: string; name?: string }
    | {
        query?: string;
        url?: string;
        results?: unknown;
        title?: string;
        success?: boolean;
        name?: string;
        tool_name?: string;
      }
    | {
        paragraph_id: string;
        translation_id: string;
        old_translation: string;
        new_translation: string;
      }
    | {
        chapter_id?: string;
        chapter_title?: string;
        paragraph_id?: string;
        character_name?: string;
        book_id?: string;
        tool_name?: string;
        old_title?: string;
        new_title?: string;
        regex_pattern?: string;
        keywords?: string[];
        translation_keywords?: string[];
        original_keywords?: string[];
        volume_ids?: string[];
        // 批量替换相关字段
        replaced_paragraph_count?: number;
        replaced_translation_count?: number;
        replacement_text?: string;
        replace_all_translations?: boolean;
      }
    | {
        memory_id?: string;
        keyword?: string;
        keywords?: string[];
        summary?: string;
        id?: string;
        tool_name?: string;
        limit?: number;
        offset?: number;
        sort_by?: string;
        include_content?: boolean;
        found_memory_ids?: string[];
      }
    | {
        doc_id: string;
        doc_title: string;
        section_id?: string;
        tool_name?: string;
      }
    | {
        tool_name: 'ask_user';
        question: string;
        suggested_answers?: string[];
        answer?: string;
        selected_index?: number;
        cancelled?: boolean;
      }
    | {
        tool_name: 'ask_user_batch';
        questions: string[];
        answers: Array<{
          question_index: number;
          answer: string;
          selected_index?: number;
        }>;
        cancelled?: boolean;
      };
  previousData?:
    | Terminology
    | CharacterSetting
    | Translation
    | Memory
    | TodoItem
    | { title_original?: string; title_translation?: string } // 用于 revert 的原始数据（仅用于 update 操作）
    | {
        replaced_paragraphs?: Array<{
          paragraph_id: string;
          chapter_id: string;
          old_selected_translation_id?: string;
          old_translations: Translation[];
        }>;
      } // 批量替换的原始数据（仅用于 batch_replace_translations 操作）
    | {
        description?: string;
        tags?: string[];
        author?: string;
        alternateTitles?: string[];
      }; // 书籍信息更新的原始数据（仅用于 update_book_info 操作）
}

/**
 * 块边界信息，用于限制 AI 只能访问当前处理块内的段落
 * 仅在 translation/polish/proofreading 等分块处理任务中提供
 */
export interface ChunkBoundaries {
  /** 当前块允许访问的段落 ID 集合（用于 O(1) 边界检查） */
  allowedParagraphIds: Set<string>;
  /** 当前块的段落 ID 数组（按顺序，用于索引映射） */
  paragraphIds: string[];
  /** 当前块的第一个段落 ID（用于错误提示） */
  firstParagraphId: string;
  /** 当前块的最后一个段落 ID（用于错误提示） */
  lastParagraphId: string;
}

export interface ToolContext {
  bookId?: string; // 某些工具（如网络搜索）不需要 bookId
  taskId?: string; // AI 任务 ID，由服务层自动提供，用于关联待办事项等
  sessionId?: string; // 聊天会话 ID，由服务层自动提供，用于关联助手聊天的待办事项
  aiModelId?: string; // AI 模型 ID（用于写入翻译来源）
  onAction?: (action: ActionInfo) => void;
  onToast?: ToastCallback; // Toast 回调函数，用于在工具中直接显示 toast
  /**
   * 块边界信息（可选）
   * 仅在 translation/polish/proofreading 等分块任务中提供，用于限制 AI 只能访问当前块内的段落
   * 如果未提供，工具可以访问所有段落（如 AI 助手聊天场景）
   */
  chunkBoundaries?: ChunkBoundaries;
  /**
   * AI 处理 Store（可选）
   * 用于任务状态工具访问和更新任务状态
   */
  aiProcessingStore?: AIProcessingStore;
  /**
   * 当前块索引（可选）
   * 仅在分块任务中提供，用于判断是否为首块（chunkIndex === 0）
   * 非首块的 review 检查会跳过章节标题验证
   */
  chunkIndex?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<string> | string;

export interface ToolDefinition {
  definition: AITool;
  handler: ToolHandler;
}

/**
 * 类型辅助函数：安全地将 Record<string, unknown> 转换为具体类型
 * 用于工具 handler 中提取参数
 */
export function parseToolArgs<T>(args: Record<string, unknown>): T {
  return args as unknown as T;
}
