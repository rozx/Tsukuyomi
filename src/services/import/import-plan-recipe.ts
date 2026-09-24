import type { BookUpdateRecipe } from 'src/models/book-sync';
import type { ImportPlan } from 'src/models/import';
import type { ImportParsingClient } from './import-parsing-client';
import type { ImportPlanContext } from './import-plan-context';
import {
  summarizeImportRecipe,
  testImportRecipe,
  type ImportRecipeTestResult,
} from './import-update-recipe';

export interface ImportRecipeEvaluation {
  change?: NonNullable<ImportPlan['recipeChange']>;
  /** 自测通过、本次要写入书籍的配方 */
  recipe?: BookUpdateRecipe;
  test?: ImportRecipeTestResult;
}

/** 生成方案时基于当前草稿重跑自测；失效时只说明原因，不影响其余导入内容。 */
export async function evaluateImportRecipe(
  context: ImportPlanContext,
  parser: ImportParsingClient,
  signal?: AbortSignal,
): Promise<ImportRecipeEvaluation> {
  const before = context.snapshot?.book.updateRecipe;
  const previous = before ? { before: summarizeImportRecipe(before) } : {};
  const declared = context.task.draft.updateRecipe;
  if (!declared)
    return before
      ? { change: { kind: 'keep', verified: before.verifiedChapterCount, ...previous } }
      : {};
  const test = await testImportRecipe(context, declared.recipe, {
    parser,
    ...(signal ? { signal } : {}),
  });
  if (!test.ok)
    return {
      test,
      change: {
        kind: 'stale',
        verified: test.verified,
        ...previous,
        after: summarizeImportRecipe(declared.recipe),
        reason: `配方已失效，本次不会写入配方：${test.issues[0]!.message}`,
        issues: test.issues,
      },
    };
  const recipe = { ...declared.recipe, verifiedChapterCount: test.verified };
  return {
    test,
    recipe,
    change: {
      kind: before ? 'replace' : 'add',
      verified: test.verified,
      ...previous,
      after: summarizeImportRecipe(recipe),
    },
  };
}

/**
 * 把配方写进方案书籍：跳过列表 = 原列表 ∪ 草稿中未选中且与目录一一对应的章节 − 本次写入的网址。
 * 没有有效配方时只做减法，保留目标书原有的配方。
 */
export function applyImportRecipe(
  context: ImportPlanContext,
  plan: ImportPlan,
  evaluation: ImportRecipeEvaluation,
  writtenUrls: string[],
): void {
  const book = plan.book;
  const written = new Set(writtenUrls);
  const prior = book.updateRecipe?.skippedUrls ?? [];
  if (evaluation.recipe && evaluation.test) {
    const titles = new Map(evaluation.test.entries.map((entry) => [entry.url, entry.title]));
    const skipped = [...prior];
    for (const chapter of context.task.draft.chapters) {
      const url = evaluation.test.chapterUrls.get(chapter.id);
      if (!chapter.selected && url && !skipped.some((entry) => entry.url === url))
        skipped.push({ url, title: titles.get(url) ?? chapter.title });
    }
    book.updateRecipe = {
      ...evaluation.recipe,
      skippedUrls: skipped.filter((entry) => !written.has(entry.url)),
      recordedAt: plan.createdAt,
    };
    const catalog = evaluation.recipe.catalogUrls[0]!;
    book.webUrl = [catalog, ...(book.webUrl ?? []).filter((url) => url !== catalog)];
    return;
  }
  if (book.updateRecipe && prior.some((entry) => written.has(entry.url)))
    book.updateRecipe = {
      ...book.updateRecipe,
      skippedUrls: prior.filter((entry) => !written.has(entry.url)),
    };
}
