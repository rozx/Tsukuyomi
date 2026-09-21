import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { ImportLibraryService } from '../services/import/import-library-service';
import { ImportRepository } from '../services/import/import-repository';
import { BookService } from '../services/book-service';
import { getDB } from '../utils/indexed-db';
import { useBooksStore } from '../stores/books';

describe('导入书库只读对照', () => {
  it('同名不同作者返回歧义及依据，不默认选择目标，也不暴露书籍模型配置', async () => {
    const task = await ImportRepository.createTask();
    const now = new Date();
    await BookService.bulkSaveBooks(
      ['甲', '乙'].map((author, index) => ({
        id: `b${index}`,
        title: '同名小说',
        author,
        description: '简介',
        createdAt: now,
        lastEdited: now,
      })),
    );
    const db = await getDB();
    const first = (await db.get('books', 'b0'))!;
    await db.put('books', { ...first, privateField: '不能发给模型' } as typeof first);
    const before = await db.getAll('book-revisions');
    const result = await ImportLibraryService.search(task.id, { query: '同名小说' });
    expect(result.ambiguous).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.reasons.includes('书名匹配'))).toBe(true);
    expect(
      (await ImportLibraryService.search(task.id, { query: '', author: '甲' })).items.map(
        (item) => item.id,
      ),
    ).toEqual(['b0']);
    expect(JSON.stringify(result)).not.toContain('不能发给模型');
    expect((await ImportRepository.getTask(task.id))!.draft.target).toEqual({ kind: 'new' });
    expect(await db.getAll('book-revisions')).toEqual(before);
  });

  it('章节与正文读取绑定显式小说，切换全局书籍不改变目标，失败不是空正文', async () => {
    const task = await ImportRepository.createTask();
    const now = new Date();
    await BookService.saveBook({
      id: 'book',
      title: '书',
      createdAt: now,
      lastEdited: now,
      volumes: [
        {
          id: 'v',
          title: '卷',
          chapters: [
            {
              id: 'good',
              title: '好章',
              createdAt: now,
              lastEdited: now,
              content: [{ id: 'p', text: '正文', translations: [], selectedTranslationId: '' }],
            },
            { id: 'bad', title: '坏章', createdAt: now, lastEdited: now },
          ],
        },
      ],
    });
    const db = await getDB();
    await db.put('chapter-contents', { chapterId: 'bad', content: '{bad', lastModified: 'time' });
    useBooksStore().books = [{ id: 'other', title: '其他书', createdAt: now, lastEdited: now }];
    const chapters = await ImportLibraryService.chapters(task.id, 'book');
    expect(chapters.items.map((item) => item.id)).toEqual(['good', 'bad']);
    const good = await ImportLibraryService.chapter(task.id, 'book', 'good', {
      offset: 0,
      limit: 1,
    });
    expect(good.status).toBe('loaded');
    expect(good.paragraphs[0]?.text).toBe('正文');
    expect(good.bookRevision).toBe(1);
    const bad = await ImportLibraryService.chapter(task.id, 'book', 'bad');
    expect(bad.status).toBe('failed');
    expect(bad.error).toBeTruthy();
    await expect(ImportLibraryService.chapter(task.id, 'other', 'good')).rejects.toThrow();
    expect((await ImportLibraryService.book(task.id, 'book')).title).toBe('书');
  });
});
