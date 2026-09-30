import { importError } from './import-error';
import type { ImportTask } from 'src/models/import';

const TASK_NAME_MAX = 80;

/**
 * 修改任务名。Agent 通过 rename_import_task 调用，用户在工作台手动改名；
 * 用户命名后 Agent 不能再覆盖。
 */
export function renameImportTask(
  task: ImportTask,
  name: string,
  actor: 'agent' | 'user',
): { success: true; name: string } {
  const trimmed = name.trim();
  if (!trimmed) throw importError('NAME_INVALID', 'nameInvalidTaskNamesMustBeNonempty', {});
  if (trimmed.length > TASK_NAME_MAX)
    throw importError('NAME_INVALID', 'nameInvalidTaskNamesAreLimitedToDetail', {
      value1: String(TASK_NAME_MAX),
    });
  if (actor === 'agent' && task.nameSource === 'user')
    throw importError('NAME_LOCKED', 'nameLockedTheUserNamedThisTaskManually', {});
  task.name = trimmed;
  task.nameSource = actor;
  return { success: true, name: trimmed };
}

/** 生成方案前必须已命名，保证任务列表可以区分。 */
export function assertImportTaskNamed(task: ImportTask): void {
  if (!task.nameSource)
    throw importError('TASK_UNNAMED', 'taskUnnamedUseRenameImportTaskWithThe', {});
}
