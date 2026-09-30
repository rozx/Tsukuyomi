import { appendExtractionRules } from './import-action-results';
import type { ActionDetail } from 'src/utils/action-info-utils';
import type { MessageKey } from 'src/i18n/types';
import {
  actionObject,
  actionText,
  actionClip,
  actionItems,
  actionLabel,
  actionDetail,
  actionList,
  actionT,
} from './import-action-context';
import type { ImportActionData, ImportActionContext } from './import-action-context';

function names(
  context: ImportActionContext,
  value: unknown,
  lookup: Map<string, string>,
  fallback: string,
  brief: boolean,
): string {
  if (!Array.isArray(value)) return '';
  const titles = value.map((id) => actionLabel(id, lookup, fallback));
  if (!brief) return titles.join('\n');
  const shown = titles
    .slice(0, 2)
    .map((t) => actionT(context, 'importUi.action.quoted', { value: actionClip(t, 24) }))
    .join(actionList(context));
  return titles.length > 2
    ? actionT(context, 'importUi.action.batch.andMore', { items: shown, count: titles.length })
    : shown;
}
function scopeDescription(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const scope = actionObject(args.scope);
  const parts: string[] = [];
  for (const [key, labelKey, lookup] of [
    ['volume_ids', 'importUi.action.batch.targetVolumes', context.volumes],
    ['chapter_ids', 'importUi.action.batch.targetChapters', context.chapters],
  ] as const) {
    if (!Array.isArray(scope[key])) continue;
    const label = t(labelKey);
    actionDetail(details, label, names(context, scope[key], lookup, label, false));
    parts.push(names(context, scope[key], lookup, label, true));
  }
  if (scope.selected_only === true) parts.push(t('importUi.action.batch.selectedOnly'));
  const pattern = actionObject(scope.title);
  if (pattern.pattern) {
    actionDetail(details, t('importUi.action.batch.titleFilter'), pattern.pattern);
    actionDetail(details, t('importUi.action.batch.titleFilterFlags'), pattern.flags);
    parts.push(
      t('importUi.action.batch.titleMatch', {
        pattern: actionClip(actionText(pattern.pattern), 24),
      }),
    );
  }
  return (
    parts.join(' · ') ||
    t(
      args.target === 'volume_title'
        ? 'importUi.action.batch.allVolumes'
        : 'importUi.action.batch.allChapters',
    )
  );
}

const DRAFT_ACTIONS: Record<string, MessageKey> = {
  remove_matches: 'importUi.action.batch.removeMatches',
  remove_lines: 'importUi.action.batch.removeLines',
  replace: 'importUi.action.batch.replaceTitle',
};

function appendDraftExamples(
  input: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): void {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const empty = t('importUi.action.batch.emptyString');
  actionItems(result.examples).forEach((example, index) => {
    const number = index + 1;
    actionDetail(
      details,
      t('importUi.action.batch.exampleTarget', { number }),
      actionLabel(
        example.id,
        input.target === 'volume_title' ? context.volumes : context.chapters,
        t('importUi.action.batch.entry'),
      ),
    );
    actionDetail(details, t('importUi.action.batch.exampleBefore', { number }), example.before);
    actionDetail(
      details,
      t('importUi.action.batch.exampleAfter', { number }),
      example.after === '' ? empty : example.after,
    );
  });
}

function draftBatch(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const recorded =
    name === 'apply_draft_batch' ? context.batches.get(actionText(args.batch_id)) : undefined;
  const input = recorded?.name === 'preview_draft_batch' ? recorded.args : args;
  if (!input.scope && !input.pattern) return undefined;
  const scope = scopeDescription(
    input,
    recorded ? { ...context, chapters: recorded.chapters, volumes: recorded.volumes } : context,
    details,
  );
  actionDetail(details, t('importUi.action.batch.scope'), scope);
  actionDetail(details, t('importUi.action.label.previewRevision'), input.base_draft_revision);
  const actionKey = DRAFT_ACTIONS[actionText(input.action)];
  const action = t(actionKey ?? 'importUi.action.batch.bulkEdit');
  actionDetail(details, t('importUi.action.batch.method'), action);
  const pattern = actionObject(input.pattern);
  const regex = pattern.mode === 'regex';
  actionDetail(
    details,
    t(regex ? 'importUi.action.pattern.regex' : 'importUi.action.batch.matchText'),
    pattern.pattern,
  );
  if (regex)
    actionDetail(
      details,
      t('importUi.action.batch.regexFlags'),
      pattern.flags || t('importUi.action.pattern.defaultFlags'),
    );
  if (input.replacement !== undefined)
    actionDetail(
      details,
      t('importUi.action.batch.replacement'),
      input.replacement === '' ? t('importUi.action.batch.emptyString') : input.replacement,
    );
  appendDraftExamples(input, result, context, details);
  const operation = t(
    input.target === 'body'
      ? 'importUi.action.batch.bodyCleanup'
      : input.target === 'volume_title'
        ? 'importUi.action.batch.volumeTitles'
        : 'importUi.action.batch.chapterTitles',
  );
  const rule = pattern.pattern
    ? t(regex ? 'importUi.action.batch.regexRule' : 'importUi.action.batch.textRule', {
        pattern: actionClip(actionText(pattern.pattern), 32),
      })
    : '';
  return t(
    name === 'apply_draft_batch'
      ? 'importUi.action.batch.applySummary'
      : 'importUi.action.batch.previewSummary',
    { operation, scope, action, rule },
  );
}

const SOURCE_FILTERS = [
  ['name', 'importUi.action.batch.nameFilter'],
  ['locator', 'importUi.action.batch.pathFilter'],
] as const;

export function describeImportSources(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const sourceLabel = t('importUi.action.label.source');
  const ids =
    args.source_ids ??
    args.discovery_ids ??
    (Array.isArray(args.sources)
      ? actionItems(args.sources).map((item) => item.source_id)
      : undefined);
  actionDetail(details, sourceLabel, names(context, ids, context.sources, sourceLabel, false));
  if (Array.isArray(ids))
    actionDetail(
      details,
      t('importUi.action.label.sourceLocation'),
      ids
        .map((id) => context.locations.get(actionText(id)))
        .filter(Boolean)
        .join('\n'),
    );
  const filter = actionObject(args.filter);
  for (const [key, label] of SOURCE_FILTERS) {
    const pattern = actionObject(filter[key]);
    if (pattern.pattern)
      actionDetail(
        details,
        t(label),
        t(
          pattern.flags ? 'importUi.action.batch.filterWithFlags' : 'importUi.action.batch.filter',
          {
            mode: t(
              pattern.mode === 'regex'
                ? 'importUi.action.batch.regexMode'
                : 'importUi.action.batch.textMode',
            ),
            pattern: actionText(pattern.pattern),
            flags: actionText(pattern.flags),
          },
        ),
      );
  }
  appendExtractionRules(args.rules, context, details);
  actionItems(args.sources).forEach((source, index) =>
    appendExtractionRules(
      source.rules,
      context,
      details,
      t('importUi.action.batch.sourcePrefix', { number: index + 1 }),
    ),
  );
  return names(context, ids, context.sources, sourceLabel, true);
}

function extractionLabel(name: string, args: ImportActionData): MessageKey {
  if (name === 'prepare_chapter_batch') return 'importUi.action.batch.prepare';
  if (name === 'get_chapter_batch') return 'importUi.action.batch.progress';
  return args.retry_failed ? 'importUi.action.batch.retry' : 'importUi.action.batch.run';
}

function extractionBatch(
  name: string,
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const saved = context.batches.get(actionText(args.batch_id));
  const input = saved?.name === 'prepare_chapter_batch' ? saved.args : args;
  const volume = input.volume_id
    ? actionLabel(
        input.volume_id,
        saved?.volumes ?? context.volumes,
        t('importUi.action.label.volume'),
      )
    : '';
  actionDetail(details, t('importUi.action.batch.targetVolumes'), volume);
  const selected = describeImportSources(input, context, details);
  const catalog = actionObject(input.catalog);
  const pieces = [
    volume ? t('importUi.action.quoted', { value: actionClip(volume, 24) }) : '',
    selected,
  ];
  if (catalog.snapshot_id) {
    const source = actionLabel(
      catalog.snapshot_id,
      context.resources,
      t('importUi.action.batch.catalogSnapshot'),
    );
    actionDetail(details, t('importUi.action.batch.catalogSource'), source);
    actionDetail(details, t('importUi.action.batch.catalogSnapshotId'), catalog.snapshot_id);
    const offset = typeof catalog.offset === 'number' ? catalog.offset : 0;
    const limit = typeof catalog.limit === 'number' ? catalog.limit : 0;
    const span = { from: offset + 1, to: offset + limit };
    actionDetail(
      details,
      t('importUi.action.batch.catalogRange'),
      t('importUi.action.batch.chapterSpan', span),
    );
    pieces.push(t('importUi.action.batch.catalogSpan', span));
  }
  if (args.retry_failed)
    actionDetail(
      details,
      t('importUi.action.batch.retryPolicy'),
      t('importUi.action.batch.retryOnly'),
    );
  if (!pieces.some(Boolean) && args.batch_id)
    pieces.push(t('importUi.action.batch.batchRef', { id: actionText(args.batch_id).slice(0, 8) }));
  if (!pieces.some(Boolean)) return undefined;
  return t('importUi.action.labeled', {
    label: t(extractionLabel(name, args)),
    value: pieces.filter(Boolean).join(' · '),
  });
}
export function describeImportBatch(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  if (name === 'preview_draft_batch' || name === 'apply_draft_batch')
    return draftBatch(name, args, result, context, details);
  if (['prepare_chapter_batch', 'get_chapter_batch', 'run_chapter_batch'].includes(name))
    return extractionBatch(name, args, context, details);
  return undefined;
}
