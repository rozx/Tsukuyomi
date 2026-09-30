import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { FullTextIndexService } from '../services/full-text-index-service';
import { getDB } from '../utils/indexed-db';
import { setNameTranslation } from '../services/localization/selection';
import * as contentHash from '../utils/content-hash';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const chapter = translationChapter('c', '11111111');
  chapter.title = setNameTranslation(
    {
      original: 'Original title',
      translation: { id: 'cn-title', translation: 'CN_TITLE_SECRET', aiModelId: '' },
    },
    'en-US',
    { id: 'en-title', translation: 'English title', aiModelId: '' },
    { counter: 2, actorId: 'a' },
    0,
  );
  const paragraph = chapter.content![0]!;
  paragraph.translations = [
    { id: 'cn', language: 'zh-CN', translation: 'CN_BODY_SECRET', aiModelId: '' },
    { id: 'en', language: 'en-US', translation: 'English selected', aiModelId: '' },
    { id: 'old-en', language: 'en-US', translation: 'English unselected', aiModelId: '' },
  ];
  paragraph.selectedTranslationId = 'cn';
  paragraph.selectedTranslations = {
    'en-US': { value: 'en', revision: { counter: 2, actorId: 'a' }, updatedAt: 0 },
  };
  return chapterTranslationFixture([chapter]);
}
describe('全文索引语言归属与过时提交', () => {
  it('旧持久索引加载晚返回不会覆盖新内存索引', async () => {
    const { books } = await fixture();
    const book = books.getBookById('fixture-book')!;
    await FullTextIndexService.buildIndex(book.id, book);
    const db = await getDB();
    const stored = (await db.get('full-text-indexes', book.id))!;
    await FullTextIndexService.invalidateIndex(book.id);
    await db.put('full-text-indexes', stored);
    const original = contentHash.hashString;
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    vi.spyOn(contentHash, 'hashString').mockImplementation(async (value) => {
      if (++calls === 1) {
        entered.resolve();
        await release.promise;
      }
      return original(value);
    });
    const pending = FullTextIndexService.loadIndex(book.id, book);
    await entered.promise;
    await books.updateBook(book.id, { targetLanguage: 'zh-TW' });
    await FullTextIndexService.buildIndex(book.id, books.getBookById(book.id)!);
    release.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'FULL_TEXT_INDEX_CHANGED' });
    const current = await FullTextIndexService.loadIndex(book.id, books.getBookById(book.id)!);
    expect(current).not.toBeNull();
  });

  it('持久索引带语言标记，缺省搜索使用书籍目标且仅匹配目标选用', async () => {
    const { books } = await fixture();
    const book = books.getBookById('fixture-book')!;
    await FullTextIndexService.buildIndex(book.id, book);
    const stored = (await (await getDB()).get('full-text-indexes', book.id))!;
    const documents = JSON.parse(stored.indexData);
    expect(stored.schemaVersion).toBe(2);
    expect(stored.inputSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(documents[0].translationsByLanguage['en-US']).toEqual(['English selected']);
    expect(documents[0].chapterTitlesByLanguage['en-US']).toBe('English title');
    const options = { novel: book, searchInOriginal: false };
    expect(await FullTextIndexService.search(book.id, ['CN_BODY_SECRET'], options)).toEqual([]);
    expect(await FullTextIndexService.search(book.id, ['English unselected'], options)).toEqual([]);
    expect(await FullTextIndexService.search(book.id, ['English selected'], options)).toHaveLength(
      1,
    );
  });
  it('旧未标语言索引不会被当作当前索引复用', async () => {
    const { books } = await fixture();
    const db = await getDB();
    await FullTextIndexService.invalidateIndex('fixture-book');
    await db.put('full-text-indexes', {
      bookId: 'fixture-book',
      indexData: JSON.stringify([
        {
          paragraphId: '11111111',
          chapterId: 'c',
          volumeIndex: 0,
          chapterIndex: 0,
          paragraphIndex: 0,
          originalText: 'Old',
          translations: ['CN_ONLY_OLD'],
          chapterTitleOriginal: '',
          chapterTitleTranslation: '',
        },
      ]),
      lastUpdated: '',
    });
    const rows = await FullTextIndexService.search('fixture-book', ['English selected'], {
      novel: books.getBookById('fixture-book')!,
      searchInOriginal: false,
      language: 'en-US',
    });
    expect(rows).toHaveLength(1);
    expect((await db.get('full-text-indexes', 'fixture-book'))!.schemaVersion).toBe(2);
  });
  it('旧索引计算晚提交不会覆盖切目标后的新索引', async () => {
    const { books } = await fixture();
    const old = books.getBookById('fixture-book')!;
    const original = contentHash.hashString;
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    vi.spyOn(contentHash, 'hashString').mockImplementation(async (value) => {
      if (++calls === 1) {
        entered.resolve();
        await release.promise;
      }
      return original(value);
    });
    const pending = FullTextIndexService.buildIndex(old.id, old);
    await entered.promise;
    await books.updateBook(old.id, { targetLanguage: 'zh-TW' });
    await FullTextIndexService.buildIndex(old.id, books.getBookById(old.id)!);
    const db = await getDB();
    const fresh = await db.get('full-text-indexes', old.id);
    release.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'FULL_TEXT_INDEX_CHANGED' });
    expect(await db.get('full-text-indexes', old.id)).toEqual(fresh);
  });
});
