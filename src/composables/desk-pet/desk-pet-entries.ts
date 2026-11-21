/**
 * 把任务的流式时间线（useThinkingFormatter 解析出的片段）转成月詠桌宠气泡里的条目：
 * 思考 / 工具 / 输出。纯函数，台词经 i18n 查表。
 */
import type { FormattedMessagePart, ToolCallTone } from 'src/composables/useThinkingFormatter';
import { plainTextLines } from 'src/utils/text-utils';

export interface DeskPetEntry {
  kind: 'thinking' | 'tool' | 'output';
  /** 显示的一行：思考 / 输出为文字末尾，工具为台词 */
  text: string;
  /** 工具条目的原始工具名 */
  tool?: string;
  /** 工具条目的执行状态 */
  toolStatus?: ToolCallTone;
}

/** 展开时保留的最近条目数 */
const EXPANDED_ENTRIES = 8;
/** 末尾一行超过这个长度时只保留结尾 */
const MAX_TAIL = 80;

type ToolGroup =
  | 'memoryRead'
  | 'memoryWrite'
  | 'chapterRead'
  | 'termRead'
  | 'termWrite'
  | 'characterRead'
  | 'characterWrite'
  | 'paragraphRead'
  | 'translationWrite'
  | 'todo'
  | 'taskStatus'
  | 'bookRead'
  | 'helpRead';

/** 工具 → 台词分组；未收录的工具走通用台词 */
const TOOL_GROUPS: Readonly<Record<string, ToolGroup>> = {
  search_memories: 'memoryRead',
  get_memory: 'memoryRead',
  create_memory: 'memoryWrite',
  update_memory: 'memoryWrite',
  query_chapter: 'chapterRead',
  get_chapter_info: 'chapterRead',
  get_previous_chapter: 'chapterRead',
  get_next_chapter: 'chapterRead',
  list_chapters: 'chapterRead',
  list_chapters_by_volume: 'chapterRead',
  get_term: 'termRead',
  list_terms: 'termRead',
  search_terms_by_keywords: 'termRead',
  create_term: 'termWrite',
  update_term: 'termWrite',
  get_character: 'characterRead',
  list_characters: 'characterRead',
  search_characters_by_keywords: 'characterRead',
  create_character: 'characterWrite',
  update_character: 'characterWrite',
  get_paragraph_info: 'paragraphRead',
  get_paragraph_position: 'paragraphRead',
  find_paragraph_by_keywords: 'paragraphRead',
  get_occurrences_by_keywords: 'paragraphRead',
  get_translation_history: 'paragraphRead',
  add_translation: 'translationWrite',
  add_translation_batch: 'translationWrite',
  update_translation: 'translationWrite',
  batch_replace_translations: 'translationWrite',
  select_translation: 'translationWrite',
  create_todo: 'todo',
  update_todos: 'todo',
  mark_todo_working: 'todo',
  mark_todo_done: 'todo',
  update_task_status: 'taskStatus',
  get_book_info: 'bookRead',
  get_special_instructions: 'bookRead',
  search_help_docs: 'helpRead',
  get_help_doc: 'helpRead',
  list_help_docs: 'helpRead',
};

interface Translator {
  t: (key: string, params?: Record<string, unknown>) => string;
}

/** 工具调用的一句说明：简繁中文为月詠口吻，英文为中性表达 */
export function deskPetToolLine(i18n: Translator, tool: string): string {
  const group = TOOL_GROUPS[tool];
  return group
    ? i18n.t(`deskPetUi.tools.${group}`)
    : i18n.t('deskPetUi.tools.fallback', { tool });
}

/** 文字的最后一个非空行（去掉 Markdown 标记），太长时只保留结尾（正在写的内容） */
export function tailLine(text: string): string {
  const lines = plainTextLines(text);
  const last = lines[lines.length - 1] ?? '';
  return last.length > MAX_TAIL ? `…${last.slice(-MAX_TAIL)}` : last;
}

/** 文字的第一个非空行，太长时只保留开头（回复小结用） */
export function headLine(text: string | undefined): string {
  const first = plainTextLines(text ?? '')[0] ?? '';
  return first.length > MAX_TAIL ? `${first.slice(0, MAX_TAIL)}…` : first;
}

/**
 * 片段 → 条目：工具调用一条（台词 + 工具名 + 状态），思考 / 输出各取末尾一行；
 * 工具结果的状态已回填到对应的工具调用上，状态切换与分块分隔不成条。
 * 时间线为空时用 outputContent 兜底（例如只写了输出的旧记录）。
 */
export function buildDeskPetEntries(
  parts: readonly FormattedMessagePart[],
  options: { toolLine: (tool: string) => string; outputContent?: string | undefined },
): DeskPetEntry[] {
  const entries: DeskPetEntry[] = [];
  for (const part of parts) {
    if (part.type === 'tool-call' && part.toolName) {
      const entry: DeskPetEntry = {
        kind: 'tool',
        text: options.toolLine(part.toolName),
        tool: part.toolName,
      };
      if (part.toolCallTone) entry.toolStatus = part.toolCallTone;
      entries.push(entry);
    } else if (part.type === 'content') {
      const text = tailLine(part.text);
      if (text) entries.push({ kind: part.mode === 'output' ? 'output' : 'thinking', text });
    }
  }
  if (entries.length === 0 && options.outputContent) {
    const text = tailLine(options.outputContent);
    if (text) entries.push({ kind: 'output', text });
  }
  return entries;
}

/** 收起只显示最新一条，展开显示最近若干条（最新在最后） */
export function visibleEntries(entries: readonly DeskPetEntry[], expanded: boolean): DeskPetEntry[] {
  return entries.slice(expanded ? -EXPANDED_ENTRIES : -1);
}
