import type { ActionDetail } from 'src/utils/action-info-utils';
import type { MessageKey } from 'src/i18n/types';
import {
  actionDetail,
  actionValue,
  actionItems,
  actionObject,
  actionText,
  actionLabel,
  actionT,
} from './import-action-context';
import type { ImportActionData, ImportActionContext } from './import-action-context';

const RESULT_LABELS: Record<string, MessageKey> = {
  draftRevision: 'importUi.action.label.draftRevision',
  batchId: 'importUi.action.label.batchId',
  planId: 'importUi.action.result.planId',
  targetBookId: 'importUi.action.result.targetBookId',
  affected: 'importUi.action.result.affected',
  matches: 'importUi.action.result.matches',
  ready: 'importUi.action.result.ready',
  failed: 'importUi.action.result.failed',
  pending: 'importUi.action.result.pending',
  total: 'importUi.action.result.total',
  nextOffset: 'importUi.action.result.nextOffset',
  format: 'importUi.action.result.format',
  totalCharacters: 'importUi.action.result.totalCharacters',
  bookRevision: 'importUi.action.result.bookRevision',
  author: 'importUi.metadata.author',
  description: 'importUi.metadata.description',
};
const SUMMARY_LABELS: Record<string, MessageKey> = {
  addedChapters: 'importUi.action.result.addedChapters',
  updatedChapters: 'importUi.action.result.updatedChapters',
  removedChapters: 'importUi.action.result.removedChapters',
  addedParagraphs: 'importUi.action.result.addedParagraphs',
  removedParagraphs: 'importUi.action.result.removedParagraphs',
  clearedVersions: 'importUi.action.result.clearedVersions',
  clearedParagraphs: 'importUi.action.result.clearedParagraphs',
};
const METADATA_LABELS: Record<string, MessageKey> = {
  title: 'importUi.metadata.title',
  author: 'importUi.metadata.author',
  description: 'importUi.metadata.description',
  cover: 'importUi.metadata.cover',
  alternateTitles: 'importUi.metadata.alternateTitles',
  tags: 'importUi.metadata.tags',
};

function appendCompleteness(
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): void {
  const t = (key: MessageKey) => actionT(context, key);
  const completeness = actionObject(result.completeness);
  if (typeof completeness.confirmed === 'boolean')
    actionDetail(
      details,
      t('importUi.planDetails.completeness'),
      t(
        completeness.confirmed
          ? 'importUi.planDetails.confirmed'
          : 'importUi.planDetails.notConfirmed',
      ),
    );
  actionDetail(details, t('importUi.action.result.knownTotal'), completeness.knownTotal);
  if (Array.isArray(completeness.missing))
    actionDetail(
      details,
      t('importUi.action.result.missingChapters'),
      completeness.missing.map(actionText).join('\n'),
    );
}

export function appendImportResultDetails(
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): void {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  for (const [key, labelKey] of Object.entries(RESULT_LABELS)) {
    const label = t(labelKey);
    if (!details.some((d) => d.label === label)) actionDetail(details, label, result[key]);
  }
  for (const [key, label] of [
    ['warnings', 'importUi.action.result.warnings'],
    ['missing', 'importUi.action.result.missing'],
  ] as const) {
    if (Array.isArray(result[key]))
      actionDetail(details, t(label), result[key].map(String).join('\n'));
  }
  actionDetail(
    details,
    t('importUi.action.result.conflicts'),
    actionItems(result.conflicts)
      .map((c) => actionText(c.message))
      .join('\n'),
  );
  const summary = actionObject(result.summary);
  for (const [key, label] of Object.entries(SUMMARY_LABELS))
    actionDetail(details, t(label), summary[key]);
  const metadata = actionObject(result.metadata ?? actionObject(result.inspection).metadata);
  for (const [key, label] of Object.entries(METADATA_LABELS))
    actionDetail(details, t(label), actionObject(metadata[key]).value ?? metadata[key]);
  appendCompleteness(result, context, details);
  actionItems(result.results).forEach((item, index) => {
    const source = actionLabel(item.sourceId, context.sources, t('importUi.action.label.source'));
    const error = actionObject(item.error);
    const lines = [
      source,
      t(item.success === false ? 'importUi.action.result.failed' : 'importUi.action.result.ready'),
      actionText(error.message),
    ];
    if (typeof item.totalCharacters === 'number')
      lines.push(t('importUi.action.result.characters', { count: item.totalCharacters }));
    if (Array.isArray(item.warnings)) lines.push(...item.warnings.map(actionText));
    actionDetail(
      details,
      t('importUi.action.result.sourceResult', { number: index + 1 }),
      lines.filter(Boolean).join('\n'),
    );
  });
}

const RULE_LABELS: Record<string, MessageKey> = {
  preset: 'importUi.action.rules.preset',
  selector: 'importUi.action.rules.selector',
  encoding: 'importUi.action.rules.encoding',
};

export function appendExtractionRules(
  value: unknown,
  context: ImportActionContext,
  details: ActionDetail[],
  prefix = '',
): void {
  const t = (key: MessageKey) => actionT(context, key);
  const rules = actionObject(value);
  for (const [key, label] of Object.entries(RULE_LABELS))
    actionDetail(details, prefix + t(label), rules[key]);
  if (Array.isArray(rules.excludeSelectors))
    actionDetail(
      details,
      prefix + t('importUi.action.rules.excludeSelectors'),
      rules.excludeSelectors.map(String).join('\n'),
    );
  for (const [key, label] of [
    ['ranges', 'importUi.action.rules.ranges'],
    ['excludeRanges', 'importUi.action.rules.excludeRanges'],
  ] as const) {
    actionDetail(
      details,
      prefix + t(label),
      actionItems(rules[key])
        .map((range) => {
          const span = `${actionValue(range.start)}–${actionValue(range.end)}`;
          return range.reason
            ? actionT(context, 'importUi.action.labeled', {
                label: span,
                value: actionText(range.reason),
              })
            : span;
        })
        .join('\n'),
    );
  }
}
