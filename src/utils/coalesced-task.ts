/**
 * 把一个异步任务包装成「同一时间只跑一轮、运行中的请求合并成一次补跑」。
 *
 * 适合「根据最新数据重算」的场景：运行中收到的请求不会被丢掉，
 * 当前一轮结束后再补跑一次，保证最后一次请求之后的数据一定被处理。
 */
export function createCoalescedTask(task: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let rerun = false;

  const loop = async () => {
    try {
      await task();
    } finally {
      if (rerun) {
        rerun = false;
        running = loop().catch(() => undefined);
      } else {
        running = null;
      }
    }
  };

  return {
    /** 请求运行；运行中时只标记补跑，返回当前这一轮 */
    run(): Promise<void> {
      if (running) {
        rerun = true;
        return running;
      }
      const current = loop();
      running = current.catch(() => undefined);
      return current;
    },
    isRunning: () => running !== null,
    /** 等到没有运行中或待补跑的轮次 */
    async idle(): Promise<void> {
      while (running) await running;
    },
  };
}
