import type { ActionDetail } from 'src/utils/action-info-utils';
import type { ImportActionContext, ImportActionData } from './import-action-context';
import {
  actionClip,
  actionDetail,
  actionItems,
  actionLabel,
  actionObject,
  actionRange,
  actionText,
  actionValue,
} from './import-action-context';

function pattern(details: ActionDetail[], label: string, value: unknown): void {
  const p = actionObject(value);
  if (!p.pattern) return;
  actionDetail(details, label, p.pattern);
  actionDetail(details, `${label} · 模式`, p.mode === 'regex' ? '正则表达式' : '字面量');
  if (p.mode === 'regex')
    actionDetail(details, `${label} · 标志`, p.flags || '默认（全局、Unicode）');
}
function range(value: unknown): string {
  const r = actionObject(value);
  return typeof r.start === 'number' && typeof r.end === 'number'
    ? `[${r.start}, ${r.end}) · UTF-16`
    : '';
}
function appendRules(details: ActionDetail[], rules: ImportActionData): void {
  const modes: Record<string, string> = {
    regex: '正则卷章标题',
    markdown: 'Markdown 标题层级',
    single: '单章正文范围',
  };
  actionDetail(details, '拆章方式', modes[actionText(rules.mode)]);
  pattern(details, '章节标题规则', rules.chapter_pattern);
  pattern(details, '卷标题规则', rules.volume_pattern);
  actionDetail(details, '章节标题层级', rules.chapter_level);
  actionDetail(details, '卷标题层级', rules.volume_level);
  actionDetail(
    details,
    '正文中的章标题',
    rules.include_headings === true ? '保留' : '提取到标题栏',
  );
  const selection = actionObject(rules.selection);
  pattern(details, '正文开始标记', selection.start);
  pattern(details, '正文结束标记', selection.end);
  pattern(details, '正文捕获规则', selection.body);
}
function appendItems(details: ActionDetail[], items: ImportActionData[], prefix: string): void {
  items.forEach((item, index) => {
    const label = `${prefix} ${index + 1}`;
    if (item.reason) {
      actionDetail(details, label, `${range(item)}\n${actionText(item.reason)}`);
      return;
    }
    actionDetail(
      details,
      `${label} · 卷章`,
      [item.volumeTitle, item.title].filter(Boolean).join(' / '),
    );
    actionDetail(details, `${label} · 区间`, range(item));
    actionDetail(details, `${label} · 字符数`, item.characters);
    actionDetail(details, `${label} · 章节 ID`, item.chapterId);
    actionDetail(details, `${label} · 开头片段`, item.head);
    actionDetail(details, `${label} · 结尾片段`, item.tail);
    if (Array.isArray(item.warnings))
      actionDetail(details, `${label} · 提示`, item.warnings.join('\n'));
    if (item.unassigned === true) actionDetail(details, `${label} · 归类`, '待归类，默认不选中');
  });
}

export function describeTextStructure(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string | undefined {
  const labels: Record<string, string> = {
    preview_text_structure: '预览文本拆章',
    get_text_structure: '查看文本拆章',
    apply_text_structure: '应用文本拆章',
  };
  if (!labels[name]) return;
  const recorded = context.batches.get(actionText(args.batch_id));
  const input = recorded?.name === 'preview_text_structure' ? recorded.args : args;
  const resourceId = result.resourceId ?? input.resource_id;
  const source =
    actionText(result.sourceName) || actionLabel(resourceId, context.resources, '提取资源');
  actionDetail(details, '来源文件', source);
  actionDetail(details, '提取资源 ID', resourceId);
  actionDetail(details, '来源快照 ID', result.snapshotId);
  actionDetail(details, '预览基准版本', input.base_draft_revision);
  actionDetail(details, '正文选择区间', range(result.selected));
  actionDetail(details, '原文字符数', result.totalCharacters);
  actionDetail(details, '排除字符数', result.excludedCharacters);
  actionDetail(details, '待归类章节', result.unassigned);
  actionDetail(details, '空章节', result.empty);
  actionDetail(details, '提示数量', result.warningCount);
  if (input.volume_id)
    actionDetail(
      details,
      '默认目标卷',
      actionLabel(input.volume_id, recorded?.volumes ?? context.volumes, '卷'),
    );
  const replacements = input.replace_chapter_ids ?? result.replaceChapterIds;
  if (Array.isArray(replacements))
    actionDetail(
      details,
      '替换的草稿章节',
      replacements
        .map(
          (id) =>
            `${actionLabel(id, recorded?.chapters ?? context.chapters, '章节')} (${actionText(id)})`,
        )
        .join('\n'),
    );
  appendRules(details, actionObject(input.rules ?? result.rules));
  let page = '';
  if (name === 'get_text_structure') {
    const items = actionItems(result.items);
    const label = (args.view ?? result.view) === 'excluded' ? '排除记录' : '章节';
    page = ` · ${label} · ${actionRange(args, result, Array.isArray(result.items) ? items.length : undefined, '项')}`;
    actionDetail(details, '本页范围', page.slice(3));
    appendItems(details, items, label);
  } else appendItems(details, actionItems(result.examples), '示例');
  if (Array.isArray(result.examples) && name !== 'get_text_structure')
    actionDetail(
      details,
      '示例说明',
      `仅展示 ${result.examples.length} 项示例，完整卷章和排除记录可分页检查`,
    );
  const counts =
    typeof result.chapters === 'number'
      ? `（${actionValue(result.volumes)} 卷／${result.chapters} 章／${actionValue(result.warningCount)} 项提示）`
      : '';
  return `${labels[name]}：「${actionClip(source)}」${page}${counts}`;
}
