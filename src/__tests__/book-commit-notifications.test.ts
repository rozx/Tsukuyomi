import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { BookCommitBus } from '../services/book-commit-notifications';
import { startBookCommitNotifications } from '../composables/useBookCommitNotifications';
import { useBooksStore } from '../stores/books';
import { useContextStore } from '../stores/context';
import { BookService } from '../services/book-service';
import { getDB } from '../utils/indexed-db';
import { book } from './import-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('导入提交后的书库通知', () => {
  it('当前宿主等待本地刷新，其他宿主收到只含身份和序号的通知', async () => {
    const channels = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        constructor() {
          channels.add(this);
        }
        postMessage(data: unknown) {
          for (const channel of channels)
            if (channel !== this) channel.onmessage?.({ data } as MessageEvent);
        }
        close() {
          channels.delete(this);
        }
      },
    );
    const one = new BookCommitBus();
    const two = new BookCommitBus();
    const local = vi.fn(() => Promise.resolve());
    const remote = vi.fn(() => Promise.resolve());
    const off1 = one.subscribe(local);
    const off2 = two.subscribe(remote);
    const change = { bookId: 'book', revision: 2, chapterIds: ['chapter'] };
    await one.publish(change);
    expect(local).toHaveBeenCalledWith(change);
    expect(remote).toHaveBeenCalledWith(change);
    off1();
    off2();
    expect(channels.size).toBe(0);
  });

  it('迟到通知读取当前数据库，不恢复旧正文；缺少 BroadcastChannel 时聚焦补查', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const original = book();
    await BookService.saveBook(original);
    const store = useBooksStore();
    store.books = [original];
    store.isLoaded = true;
    const context = useContextStore();
    context.setCurrentBook('book');
    context.setCurrentChapter('old-c');
    const bus = new BookCommitBus();
    const listener = startBookCommitNotifications(bus);
    try {
      const changed = book();
      changed.volumes![0]!.chapters![0]!.content![0]!.text = '最新原文';
      await BookService.saveBook(changed);
      await bus.publish({ bookId: 'book', revision: 1, chapterIds: ['old-c'] });
      expect(store.getBookById('book')?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.text).toBe(
        '最新原文',
      );
      const revision = await (await getDB()).get('book-revisions', 'book');
      const changedAgain = book();
      changedAgain.title = '通知丢失后的标题';
      await BookService.saveBook(changedAgain);
      await listener.reconcile();
      expect(store.getBookById('book')?.title).toBe('通知丢失后的标题');
      expect((await (await getDB()).get('book-revisions', 'book'))?.revision).toBe(
        revision!.revision + 1,
      );
    } finally {
      listener.dispose();
    }
  });
});
