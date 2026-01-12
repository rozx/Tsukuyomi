import type { Terminology, CharacterSetting, Translation } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { TodoItem } from 'src/services/todo-list-service';
import type { AITool } from 'src/services/ai/types/ai-service';
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
    | 'ask';
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
    | 'user';
  data:
    | Terminology
    | CharacterSetting
    | TodoItem
    | { id: string; name?: string }
    | { query?: string; url?: string; results?: unknown; title?: string; success?: boolean }
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
        sort_by?: string;
      }
    | {
        tool_name: 'ask_user';
        question: string;
        suggested_answers?: string[];
        answer?: string;
        selected_index?: number;
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

export interface ToolContext {
  bookId?: string; // 某些工具（如网络搜索）不需要 bookId
  taskId?: string; // AI 任务 ID，由服务层自动提供，用于关联待办事项等
  sessionId?: string; // 聊天会话 ID，由服务层自动提供，用于关联助手聊天的待办事项
  onAction?: (action: ActionInfo) => void;
  onToast?: ToastCallback; // Toast 回调函数，用于在工具中直接显示 toast
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (args: any, context: ToolContext) => Promise<string> | string;

export interface ToolDefinition {
  definition: AITool;
  handler: ToolHandler;
}
