import './setup';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { cloneDeep } from 'lodash';
import type { CharacterSetting } from '../models/novel';
import { useBooksStore } from '../stores/books';
import { applyBookSnapshot } from '../composables/book-details/book-undo-snapshot';

const term = {
  id: 'term-1',
  name: '勇者',
  translation: { id: 't1', translation: '勇者', aiModelId: '' },
};
const character = {
  id: 'char-1',
  name: '佐藤',
  translation: { id: 'c1', translation: '佐藤', aiModelId: '' },
  aliases: [],
} as unknown as CharacterSetting;

async function setup() {
  setActivePinia(createPinia());
  const books = useBooksStore();
  await books.addBook({
    id: 'a',
    title: '书',
    targetLanguage: 'zh-CN',
    createdAt: new Date(0),
    lastEdited: new Date(0),
  });
  return books;
}
const termNames = (books: ReturnType<typeof useBooksStore>) =>
  (books.getBookById('a')?.terminologies ?? []).map((value) => value.name);
const characterNames = (books: ReturnType<typeof useBooksStore>) =>
  (books.getBookById('a')?.characterSettings ?? []).map((value) => value.name);

describe('撤销 / 重做书籍快照中的术语与角色', () => {
  it('删除术语和角色后应用删除前的快照，以新身份恢复而不是因删除记录失败', async () => {
    const books = await setup();
    await books.updateBook('a', { terminologies: [term], characterSettings: [character] });
    const before = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { terminologies: [], characterSettings: [] });

    await applyBookSnapshot(books, before);

    expect(termNames(books)).toEqual(['勇者']);
    expect(characterNames(books)).toEqual(['佐藤']);
  });

  it('新增术语后撤销再重做，重做快照同样能恢复', async () => {
    const books = await setup();
    const empty = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { terminologies: [term] });
    const added = cloneDeep(books.getBookById('a')!);

    await applyBookSnapshot(books, empty);
    expect(termNames(books)).toEqual([]);
    await applyBookSnapshot(books, added);

    expect(termNames(books)).toEqual(['勇者']);
  });

  it('普通字段照常按快照恢复，并保留当前目标语言', async () => {
    const books = await setup();
    const before = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { title: '新书名', targetLanguage: 'en-US' });

    await applyBookSnapshot(books, before);

    expect(books.getBookById('a')?.title).toBe('书');
    expect(books.getBookById('a')?.targetLanguage).toBe('en-US');
  });
});
