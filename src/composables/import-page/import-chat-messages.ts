/**
 * 把导入任务的持久事件转换成月詠聊天组件使用的消息格式。
 *
 * 工具调用挂在发出它的助手消息上，作为操作记录显示；名称写明处理的来源与实际结果，
 * 便于用户定位来源或草稿。问答与待办沿用聊天已有的徽章字段。
 */
import type { ImportEvent } from 'src/models/import';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import type { AIToolCall } from 'src/services/ai/types/ai-service';
import { TOOL_CALL_PLACEHOLDER_VARIANTS } from 'src/constants/chat';

/** 操作记录当前显示内容的短指纹（djb2），只用于区分消息标识，不作安全用途。 */
function fingerprint(actions: MessageAction[]): string {
  const text = actions
    .map(
      (action) =>
        `${action.name ?? ''}|${action.answer ?? ''}|${action.batch_answers?.length ?? 0}`,
    )
    .join('\n');
  let hash = 5381;
  for (let index = 0; index < text.length; index++)
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

interface MessageOptions {
  sourceNames: Map<string, string>;
  streaming?: string;
  /** 正在压缩上下文：末尾显示临时的总结气泡。 */
  compacting?: boolean;
}

const COMPACTED_TEXT = '对话上下文已压缩为摘要，来源、草稿和操作记录保持不变。';
const COMPACTING_TEXT = '正在压缩对话上下文…';

type Args = Record<string, unknown>;
type Result = Record<string, unknown> | undefined;
type ActionShape = Pick<MessageAction, 'type' | 'entity'>;

const ACTION_SHAPES: Record<string, ActionShape> = {
  prepare_chapter_batch: { type: 'create', entity: 'chapter' },
  run_chapter_batch: { type: 'create', entity: 'chapter' },
  get_chapter_batch: { type: 'read', entity: 'chapter' },
  list_sources: { type: 'read', entity: 'web' },
  inspect_source: { type: 'read', entity: 'web' },
  read_source: { type: 'read', entity: 'web' },
  extract_novel_info: { type: 'read', entity: 'book' },
  add_sources: { type: 'create', entity: 'web' },
  extract_content: { type: 'create', entity: 'chapter' },
  get_import_draft: { type: 'read', entity: 'chapter' },
  edit_import_draft: { type: 'update', entity: 'chapter' },
  search_books: { type: 'search', entity: 'book' },
  get_book_info: { type: 'read', entity: 'book' },
  list_chapters: { type: 'read', entity: 'book' },
  get_chapter_info: { type: 'read', entity: 'chapter' },
  search_web: { type: 'web_search', entity: 'web' },
  preview_import: { type: 'read', entity: 'book' },
  rename_import_task: { type: 'update', entity: 'book' },
  ask_user: { type: 'ask', entity: 'user' },
  ask_user_batch: { type: 'ask', entity: 'user' },
  create_todo: { type: 'create', entity: 'todo' },
  update_todos: { type: 'update', entity: 'todo' },
  mark_todo_done: { type: 'update', entity: 'todo' },
  mark_todo_working: { type: 'update', entity: 'todo' },
  delete_todo: { type: 'delete', entity: 'todo' },
  list_todos: { type: 'read', entity: 'todo' },
};

function parseArgs(raw: string): Args {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Args) : {};
  } catch {
    return {};
  }
}

function sourceLabel(id: unknown, names: Map<string, string>): string {
  return typeof id === 'string' ? (names.get(id) ?? id.slice(0, 8)) : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** 操作本身的描述：处理了哪些来源、范围或草稿。 */
function describe(name: string, args: Args, names: Map<string, string>): string {
  switch (name) {
    case 'prepare_chapter_batch':
      return '准备章节批次';
    case 'run_chapter_batch':
      return args.retry_failed ? '重试失败章节' : '批量提取章节';
    case 'get_chapter_batch':
      return '查看批次进度';
    case 'list_sources':
      return '列出来源';
    case 'inspect_source':
      return `检查来源：${sourceLabel(args.source_id, names)}`;
    case 'read_source':
      return '查看来源内容';
    case 'extract_novel_info':
      return `读取小说信息：${sourceLabel(args.source_id, names)}`;
    case 'add_sources':
      return `追加 ${count(args.discovery_ids)} 个发现的来源`;
    case 'extract_content': {
      const sources = (Array.isArray(args.sources) ? args.sources : []) as Args[];
      const labels = sources.slice(0, 3).map((entry) => sourceLabel(entry.source_id, names));
      const more = sources.length > 3 ? ` 等 ${sources.length} 个` : '';
      return `提取正文：${labels.join('、')}${more}`;
    }
    case 'get_import_draft':
      return '读取草稿';
    case 'edit_import_draft':
      return `编辑草稿：${count(args.operations)} 项操作`;
    case 'search_books':
      return `查找本地小说：${typeof args.query === 'string' ? args.query : ''}`;
    case 'get_book_info':
    case 'list_chapters':
    case 'get_chapter_info':
      return '对照本地小说';
    case 'preview_import':
      return '生成导入方案';
    case 'rename_import_task':
      return `命名任务：${text(args.name)}`;
    default:
      return name;
  }
}

function errorMessage(result: Args): string {
  const error = result.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as Args).message;
    if (typeof message === 'string') return message.replace(/^[A-Z_]+:\s*/, '');
  }
  return '未知错误';
}

/** 实际结果：成功/失败数量或错误原因；尚无结果时显示进行中。 */
function outcome(name: string, result: Result): string {
  if (!result) return '（进行中）';
  if (result.success === false && name !== 'extract_content')
    return `（失败：${errorMessage(result)}）`;
  if (['prepare_chapter_batch', 'run_chapter_batch', 'get_chapter_batch'].includes(name)) {
    const ready = typeof result.ready === 'number' ? result.ready : 0;
    const failed = typeof result.failed === 'number' ? result.failed : 0;
    const pending = typeof result.pending === 'number' ? result.pending : 0;
    return `（成功 ${ready}／失败 ${failed}／待处理 ${pending}）`;
  }
  if (name === 'extract_content' && Array.isArray(result.results)) {
    const results = result.results as Args[];
    const ok = results.filter((entry) => entry.success === true).length;
    return `（成功 ${ok}／失败 ${results.length - ok}）`;
  }
  if (name === 'edit_import_draft' && typeof result.draftRevision === 'number')
    return `（草稿版本 ${result.draftRevision}）`;
  if (name === 'preview_import' && Array.isArray(result.conflicts))
    return result.conflicts.length ? `（${result.conflicts.length} 个待处理）` : '（可检查）';
  return '';
}

function todoName(args: Args): string {
  if (typeof args.text === 'string') return args.text;
  if (Array.isArray(args.items)) return (args.items as unknown[]).map(String).join('、');
  return typeof args.id === 'string' ? args.id : '待办';
}

type AnswerData = { answers?: { questionIndex: number; answer: string; selectedIndex?: number }[] };

function askAction(call: AIToolCall, args: Args, answer: AnswerData | undefined) {
  const answers = answer?.answers ?? [];
  if (call.function.name === 'ask_user_batch') {
    const questions = (Array.isArray(args.questions) ? args.questions : []) as Args[];
    return {
      batch_questions: questions.map((entry) => text(entry.question)),
      ...(answers.length
        ? {
            batch_answers: answers.map((entry) => ({
              question_index: entry.questionIndex,
              answer: entry.answer,
              ...(entry.selectedIndex !== undefined ? { selected_index: entry.selectedIndex } : {}),
            })),
          }
        : {}),
    };
  }
  const [first] = answers;
  return {
    question: text(args.question),
    ...(Array.isArray(args.suggested_answers)
      ? { suggested_answers: (args.suggested_answers as unknown[]).map(String) }
      : {}),
    ...(first ? { answer: first.answer } : {}),
    ...(first?.selectedIndex !== undefined ? { selected_index: first.selectedIndex } : {}),
  };
}

function toAction(
  call: AIToolCall,
  timestamp: number,
  results: Map<string, Result>,
  answers: Map<string, AnswerData>,
  names: Map<string, string>,
): MessageAction {
  const tool = call.function.name;
  const args = parseArgs(call.function.arguments);
  const shape = ACTION_SHAPES[tool] ?? { type: 'read', entity: 'web' };
  const base = { ...shape, timestamp, tool_name: tool };
  if (shape.type === 'ask') return { ...base, ...askAction(call, args, answers.get(call.id)) };
  if (shape.entity === 'todo') return { ...base, name: todoName(args) };
  if (shape.type === 'web_search')
    return { ...base, query: typeof args.query === 'string' ? args.query : '' };
  return {
    ...base,
    name: `${describe(tool, args, names)}${outcome(tool, results.get(call.id))}`,
  };
}

export function importEventsToMessages(
  events: ImportEvent[],
  options: MessageOptions,
): ChatSessionMessage[] {
  const results = new Map<string, Result>();
  const answers = new Map<string, AnswerData>();
  for (const event of events) {
    if (event.kind === 'tool-result' && event.callId)
      results.set(event.callId, event.data as Result);
    if (event.kind === 'answer' && event.callId)
      answers.set(event.callId, event.data as AnswerData);
  }
  const messages: ChatSessionMessage[] = [];
  for (const event of events) {
    if (event.kind === 'summary') {
      messages.push({
        id: event.id,
        role: 'assistant',
        content: COMPACTED_TEXT,
        timestamp: event.createdAt,
        isSummarization: true,
      });
      continue;
    }
    const message = event.message;
    if (event.kind !== 'message' || !message) continue;
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const calls = message.role === 'assistant' ? (message.tool_calls ?? []) : [];
    const actions = calls.map((call, index) =>
      toAction(call, event.createdAt + index, results, answers, options.sourceNames),
    );
    const content = message.content ?? '';
    messages.push({
      // 聊天列表按消息标识缓存操作记录；结果或回答到达后标识随之变化以触发刷新
      id: actions.length ? `${event.id}:${fingerprint(actions)}` : event.id,
      role: message.role,
      content: (TOOL_CALL_PLACEHOLDER_VARIANTS as readonly string[]).includes(content.trim())
        ? ''
        : content,
      timestamp: event.createdAt,
      ...(message.reasoning_content ? { thinkingProcess: message.reasoning_content } : {}),
      ...(actions.length ? { actions } : {}),
    });
  }
  if (options.streaming)
    messages.push({
      id: 'import-streaming',
      role: 'assistant',
      content: options.streaming,
      timestamp: Date.now(),
    });
  if (options.compacting)
    messages.push({
      id: 'import-compacting',
      role: 'assistant',
      content: COMPACTING_TEXT,
      timestamp: Date.now(),
      isSummarization: true,
    });
  return messages;
}
