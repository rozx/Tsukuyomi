import type { Terminology, CharacterSetting, Translation } from 'src/models/novel';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface ActionInfo {
  type: 'create' | 'update' | 'delete' | 'web_search' | 'web_fetch' | 'read';
  entity: 'term' | 'character' | 'web' | 'translation' | 'chapter' | 'paragraph' | 'book' | 'memory';
  data:
    | Terminology
    | CharacterSetting
    | { id: string; name?: string }
    | { query?: string; url?: string; results?: unknown; title?: string; success?: boolean }
    | { paragraph_id: string; translation_id: string; old_translation: string; new_translation: string }
    | { chapter_id?: string; chapter_title?: string; paragraph_id?: string; character_name?: string; book_id?: string; tool_name?: string }
    | { memory_id?: string; keyword?: string; summary?: string; id?: string };
  previousData?: Terminology | CharacterSetting | Translation; // 用于 revert 的原始数据（仅用于 update 操作）
}

export interface ToolContext {
  bookId?: string; // 某些工具（如网络搜索）不需要 bookId
  onAction?: (action: ActionInfo) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (args: any, context: ToolContext) => Promise<string> | string;

export interface ToolDefinition {
  definition: AITool;
  handler: ToolHandler;
}
