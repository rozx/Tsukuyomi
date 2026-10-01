import { describe, expect, it } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';

async function tab() {
  setActivePinia(createPinia());
  const books = useBooksStore();
  await books.loadBooks();
  return books;
}

describe('持有旧快照的元数据保存与目标语言', () => {
  it('另一标签页改了目标语言后，旧快照保存无关字段不会把目标语言改回去', async () => {
    await BookService.saveBook({
      id: 'lang-book',
      title: '书',
      targetLanguage: 'zh-CN',
      createdAt: new Date(0),
      lastEdited: new Date(0),
    });
    const stale = await tab();
    const other = await tab();
    await other.updateBook('lang-book', { targetLanguage: 'en-US' });

    await stale.updateBook('lang-book', { description: '新简介' });

    const saved = (await BookService.getBookById('lang-book'))!;
    expect(saved.targetLanguage).toBe('en-US');
    expect(saved.description).toBe('新简介');
    expect(stale.getBookById('lang-book')?.targetLanguage).toBe('en-US');
  });

  it('本次更新明确修改目标语言时照常写入', async () => {
    await BookService.saveBook({
      id: 'lang-book-2',
      title: '书',
      targetLanguage: 'zh-CN',
      createdAt: new Date(0),
      lastEdited: new Date(0),
    });
    const books = await tab();
    await books.updateBook('lang-book-2', { targetLanguage: 'zh-TW' });
    expect((await BookService.getBookById('lang-book-2'))!.targetLanguage).toBe('zh-TW');
  });

  it('旧快照保存后，内存里的卷章标题也换成库中合并后的最新译名', async () => {
    const { getNameTranslation } = await import('../services/localization/selection');
    const title = {
      original: '第1話',
      translation: { id: 'cn', translation: '第一话', aiModelId: '' },
    };
    await BookService.saveBook({
      id: 'title-book',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title,
          chapters: [{ id: 'c', title, createdAt: new Date(0), lastEdited: new Date(0) }],
        },
      ],
    });
    const stale = await tab();
    await BookService.editTitle('title-book', 'en-US', {
      kind: 'chapter',
      id: 'c',
      expectedOriginal: '第1話',
      translation: 'Chapter One',
    });

    await stale.updateBook('title-book', { description: '新简介' });

    const chapter = stale.getBookById('title-book')!.volumes![0]!.chapters![0]!;
    expect(
      getNameTranslation(chapter.title as Exclude<typeof chapter.title, string>, 'en-US')
        ?.translation,
    ).toBe('Chapter One');
  });
});
