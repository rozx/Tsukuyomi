import type { ActionDetail } from 'src/utils/action-info-utils';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import {
  actionClip,
  actionDetail,
  actionItems,
  actionLabel,
  actionObject,
  actionT,
  actionText,
} from './import-action-context';
import type { ImportActionContext, ImportActionData } from './import-action-context';

/** 配方概要里的引擎标识转成界面文字，例如 builtin:ncode → 内置站点（ncode）。 */
export function recipeEngineLabel(engine: unknown, locale: AppLocale = 'zh-CN'): string {
  const value = actionText(engine);
  if (!value) return '';
  return value.startsWith('builtin:')
    ? translateText(locale, 'importUi.action.recipe.builtin', { site: value.slice(8) })
    : translateText(locale, 'importUi.action.recipe.generic');
}

function stage(result: ImportActionData): MessageKey {
  if (!Object.keys(result).length) return 'importUi.action.recipe.testing';
  return result.success === false
    ? 'importUi.action.recipe.testFailed'
    : 'importUi.action.recipe.testPassed';
}

/** record_update_recipe 的气泡与详情：阶段、引擎、可复现章节数和差异示例。 */
export function describeRecipeDeclaration(
  args: ImportActionData,
  result: ImportActionData,
  context: ImportActionContext,
  details: ActionDetail[],
): string {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    actionT(context, key, values);
  const catalogs = (Array.isArray(args.catalog_source_ids) ? args.catalog_source_ids : []).map(
    (id) => actionLabel(id, context.sources, t('importUi.action.label.source')),
  );
  const engine = recipeEngineLabel(result.engine, context.uiLocale);
  actionDetail(details, t('importUi.action.recipe.stage'), t(stage(result)));
  actionDetail(details, t('importUi.recipe.engine'), engine);
  actionDetail(details, t('importUi.action.batch.catalogSource'), catalogs.join('\n'));
  actionDetail(
    details,
    t('importUi.action.recipe.catalogUrls'),
    (Array.isArray(result.catalogUrls) ? result.catalogUrls : []).map(actionText).join('\n'),
  );
  actionDetail(details, t('importUi.action.recipe.catalogSelector'), args.catalog_selector);
  actionDetail(details, t('importUi.action.recipe.verified'), result.verified);
  actionDetail(details, t('importUi.action.recipe.pinned'), result.pinned);
  actionDetail(
    details,
    t('importUi.recipe.cleanup'),
    actionItems(args.cleanup)
      .map((rule) => {
        const pattern = actionObject(rule.pattern);
        return t(
          pattern.mode === 'regex'
            ? 'importUi.action.recipe.cleanupRegex'
            : 'importUi.action.recipe.cleanupText',
          {
            action: t(
              rule.action === 'remove_lines'
                ? 'importUi.action.batch.removeLines'
                : 'importUi.action.recipe.removeMatches',
            ),
            pattern: actionText(pattern.pattern),
          },
        );
      })
      .join('\n'),
  );
  if (args.strip_heading === true)
    actionDetail(
      details,
      t('importUi.action.recipe.stripHeading'),
      t('importUi.action.recipe.yes'),
    );
  actionDetail(
    details,
    t('importUi.action.recipe.issues'),
    actionItems(result.issues)
      .map((issue) => actionText(issue.message))
      .join('\n'),
  );
  const target = catalogs[0] ? t('importUi.action.quoted', { value: actionClip(catalogs[0]) }) : '';
  return t('importUi.action.recipe.summary', {
    target,
    engine: engine ? ` · ${engine}` : '',
  });
}
