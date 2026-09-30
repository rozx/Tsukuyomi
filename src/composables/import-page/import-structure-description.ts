import type { ActionDetail } from 'src/utils/action-info-utils';
import type { MessageKey } from 'src/i18n/types';
import type { ImportActionContext, ImportActionData } from './import-action-context';
import {
  actionClip,
  actionDetail,
  actionItems,
  actionLabel,
  actionObject,
  actionRange,
  actionT,
  actionText,
  actionValue,
} from './import-action-context';

type T = (key: MessageKey, values?: Record<string, string | number>) => string;

function pattern(details: ActionDetail[], t: T, label: string, value: unknown): void {
  const p = actionObject(value);
  if (!p.pattern) return;
  actionDetail(details, label, p.pattern);
  actionDetail(
    details,
    t('importUi.action.structure.patternMode', { label }),
    t(p.mode === 'regex' ? 'importUi.action.pattern.regex' : 'importUi.action.pattern.literal'),
  );
  if (p.mode === 'regex')
    actionDetail(
      details,
      t('importUi.action.structure.patternFlags', { label }),
      p.flags || t('importUi.action.pattern.defaultFlags'),
    );
}
function range(value: unknown): string {
  const r = actionObject(value);
  return typeof r.start === 'number' && typeof r.end === 'number'
    ? `[${r.start}, ${r.end}) · UTF-16`
    : '';
}
const MODES: Record<string, MessageKey> = {
  regex: 'importUi.action.structure.modeRegex',
  markdown: 'importUi.action.structure.modeMarkdown',
  single: 'importUi.action.structure.modeSingle',
};
function appendRules(details: ActionDetail[], t: T, rules: ImportActionData): void {
  const mode = MODES[actionText(rules.mode)];
  actionDetail(details, t('importUi.action.structure.mode'), mode ? t(mode) : undefined);
  pattern(details, t, t('importUi.action.structure.chapterPattern'), rules.chapter_pattern);
  pattern(details, t, t('importUi.action.structure.volumePattern'), rules.volume_pattern);
  actionDetail(details, t('importUi.action.structure.chapterLevel'), rules.chapter_level);
  actionDetail(details, t('importUi.action.structure.volumeLevel'), rules.volume_level);
  actionDetail(
    details,
    t('importUi.action.structure.headings'),
    t(
      rules.include_headings === true
        ? 'importUi.action.structure.headingsKeep'
        : 'importUi.action.structure.headingsExtract',
    ),
  );
  const selection = actionObject(rules.selection);
  pattern(details, t, t('importUi.action.structure.selectionStart'), selection.start);
  pattern(details, t, t('importUi.action.structure.selectionEnd'), selection.end);
  pattern(details, t, t('importUi.action.structure.selectionBody'), selection.body);
}
function appendItems(
  details: ActionDetail[],
  t: T,
  items: ImportActionData[],
  prefix: string,
): void {
  items.forEach((item, index) => {
    const label = `${prefix} ${index + 1}`;
    const field = (key: MessageKey) => t(key, { label });
    if (item.reason) {
      actionDetail(details, label, `${range(item)}\n${actionText(item.reason)}`);
      return;
    }
    actionDetail(
      details,
      field('importUi.action.structure.itemTitles'),
      [item.volumeTitle, item.title].filter(Boolean).join(' / '),
    );
    actionDetail(details, field('importUi.action.structure.itemRange'), range(item));
    actionDetail(details, field('importUi.action.structure.itemCharacters'), item.characters);
    actionDetail(details, field('importUi.action.structure.itemChapterId'), item.chapterId);
    actionDetail(details, field('importUi.action.structure.itemHead'), item.head);
    actionDetail(details, field('importUi.action.structure.itemTail'), item.tail);
    if (Array.isArray(item.warnings))
      actionDetail(
        details,
        field('importUi.action.structure.itemWarnings'),
        item.warnings.map(actionText).join('\n'),
      );
    if (item.unassigned === true)
      actionDetail(
        details,
        field('importUi.action.structure.itemGroup'),
        t('importUi.action.structure.unassigned'),
      );
  });
}

const STRUCTURE_LABELS: Record<string, MessageKey> = {
  preview_text_structure: 'importUi.action.structure.preview',
  get_text_structure: 'importUi.action.structure.get',
  apply_text_structure: 'importUi.action.structure.apply',
};

function appendOverview(
  details: ActionDetail[],
  t: T,
  input: ImportActionData,
  result: ImportActionData,
): void {
  actionDetail(details, t('importUi.action.structure.resourceId'), input.resourceId);
  actionDetail(details, t('importUi.action.structure.snapshotId'), result.snapshotId);
  actionDetail(details, t('importUi.action.label.previewRevision'), input.base_draft_revision);
  actionDetail(details, t('importUi.action.structure.selected'), range(result.selected));
  actionDetail(details, t('importUi.action.structure.totalCharacters'), result.totalCharacters);
  actionDetail(
    details,
    t('importUi.action.structure.excludedCharacters'),
    result.excludedCharacters,
  );
  actionDetail(details, t('importUi.action.structure.unassignedCount'), result.unassigned);
  actionDetail(details, t('importUi.action.structure.empty'), result.empty);
  actionDetail(details, t('importUi.action.structure.warningCount'), result.warningCount);
}

export function describeTextStructure(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const t: T = (key, values) => actionT(context, key, values);
  const labelKey = STRUCTURE_LABELS[name];
  if (!labelKey) return;
  const recorded = context.batches.get(actionText(args.batch_id));
  const input = recorded?.name === 'preview_text_structure' ? recorded.args : args;
  const resourceId = result.resourceId ?? input.resource_id;
  const source =
    actionText(result.sourceName) ||
    actionLabel(resourceId, context.resources, t('importUi.action.structure.resource'));
  actionDetail(details, t('importUi.action.structure.sourceFile'), source);
  appendOverview(details, t, { ...input, resourceId }, result);
  if (input.volume_id)
    actionDetail(
      details,
      t('importUi.action.structure.defaultVolume'),
      actionLabel(
        input.volume_id,
        recorded?.volumes ?? context.volumes,
        t('importUi.action.label.volume'),
      ),
    );
  const replacements = input.replace_chapter_ids ?? result.replaceChapterIds;
  if (Array.isArray(replacements))
    actionDetail(
      details,
      t('importUi.action.structure.replaced'),
      replacements
        .map(
          (id) =>
            `${actionLabel(id, recorded?.chapters ?? context.chapters, t('importUi.action.label.chapter'))} (${actionText(id)})`,
        )
        .join('\n'),
    );
  appendRules(details, t, actionObject(input.rules ?? result.rules));
  let page = '';
  if (name === 'get_text_structure') {
    const items = actionItems(result.items);
    const label = t(
      (args.view ?? result.view) === 'excluded'
        ? 'importUi.action.source.viewExcluded'
        : 'importUi.action.label.chapter',
    );
    const shown = actionRange(
      context,
      args,
      result,
      Array.isArray(result.items) ? items.length : undefined,
      'item',
    );
    page = ` · ${label} · ${shown}`;
    actionDetail(details, t('importUi.action.structure.page'), page.slice(3));
    appendItems(details, t, items, label);
  } else
    appendItems(details, t, actionItems(result.examples), t('importUi.action.structure.example'));
  if (Array.isArray(result.examples) && name !== 'get_text_structure')
    actionDetail(
      details,
      t('importUi.action.structure.examplesNote'),
      t('importUi.action.structure.examplesText', { count: result.examples.length }),
    );
  const counts =
    typeof result.chapters === 'number'
      ? t('importUi.action.structure.counts', {
          volumes: actionValue(result.volumes),
          chapters: result.chapters,
          warnings: actionValue(result.warningCount),
        })
      : '';
  return `${t('importUi.action.labeled', {
    label: t(labelKey),
    value: t('importUi.action.quoted', { value: actionClip(source) }),
  })}${page}${counts}`;
}
