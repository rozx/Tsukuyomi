import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { getDB } from '../utils/indexed-db';
import {
  setCacheEntry,
  setCacheMiss,
  clearCache,
  loadChapterContent,
} from '../utils/chapter-content-loader';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import type { Paragraph } from '../models/novel';

const paragraph: Paragraph = {
  id: 'p',
  text: '原文',
  translations: [{ id: 't', translation: '译文', aiModelId: 'm' }],
  selectedTranslationId: 't',
};

afterEach(() => {
  mock.restore();
  clearCache();
});

describe('导入严格书库读取', () => {
  it('旧版内嵌正文可读取，仍保留独立正文记录不存在的事实', async () => {
    const db = await getDB();
    const now = new Date();
    await db.put('books', {
      id: 'legacy',
      title: '旧书',
      createdAt: now,
      lastEdited: now,
      volumes: [
        {
          id: 'v',
          title: '卷',
          chapters: [
            { id: 'inline', title: '章', createdAt: now, lastEdited: now, content: [paragraph] },
          ],
        },
      ],
    });
    const result = await ImportLibraryReader.readBook('legacy');
    expect(
      result.kind === 'loaded' &&
        result.chapters.inline?.kind === 'loaded' &&
        result.chapters.inline.content,
    ).toEqual([paragraph]);
    expect(
      result.kind === 'loaded' &&
        result.chapters.inline?.kind === 'loaded' &&
        result.chapters.inline.record,
    ).toBeUndefined();
    expect(await db.get('chapter-contents', 'inline')).toBeUndefined();
    await db.put('chapter-contents', {
      chapterId: 'inline',
      content: '{broken',
      lastModified: 'time',
    });
    const failed = await ImportLibraryReader.readBook('legacy');
    expect(failed.kind === 'loaded' && failed.chapters.inline?.kind).toBe('failed');
  });
  it('没有记录才是 absent，合法空数组是 loaded，损坏数据是 failed', async () => {
    const db = await getDB();
    expect(await ImportLibraryReader.readChapter('absent')).toEqual({ kind: 'absent' });
    await db.put('chapter-contents', { chapterId: 'empty', content: '[]', lastModified: 'time' });
    expect((await ImportLibraryReader.readChapter('empty')).kind).toBe('loaded');
    for (const content of [
      '',
      '{broken',
      '{}',
      '[null]',
      '[{"id":"p","text":"x"}]',
      '[{"id":"p","text":"x","translations":[{}],"selectedTranslationId":""}]',
    ]) {
      await db.put('chapter-contents', { chapterId: 'bad', content, lastModified: 'time' });
      expect((await ImportLibraryReader.readChapter('bad')).kind).toBe('failed');
    }
  });

  it('绕过正负缓存；失败不写否定缓存，重试可看到真实数据', async () => {
    const db = await getDB();
    const content = JSON.stringify([paragraph]);
    await db.put('chapter-contents', { chapterId: 'c', content, lastModified: 'time' });
    setCacheMiss('c');
    const loaded = await ImportLibraryReader.readChapter('c');
    expect(loaded.kind === 'loaded' && loaded.content).toEqual([paragraph]);
    const old = [{ ...paragraph, text: '旧缓存' }];
    setCacheEntry('c', { parsed: old, serialized: JSON.stringify(old) });
    expect(await loadChapterContent('c')).toEqual(old);
    const fresh = await ImportLibraryReader.readChapter('c');
    expect(fresh.kind === 'loaded' && fresh.content).toEqual([paragraph]);
    const failing = spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    expect((await ImportLibraryReader.readChapter('c')).kind).toBe('failed');
    failing.mockRestore();
    expect((await ImportLibraryReader.readChapter('c')).kind).toBe('loaded');
    // 严格读入口不改变原 loader 的调用行为或缓存。
    expect(await loadChapterContent('c')).toEqual(old);
  });

  it('小说、修改序号和各章读取状态来自同一只读事务，不把错误章节装成空内容', async () => {
    const db = await getDB();
    const time = new Date('2026-01-01T00:00:00Z');
    await db.put('books', {
      id: 'b',
      title: '测试',
      createdAt: time,
      lastEdited: time,
      volumes: [
        {
          id: 'v',
          title: '卷',
          chapters: ['good', 'bad', 'absent'].map((id) => ({
            id,
            title: id,
            createdAt: time,
            lastEdited: time,
          })),
        },
      ],
    });
    await db.put('chapter-contents', {
      chapterId: 'good',
      content: JSON.stringify([paragraph]),
      lastModified: 'time',
    });
    await db.put('chapter-contents', { chapterId: 'bad', content: '{bad', lastModified: 'time' });
    await db.put('book-revisions', { bookId: 'b', revision: 7 });
    const transactions = spyOn(db, 'transaction');
    const result = await ImportLibraryReader.readBook('b');
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') throw new Error('未读取小说');
    expect(result.revision).toBe(7);
    expect(result.chapters.good?.kind).toBe('loaded');
    expect(result.chapters.bad?.kind).toBe('failed');
    expect(result.chapters.absent?.kind).toBe('absent');
    expect(result.book.volumes?.[0]?.chapters?.[1]?.content).toBeUndefined();
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(transactions.mock.calls[0]?.[0]).toEqual([
      'books',
      'chapter-contents',
      'book-revisions',
    ]);
  });

  it('旧小说没有修改序号时为 0，损坏书籍或数据库失败不当作不存在', async () => {
    const db = await getDB();
    await db.put('books', {
      id: 'b',
      title: '旧书',
      createdAt: new Date(),
      lastEdited: new Date(),
    });
    const result = await ImportLibraryReader.readBook('b');
    expect(result.kind === 'loaded' && result.revision).toBe(0);
    expect(await ImportLibraryReader.readBook('missing')).toEqual({ kind: 'absent' });
    spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    expect((await ImportLibraryReader.readBook('b')).kind).toBe('failed');
  });
});
