/**
 * 任务队列的跨标签页协调：
 * - 执行者选举：只有持有 Web Lock 的标签页执行队列
 * - 广播：队列变化与章节写入通知其他标签页
 */

const TASK_QUEUE_RUNNER_LOCK = 'tsukuyomi:task-queue-runner';
const TASK_QUEUE_CHANNEL = 'tsukuyomi:task-queue';

/**
 * restore：启动时立即拿到锁，说明没有存活的执行者（刷新、重开或重启后）
 * takeover：等待后被授予锁，说明原执行者标签页刚离开，应用仍开着
 * standalone：环境不支持 Web Locks，当前标签页直接执行
 */
export type ExecutorAcquireMode = 'restore' | 'takeover' | 'standalone';

/**
 * 竞选执行者。拿到锁后调用 onAcquire，并一直持有到 release() 被调用（或标签页关闭）。
 * 返回 release 函数。
 */
export function electTaskQueueExecutor(
  handlers: {
    onAcquire: (mode: ExecutorAcquireMode) => void;
    /** 已有存活的执行者，本标签页进入等待（只显示队列） */
    onWaiting?: () => void;
  },
  locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks,
): () => void {
  const { onAcquire, onWaiting } = handlers;
  let releaseHold: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let released = false;
  const release = () => {
    released = true;
    releaseHold();
  };

  if (!locks) {
    onAcquire('standalone');
    return release;
  }

  const run = async () => {
    // 先立即尝试：拿到说明没有存活的执行者
    const acquired = (await locks.request(
      TASK_QUEUE_RUNNER_LOCK,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return false;
        if (!released) onAcquire('restore');
        await hold;
        return true;
      },
    )) as unknown as boolean;
    if (acquired || released) return;
    onWaiting?.();
    // 拿不到则排队等待；被授予时说明原执行者已离开
    await locks.request(TASK_QUEUE_RUNNER_LOCK, async () => {
      if (released) return;
      onAcquire('takeover');
      await hold;
    });
  };
  run().catch((error: unknown) => {
    console.error('[task-queue] 执行者选举失败，当前标签页直接执行队列:', error);
    if (!released) onAcquire('standalone');
  });
  return release;
}

export type TaskQueueBroadcast =
  | { type: 'changed' }
  | { type: 'chapterWrite'; bookId: string; chapterId: string; at: number };

/** 打开广播通道；环境不支持时返回空实现 */
export function openTaskQueueChannel(onMessage: (message: TaskQueueBroadcast) => void): {
  post: (message: TaskQueueBroadcast) => void;
  close: () => void;
} {
  if (typeof BroadcastChannel === 'undefined') return { post: () => {}, close: () => {} };
  const channel = new BroadcastChannel(TASK_QUEUE_CHANNEL);
  channel.onmessage = (event: MessageEvent<TaskQueueBroadcast>) => {
    if (event.data && typeof event.data === 'object') onMessage(event.data);
  };
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
