import { describe, expect, it } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { useBooksStore } from '../stores/books';
import { getDB } from '../utils/indexed-db';
import { book } from './import-fixtures';
import { setCacheEntry } from '../utils/chapter-content-loader';

describe('执行前刷新已提交书籍', () => {
  it('读取当前正文而非旧缓存，只更新 UI 状态不再保存书库', async () => {
    const original = book();
    await BookService.saveBook(original);
    const store = useBooksStore();
    store.books = [original];
    const updated = book();
    updated.title = '已导入的新标题';
    updated.volumes![0]!.chapters![0]!.content![0]!.text = '已导入的新原文';
    await BookService.saveBook(updated);
    setCacheEntry('old-c', {
      parsed: original.volumes![0]!.chapters![0]!.content!,
      serialized: JSON.stringify(original.volumes![0]!.chapters![0]!.content),
    });
    const db = await getDB();
    const before = await db.get('book-revisions', 'book');
    const fresh = await store.refreshBookFromStorage('book', 'old-c');
    expect(fresh?.title).toBe('已导入的新标题');
    expect(fresh?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.text).toBe('已导入的新原文');
    expect(fresh?.volumes?.[0]?.chapters?.[1]?.content).toBeUndefined();
    expect(store.getBookById('book')?.title).toBe('已导入的新标题');
    expect(await db.get('book-revisions', 'book')).toEqual(before);
  });

  it('正文读取失败不把 UI 替换成空书；目标删除后移除旧 UI 副本', async () => {
    await BookService.saveBook(book());
    const store = useBooksStore();
    store.books = [book()];
    const db = await getDB();
    await db.put('chapter-contents', {
      chapterId: 'old-c',
      content: '{broken',
      lastModified: 'time',
    });
    await expect(store.refreshBookFromStorage('book', 'old-c')).rejects.toThrow('BOOK_READ_FAILED');
    expect(store.books[0]?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.text).toBe('原文甲');
    await BookService.deleteBook('book');
    expect(await store.refreshBookFromStorage('book', 'old-c')).toBeUndefined();
    expect(store.books).toEqual([]);
  });
});
