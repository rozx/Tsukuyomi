import { describe, expect, it } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { getDB } from '../utils/indexed-db';
const a = {
  chapterId: 'a',
  edits: [
    {
      type: 'append' as const,
      paragraphId: '11111111',
      originalText: 'source 11111111',
      translation: { id: 'en-a', translation: 'Result A', aiModelId: '' },
    },
  ],
};
const b = {
  chapterId: 'b',
  edits: [
    {
      type: 'append' as const,
      paragraphId: '22222222',
      originalText: 'source 22222222',
      translation: { id: 'en-b', translation: 'Result B', aiModelId: '' },
    },
  ],
};
async function setup() {
  return chapterTranslationFixture([
    translationChapter('a', '11111111'),
    translationChapter('b', '22222222'),
  ]);
}
describe('跨章节语言编辑事务', () => {
  it('空输入保留书籍与修订，一次保存多个章节保留最新目标和范围外 metadata', async () => {
    const { books } = await setup();
    const before = await BookService.getBookById('fixture-book');
    await BookService.editParagraphTranslationGroups('fixture-book', 'en-US', []);
    expect(await BookService.getBookById('fixture-book')).toEqual(before);
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW', description: 'Latest' });
    await BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [a, b]);
    expect(
      (await ChapterContentService.loadChapterContent('a'))![0]!.translations[0],
    ).toMatchObject({ translation: 'Result A', language: 'en-US' });
    expect(
      (await ChapterContentService.loadChapterContent('b'))![0]!.translations[0],
    ).toMatchObject({ translation: 'Result B', language: 'en-US' });
    expect(await BookService.getBookById('fixture-book')).toMatchObject({
      targetLanguage: 'zh-TW',
      description: 'Latest',
    });
  });
  it('后一个章节原文过期时整批回滚，不部分修改前一个章节', async () => {
    await setup();
    const before = await BookService.getBookById('fixture-book');
    await expect(
      BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [
        a,
        { ...b, edits: [{ ...b.edits[0]!, originalText: 'Stale source' }] },
      ]),
    ).rejects.toThrow('PARAGRAPH_SOURCE_CHANGED');
    expect((await ChapterContentService.loadChapterContent('a'))![0]!.translations).toEqual([]);
    expect((await ChapterContentService.loadChapterContent('b'))![0]!.translations).toEqual([]);
    expect(await BookService.getBookById('fixture-book')).toEqual(before);
  });
  it('损坏章节数据拒绝整批，重复章节拒绝且单章节仍走相同原子入口', async () => {
    await setup();
    await expect(
      BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [a, a]),
    ).rejects.toThrow('DUPLICATE_EDIT_CHAPTER');
    await BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [a]);
    expect(
      (await ChapterContentService.loadChapterContent('a'))![0]!.translations[0]?.translation,
    ).toBe('Result A');
    const db = await getDB();
    await db.put('chapter-contents', {
      chapterId: 'b',
      bookId: 'fixture-book',
      content: '{broken',
      lastModified: '',
    });
    await expect(
      BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [
        {
          ...a,
          edits: [
            {
              ...a.edits[0]!,
              translation: { ...a.edits[0]!.translation, id: 'next', translation: 'Not saved' },
            },
          ],
        },
        b,
      ]),
    ).rejects.toThrow();
    expect((await ChapterContentService.loadChapterContent('a'))![0]!.translations).toHaveLength(1);
  });
  it('批量目标选用在准备后改变时拒绝，不写入旧选用版本', async () => {
    await setup();
    await BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [a]);
    await expect(
      BookService.editParagraphTranslationGroups('fixture-book', 'en-US', [
        {
          ...a,
          edits: [
            {
              type: 'update',
              paragraphId: '11111111',
              originalText: 'source 11111111',
              translationId: 'en-a',
              text: 'Not saved',
              expectedSelectedTranslationId: 'previous',
            },
          ],
        },
      ]),
    ).rejects.toThrow('PARAGRAPH_SELECTION_CHANGED');
    expect(
      (await ChapterContentService.loadChapterContent('a'))![0]!.translations[0]?.translation,
    ).toBe('Result A');
  });
});
