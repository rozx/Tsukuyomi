interface TransactionCompletion {
  done: Promise<void>;
  abort(): void;
}

/** 回调内仅等待此事务的数据库请求；任何失败都回滚并消费事务的最终拒绝。 */
export async function completeIdbTransaction<T>(
  tx: TransactionCompletion,
  work: () => Promise<T>,
): Promise<T> {
  const completion = tx.done.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  try {
    const result = await work();
    const outcome = await completion;
    if (!outcome.ok) throw outcome.error;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* 请求可能已使事务中止。 */
    }
    await completion;
    throw error;
  }
}
