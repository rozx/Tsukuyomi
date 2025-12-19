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

