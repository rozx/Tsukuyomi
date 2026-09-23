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
} from './import-action-context';
import type {
  ImportActionData,
  ImportActionContext,
  ImportActionInfo,
} from './import-action-context';
import { describeImportBatch, describeImportSources } from './import-batch-description';
function draftRead(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const task = context.task?.name || '当前任务';
  if (args.view === 'chapter') {
    const title =
      actionText(result.title) || actionLabel(args.chapter_id, context.chapters, '章节');
    const range = actionRange(
      args,
      result,
      Array.isArray(result.content) ? result.content.length : undefined,
      '项',
    );
    actionDetail(details, '章节', title);
    actionDetail(details, '读取内容', '章节草稿的正文引用');
    actionDetail(details, '读取范围', range);
    actionDetail(
      details,
      '正文引用',
      actionItems(result.content)
        .map((ref) => {
          const location =
            ref.kind === 'existing'
              ? `书籍 ${actionText(ref.bookId)}／章节 ${actionText(ref.chapterId)}／段落 ${actionText(ref.paragraphId)}`
              : `资源 ${actionText(ref.resourceId)}${ref.blockId ? `／内容块 ${actionText(ref.blockId)}` : '／全部内容块'}`;
          const range =
            ref.start !== undefined || ref.end !== undefined
              ? `；字符偏移 ${actionValue(ref.start ?? 0)}–${actionValue(ref.end ?? '末尾')}`
              : '';
          return `${location}${range}${Array.isArray(ref.excludeRanges) ? `；排除 ${ref.excludeRanges.length} 处` : ''}`;
        })
        .join('\n'),
    );
    return `读取章节草稿：「${actionClip(title)}」· 正文引用${range}`;
  }
  if (args.view === 'chapters') {
    const range = actionRange(
      args,
      result,
      Array.isArray(result.chapters) ? result.chapters.length : undefined,
      '章',
    );
    actionDetail(details, '读取内容', '卷章草稿目录');
    actionDetail(details, '读取范围', range);
    actionDetail(
      details,
      '本页章节',
      actionItems(result.chapters)
        .map((c) => actionText(c.title) || actionText(c.id))
        .join('\n'),
    );
    return `读取草稿目录：「${actionClip(task)}」· ${range}`;
  }
  actionDetail(details, '读取内容', '任务总览、元信息与卷章统计');
  actionDetail(details, '章节数', result.chapterCount);
  actionDetail(
    details,
    '卷',
    actionItems(result.volumes)
      .map((v) => actionText(v.title))
      .join('\n'),
  );
  return `读取草稿总览：「${actionClip(task)}」`;
}

function sourceRead(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const title = actionLabel(args.resource_id, context.resources, '来源资源');
  actionDetail(details, '来源', title);
  const sourceId = context.resourceSources.get(actionText(args.resource_id));
  if (sourceId) actionDetail(details, '来源位置', context.locations.get(sourceId));
  const view = actionText(args.view) || 'text';
  const viewLabels: Record<string, string> = {
    text: '来源原文',
    blocks: '正文内容块',
    excluded: '排除记录',
    inspection: '来源检查信息',
  };
  const label = viewLabels[view] ?? '来源内容';
  actionDetail(details, '读取内容', label);
  if (view === 'inspection') return `查看${label}：「${actionClip(title)}」`;
  const count =
    view === 'text'
      ? typeof result.text === 'string'
        ? result.text.length
        : undefined
      : Array.isArray(result.items)
        ? result.items.length
        : undefined;
  const range = actionRange(args, result, count, view === 'text' ? '字符' : '项');
  actionDetail(details, '读取范围', range);
  actionDetail(details, '读取的原文', result.text);
  actionItems(result.items).forEach((item, index) => {
    actionDetail(
      details,
      `第 ${index + 1} 项${item.truncated ? '（截断预览）' : ''}`,
      item.preview,
    );
    actionDetail(details, `第 ${index + 1} 项排除原因`, item.reason);
  });
  return `读取${label}：「${actionClip(title)}」· ${range}`;
}

function editDescription(
  args: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const labels: Record<string, string> = {
    set_metadata: '设置书籍信息',
    propose_target: '设置导入目标',
    declare_candidates: '声明小说范围',
    upsert_volume: '设置卷',
    upsert_chapter: '设置章节',
    remove_chapter: '删除章节',
    reorder_chapters: '调整章节顺序',
    reorder_volumes: '调整卷顺序',
    propose_match: '设置章节对应',
    set_completeness: '设置完整性',
  };
  const lines = actionItems(args.operations).map((op) => {
    const chapter = actionObject(op.chapter);
    const target =
      actionText(chapter.title) ||
      actionText(op.title) ||
      (op.chapterId ? actionLabel(op.chapterId, context.chapters, '章节') : '') ||
      actionText(op.value);
    return `${labels[actionText(op.op)] ?? actionText(op.op)}${target ? `：${target}` : ''}`;
  });
  actionDetail(details, '草稿操作', lines.join('\n'));
  return `编辑草稿：${lines
    .slice(0, 2)
    .map((line) => actionClip(line, 36))
    .join('；')}${lines.length > 2 ? ` 等${lines.length}项` : ''}`;
}
function libraryRead(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const book =
    name === 'get_book_info'
      ? actionText(result.title) || actionLabel(args.book_id, context.books, '书籍')
      : actionLabel(args.book_id, context.books, '书籍');
  actionDetail(details, '书籍', book);
  if (name === 'get_book_info') return `读取书库信息：「${actionClip(book)}」`;
  const chapter = actionText(result.title) || actionText(args.chapter_id);
  actionDetail(details, '章节', chapter);
  const values = name === 'list_chapters' ? result.items : result.paragraphs;
  const range = actionRange(
    args,
    result,
    Array.isArray(values) ? values.length : undefined,
    name === 'list_chapters' ? '章' : '段',
  );
  actionDetail(details, '读取范围', range);
  actionDetail(
    details,
    '读取结果',
    actionItems(values)
      .map((item) => actionText(item.title) || actionText(item.text))
      .join('\n'),
  );
  return name === 'list_chapters'
    ? `对照书库目录：「${actionClip(book)}」· ${range}`
    : `对照书库章节：「${actionClip(chapter)}」· ${range}`;
}
function sourceList(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const parent = args.parent_source_id
    ? actionLabel(args.parent_source_id, context.sources, '来源')
    : context.task?.name || '当前任务';
  const statuses: Record<string, string> = {
    registered: '未读取',
    inspected: '已检查',
    extracted: '已提取',
    failed: '失败',
    excluded: '已排除',
  };
  const status = statuses[actionText(args.status)];
  actionDetail(details, '来源范围', parent);
  actionDetail(details, '状态筛选', status);
  actionDetail(
    details,
    '来源列表',
    actionItems(result.items)
      .map(
        (item) =>
          `${actionText(item.name) || actionText(item.id)}${item.url ? `\n${actionText(item.url)}` : ''}`,
      )
      .join('\n'),
  );
  return `列出来源：「${actionClip(parent)}」${status ? ` · ${status}` : ''}${Array.isArray(result.items) ? ` · 返回${result.items.length}个` : ''}`;
}

export function importActionInfo(
  name: string,
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
): ImportActionInfo {
  const details: ActionDetail[] = [];
  actionDetail(details, '导入任务', context.task?.name);
  actionDetail(
    details,
    '状态',
    !Object.keys(result).length ? '进行中' : result.success === false ? '失败' : '已完成',
  );
  actionDetail(details, '草稿版本', result.draftRevision);
  actionDetail(details, '基准草稿版本', args.base_draft_revision ?? args.draft_revision);
  for (const [key, label] of Object.entries({
    chapter_id: '章节 ID',
    source_id: '来源 ID',
    resource_id: '资源 ID',
    batch_id: '批次 ID',
    book_id: '书籍 ID',
  }))
    actionDetail(details, label, args[key]);
  const error = actionObject(result.error);
  actionDetail(details, '错误代码', error.code);
  actionDetail(details, '错误原因', error.message ?? result.error);
  appendImportResultDetails(result, context, details);
  if (name === 'edit_import_draft')
    return { summary: editDescription(args, context, details), details };
  if (['get_book_info', 'list_chapters', 'get_chapter_info'].includes(name))
    return { summary: libraryRead(name, args, result, context, details), details };
  if (name === 'list_sources')
    return { summary: sourceList(args, result, context, details), details };
  if (name === 'preview_import')
    return {
      summary: `生成导入方案：「${actionClip(context.task?.name || '当前任务')}」`,
      details,
    };
  if (name === 'read_source')
    return { summary: sourceRead(args, result, context, details), details };
  const batch = describeImportBatch(name, args, result, context, details);
  if (batch) return { summary: batch, details };
  if (name === 'get_import_draft')
    return { summary: draftRead(args, result, context, details), details };
  if (name === 'extract_content' || name === 'add_sources') {
    const selected = describeImportSources(args, context, details);
    if (selected)
      return {
        summary: `${name === 'add_sources' ? '追加来源' : '提取正文'}：${selected}${args.filter ? ' · 按规则筛选' : ''}`,
        details,
      };
  }
  if (args.source_id) {
    actionDetail(details, '来源', actionLabel(args.source_id, context.sources, '来源'));
    actionDetail(details, '来源位置', context.locations.get(actionText(args.source_id)));
  }
  return { details };
}
