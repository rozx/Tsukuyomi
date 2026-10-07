import type { AppSettings, TaskDefaultModels } from 'src/models/settings';

type TaskModelSettings = Pick<AppSettings, 'taskDefaultModels' | 'taskDefaultModelsUpdatedAt'>;
type Input = {
  lastEdited?: unknown;
  taskDefaultModels?: unknown;
  taskDefaultModelsUpdatedAt?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function timestamp(value: unknown): number {
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'string'
        ? new Date(value).getTime()
        : value;
  return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? time : 0;
}

/** 旧配置以整份设置的时间初始化一次；保留未来任务，忽略损坏的选择和游离时间戳。 */
export function normalizeTaskModelSettings(settings: Input): TaskModelSettings {
  const values: TaskDefaultModels = {};
  const times: NonNullable<AppSettings['taskDefaultModelsUpdatedAt']> = {};
  const rawTimes = record(settings.taskDefaultModelsUpdatedAt);
  for (const [key, value] of Object.entries(record(settings.taskDefaultModels))) {
    if (value !== null && (typeof value !== 'string' || !value.trim())) continue;
    const task = key as keyof TaskDefaultModels;
    values[task] = value;
    const time = rawTimes[key];
    times[task] =
      typeof time === 'number' && Number.isFinite(time) && time >= 0
        ? time
        : timestamp(settings.lastEdited);
  }
  return Object.keys(values).length
    ? { taskDefaultModels: values, taskDefaultModelsUpdatedAt: times }
    : {};
}

/** 按任务合并；缺省不是删除，null 是显式取消，相等时间用稳定顺序使双向同步收敛。 */
export function mergeTaskModelSettings(local: Input, remote: Input): TaskModelSettings {
  const a = normalizeTaskModelSettings(local);
  const b = normalizeTaskModelSettings(remote);
  const values = { ...a.taskDefaultModels };
  const times = { ...a.taskDefaultModelsUpdatedAt };
  for (const [key, value] of Object.entries(b.taskDefaultModels ?? {})) {
    const task = key as keyof TaskDefaultModels;
    const localValue = values[task];
    const localTime = times[task] ?? 0;
    const remoteTime = b.taskDefaultModelsUpdatedAt?.[task] ?? 0;
    // 同时发生的取消优先；其它同刻冲突按模型 ID 排序，避免两端互相覆盖。
    if (
      localValue === undefined ||
      remoteTime > localTime ||
      (remoteTime === localTime && (value === null || (localValue !== null && value > localValue)))
    ) {
      values[task] = value;
      times[task] = remoteTime;
    }
  }
  return Object.keys(values).length
    ? { taskDefaultModels: values, taskDefaultModelsUpdatedAt: times }
    : {};
}
