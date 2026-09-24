import type { ActionDetail } from 'src/utils/action-info-utils';
import {
  actionClip,
  actionDetail,
  actionItems,
  actionLabel,
  actionObject,
  actionText,
} from './import-action-context';
import type { ImportActionContext, ImportActionData } from './import-action-context';

/** 配方概要里的引擎标识转成界面文字，例如 builtin:ncode → 内置站点（ncode）。 */
export function recipeEngineLabel(engine: unknown): string {
  const value = actionText(engine);
  if (!value) return '';
  return value.startsWith('builtin:') ? `内置站点（${value.slice(8)}）` : '通用网页';
}

function stage(result: ImportActionData): string {
  if (!Object.keys(result).length) return '离线自测中';
  return result.success === false ? '自测未通过，草稿未修改' : '自测通过，已写入草稿';
}

/** record_update_recipe 的气泡与详情：阶段、引擎、可复现章节数和差异示例。 */
export function describeRecipeDeclaration(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const catalogs = (Array.isArray(args.catalog_source_ids) ? args.catalog_source_ids : []).map(
    (id) => actionLabel(id, context.sources, '来源'),
  );
  const engine = recipeEngineLabel(result.engine);
  actionDetail(details, '阶段', stage(result));
  actionDetail(details, '引擎', engine);
  actionDetail(details, '目录来源', catalogs.join('\n'));
  actionDetail(
    details,
    '目录网址',
    (Array.isArray(result.catalogUrls) ? result.catalogUrls : []).map(actionText).join('\n'),
  );
  actionDetail(details, '目录链接范围', args.catalog_selector);
  actionDetail(details, '可复现章节', result.verified);
  actionDetail(details, '固定正文章节', result.pinned);
  actionDetail(
    details,
    '清理规则',
    actionItems(args.cleanup)
      .map((rule) => {
        const pattern = actionObject(rule.pattern);
        const action = rule.action === 'remove_lines' ? '删除整行' : '删除匹配';
        return `${action}：${actionText(pattern.pattern)}${pattern.mode === 'regex' ? '（正则）' : ''}`;
      })
      .join('\n'),
  );
  if (args.strip_heading === true) actionDetail(details, '剥离标题', '是');
  actionDetail(
    details,
    '差异示例',
    actionItems(result.issues)
      .map((issue) => actionText(issue.message))
      .join('\n'),
  );
  const target = catalogs[0] ? `「${actionClip(catalogs[0])}」` : '';
  return `声明更新配方：${target}${engine ? ` · ${engine}` : ''}`;
}
