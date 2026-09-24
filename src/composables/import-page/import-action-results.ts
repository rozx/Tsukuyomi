import type { ActionDetail } from 'src/utils/action-info-utils';
import {
  actionDetail,
  actionValue,
  actionItems,
  actionObject,
  actionText,
  actionLabel,
} from './import-action-context';
import type { ImportActionData, ImportActionContext } from './import-action-context';

const RESULT_LABELS: Record<string, string> = {
  draftRevision: '草稿版本',
  batchId: '批次 ID',
  planId: '方案 ID',
  targetBookId: '目标书籍 ID',
  affected: '影响项目',
  matches: '命中次数',
  ready: '成功',
  failed: '失败',
  pending: '待处理',
  total: '总数',
  nextOffset: '后续起始偏移',
  format: '来源格式',
  totalCharacters: '正文字符数',
  bookRevision: '书籍版本',
  author: '作者',
  description: '简介',
};
const SUMMARY_LABELS: Record<string, string> = {
  addedChapters: '新增章节',
  updatedChapters: '更新章节',
  removedChapters: '删除章节',
  addedParagraphs: '新增段落',
  removedParagraphs: '删除段落',
  clearedVersions: '清除译文版本',
  clearedParagraphs: '受影响段落',
};

export function appendImportResultDetails(
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): void {
  for (const [key, label] of Object.entries(RESULT_LABELS))
    if (!details.some((d) => d.label === label)) actionDetail(details, label, result[key]);
  for (const [key, label] of [
    ['warnings', '警告'],
    ['missing', '缺失内容'],
  ] as const) {
    if (Array.isArray(result[key]))
      actionDetail(details, label, result[key].map(String).join('\n'));
  }
  actionDetail(
    details,
    '待处理问题',
    actionItems(result.conflicts)
      .map((c) => actionText(c.message))
      .join('\n'),
  );
  const summary = actionObject(result.summary);
  for (const [key, label] of Object.entries(SUMMARY_LABELS))
    actionDetail(details, label, summary[key]);
  const metadataLabels: Record<string, string> = {
    title: '书名',
    author: '作者',
    description: '简介',
    cover: '封面',
    alternateTitles: '别名',
    tags: '标签',
  };
  const metadata = actionObject(result.metadata ?? actionObject(result.inspection).metadata);
  for (const [key, label] of Object.entries(metadataLabels))
    actionDetail(details, label, actionObject(metadata[key]).value ?? metadata[key]);
  const completeness = actionObject(result.completeness);
  if (typeof completeness.confirmed === 'boolean')
    actionDetail(details, '完整性', completeness.confirmed ? '已确认' : '未确认');
  actionDetail(details, '已知总章数', completeness.knownTotal);
  if (Array.isArray(completeness.missing))
    actionDetail(details, '缺失章节', completeness.missing.map(String).join('\n'));
  actionItems(result.results).forEach((item, index) => {
    const source = actionLabel(item.sourceId, context.sources, '来源');
    const error = actionObject(item.error);
    const lines = [source, item.success === false ? '失败' : '成功', actionText(error.message)];
    if (typeof item.totalCharacters === 'number') lines.push(`${item.totalCharacters} 字符`);
    if (Array.isArray(item.warnings)) lines.push(...item.warnings.map(String));
    actionDetail(details, `来源结果 ${index + 1}`, lines.filter(Boolean).join('\n'));
  });
}

export function appendExtractionRules(value: unknown, details: ActionDetail[], prefix = ''): void {
  const rules = actionObject(value);
  for (const [key, label] of Object.entries({
    preset: '提取预设',
    selector: '正文选择器',
    encoding: '编码',
  }))
    actionDetail(details, prefix + label, rules[key]);
  if (Array.isArray(rules.excludeSelectors))
    actionDetail(details, prefix + '排除选择器', rules.excludeSelectors.map(String).join('\n'));
  for (const [key, label] of [
    ['ranges', '选取范围'],
    ['excludeRanges', '排除范围'],
  ] as const) {
    actionDetail(
      details,
      prefix + label,
      actionItems(rules[key])
        .map(
          (range) =>
            `${actionValue(range.start)}–${actionValue(range.end)}${range.reason ? `：${actionText(range.reason)}` : ''}`,
        )
        .join('\n'),
    );
  }
}
