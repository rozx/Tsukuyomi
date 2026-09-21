export interface BookCommitNotice {
  bookId: string;
  revision: number;
  chapterIds: string[];
}
type Listener = (notice: BookCommitNotice) => Promise<void>;

function validNotice(value: unknown): value is BookCommitNotice {
  if (!value || typeof value !== 'object') return false;
  const notice = value as Partial<BookCommitNotice>;
  return (
    typeof notice.bookId === 'string' &&
    Boolean(notice.bookId) &&
    typeof notice.revision === 'number' &&
    Number.isSafeInteger(notice.revision) &&
    notice.revision >= 0 &&
    Array.isArray(notice.chapterIds) &&
    notice.chapterIds.every((id) => typeof id === 'string')
  );
}

/** 通知不携带小说数据；接收方必须从当前数据库重新读取。 */
export class BookCommitBus {
  private readonly listeners = new Set<Listener>();
  private channel: BroadcastChannel | undefined;

  private open(): BroadcastChannel | undefined {
    try {
      return typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('tsukuyomi:book-commit');
    } catch {
      return undefined;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.channel) {
      this.channel = this.open();
      if (this.channel)
        this.channel.onmessage = (event: MessageEvent<unknown>) => {
          if (validNotice(event.data))
            void this.deliver(event.data).catch((error: unknown) =>
              console.warn('书库通知刷新失败:', error),
            );
        };
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.channel?.close();
        this.channel = undefined;
      }
    };
  }

  private async deliver(notice: BookCommitNotice): Promise<void> {
    const results = await Promise.allSettled(
      [...this.listeners].map((listener) => listener(notice)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  async publish(notice: BookCommitNotice): Promise<void> {
    if (!validNotice(notice)) throw new Error('INVALID_NOTICE: 书库通知身份无效');
    const channel = this.channel ?? this.open();
    try {
      channel?.postMessage(notice);
    } finally {
      if (channel !== this.channel) channel?.close();
    }
    await this.deliver(notice);
  }
}

export const bookCommitBus = new BookCommitBus();
