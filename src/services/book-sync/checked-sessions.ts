import type { BookSyncService } from './book-sync-service';

type Session = Awaited<ReturnType<typeof BookSyncService.openSession>>;

/** 交接有效期：超过后目录可能已变化，更新页重新检查 */
const TTL_MS = 10 * 60_000;

const entries = new Map<
  string,
  { session: Session; at: number; expiry: ReturnType<typeof setTimeout> }
>();

function remove(bookId: string): { session: Session; at: number } | undefined {
  const entry = entries.get(bookId);
  if (!entry) return undefined;
  clearTimeout(entry.expiry);
  entries.delete(bookId);
  return entry;
}

/**
 * 书架快速检查完成后的会话交接：进入该书的检查更新页时直接复用，不再重复回放目录。
 *
 * 只交接一次（取出即失效）。复用是安全的：会话应用前会校验书籍版本，书籍在此期间被修改时
 * 由更新页按 BOOK_CHANGED 重算并要求再次确认。
 */
export const CheckedSessions = {
  put(bookId: string, session: Session): void {
    remove(bookId);
    // 会话持有书籍快照与完整目录：到期主动释放，不等下一次放入或取出
    const expiry = setTimeout(() => remove(bookId), TTL_MS);
    entries.set(bookId, { session, at: Date.now(), expiry });
  },

  take(bookId: string): Session | undefined {
    const entry = remove(bookId);
    return entry && Date.now() - entry.at < TTL_MS ? entry.session : undefined;
  },

  drop(bookId: string): void {
    remove(bookId);
  },
};
