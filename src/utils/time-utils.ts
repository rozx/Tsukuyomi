/**
 * 时间工具函数
 */

/**
 * 检查两个时间之间的差异是否超过阈值
 * @param localTime 本地时间（Date、时间戳或字符串）
 * @param remoteTime 远程时间（Date、时间戳或字符串）
 * @param thresholdMs 阈值（毫秒），默认 1000
 * @returns 如果时间差异超过阈值，返回 true
 */
export function isTimeDifferent(
  localTime: Date | number | string,
  remoteTime: Date | number | string,
  thresholdMs = 1000,
): boolean {
  const local = typeof localTime === 'string'
    ? new Date(localTime).getTime()
    : typeof localTime === 'number'
      ? localTime
      : localTime.getTime();
  const remote = typeof remoteTime === 'string'
    ? new Date(remoteTime).getTime()
    : typeof remoteTime === 'number'
      ? remoteTime
      : remoteTime.getTime();
  return Math.abs(local - remote) > thresholdMs;
}

/**
 * 检查本地项目是否是在上次同步后新添加的
 * @param lastEdited 最后编辑时间
 * @param lastSyncTime 上次同步时间（毫秒时间戳）
 * @returns 如果是在上次同步后添加的，返回 true
 *          如果是首次同步（lastSyncTime <= 0），返回 true（所有项目都应该同步）
 */
export function isNewlyAdded(
  lastEdited: Date | number | string,
  lastSyncTime: number,
): boolean {
  // 首次同步时，所有项目都应该被视为"新添加"的，需要同步
  if (lastSyncTime <= 0) return true;
  const editedTime = typeof lastEdited === 'string'
    ? new Date(lastEdited).getTime()
    : typeof lastEdited === 'number'
      ? lastEdited
      : lastEdited.getTime();
  return editedTime > lastSyncTime;
}

/**
 * 格式化 AI 任务的持续时间为"X秒" / "Y分Z秒"的中文显示
 *
 * @param startMs - 任务开始的毫秒时间戳（task.startTime）
 * @param endMs  - 任务结束的毫秒时间戳（task.endTime）。未定义表示任务仍在进行
 * @param nowMs  - "现在"的毫秒值。未提供时回退到 Date.now()。
 *                 对需要"活动任务每秒滴答刷新"的组件（如 TranslationProgress、
 *                 ThinkingProcessPanel），应传入响应式的 now.value —— Vue 模板
 *                 在其变化时会重新渲染表达式，从而驱动计时器走动。
 *
 * 合并了原本散落在 TranslationProgress / ThinkingProcessPanel / ThinkingDetailDialog
 * 三个组件的重复实现。
 */
export function formatTaskDuration(
  startMs: number,
  endMs?: number,
  nowMs?: number,
): string {
  const end = endMs ?? nowMs ?? Date.now();
  const duration = Math.floor((end - startMs) / 1000);
  if (duration < 60) return `${duration}秒`;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
}

