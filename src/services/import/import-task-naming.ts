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
  if (!trimmed) throw new Error('NAME_INVALID: 任务名不能为空');
  if (trimmed.length > TASK_NAME_MAX)
    throw new Error(`NAME_INVALID: 任务名不能超过 ${TASK_NAME_MAX} 个字符`);
  if (actor === 'agent' && task.nameSource === 'user')
    throw new Error('NAME_LOCKED: 用户已手动命名这个任务，不要再修改');
  task.name = trimmed;
  task.nameSource = actor;
  return { success: true, name: trimmed };
}

/** 生成方案前必须已命名，保证任务列表可以区分。 */
export function assertImportTaskNamed(task: ImportTask): void {
  if (!task.nameSource)
    throw new Error(
      'TASK_UNNAMED: 请先根据识别到的书本信息调用 rename_import_task 命名任务，再生成导入方案',
    );
}
