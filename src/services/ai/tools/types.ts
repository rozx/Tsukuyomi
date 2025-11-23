import type { Terminology, CharacterSetting } from 'src/models/novel';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface ActionInfo {
  type: 'create' | 'update' | 'delete' | 'web_search' | 'web_fetch';
  entity: 'term' | 'character' | 'web';
  data:
    | Terminology
    | CharacterSetting
    | { id: string; name?: string }
    | { query?: string; url?: string; results?: unknown; title?: string; success?: boolean };
  previousData?: Terminology | CharacterSetting; // 用于 revert 的原始数据（仅用于 update 操作）
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
