import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { getDB } from 'src/utils/indexed-db';
import { bookCommitBus } from 'src/services/book-commit-notifications';
import type { BookCommitBus } from 'src/services/book-commit-notifications';

/** 应用宿主只注册一次；任何通知（含迟到通知）都读取当前版本。 */
export function startBookCommitNotifications(bus: BookCommitBus = bookCommitBus) {
  const books = useBooksStore();
  const context = useContextStore();
  let disposed = false;
  const pending = new Map<string, Promise<void>>();
  const refresh = async (bookId: string): Promise<void> => {
    if (disposed || !books.isLoaded) return;
    const previous = pending.get(bookId);
    const work = (async () => {
      await previous?.catch(() => undefined);
      if (disposed) return;
      const selected = context.currentBookId === bookId ? context.currentChapterId : undefined;
      await books.refreshBookFromStorage(bookId, selected ?? undefined);
    })();
    pending.set(bookId, work);
    try {
      await work;
    } finally {
      if (pending.get(bookId) === work) pending.delete(bookId);
    }
  };
  const unsubscribe = bus.subscribe((notice) => refresh(notice.bookId));
  const reconcile = async (): Promise<void> => {
    if (disposed || !books.isLoaded) return;
    const db = await getDB();
    const revisions = new Map(
      (await db.getAll('book-revisions')).map((entry) => [entry.bookId, entry.revision]),
    );
    const ids = new Set([...(await db.getAllKeys('books')), ...books.books.map((book) => book.id)]);
    for (const id of ids)
      if (books.storageRevisions[id] !== (revisions.get(id) ?? 0)) await refresh(id);
  };
  const onFocus = () => {
    void reconcile().catch((error: unknown) => console.warn('重新读取书库失败:', error));
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') onFocus();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  return {
    reconcile,
    dispose() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
