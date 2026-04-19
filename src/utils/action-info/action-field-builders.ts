import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MessageAction } from 'src/stores/chat-sessions';

type PartialAction = Partial<MessageAction>;
type ActionData = ActionInfo['data'];

/**
 * 工具：从 source 里挑若干键，若存在且非空则复制到结果对象。
 */
function pickDefined<T extends object>(source: T, keys: readonly (keyof T)[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

export function buildWebFields(action: ActionInfo): PartialAction {
  const result: PartialAction = {};
  const data = action.data as Record<string, unknown>;
  if (action.type === 'web_search' && 'query' in data) {
    result.query = data.query as string;
  }
  if (action.type === 'web_fetch' && 'url' in data) {
    result.url = data.url as string;
  }
  return result;
}

export function buildTranslationFields(action: ActionInfo): PartialAction {
  if (action.entity !== 'translation') return {};
  const data = action.data as Record<string, unknown>;

  if ('paragraph_id' in data && 'translation_id' in data) {
    const result: PartialAction = {
      paragraph_id: data.paragraph_id as string,
      translation_id: data.translation_id as string,
    };
    if (data.old_translation) result.old_translation = data.old_translation as string;
    if (data.new_translation) result.new_translation = data.new_translation as string;
    return result;
  }

  return {};
}

export function buildBatchReplaceFields(action: ActionInfo): PartialAction {
  if (action.entity !== 'translation') return {};
  const data = action.data as Record<string, unknown>;
  if (data.tool_name !== 'batch_replace_translations') return {};

  const result: PartialAction = { tool_name: 'batch_replace_translations' };
  if (data.replaced_paragraph_count !== undefined) {
    result.replaced_paragraph_count = data.replaced_paragraph_count as number;
  }
  if (data.replaced_translation_count !== undefined) {
    result.replaced_translation_count = data.replaced_translation_count as number;
  }
  if (data.replacement_text) {
    result.replacement_text = data.replacement_text as string;
  }
  if (data.replace_all_translations !== undefined) {
    result.replace_all_translations = data.replace_all_translations as boolean;
  }
  if (data.keywords) {
    result.keywords = data.keywords as string[];
  }
  if (data.original_keywords) {
    result.original_keywords = data.original_keywords as string[];
  }
  return result;
}

const READ_PASS_THROUGH_KEYS = [
  'chapter_id',
  'chapter_title',
  'paragraph_id',
  'character_name',
  'tool_name',
  'title',
  'url',
  'book_id',
  'keywords',
  'translation_keywords',
  'regex_pattern',
] as const;

export function buildReadFields(action: ActionInfo): PartialAction {
  if (action.type !== 'read') return {};
  const data = action.data as Record<string, unknown>;
  return pickDefined(data, READ_PASS_THROUGH_KEYS) as PartialAction;
}

const SEARCH_PASS_THROUGH_KEYS = ['tool_name', 'keywords', 'book_id', 'query'] as const;

export function buildSearchFields(action: ActionInfo): PartialAction {
  if (action.type !== 'search') return {};
  const data = action.data as Record<string, unknown>;
  return pickDefined(data, SEARCH_PASS_THROUGH_KEYS) as PartialAction;
}

export function buildMemoryFields(action: ActionInfo): PartialAction {
  if (action.entity !== 'memory') return {};
  const data = action.data as Record<string, unknown>;
  const result: PartialAction = {};
  if ('memory_id' in data) result.memory_id = data.memory_id as string;
  if ('keyword' in data) result.keyword = data.keyword as string;
  if ('summary' in data) result.name = data.summary as string;
  return result;
}

export function buildTodoFields(action: ActionInfo): PartialAction {
  if (action.entity !== 'todo') return {};
  const data = action.data as Record<string, unknown>;
  if ('text' in data) {
    return { name: data.text as string };
  }
  return {};
}

const NAVIGATE_PASS_THROUGH_KEYS = [
  'book_id',
  'chapter_id',
  'chapter_title',
  'paragraph_id',
] as const;

export function buildNavigateFields(action: ActionInfo): PartialAction {
  if (action.type !== 'navigate') return {};
  const data = action.data as Record<string, unknown>;
  return pickDefined(data, NAVIGATE_PASS_THROUGH_KEYS) as PartialAction;
}

export function buildHelpDocNavigateFields(action: ActionInfo): PartialAction {
  if (action.type !== 'navigate' || action.entity !== 'help_doc') return {};
  const data = action.data as Record<string, unknown>;
  if (!('doc_id' in data)) return {};

  const result: PartialAction = { doc_id: data.doc_id as string };
  if (data.doc_title) result.title = data.doc_title as string;
  if (data.section_id) result.section_id = data.section_id as string;
  return result;
}

function extractAnswerForAskUser(data: Record<string, unknown>): PartialAction {
  const result: PartialAction = {};
  if (typeof data.answer === 'string') result.answer = data.answer;
  if (typeof data.selected_index === 'number') result.selected_index = data.selected_index;
  if (data.cancelled) result.cancelled = true;
  if (Array.isArray(data.suggested_answers)) {
    result.suggested_answers = data.suggested_answers as string[];
  }
  return result;
}

export function buildAskUserFields(action: ActionInfo): PartialAction {
  if (action.type !== 'ask' || action.entity !== 'user') return {};
  const data = action.data as Record<string, unknown>;

  if (data.tool_name === 'ask_user' && 'question' in data) {
    return {
      tool_name: 'ask_user',
      question: data.question as string,
      ...extractAnswerForAskUser(data),
    };
  }

  if (data.tool_name === 'ask_user_batch' && 'questions' in data && 'answers' in data) {
    const result: PartialAction = {
      tool_name: 'ask_user_batch',
      batch_questions: data.questions as string[],
      batch_answers: data.answers as NonNullable<MessageAction['batch_answers']>,
    };
    if (data.cancelled) result.cancelled = true;
    return result;
  }

  return {};
}

export function buildChapterUpdateFields(action: ActionInfo): PartialAction {
  if (action.type !== 'update' || action.entity !== 'chapter') return {};
  const data = action.data as Record<string, unknown>;
  const result: PartialAction = {};
  if ('old_title' in data) result.old_title = data.old_title as string;
  if ('new_title' in data) result.new_title = data.new_title as string;
  if ('tool_name' in data) result.tool_name = data.tool_name as string;
  return result;
}

export function extractActionName(data: ActionData): string | undefined {
  return 'name' in data ? (data.name as string) : undefined;
}
