import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { cloneDeep } from 'lodash';
import type { CharacterSetting } from '../models/novel';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
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

/** 写入含该角色的书籍记录时模拟存储失败（配额 / 并发冲突），与具体实现无关 */
function failBookWritesContaining(name: string) {
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')!
    .value as IDBObjectStore['put'];
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const characters = (value as { characterSettings?: { name: string }[] })?.characterSettings;
    if (this.name === 'books' && characters?.some((item) => item.name === name))
      throw new DOMException('模拟配额不足', 'QuotaExceededError');
    return put.call(this, value, key);
  });
}

async function deletedEntitiesSnapshot() {
  const books = await setup();
  await books.updateBook('a', { terminologies: [term], characterSettings: [character] });
  const before = cloneDeep(books.getBookById('a')!);
  await books.updateBook('a', { terminologies: [], characterSettings: [] });
  return { books, before };
}

describe('撤销 / 重做书籍快照中的术语与角色', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('删除术语和角色后应用删除前的快照，以新身份恢复而不是因删除记录失败', async () => {
    const books = await setup();
    await books.updateBook('a', { terminologies: [term], characterSettings: [character] });
    const before = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { terminologies: [], characterSettings: [] });

    await applyBookSnapshot(books, before, 'op-1');

    expect(termNames(books)).toEqual(['勇者']);
    expect(characterNames(books)).toEqual(['佐藤']);
  });

  it('新增术语后撤销再重做，重做快照同样能恢复', async () => {
    const books = await setup();
    const empty = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { terminologies: [term] });
    const added = cloneDeep(books.getBookById('a')!);

    await applyBookSnapshot(books, empty, 'op-1');
    expect(termNames(books)).toEqual([]);
    await applyBookSnapshot(books, added, 'op-2');

    expect(termNames(books)).toEqual(['勇者']);
  });

  it('删除角色的别名后应用删除前的快照，别名以新身份恢复，角色身份不变', async () => {
    const books = await setup();
    const withAlias = {
      ...character,
      aliases: [{ name: 'サトウ', translation: { id: 'a1', translation: '萨托', aiModelId: '' } }],
    } as unknown as CharacterSetting;
    await books.updateBook('a', { characterSettings: [withAlias] });
    const before = cloneDeep(books.getBookById('a')!);
    const aliasId = before.characterSettings![0]!.aliases[0]!.id;
    await books.updateBook('a', {
      characterSettings: [{ ...before.characterSettings![0]!, aliases: [] }],
    });

    await applyBookSnapshot(books, before, 'op-1');

    const restored = books.getBookById('a')!.characterSettings!;
    expect(restored.map((value) => value.id)).toEqual(['char-1']);
    expect(restored[0]!.aliases.map((value) => value.name)).toEqual(['サトウ']);
    expect(restored[0]!.aliases[0]!.id).not.toBe(aliasId);
  });

  it('普通字段照常按快照恢复，并保留当前目标语言', async () => {
    const books = await setup();
    const before = cloneDeep(books.getBookById('a')!);
    await books.updateBook('a', { title: '新书名', targetLanguage: 'en-US' });

    await applyBookSnapshot(books, before, 'op-1');

    expect(books.getBookById('a')?.title).toBe('书');
    expect(books.getBookById('a')?.targetLanguage).toBe('en-US');
  });

  it('恢复任一已删除实体失败时，已删除的术语和角色都不写入', async () => {
    const { books, before } = await deletedEntitiesSnapshot();
    failBookWritesContaining('佐藤');

    await expect(applyBookSnapshot(books, before, 'op-1')).rejects.toThrow();

    const stored = await BookService.getBookById('a');
    expect(stored?.terminologies ?? []).toEqual([]);
    expect(stored?.characterSettings ?? []).toEqual([]);
  });

  it('失败后以同一操作 ID 重试，每个实体只恢复一份', async () => {
    const { books, before } = await deletedEntitiesSnapshot();
    const failing = failBookWritesContaining('佐藤');
    await expect(applyBookSnapshot(books, before, 'op-1')).rejects.toThrow();
    failing.mockRestore();

    await applyBookSnapshot(books, before, 'op-1');

    expect(termNames(books)).toEqual(['勇者']);
    expect(characterNames(books)).toEqual(['佐藤']);
  });

  it('同一操作 ID 重复应用不会重复恢复', async () => {
    const { books, before } = await deletedEntitiesSnapshot();

    await applyBookSnapshot(books, before, 'op-1');
    await applyBookSnapshot(books, before, 'op-1');

    expect(termNames(books)).toEqual(['勇者']);
    expect(characterNames(books)).toEqual(['佐藤']);
  });
});
