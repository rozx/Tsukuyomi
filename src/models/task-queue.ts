import type { AppLocale } from 'src/models/locale';

/** 进入队列的章节任务类型（与 AIProcessingTask.type 中的章节级任务对应） */
export type TaskQueueKind = 'translation' | 'polish' | 'proofreading';

/** 翻译任务的范围：只翻译未翻译段落 / 全部重新翻译 */
export type TaskQueueTranslationMode = 'continue' | 'retranslate';

/** 入队来源：阅读页手动启动 / 章节列表批量启动 */
export type TaskQueueOrigin = 'manual' | 'batch';

export type TaskQueueItemStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** 队列项等待原因：书籍被导入 / 书籍同步等独占操作占用，或桌面端正在准备更新重启 */
export type TaskQueueWaitingReason = 'book-busy';

export interface TaskQueueItemError {
  code: string;
  message: string;
}

/**
 * 章节任务队列项。
 *
 * 只保存在本设备（IndexedDB `task-queue` 仓库），不参与云同步。
 * `targetParagraphIds` / `completedParagraphIds` 用于中断后从断点继续：
 * 恢复时只处理「快照 − 已完成」中仍存在的段落。
 */
export interface TaskQueueItem {
  id: string;
  bookId: string;
  chapterId: string;
  kind: TaskQueueKind;
  /** 仅 translation 使用 */
  mode?: TaskQueueTranslationMode | undefined;
  origin: TaskQueueOrigin;
  status: TaskQueueItemStatus;
  /** 排队顺序，数值越小越先执行 */
  order: number;
  /** 首次启动时的目标段落快照 */
  targetParagraphIds?: string[] | undefined;
  /** 快照时的书籍目标语言；恢复时若已改变则重新计算目标 */
  targetLanguage?: AppLocale | undefined;
  /** 段落落盘成功后追加 */
  completedParagraphIds: string[];
  /** 期望状态：请求执行者中止该项（非执行者标签页也可写入） */
  cancelRequested?: boolean | undefined;
  /** 每次运行对应的 aiProcessing 记录 ID（按时间顺序） */
  aiTaskIds: string[];
  waitingReason?: TaskQueueWaitingReason | undefined;
  error?: TaskQueueItemError | undefined;
  enqueuedAt: number;
  startedAt?: number | undefined;
  endedAt?: number | undefined;
}

/** 队列暂停原因：用户手动暂停 / 刷新或重启后恢复为暂停 / 全部停止 */
export type TaskQueuePausedReason = 'user' | 'restored';

/** 队列级状态（单例，与队列项存放在同一仓库，用固定 ID 区分） */
export interface TaskQueueMeta {
  paused: boolean;
  pausedReason?: TaskQueuePausedReason | undefined;
}

/** 队列级状态在 `task-queue` 仓库中的固定 ID */
export const TASK_QUEUE_META_ID = '__meta__';

/** 队列级状态在仓库中的记录形态 */
export interface TaskQueueMetaRecord extends TaskQueueMeta {
  id: typeof TASK_QUEUE_META_ID;
}

/** `task-queue` 仓库中的记录：队列项或队列级状态 */
export type TaskQueueRecord = TaskQueueItem | TaskQueueMetaRecord;

/** 区分仓库记录是否为队列级状态 */
export function isTaskQueueMetaRecord(record: TaskQueueRecord): record is TaskQueueMetaRecord {
  return record.id === TASK_QUEUE_META_ID;
}

/** 已结束队列项的保留上限，超过时删除最旧的 */
export const TASK_QUEUE_FINISHED_LIMIT = 200;

/** 「最大同时进行任务」的取值范围与默认值 */
export const TASK_QUEUE_MAX_CONCURRENT_MIN = 1;
export const TASK_QUEUE_MAX_CONCURRENT_MAX = 5;
export const TASK_QUEUE_MAX_CONCURRENT_DEFAULT = 2;

/**
 * 读取「最大同时进行任务」：非数字时用默认值，非整数四舍五入，再钳制到 1–5。
 * 加载本地设置、导入同步设置、读取 getter 时都走这里，保证调度看到的一定是合法值。
 */
export function pickTaskQueueMaxConcurrent(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return TASK_QUEUE_MAX_CONCURRENT_DEFAULT;
  const rounded = Number.isFinite(value) ? Math.round(value) : value;
  return Math.min(TASK_QUEUE_MAX_CONCURRENT_MAX, Math.max(TASK_QUEUE_MAX_CONCURRENT_MIN, rounded));
}

/** 是否为仍需执行的状态 */
export function isTaskQueueItemPending(status: TaskQueueItemStatus): boolean {
  return status === 'queued' || status === 'running';
}
