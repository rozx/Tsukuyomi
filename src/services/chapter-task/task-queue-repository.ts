import { getDB } from 'src/utils/indexed-db';
import {
  TASK_QUEUE_META_ID,
  isTaskQueueMetaRecord,
  type TaskQueueItem,
  type TaskQueueMeta,
} from 'src/models/task-queue';

export interface TaskQueueSnapshot {
  items: TaskQueueItem[];
  meta: TaskQueueMeta;
}

export interface TaskQueueMutation<T> {
  put?: TaskQueueItem[];
  remove?: string[];
  meta?: TaskQueueMeta;
  result: T;
}

const DEFAULT_META: TaskQueueMeta = { paused: false };

function toSnapshot(records: Awaited<ReturnType<typeof readAll>>): TaskQueueSnapshot {
  let meta: TaskQueueMeta = { ...DEFAULT_META };
  const items: TaskQueueItem[] = [];
  for (const record of records) {
    if (isTaskQueueMetaRecord(record)) {
      meta = {
        paused: record.paused === true,
        ...(record.pausedReason ? { pausedReason: record.pausedReason } : {}),
      };
    } else {
      items.push(record);
    }
  }
  items.sort((a, b) => a.order - b.order);
  return { items, meta };
}

async function readAll() {
  const db = await getDB();
  return db.getAll('task-queue');
}

/** 读取整个队列（队列项按 order 排序） */
export async function loadTaskQueue(): Promise<TaskQueueSnapshot> {
  return toSnapshot(await readAll());
}

/**
 * 在单个 readwrite 事务内完成「读取 → 计算 → 写入」。
 *
 * IndexedDB 的 readwrite 事务在同一仓库上跨标签页串行执行，因此两个标签页同时入队时
 * 判重与定序不会互相覆盖。`compute` 必须是同步函数——在事务里 await 非 IDB 的 Promise
 * 会让事务提前提交。
 */
export async function mutateTaskQueue<T>(
  compute: (snapshot: TaskQueueSnapshot) => TaskQueueMutation<T>,
): Promise<{ result: T; snapshot: TaskQueueSnapshot }> {
  const db = await getDB();
  const tx = db.transaction('task-queue', 'readwrite');
  const records = await tx.store.getAll();
  const before = toSnapshot(records);
  const mutation = compute(before);
  const writes: Promise<unknown>[] = [];
  for (const id of mutation.remove ?? []) writes.push(tx.store.delete(id));
  for (const item of mutation.put ?? []) writes.push(tx.store.put(item));
  if (mutation.meta) {
    writes.push(tx.store.put({ ...mutation.meta, id: TASK_QUEUE_META_ID }));
  }
  await Promise.all(writes);
  await tx.done;

  const removed = new Set(mutation.remove ?? []);
  const updated = new Map((mutation.put ?? []).map((item) => [item.id, item]));
  const items = before.items
    .filter((item) => !removed.has(item.id) && !updated.has(item.id))
    .concat([...updated.values()])
    .sort((a, b) => a.order - b.order);
  return { result: mutation.result, snapshot: { items, meta: mutation.meta ?? before.meta } };
}
