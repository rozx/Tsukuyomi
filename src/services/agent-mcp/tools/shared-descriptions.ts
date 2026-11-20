import { describeTool } from 'src/services/ai/tools/tool-localization';

/**
 * 外部工具 → 站内对应工具的说明。表里的外部工具，其说明由「一句功能概述 + 站内说明原文」组成，
 * 所以「什么时候该用、该怎么用」在站内与外部是同一份文字，站内一改这里自动跟着变，不会各说各的。
 *
 * 只收录功能对得上的工具；站内说明里提到的工具名与参数写法，由 tools.ts 里的 audience 片段换成外部的说法。
 * agent-mcp-shared-descriptions.test.ts 按这张表校验。
 */
export const SHARED_TOOL_GUIDANCE = {
  upsert_terms: 'create_term',
  delete_terms: 'delete_term',
  search_memories: 'search_memories',
  delete_memories: 'delete_memory',
  get_special_instructions: 'get_special_instructions',
  update_special_instructions: 'update_special_instructions',
  search_chapters: 'query_chapter',
  count_occurrences: 'get_occurrences_by_keywords',
  update_book: 'update_book_info',
  move_chapters: 'move_chapters',
  search_help_docs: 'search_help_docs',
} as const;

type SharedExternalTool = keyof typeof SHARED_TOOL_GUIDANCE;

/** 外部工具的说明：功能概述（英文，说明外部工具自己的参数与返回）后面接上站内对应工具的说明原文 */
export function withBuiltinGuidance(tool: SharedExternalTool, summary: string): string {
  return `${summary} ${describeTool(SHARED_TOOL_GUIDANCE[tool], 'external')}`;
}
