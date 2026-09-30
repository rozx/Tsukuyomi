import type { AppLocale } from 'src/models/locale';
import { importActionInfo } from './import-action-info';
import type { MessageKey } from 'src/i18n/types';
import { localizeImportFeedback } from 'src/services/import/import-error';
import {
  actionList,
  actionObject,
  actionT,
  createImportActionContext,
} from './import-action-context';
import type { ImportActionContext, ImportActionTask } from './import-action-context';
/**
 * 把导入任务的持久事件转换成月詠聊天组件使用的消息格式。
 *
 * 工具调用挂在发出它的助手消息上，作为操作记录显示；名称写明处理的来源与实际结果，
 * 便于用户定位来源或草稿。问答与待办沿用聊天已有的徽章字段。
 */
import type { ImportEvent, ImportSource } from 'src/models/import';
import type { ChatSessionMessage, MessageAction } from 'src/stores/chat-sessions';
import type { AIToolCall } from 'src/services/ai/types/ai-service';
import { TOOL_CALL_PLACEHOLDER_VARIANTS } from 'src/constants/chat';

/** 操作记录当前显示内容的短指纹（djb2），只用于区分消息标识，不作安全用途。 */
function fingerprint(actions: MessageAction[]): string {
  const text = actions
    .map(
      (action) =>
        `${action.name ?? ''}|${JSON.stringify(action.descriptionDetails ?? [])}|${action.answer ?? ''}|${action.batch_answers?.length ?? 0}`,
    )
    .join('\n');
  let hash = 5381;
  for (let index = 0; index < text.length; index++)
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

interface MessageOptions {
  uiLocale?: AppLocale;
  sourceNames: Map<string, string>;
  task?: ImportActionTask;
  sources?: Pick<ImportSource, 'id' | 'name' | 'url' | 'relativePath'>[];
  streaming?: string;
  /** 正在压缩上下文：末尾显示临时的总结气泡。 */
  compacting?: boolean;
}

type Args = Record<string, unknown>;
type Result = Record<string, unknown> | undefined;
type ActionShape = Pick<MessageAction, 'type' | 'entity'>;

const ACTION_SHAPES: Record<string, ActionShape> = {
  preview_text_structure: { type: 'read', entity: 'chapter' },
  get_text_structure: { type: 'read', entity: 'chapter' },
  apply_text_structure: { type: 'update', entity: 'chapter' },
  preview_draft_batch: { type: 'read', entity: 'chapter' },
  apply_draft_batch: { type: 'update', entity: 'chapter' },
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
  record_update_recipe: { type: 'update', entity: 'book' },
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

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

type Describe = (args: Args, context: ImportActionContext) => string;

function extractionLabel(args: Args, context: ImportActionContext): string {
  if (args.filter) return actionT(context, 'importUi.action.chat.filterExtract');
  const sources = (Array.isArray(args.sources) ? args.sources : []) as Args[];
  const labels = sources.slice(0, 3).map((entry) => sourceLabel(entry.source_id, context.sources));
  return actionT(context, 'importUi.action.chat.extract', {
    sources: labels.join(actionList(context)),
    more:
      sources.length > 3
        ? actionT(context, 'importUi.action.chat.moreSources', { count: sources.length })
        : '',
  });
}

const fixed =
  (key: MessageKey): Describe =>
  (_args, context) =>
    actionT(context, key);
const libraryLabel = fixed('importUi.action.chat.library');

/** 操作本身的描述：处理了哪些来源、范围或草稿（未由 importActionInfo 给出摘要时使用）。 */
const DESCRIPTIONS: Record<string, Describe> = {
  preview_draft_batch: (args, context) =>
    actionT(
      context,
      args.target === 'body'
        ? 'importUi.action.chat.previewBodyBatch'
        : 'importUi.action.chat.previewTitleBatch',
    ),
  apply_draft_batch: fixed('importUi.action.chat.applyBatch'),
  prepare_chapter_batch: fixed('importUi.action.batch.prepare'),
  run_chapter_batch: (args, context) =>
    actionT(
      context,
      args.retry_failed ? 'importUi.action.batch.retry' : 'importUi.action.batch.run',
    ),
  get_chapter_batch: fixed('importUi.action.batch.progress'),
  list_sources: fixed('importUi.action.chat.listSources'),
  inspect_source: (args, context) =>
    actionT(context, 'importUi.action.chat.inspectSource', {
      source: sourceLabel(args.source_id, context.sources),
    }),
  read_source: fixed('importUi.action.chat.readSource'),
  extract_novel_info: (args, context) =>
    actionT(context, 'importUi.action.chat.novelInfo', {
      source: sourceLabel(args.source_id, context.sources),
    }),
  add_sources: (args, context) =>
    args.filter
      ? actionT(context, 'importUi.action.chat.filterAddSources')
      : actionT(context, 'importUi.action.chat.addDiscoveries', {
          count: count(args.discovery_ids),
        }),
  extract_content: extractionLabel,
  get_import_draft: fixed('importUi.action.chat.readDraft'),
  edit_import_draft: (args, context) =>
    actionT(context, 'importUi.action.chat.editDraft', { count: count(args.operations) }),
  search_books: (args, context) =>
    actionT(context, 'importUi.action.chat.searchBooks', { query: text(args.query) }),
  get_book_info: libraryLabel,
  list_chapters: libraryLabel,
  get_chapter_info: libraryLabel,
  preview_import: fixed('importUi.action.chat.previewImport'),
  rename_import_task: (args, context) =>
    actionT(context, 'importUi.action.chat.rename', { name: text(args.name) }),
  search_web: (args, context) =>
    actionT(context, 'importUi.action.chat.searchWeb', { query: text(args.query) }),
};

function describe(name: string, args: Args, context: ImportActionContext): string {
  return DESCRIPTIONS[name]?.(args, context) ?? name;
}

function errorMessage(result: Args, context: ImportActionContext): string {
  const error = result.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as Args).message;
    if (typeof message === 'string') return message.replace(/^[A-Z_]+:\s*/, '');
  }
  return actionT(context, 'importUi.action.chat.unknownError');
}

function batchOutcome(name: string, result: Args, context: ImportActionContext): string {
  if (['preview_draft_batch', 'apply_draft_batch'].includes(name))
    return actionT(context, 'importUi.action.chat.affected', {
      affected: numberOf(result.affected),
      matches: numberOf(result.matches),
    });
  if (name === 'add_sources' && Array.isArray(result.sources))
    return actionT(context, 'importUi.action.chat.added', { count: result.sources.length });
  if (['prepare_chapter_batch', 'run_chapter_batch', 'get_chapter_batch'].includes(name))
    return actionT(context, 'importUi.action.chat.batchCounts', {
      ready: numberOf(result.ready),
      failed: numberOf(result.failed),
      pending: numberOf(result.pending),
    });
  if (name === 'extract_content' && Array.isArray(result.results)) {
    const results = result.results as Args[];
    const ok = results.filter((entry) => entry.success === true).length;
    return actionT(context, 'importUi.action.chat.extractCounts', {
      ready: ok,
      failed: results.length - ok,
    });
  }
  return '';
}

/** 实际结果：成功/失败数量或错误原因；尚无结果时显示进行中。 */
function outcome(name: string, result: Result, context: ImportActionContext): string {
  if (!result) return actionT(context, 'importUi.action.chat.inProgress');
  if (result.success === false && name !== 'extract_content')
    return actionT(context, 'importUi.action.chat.failed', {
      reason: errorMessage(result, context),
    });
  const batch = batchOutcome(name, result, context);
  if (batch) return batch;
  if (name === 'edit_import_draft' && typeof result.draftRevision === 'number')
    return actionT(context, 'importUi.action.chat.revision', { revision: result.draftRevision });
  if (name === 'record_update_recipe' && typeof result.verified === 'number')
    return actionT(context, 'importUi.action.chat.recipe', {
      verified: result.verified,
      pinned:
        typeof result.pinned === 'number' && result.pinned
          ? actionT(context, 'importUi.action.chat.recipePinned', { count: result.pinned })
          : '',
    });
  if (name === 'preview_import' && Array.isArray(result.conflicts))
    return result.conflicts.length
      ? actionT(context, 'importUi.action.chat.pending', { count: result.conflicts.length })
      : actionT(context, 'importUi.action.chat.reviewable');
  if (name === 'search_web' && Array.isArray(result.results))
    return actionT(context, 'importUi.action.chat.results', { count: result.results.length });
  return '';
}

function todoName(args: Args, context: ImportActionContext): string {
  if (typeof args.text === 'string') return args.text;
  if (Array.isArray(args.items))
    return (args.items as unknown[]).map(String).join(actionList(context));
  return typeof args.id === 'string' ? args.id : actionT(context, 'importUi.action.chat.todo');
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
  context: ImportActionContext,
): MessageAction {
  const tool = call.function.name;
  const args = parseArgs(call.function.arguments);
  const shape = ACTION_SHAPES[tool] ?? { type: 'read', entity: 'web' };
  const base = { ...shape, timestamp, tool_name: tool };
  if (shape.type === 'ask') return { ...base, ...askAction(call, args, answers.get(call.id)) };
  if (shape.entity === 'todo') return { ...base, name: todoName(args, context) };
  const raw = results.get(call.id);
  // 结果中的自有说明按当前界面语言重新投影；旧记录的纯文字保持原样
  const result = raw && localizeImportFeedback(raw, context.uiLocale ?? 'zh-CN');
  if (shape.type === 'web_search' && !result)
    return { ...base, query: typeof args.query === 'string' ? args.query : '' };
  const info = importActionInfo(tool, args, actionObject(result), context);
  return {
    ...base,
    ...(shape.type === 'web_search' ? { query: text(args.query) } : {}),
    nameIsDescription: true,
    descriptionDetails: info.details,
    name: `${info.summary ?? describe(tool, args, context)}${outcome(tool, result, context)}`,
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
  const context = createImportActionContext(events, options);
  const messages: ChatSessionMessage[] = [];
  for (const event of events) {
    if (event.kind === 'summary') {
      messages.push({
        id: event.id,
        role: 'assistant',
        content: actionT(context, 'importUi.action.chat.compacted'),
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
      toAction(call, event.createdAt + index, results, answers, context),
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
      content: actionT(context, 'importUi.chat.compacting'),
      timestamp: Date.now(),
      isSummarization: true,
    });
  return messages;
}
