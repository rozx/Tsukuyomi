import './setup';
import { describe, expect, it } from 'bun:test';
import { getDB } from '../utils/indexed-db';
import { BookService } from '../services/book-service';
import {
  loadChapterContent,
  loadChapterContentsBatch,
  clearCache,
} from '../utils/chapter-content-loader';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { maintainChapterContent } from '../services/chapter-content-maintenance';

describe('多语言持久化入口', () => {
  it('书籍读取与单章、批量懒加载采用相同的简中归一化', async () => {
    const db = await getDB();
    await db.put('books', {
      id: 'old',
      title: 'Book',
      lastEdited: new Date(1000),
      createdAt: new Date(0),
    });
    const content = JSON.stringify([
      {
        id: 'p',
        text: 'A',
        selectedTranslationId: 't',
        translations: [{ id: 't', translation: '甲', aiModelId: 'm' }],
      },
    ]);
    await db.put('chapter-contents', {
      chapterId: 'chapter',
      content,
      lastModified: new Date(1000).toISOString(),
    });
    expect((await BookService.getBookById('old'))?.targetLanguage).toBe('zh-CN');
    expect((await BookService.getAllBooks())[0]?.lastEdited).toEqual(new Date(1000));
    const imported = await ImportLibraryReader.readBook('old');
    expect(imported.kind === 'loaded' && imported.book.targetLanguage).toBe('zh-CN');
    const single = await loadChapterContent('chapter');
    expect(single?.[0]?.translations[0]?.language).toBe('zh-CN');
    clearCache();
    expect((await loadChapterContentsBatch(['chapter'])).get('chapter')).toEqual(single);
    expect((await loadChapterContent('chapter'))?.[0]?.selectedTranslations?.['zh-CN']?.value).toBe(
      't',
    );
    await maintainChapterContent('old', ['chapter']);
    expect(await loadChapterContent('chapter')).toEqual(single);
  });

  it('严格导入读取把语言损坏报告为失败，不会视为不存在或空正文', () => {
    const result = ImportLibraryReader.decodeChapter({
      chapterId: 'bad',
      lastModified: '2026-09-29',
      content: JSON.stringify([
        {
          id: 'p',
          text: 'A',
          selectedTranslationId: 't',
          translations: [{ id: 't', translation: 'A', aiModelId: 'm', language: 'unknown' }],
        },
      ]),
    });
    expect(result.kind).toBe('failed');
  });

  it('旧记录归一化后的无改动保存不制造书籍修订，重复序列化保持一致', async () => {
    const db = await getDB();
    await db.put('books', {
      id: 'old',
      title: 'Book',
      lastEdited: new Date(1000),
      createdAt: new Date(0),
      volumes: [
        {
          id: 'v',
          title: 'V',
          chapters: [{ id: 'c', title: 'C', createdAt: new Date(0), lastEdited: new Date(1000) }],
        },
      ],
    });
    await db.put('chapter-contents', {
      chapterId: 'c',
      lastModified: new Date(1000).toISOString(),
      content: JSON.stringify([
        {
          id: 'p',
          text: 'A',
          selectedTranslationId: 't',
          translations: [{ id: 't', translation: '甲', aiModelId: 'm' }],
        },
      ]),
    });
    const before = await ImportLibraryReader.readBook('old');
    if (before.kind !== 'loaded') throw new Error('missing book');
    const loaded = (await BookService.getBookById('old', true))!;
    await BookService.saveBook(loaded);
    const after = await ImportLibraryReader.readBook('old');
    expect(after.kind === 'loaded' && after.revision).toBe(before.revision);
    expect((await BookService.getBookById('old'))?.lastEdited).toEqual(new Date(1000));
    await BookService.saveBook(loaded);
    expect(await ImportLibraryReader.readBook('old')).toEqual(after);
  });
});

it('未填写译名的旧实体仅补同步元数据，无编辑保存不增加书籍修订', async () => {
  const db = await getDB();
  await db.put('books', {
    id: 'empty-name',
    title: 'Book',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    terminologies: [
      { id: 't', name: 'Term', translation: { id: 'old-empty', translation: '', aiModelId: 'm' } },
    ],
  });
  const loaded = (await BookService.getBookById('empty-name'))!;
  await BookService.saveBook(loaded, { saveChapterContent: false });
  expect((await db.get('book-revisions', 'empty-name'))?.revision ?? 0).toBe(0);
});
