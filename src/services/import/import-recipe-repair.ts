import type { ImportTask } from 'src/models/import';
import type { Novel } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { ImportRepository } from './import-repository';
import { ImportSourceService } from './import-source-service';

const FINISHED = new Set<ImportTask['state']>(['applied', 'reverted']);

/** 修复任务：从书籍同步工作区发起，由用户在导入工作台决定何时运行。 */
export class ImportRecipeRepair {
  /**
   * 打开这本书尚未完成的修复任务，没有就新建：预设目标、目录来源和失效原因。
   * 不启动 Agent，因此也不会绕过同一时间只运行一个导入任务的限制。
   */
  static async open(
    book: Pick<Novel, 'id' | 'title' | 'updateRecipe' | 'webUrl'>,
    reason: string,
  ): Promise<string> {
    const tasks = await (await getDB()).getAll('import-tasks');
    const existing = tasks.find(
      (task) =>
        task.purpose?.kind === 'recipe-repair' &&
        task.purpose.bookId === book.id &&
        !FINISHED.has(task.state),
    );
    if (existing) return existing.id;
    const task = await ImportRepository.createTask(`修复更新配方：${book.title}`);
    await ImportRepository.mutateTask(task.id, (current) => {
      current.nameSource = 'user';
      current.purpose = { kind: 'recipe-repair', bookId: book.id, reason };
      current.draft.target = { kind: 'existing', bookId: book.id, basis: 'user' };
      return Promise.resolve();
    });
    const catalog = book.updateRecipe?.catalogUrls[0] ?? book.webUrl?.[0];
    if (catalog) await ImportSourceService.registerUrl(task.id, catalog);
    return task.id;
  }
}

/** 工作台打开还没有对话的修复任务时，预填给 Agent 的说明；由用户决定是否发送。 */
export function importRepairPrefill(task: ImportTask, eventCount: number): string {
  if (task.purpose?.kind !== 'recipe-repair' || eventCount > 0) return '';
  return `这本书的更新配方需要修复：${task.purpose.reason}。请检查目录来源和章节页，建立一份通过自测的更新配方；站点没有新章节时，可以只提交配方变化。`;
}
