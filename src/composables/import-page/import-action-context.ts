import type { ImportEvent, ImportSource, ImportDraftChapter } from 'src/models/import';
import type { ActionDetail } from 'src/utils/action-info-utils';

export type ImportActionData = Record<string, unknown>;
export interface ImportActionTask {
  name: string;
  draft: {
    chapters: Pick<ImportDraftChapter, 'id' | 'title' | 'content'>[];
    volumes: { id: string; title: string }[];
  };
}
export interface ImportActionContext {
  task?: ImportActionTask;
  sources: Map<string, string>;
  chapters: Map<string, string>;
  volumes: Map<string, string>;
  resources: Map<string, string>;
  resourceSources: Map<string, string>;
  books: Map<string, string>;
  locations: Map<string, string>;
  batches: Map<
    string,
    {
      name: string;
      args: ImportActionData;
      chapters: Map<string, string>;
      volumes: Map<string, string>;
    }
  >;
}
export interface ImportActionInfo {
  summary?: string;
  details: ActionDetail[];
}
export function actionObject(value: unknown): ImportActionData {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ImportActionData)
    : {};
}
export function actionItems(value: unknown): ImportActionData[] {
  return Array.isArray(value) ? value.map(actionObject) : [];
}
export function actionText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function actionValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : actionText(value);
}
export function actionClip(value: string, limit = 48): string {
  const characters = Array.from(value);
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : value;
}
export function actionLabel(id: unknown, names: Map<string, string>, fallback: string): string {
  const key = actionText(id);
  return names.get(key) || (key ? `${fallback} ${key.slice(0, 8)}` : fallback);
}
export function actionDetail(details: ActionDetail[], label: string, value: unknown): void {
  if (typeof value === 'number' || (typeof value === 'string' && value.length))
    details.push({ label, value: String(value) });
}
export function actionRange(
  args: ImportActionData,
  result: ImportActionData,
  count: number | undefined,
  unit: string,
): string {
  const offset =
    typeof result.offset === 'number'
      ? result.offset
      : typeof args.offset === 'number'
        ? args.offset
        : 0;
  const total = typeof result.total === 'number' ? `／共${result.total}${unit}` : '';
  if (count === 0) return `返回0${unit}${total}`;
  if (count !== undefined) return `第${offset + 1}–${offset + count}${unit}${total}`;
  const limit = typeof args.limit === 'number' ? args.limit : 30;
  return `请求第${offset + 1}–${offset + limit}${unit}`;
}

function callArguments(value: unknown): ImportActionData {
  try {
    return actionObject(typeof value === 'string' ? JSON.parse(value) : value);
  } catch {
    return {};
  }
}
function rememberNames(map: Map<string, string>, values: unknown): void {
  for (const item of actionItems(values)) {
    const id = actionText(item.id) || actionText(item.chapterId);
    const title = actionText(item.title) || actionText(item.name);
    if (id && title) map.set(id, title);
  }
}
function rememberSources(context: ImportActionContext, values: unknown): void {
  rememberNames(context.sources, values);
  for (const item of actionItems(values)) {
    const location =
      actionText(item.url) || actionText(item.relativePath) || actionText(item.locator);
    if (location && typeof item.id === 'string') context.locations.set(item.id, location);
  }
}
function rememberResource(context: ImportActionContext, result: ImportActionData): void {
  const sourceId = actionText(result.sourceId);
  if (!sourceId) return;
  const source = context.sources.get(sourceId);
  for (const key of ['snapshotId', 'contentId', 'resourceId']) {
    const id = actionText(result[key]);
    if (!id) continue;
    context.resourceSources.set(id, sourceId);
    if (source) context.resources.set(id, source);
  }
}

function rememberResult(
  context: ImportActionContext,
  result: ImportActionData,
  call: { name: string; args: ImportActionData } | undefined,
): void {
  rememberSources(context, result.sources);
  rememberSources(context, result.discoveries);
  if (call?.name === 'list_sources') rememberSources(context, result.items);
  rememberNames(context.chapters, result.chapters);
  rememberNames(context.volumes, result.volumes);
  if (call?.name === 'get_book_info') rememberNames(context.books, [result]);
  if (call?.name === 'search_books') rememberNames(context.books, result.items);
  if (call?.name === 'get_import_draft' && call.args.view === 'chapter')
    rememberNames(context.chapters, [result]);
  rememberResource(context, result);
  for (const item of actionItems(result.results)) rememberResource(context, item);
  if (
    typeof result.batchId === 'string' &&
    call &&
    ['preview_draft_batch', 'prepare_chapter_batch'].includes(call.name)
  )
    context.batches.set(result.batchId, {
      ...call,
      chapters: new Map(context.chapters),
      volumes: new Map(context.volumes),
    });
}

/** 从当次调用及已保存事件建立名称索引，不为了展示聊天额外读取或抓取正文。 */
export function createImportActionContext(
  events: ImportEvent[],
  options: {
    sourceNames: Map<string, string>;
    task?: ImportActionTask;
    sources?: Pick<ImportSource, 'id' | 'name' | 'url' | 'relativePath'>[];
  },
): ImportActionContext {
  const context: ImportActionContext = {
    ...(options.task ? { task: options.task } : {}),
    sources: new Map(options.sourceNames),
    locations: new Map(),
    chapters: new Map(options.task?.draft.chapters.map((c) => [c.id, c.title])),
    volumes: new Map(options.task?.draft.volumes.map((v) => [v.id, v.title])),
    resources: new Map(),
    resourceSources: new Map(),
    books: new Map(),
    batches: new Map(),
  };
  rememberSources(context, options.sources);
  const resourceChapters = new Map<string, Set<string>>();
  for (const chapter of options.task?.draft.chapters ?? [])
    for (const ref of chapter.content) {
      if (ref.kind !== 'extraction') continue;
      const titles = resourceChapters.get(ref.resourceId) ?? new Set<string>();
      titles.add(chapter.title);
      resourceChapters.set(ref.resourceId, titles);
    }
  for (const [id, titles] of resourceChapters) context.resources.set(id, [...titles].join('、'));
  const calls = new Map<string, { name: string; args: ImportActionData }>();
  for (const event of events) {
    if (event.kind === 'tool-call' && event.callId && event.toolName)
      calls.set(event.callId, { name: event.toolName, args: callArguments(event.data) });
    for (const call of event.message?.tool_calls ?? [])
      calls.set(call.id, {
        name: call.function.name,
        args: callArguments(call.function.arguments),
      });
    if (event.kind !== 'tool-result' || !event.callId) continue;
    const result = actionObject(event.data);
    if (result.success === false) continue;
    const call = calls.get(event.callId);
    rememberResult(context, result, call);
  }
  return context;
}
