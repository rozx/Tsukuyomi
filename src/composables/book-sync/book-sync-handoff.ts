import { translateText } from 'src/i18n/translate';
import type { Router } from 'vue-router';
import { assertImportWorkspaceEnabled } from 'src/constants/features';
import { ImportRepository } from 'src/services/import/import-repository';
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportRecipeRepair } from 'src/services/import/import-recipe-repair';
import type { Novel } from 'src/models/novel';
import { useSettingsStore } from 'src/stores/settings';
import type { AppLocale } from 'src/models/locale';
import type { BookSyncChangeset } from 'src/models/book-sync';
import { importNoticeText } from 'src/services/import/import-error';

/**
 * 交给导入 Agent 的修复原因：自有失败按执行语言投影，外部诊断保留原文；
 * 没有失败记录时使用固定说明。原因会写入修复任务并进入 Agent 提示词。
 */
export function repairReason(
  changeset: Pick<BookSyncChangeset, 'status' | 'failed'> | null,
  uiLocale: AppLocale,
): string {
  if (changeset?.status !== 'invalid')
    return translateText(uiLocale, 'aiImportPrompt.recipeMissingReason');
  const failure = changeset.failed[0];
  return failure
    ? importNoticeText(failure, uiLocale)
    : translateText(uiLocale, 'aiImportPrompt.recipeReplayFailed');
}

/**
 * 把无法回放的网址交给 AI 导入器：创建任务、登记网址为来源并跳转到该任务。
 * 不启动 Agent，由用户在导入工作台里决定何时开始。
 */
export async function handoffToImporter(url: string, router: Router): Promise<string> {
  assertImportWorkspaceEnabled();
  const task = await ImportRepository.createTask(
    translateText(useSettingsStore().uiLocale, 'aiImportErrors.defaultWebsiteTask', {
      host: new URL(url).hostname,
    }),
  );
  await ImportSourceService.registerUrl(task.id, url);
  await router.push(`/import/${task.id}`);
  return task.id;
}

/**
 * 配方缺失或失效时回到 AI 导入器修复：打开这本书未完成的修复任务或新建一个，并跳转过去。
 * 同样不启动 Agent；另一个导入任务正在运行时，由工作台提示先暂停它。
 */
export async function repairWithImporter(
  book: Pick<Novel, 'id' | 'title' | 'updateRecipe' | 'webUrl'>,
  reason: string,
  router: Router,
): Promise<string> {
  assertImportWorkspaceEnabled();
  const taskId = await ImportRecipeRepair.open(book, reason, useSettingsStore().uiLocale);
  await router.push(`/import/${taskId}`);
  return taskId;
}
