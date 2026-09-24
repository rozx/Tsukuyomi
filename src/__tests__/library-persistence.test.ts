import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { FullTextIndexService } from '../services/full-text-index-service';
import * as debouncer from '../utils/chapter-embedding-debouncer';
import { getDB } from '../utils/indexed-db';
import { peekCacheEntry, setCacheEntry } from '../utils/chapter-content-loader';
import type { Novel, Paragraph } from '../models/novel';

const time = new Date('2026-01-01T00:00:00Z');
function paragraph(text = '原文'): Paragraph {
  return { id: 'p1', text, translations: [], selectedTranslationId: '' };
}
function book(id = 'b1'): Novel {
  return {
    id,
    title: '小说',
    createdAt: time,
    lastEdited: time,
    volumes: [
      {
        id: `${id}-v1`,
        title: '卷一',
        chapters: [
          {
            id: `${id}-c1`,
            title: '第一章',
            createdAt: time,
            lastEdited: time,
            content: [paragraph()],
          },
        ],
      },
    ],
  };
}
async function revision(id = 'b1') {
  return (await (await getDB()).get('book-revisions', id))?.revision ?? 0;
}
async function content(id = 'b1-c1') {
  return (await (await getDB()).get('chapter-contents', id))?.content;
}

let indexUpdateSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  ChapterContentService.clearAllCache();
  spyOn(debouncer, 'markChapterDirty').mockImplementation(() => undefined);
  indexUpdateSpy = spyOn(FullTextIndexService, 'updateIndexForChapter').mockResolvedValue(
    undefined,
  );
  spyOn(FullTextIndexService, 'invalidateIndex').mockResolvedValue(undefined);
});
afterEach(() => mock.restore());

describe('书库原子保存与语义修改序号', () => {
  it('元信息保存保留旧版内嵌正文，纯存储迁移不增加语义序号', async () => {
    const original = book();
    const db = await getDB();
    await db.put('books', original);
    await db.put('book-revisions', { bookId: original.id, revision: 5 });
    await BookService.saveBook(original, { saveChapterContent: false });
    expect(await content()).toBe(JSON.stringify(original.volumes![0]!.chapters![0]!.content));
    expect(await revision()).toBe(5);
    expect(
      (await db.get('books', original.id))?.volumes?.[0]?.chapters?.[0]?.content,
    ).toBeUndefined();
    await BookService.saveBook({ ...original, title: '只改标题' }, { saveChapterContent: false });
    expect(await revision()).toBe(6);
    expect(await content()).toContain('原文');
  });

  it('正常保存旧版内嵌正文的相同值也不误判为正文修订', async () => {
    const original = book();
    const db = await getDB();
    await db.put('books', original);
    await BookService.saveBook(original);
    expect(await revision()).toBe(0);
    expect(await content()).toContain('原文');
  });
  it('完整保存只递增一次，无变化或仅懒加载标记变化不递增，改后改回仍递增', async () => {
    const original = book();
    await BookService.saveBook(original);
    expect(await revision()).toBe(1);
    await BookService.saveBook(original);
    expect(await revision()).toBe(1);
    const metadata = (await BookService.getBookById(original.id))!;
    await BookService.saveBook(metadata, { saveChapterContent: false });
    expect(await revision()).toBe(1);
    await BookService.saveBook({ ...original, title: '改名' });
    expect(await revision()).toBe(2);
    await BookService.saveBook(original);
    expect(await revision()).toBe(3);
  });

  it('写书籍失败时正文、序号和缓存都回滚，不提前触发索引与嵌入', async () => {
    const original = book();
    await BookService.saveBook(original);
    const before = await content();
    const beforeRevision = await revision();
    const beforeCache = peekCacheEntry('b1-c1');
    vi.clearAllMocks();
    const changed = book();
    changed.title = '应回滚';
    changed.volumes![0]!.chapters![0]!.content = [paragraph('应回滚的正文')];
    Object.assign(changed, { cannotClone: () => undefined });
    await expect(BookService.saveBook(changed)).rejects.toThrow();
    expect(await content()).toBe(before);
    expect(await revision()).toBe(beforeRevision);
    expect(peekCacheEntry('b1-c1')).toEqual(beforeCache);
    expect((await BookService.getBookById('b1'))?.title).toBe('小说');
    expect(debouncer.markChapterDirty).not.toHaveBeenCalled();
    expect(indexUpdateSpy).not.toHaveBeenCalled();
  });

  it('批量保存任一本失败时所有小说、正文和序号一同回滚', async () => {
    const valid = book('valid');
    const invalid = book('invalid');
    Object.assign(invalid, { cannotClone: () => undefined });
    await expect(BookService.bulkSaveBooks([valid, invalid])).rejects.toThrow();
    expect(await BookService.getAllBooks()).toEqual([]);
    expect(await content('valid-c1')).toBeUndefined();
    expect(await content('invalid-c1')).toBeUndefined();
    expect(await revision('valid')).toBe(0);
    expect(await revision('invalid')).toBe(0);
  });

  it('独立正文保存读取当前数据库，无变化不递增，新译文和删除会递增', async () => {
    await BookService.saveBook(book());
    const translated = {
      ...paragraph(),
      translations: [{ id: 't', translation: '译文', aiModelId: 'm' }],
      selectedTranslationId: 't',
    };
    await ChapterContentService.saveChapterContent('b1-c1', [translated], { bookId: 'b1' });
    expect(await revision()).toBe(2);
    await ChapterContentService.saveChapterContent('b1-c1', [translated], { bookId: 'b1' });
    expect(await revision()).toBe(2);
    await ChapterContentService.deleteChapterContent('b1-c1', { bookId: 'b1' });
    expect(await revision()).toBe(3);
    await ChapterContentService.deleteChapterContent('b1-c1', { bookId: 'b1' });
    expect(await revision()).toBe(3);
  });

  it('缓存显示未变也不能跳过真实数据库变更；序号写失败不能改变正文缓存', async () => {
    const old = [paragraph()];
    const changed = [paragraph('缓存不同于数据库')];
    await BookService.saveBook(book());
    setCacheEntry('b1-c1', { parsed: changed, serialized: JSON.stringify(changed) });
    expect(
      await ChapterContentService.saveChapterContent('b1-c1', changed, {
        bookId: 'b1',
        skipIfUnchanged: true,
      }),
    ).toBe(true);
    expect(await content()).toBe(JSON.stringify(changed));
    expect(await revision()).toBe(2);
    const db = await getDB();
    await db.put('book-revisions', { bookId: 'b1', revision: Number.MAX_SAFE_INTEGER });
    await expect(
      ChapterContentService.saveChapterContent('b1-c1', old, { bookId: 'b1' }),
    ).rejects.toThrow('REVISION_OVERFLOW');
    expect(await content()).toBe(JSON.stringify(changed));
    expect(peekCacheEntry('b1-c1')?.parsed).toEqual(changed);
  });

  it('批量删除正文只递增一次，失败时缓存和索引保持原状', async () => {
    await BookService.saveBook(book());
    await ChapterContentService.saveChapterContent('b1-c2', [paragraph('第二章')], {
      bookId: 'b1',
    });
    const before = await revision();
    await ChapterContentService.bulkDeleteChapterContent(['b1-c1', 'b1-c2'], { bookId: 'b1' });
    expect(await revision()).toBe(before + 1);
    expect(await content()).toBeUndefined();
    expect(await content('b1-c2')).toBeUndefined();
  });

  it('删除小说保留修改序号，恢复同 ID 不复用旧序号，清书库不回退序号', async () => {
    const original = book();
    await BookService.saveBook(original);
    await BookService.deleteBook(original.id);
    expect(await revision()).toBe(2);
    expect(await content()).toBeUndefined();
    await BookService.saveBook(original);
    expect(await revision()).toBe(3);
    await BookService.saveBook(book('b2'));
    await BookService.clearBooks();
    expect(await revision()).toBe(4);
    expect(await revision('b2')).toBe(2);
    expect(await BookService.getAllBooks()).toEqual([]);
    expect(await content()).toBeUndefined();
  });

  it('全清正文对旧记录按书籍结构找归属，新记录使用保存的所属书籍', async () => {
    await BookService.saveBook(book());
    const db = await getDB();
    await db.put('chapter-contents', {
      chapterId: 'b1-c1',
      content: JSON.stringify([paragraph()]),
      lastModified: time.toISOString(),
    });
    await ChapterContentService.saveChapterContent('orphan', [paragraph()], { bookId: 'b2' });
    const before1 = await revision();
    const before2 = await revision('b2');
    await ChapterContentService.clearAllChapterContent();
    expect(await revision()).toBe(before1 + 1);
    expect(await revision('b2')).toBe(before2 + 1);
  });
});
