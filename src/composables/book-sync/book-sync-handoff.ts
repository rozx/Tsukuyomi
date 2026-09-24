import type { Router } from 'vue-router';
import { assertImportWorkspaceEnabled } from 'src/constants/features';
import { ImportRepository } from 'src/services/import/import-repository';
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportRecipeRepair } from 'src/services/import/import-recipe-repair';
import type { Novel } from 'src/models/novel';

/**
 * 把无法回放的网址交给 AI 导入器：创建任务、登记网址为来源并跳转到该任务。
 * 不启动 Agent，由用户在导入工作台里决定何时开始。
 */
export async function handoffToImporter(url: string, router: Router): Promise<string> {
  assertImportWorkspaceEnabled();
  const task = await ImportRepository.createTask(`导入：${new URL(url).hostname}`);
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
  const taskId = await ImportRecipeRepair.open(book, reason);
  await router.push(`/import/${taskId}`);
  return taskId;
}
