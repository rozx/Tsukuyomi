import { appendExtractionRules } from './import-action-results';
import type { ActionDetail } from 'src/utils/action-info-utils';
import {
  actionObject,
  actionText,
  actionClip,
  actionItems,
  actionLabel,
  actionDetail,
} from './import-action-context';
import type { ImportActionData, ImportActionContext } from './import-action-context';

function names(
  value: unknown,
  lookup: Map<string, string>,
  fallback: string,
  brief: boolean,
): string {
  if (!Array.isArray(value)) return '';
  const titles = value.map((id) => actionLabel(id, lookup, fallback));
  return brief
    ? `${titles
        .slice(0, 2)
        .map((t) => `「${actionClip(t, 24)}」`)
        .join('、')}${titles.length > 2 ? `等${titles.length}项` : ''}`
    : titles.join('\n');
}
function scopeDescription(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const scope = actionObject(args.scope);
  const parts: string[] = [];
  for (const [key, label, lookup] of [
    ['volume_ids', '目标卷', context.volumes],
    ['chapter_ids', '目标章节', context.chapters],
  ] as const) {
    if (!Array.isArray(scope[key])) continue;
    actionDetail(details, label, names(scope[key], lookup, label, false));
    parts.push(names(scope[key], lookup, label, true));
  }
  if (scope.selected_only === true) parts.push('仅已选章节');
  const pattern = actionObject(scope.title);
  if (pattern.pattern) {
    actionDetail(details, '标题筛选', pattern.pattern);
    actionDetail(details, '标题筛选标志', pattern.flags);
    parts.push(`标题匹配「${actionClip(actionText(pattern.pattern), 24)}」`);
  }
  return parts.join(' · ') || (args.target === 'volume_title' ? '全部卷' : '全部章节');
}
function draftBatch(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const recorded =
    name === 'apply_draft_batch' ? context.batches.get(actionText(args.batch_id)) : undefined;
  const input = recorded?.name === 'preview_draft_batch' ? recorded.args : args;
  if (!input.scope && !input.pattern) return undefined;
  const scope = scopeDescription(
    input,
    recorded ? { ...context, chapters: recorded.chapters, volumes: recorded.volumes } : context,
    details,
  );
  actionDetail(details, '处理范围', scope);
  actionDetail(details, '预览基准版本', input.base_draft_revision);
  const labels: Record<string, string> = {
    remove_matches: '删除匹配片段',
    remove_lines: '删除整行',
    replace: '替换标题',
  };
  const action = labels[actionText(input.action)] ?? '批量修改';
  actionDetail(details, '处理方式', action);
  const pattern = actionObject(input.pattern);
  actionDetail(details, pattern.mode === 'regex' ? '正则表达式' : '匹配文本', pattern.pattern);
  if (pattern.mode === 'regex')
    actionDetail(details, '正则标志', pattern.flags || '默认（全局、Unicode）');
  if (input.replacement !== undefined)
    actionDetail(details, '替换为', input.replacement === '' ? '空字符串' : input.replacement);
  actionItems(result.examples).forEach((example, index) => {
    actionDetail(
      details,
      `示例 ${index + 1} · 对象`,
      actionLabel(
        example.id,
        input.target === 'volume_title' ? context.volumes : context.chapters,
        '条目',
      ),
    );
    actionDetail(details, `示例 ${index + 1} · 修改前`, example.before);
    actionDetail(
      details,
      `示例 ${index + 1} · 修改后`,
      example.after === '' ? '空字符串' : example.after,
    );
  });
  const operation =
    input.target === 'body'
      ? '正文清理'
      : input.target === 'volume_title'
        ? '卷标题替换'
        : '章节标题替换';
  const rule = pattern.pattern
    ? ` · ${pattern.mode === 'regex' ? '正则' : '匹配'}「${actionClip(actionText(pattern.pattern), 32)}」`
    : '';
  return `${name === 'apply_draft_batch' ? '应用' : '预览'}${operation}：${scope} · ${action}${rule}`;
}

export function describeImportSources(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const ids =
    args.source_ids ??
    args.discovery_ids ??
    (Array.isArray(args.sources)
      ? actionItems(args.sources).map((item) => item.source_id)
      : undefined);
  actionDetail(details, '来源', names(ids, context.sources, '来源', false));
  if (Array.isArray(ids))
    actionDetail(
      details,
      '来源位置',
      ids
        .map((id) => context.locations.get(actionText(id)))
        .filter(Boolean)
        .join('\n'),
    );
  const filter = actionObject(args.filter);
  for (const [key, label] of [
    ['name', '来源名称筛选'],
    ['locator', '来源路径筛选'],
  ] as const) {
    const pattern = actionObject(filter[key]);
    if (pattern.pattern)
      actionDetail(
        details,
        label,
        `${pattern.mode === 'regex' ? '正则' : '文本'}：${actionText(pattern.pattern)}${pattern.flags ? `；标志：${actionText(pattern.flags)}` : ''}`,
      );
  }
  appendExtractionRules(args.rules, details);
  actionItems(args.sources).forEach((source, index) =>
    appendExtractionRules(source.rules, details, `来源 ${index + 1} · `),
  );
  return names(ids, context.sources, '来源', true);
}

function extractionBatch(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const saved = context.batches.get(actionText(args.batch_id));
  const input = saved?.name === 'prepare_chapter_batch' ? saved.args : args;
  const volume = input.volume_id
    ? actionLabel(input.volume_id, saved?.volumes ?? context.volumes, '卷')
    : '';
  actionDetail(details, '目标卷', volume);
  const selected = describeImportSources(input, context, details);
  const catalog = actionObject(input.catalog);
  const pieces = [volume ? `「${actionClip(volume, 24)}」` : '', selected];
  if (catalog.snapshot_id) {
    const source = actionLabel(catalog.snapshot_id, context.resources, '目录快照');
    actionDetail(details, '目录来源', source);
    actionDetail(details, '目录快照 ID', catalog.snapshot_id);
    const offset = typeof catalog.offset === 'number' ? catalog.offset : 0;
    const limit = typeof catalog.limit === 'number' ? catalog.limit : 0;
    actionDetail(details, '目录选取范围', `第${offset + 1}–${offset + limit}章`);
    pieces.push(`目录第${offset + 1}–${offset + limit}章`);
  }
  if (args.retry_failed) actionDetail(details, '重试策略', '仅重试失败章节');
  if (!pieces.some(Boolean) && args.batch_id)
    pieces.push(`批次 ${actionText(args.batch_id).slice(0, 8)}`);
  if (!pieces.some(Boolean)) return undefined;
  const label =
    name === 'prepare_chapter_batch'
      ? '准备章节批次'
      : name === 'get_chapter_batch'
        ? '查看批次进度'
        : args.retry_failed
          ? '重试失败章节'
          : '批量提取章节';
  return `${label}：${pieces.filter(Boolean).join(' · ')}`;
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
    return extractionBatch(name, args, result, context, details);
  return undefined;
}
