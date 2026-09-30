import { localizeImportFeedback } from 'src/services/import/import-error';
import type { MessageKey } from 'src/i18n/types';
import { describeTextStructure } from './import-structure-description';
import { appendImportResultDetails } from './import-action-results';
import type { ActionDetail } from 'src/utils/action-info-utils';
import {
  actionText,
  actionValue,
  actionLabel,
  actionRange,
  actionDetail,
  actionClip,
  actionItems,
  actionObject,
  actionT,
} from './import-action-context';
import type {
  ImportActionData,
  ImportActionContext,
  ImportActionInfo,
} from './import-action-context';
import { describeImportBatch, describeImportSources } from './import-batch-description';
import { describeRecipeDeclaration } from './import-recipe-description';

type T = (key: MessageKey, values?: Record<string, string | number>) => string;

function taskName(context: ImportActionContext, t: T): string {
  return context.task?.name || t('importUi.action.currentTask');
}

function contentReference(ref: ImportActionData, t: T): string {
  const location =
    ref.kind === 'existing'
      ? t('importUi.action.draft.existingRef', {
          book: actionText(ref.bookId),
          chapter: actionText(ref.chapterId),
          paragraph: actionText(ref.paragraphId),
        })
      : t(ref.blockId ? 'importUi.action.draft.blockRef' : 'importUi.action.draft.resourceRef', {
          resource: actionText(ref.resourceId),
          block: actionText(ref.blockId),
        });
  const range =
    ref.start !== undefined || ref.end !== undefined
      ? t('importUi.action.draft.offsets', {
          start: actionValue(ref.start ?? 0),
          end: ref.end === undefined ? t('importUi.action.draft.end') : actionValue(ref.end),
        })
      : '';
  const excluded = Array.isArray(ref.excludeRanges)
    ? t('importUi.action.draft.excludedRanges', { count: ref.excludeRanges.length })
    : '';
  return `${location}${range}${excluded}`;
}

function draftRead(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t: T = (key, values) => actionT(context, key, values);
  const task = taskName(context, t);
  if (args.view === 'chapter') {
    const title =
      actionText(result.title) ||
      actionLabel(args.chapter_id, context.chapters, t('importUi.action.label.chapter'));
    const range = actionRange(
      context,
      args,
      result,
      Array.isArray(result.content) ? result.content.length : undefined,
      'item',
    );
    actionDetail(details, t('importUi.action.label.chapter'), title);
    actionDetail(details, t('importUi.action.label.readContent'), t('importUi.action.draft.refs'));
    actionDetail(details, t('importUi.action.label.readRange'), range);
    actionDetail(
      details,
      t('importUi.action.label.contentRefs'),
      actionItems(result.content)
        .map((ref) => contentReference(ref, t))
        .join('\n'),
    );
    return t('importUi.action.draft.readChapter', { title: actionClip(title), range });
  }
  if (args.view === 'chapters') {
    const range = actionRange(
      context,
      args,
      result,
      Array.isArray(result.chapters) ? result.chapters.length : undefined,
      'chapter',
    );
    actionDetail(details, t('importUi.action.label.readContent'), t('importUi.action.draft.toc'));
    actionDetail(details, t('importUi.action.label.readRange'), range);
    actionDetail(
      details,
      t('importUi.action.label.pageChapters'),
      actionItems(result.chapters)
        .map((c) => actionText(c.title) || actionText(c.id))
        .join('\n'),
    );
    return t('importUi.action.draft.readToc', { task: actionClip(task), range });
  }
  actionDetail(
    details,
    t('importUi.action.label.readContent'),
    t('importUi.action.draft.overviewContent'),
  );
  actionDetail(details, t('importUi.action.label.chapterCount'), result.chapterCount);
  actionDetail(
    details,
    t('importUi.action.label.volume'),
    actionItems(result.volumes)
      .map((v) => actionText(v.title))
      .join('\n'),
  );
  return t('importUi.action.draft.readOverview', { task: actionClip(task) });
}

const SOURCE_VIEWS: Record<string, MessageKey> = {
  text: 'importUi.action.source.viewText',
  blocks: 'importUi.action.source.viewBlocks',
  excluded: 'importUi.action.source.viewExcluded',
  inspection: 'importUi.action.source.viewInspection',
};

function sourceRead(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t: T = (key, values) => actionT(context, key, values);
  const title = actionLabel(
    args.resource_id,
    context.resources,
    t('importUi.action.label.sourceResource'),
  );
  actionDetail(details, t('importUi.action.label.source'), title);
  const sourceId = context.resourceSources.get(actionText(args.resource_id));
  if (sourceId)
    actionDetail(
      details,
      t('importUi.action.label.sourceLocation'),
      context.locations.get(sourceId),
    );
  const view = actionText(args.view) || 'text';
  const label = t(SOURCE_VIEWS[view] ?? 'importUi.action.source.viewContent');
  actionDetail(details, t('importUi.action.label.readContent'), label);
  if (view === 'inspection')
    return t('importUi.action.source.inspect', { label, title: actionClip(title) });
  const count =
    view === 'text'
      ? typeof result.text === 'string'
        ? result.text.length
        : undefined
      : Array.isArray(result.items)
        ? result.items.length
        : undefined;
  const range = actionRange(context, args, result, count, view === 'text' ? 'character' : 'item');
  actionDetail(details, t('importUi.action.label.readRange'), range);
  actionDetail(details, t('importUi.action.label.readText'), result.text);
  actionItems(result.items).forEach((item, index) => {
    actionDetail(
      details,
      t(item.truncated ? 'importUi.action.source.itemTruncated' : 'importUi.action.source.item', {
        number: index + 1,
      }),
      item.preview,
    );
    actionDetail(
      details,
      t('importUi.action.source.itemReason', { number: index + 1 }),
      item.reason,
    );
  });
  return t('importUi.action.source.read', { label, title: actionClip(title), range });
}

const EDIT_LABELS: Record<string, MessageKey> = {
  set_metadata: 'importUi.action.edit.setMetadata',
  propose_target: 'importUi.action.edit.proposeTarget',
  declare_candidates: 'importUi.action.edit.declareCandidates',
  upsert_volume: 'importUi.action.edit.upsertVolume',
  upsert_chapter: 'importUi.action.edit.upsertChapter',
  remove_chapter: 'importUi.action.edit.removeChapter',
  reorder_chapters: 'importUi.action.edit.reorderChapters',
  reorder_volumes: 'importUi.action.edit.reorderVolumes',
  propose_match: 'importUi.action.edit.proposeMatch',
  set_completeness: 'importUi.action.edit.setCompleteness',
};

function editDescription(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t: T = (key, values) => actionT(context, key, values);
  const lines = actionItems(args.operations).map((op) => {
    const chapter = actionObject(op.chapter);
    const target =
      actionText(chapter.title) ||
      actionText(op.title) ||
      (op.chapterId
        ? actionLabel(op.chapterId, context.chapters, t('importUi.action.label.chapter'))
        : '') ||
      actionText(op.value);
    const key = EDIT_LABELS[actionText(op.op)];
    const label = key ? t(key) : actionText(op.op);
    return target ? t('importUi.action.labeled', { label, value: target }) : label;
  });
  actionDetail(details, t('importUi.action.label.draftOperations'), lines.join('\n'));
  const shown = lines
    .slice(0, 2)
    .map((line) => actionClip(line, 36))
    .join(t('importUi.action.clauseSeparator'));
  return t('importUi.action.edit.summary', {
    operations: shown,
    more: lines.length > 2 ? t('importUi.action.edit.more', { count: lines.length }) : '',
  });
}
function libraryRead(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t: T = (key, values) => actionT(context, key, values);
  const fallback = t('importUi.action.label.book');
  const book =
    name === 'get_book_info'
      ? actionText(result.title) || actionLabel(args.book_id, context.books, fallback)
      : actionLabel(args.book_id, context.books, fallback);
  actionDetail(details, t('importUi.action.label.book'), book);
  if (name === 'get_book_info')
    return t('importUi.action.library.readBook', { book: actionClip(book) });
  const chapter = actionText(result.title) || actionText(args.chapter_id);
  actionDetail(details, t('importUi.action.label.chapter'), chapter);
  const values = name === 'list_chapters' ? result.items : result.paragraphs;
  const range = actionRange(
    context,
    args,
    result,
    Array.isArray(values) ? values.length : undefined,
    name === 'list_chapters' ? 'chapter' : 'paragraph',
  );
  actionDetail(details, t('importUi.action.label.readRange'), range);
  actionDetail(
    details,
    t('importUi.action.label.readResult'),
    actionItems(values)
      .map((item) => actionText(item.title) || actionText(item.text))
      .join('\n'),
  );
  return name === 'list_chapters'
    ? t('importUi.action.library.readToc', { book: actionClip(book), range })
    : t('importUi.action.library.readChapter', { chapter: actionClip(chapter), range });
}

const SOURCE_STATUSES: Record<string, MessageKey> = {
  registered: 'importUi.action.status.registered',
  inspected: 'importUi.sourceStatus.inspected',
  extracted: 'importUi.sourceStatus.extracted',
  failed: 'importUi.action.status.failed',
  excluded: 'importUi.sourceStatus.excluded',
};

function sourceList(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t: T = (key, values) => actionT(context, key, values);
  const parent = args.parent_source_id
    ? actionLabel(args.parent_source_id, context.sources, t('importUi.action.label.source'))
    : taskName(context, t);
  const statusKey = SOURCE_STATUSES[actionText(args.status)];
  const status = statusKey ? t(statusKey) : undefined;
  actionDetail(details, t('importUi.action.label.sourceScope'), parent);
  actionDetail(details, t('importUi.action.label.statusFilter'), status);
  actionDetail(
    details,
    t('importUi.action.label.sourceList'),
    actionItems(result.items)
      .map(
        (item) =>
          `${actionText(item.name) || actionText(item.id)}${item.url ? `\n${actionText(item.url)}` : ''}`,
      )
      .join('\n'),
  );
  return t('importUi.action.source.list', {
    parent: actionClip(parent),
    status: status ? ` · ${status}` : '',
    count: Array.isArray(result.items)
      ? t('importUi.action.source.listCount', { count: result.items.length })
      : '',
  });
}

const ID_LABELS: Record<string, MessageKey> = {
  chapter_id: 'importUi.action.label.chapterId',
  source_id: 'importUi.action.label.sourceId',
  resource_id: 'importUi.action.label.resourceId',
  batch_id: 'importUi.action.label.batchId',
  book_id: 'importUi.action.label.bookId',
};

function describeImportAction(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const t: T = (key, values) => actionT(context, key, values);
  if (name === 'edit_import_draft') return editDescription(args, context, details);
  if (['get_book_info', 'list_chapters', 'get_chapter_info'].includes(name))
    return libraryRead(name, args, result, context, details);
  if (name === 'list_sources') return sourceList(args, result, context, details);
  if (name === 'preview_import')
    return t('importUi.action.previewImport', { task: actionClip(taskName(context, t)) });
  if (name === 'read_source') return sourceRead(args, result, context, details);
  if (name === 'search_web') {
    actionDetail(details, t('importUi.action.label.query'), args.query);
    actionDetail(details, t('importUi.action.label.message'), result.message);
    return undefined;
  }
  if (name === 'record_update_recipe')
    return describeRecipeDeclaration(args, result, context, details);
  const structure = describeTextStructure(name, args, result, context, details);
  if (structure) return structure;
  const batch = describeImportBatch(name, args, result, context, details);
  if (batch) return batch;
  if (name === 'get_import_draft') return draftRead(args, result, context, details);
  if (name === 'extract_content' || name === 'add_sources') {
    const selected = describeImportSources(args, context, details);
    if (selected)
      return t(
        name === 'add_sources' ? 'importUi.action.addSources' : 'importUi.action.extractContent',
        {
          sources: selected,
          filter: args.filter ? t('importUi.action.byFilter') : '',
        },
      );
  }
  if (args.source_id) {
    actionDetail(
      details,
      t('importUi.action.label.source'),
      actionLabel(args.source_id, context.sources, t('importUi.action.label.source')),
    );
    actionDetail(
      details,
      t('importUi.action.label.sourceLocation'),
      context.locations.get(actionText(args.source_id)),
    );
  }
  return undefined;
}

export function importActionInfo(
  name: string,
  args: ImportActionData,
  rawResult: ImportActionData,
  context: ImportActionContext,
): ImportActionInfo {
  const t: T = (key, values) => actionT(context, key, values);
  const result = localizeImportFeedback(rawResult, context.uiLocale ?? 'zh-CN');
  const details: ActionDetail[] = [];
  actionDetail(details, t('importUi.action.label.task'), context.task?.name);
  actionDetail(
    details,
    t('importUi.action.label.status'),
    t(
      !Object.keys(result).length
        ? 'importUi.action.state.running'
        : result.success === false
          ? 'importUi.action.state.failed'
          : 'importUi.action.state.done',
    ),
  );
  actionDetail(details, t('importUi.action.label.draftRevision'), result.draftRevision);
  actionDetail(
    details,
    t('importUi.action.label.baseRevision'),
    args.base_draft_revision ?? args.draft_revision,
  );
  for (const [key, label] of Object.entries(ID_LABELS)) actionDetail(details, t(label), args[key]);
  const error = actionObject(result.error);
  actionDetail(details, t('importUi.action.label.errorCode'), error.code);
  actionDetail(details, t('importUi.action.label.errorReason'), error.message ?? result.error);
  appendImportResultDetails(result, context, details);
  const summary = describeImportAction(name, args, result, context, details);
  return summary === undefined ? { details } : { summary, details };
}
