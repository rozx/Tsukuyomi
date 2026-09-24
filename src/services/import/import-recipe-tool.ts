import type { BookUpdateRecipe } from 'src/models/book-sync';
import type { ImportExtractionRules, ImportRunContext } from 'src/models/import';
import type { ImportSourceFilter } from 'src/models/import-pattern';
import { ImportRepository } from './import-repository';
import type { ImportTaskMutationOptions } from './import-repository';
import { loadImportPlanContext } from './import-plan-context';
import { invalidateImportPreview } from './import-draft-service';
import {
  buildImportRecipe,
  summarizeImportRecipe,
  testImportRecipe,
  type ImportRecipeDeclaration,
} from './import-update-recipe';

type Finish = NonNullable<ImportTaskMutationOptions<unknown>['finish']>;

/** 工具参数已按 schema 校验；这里只做命名转换。 */
function declarationOf(args: Record<string, unknown>): ImportRecipeDeclaration {
  return {
    catalogSourceIds: args.catalog_source_ids as string[],
    ...(typeof args.catalog_selector === 'string' && args.catalog_selector.trim()
      ? { catalogSelector: args.catalog_selector }
      : {}),
    ...(args.chapter_filter ? { chapterFilter: args.chapter_filter as ImportSourceFilter } : {}),
    ...(args.content_rules ? { contentRules: args.content_rules as ImportExtractionRules } : {}),
    ...(args.cleanup ? { cleanup: args.cleanup as NonNullable<BookUpdateRecipe['cleanup']> } : {}),
    ...(args.strip_heading === true ? { stripHeading: true } : {}),
    ...(args.pinned_chapter_ids ? { pinnedChapterIds: args.pinned_chapter_ids as string[] } : {}),
  };
}

/**
 * 声明更新配方：校验来源、离线自测，通过后以一次草稿修改写入。
 * 失败时不改草稿，返回 saved=false，由执行器按普通工具结果保存。
 */
export async function recordImportRecipe(
  run: ImportRunContext,
  args: Record<string, unknown>,
  finish: Finish,
  signal?: AbortSignal,
): Promise<{ saved: boolean; data: unknown }> {
  const base = args.base_draft_revision as number;
  const context = await loadImportPlanContext(run.taskId, base);
  const recipe = await buildImportRecipe(context, declarationOf(args));
  const test = await testImportRecipe(context, recipe, signal ? { signal } : {});
  const summary = {
    engine: summarizeImportRecipe(recipe).engine,
    catalogUrls: recipe.catalogUrls,
    verified: test.verified,
    pinned: test.pinned,
  };
  if (!test.ok)
    return {
      saved: false,
      data: {
        success: false,
        error: { code: test.issues[0]!.code, message: test.issues[0]!.message },
        issues: test.issues,
        ...summary,
      },
    };
  const data = await ImportRepository.mutateTask(
    run.taskId,
    (task) => {
      if (task.draft.revision !== base) throw new Error('DRAFT_CHANGED: 草稿已变化，请重新读取');
      if (['applying', 'reverting'].includes(task.state))
        throw new Error('TASK_BUSY: 正在提交导入变更');
      invalidateImportPreview(task);
      task.draft.updateRecipe = {
        recipe: { ...recipe, verifiedChapterCount: test.verified },
        declaredAtRevision: base,
        selfTest: { ok: true, verified: test.verified, pinned: test.pinned, issues: [] },
      };
      task.draft.revision++;
      return Promise.resolve({ success: true, draftRevision: task.draft.revision, ...summary });
    },
    { run, finish },
  );
  return { saved: true, data };
}
