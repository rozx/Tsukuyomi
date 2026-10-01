import { describe, expect, it } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
import { TerminologyService } from '../services/terminology-service';
import { CharacterSettingService } from '../services/character-setting-service';
import { getNameTranslation } from '../services/localization/selection';
import type { Novel } from '../models/novel';

async function openBook() {
  setActivePinia(createPinia());
  const books = useBooksStore();
  const book: Novel = {
    id: 'b',
    title: '书',
    targetLanguage: 'en-US',
    createdAt: new Date(0),
    lastEdited: new Date(0),
  };
  await books.addBook(book);
  return books;
}

describe('目标语言译名保存', () => {
  it('新别名分配 UUID，改名与省略译名更新保留身份及各语言值', async () => {
    await openBook();
    const character = await CharacterSettingService.addCharacterSetting('b', {
      name: '博士',
      aliases: [{ name: 'Doc', translation: 'Dr. A.' }],
    });
    const alias = character.aliases[0]!;
    expect(alias.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await CharacterSettingService.updateCharacterSetting('b', character.id, {
      aliases: [{ id: alias.id!, name: 'Doctor' }],
    });
    const saved = (await BookService.getBookById('b'))!.characterSettings![0]!.aliases[0]!;
    expect(saved.id).toBe(alias.id);
    expect(saved.name).toBe('Doctor');
    expect(getNameTranslation(saved, 'en-US')?.translation).toBe('Dr. A.');
  });
  it('数据库目标已变化时拒绝旧 UI 写入，显式执行语言仍可保存旧任务结果', async () => {
    const books = await openBook();
    const term = await TerminologyService.addTerminology('b', {
      name: '医者',
      translation: 'Doctor',
    });
    await BookService.saveBook({ ...books.getBookById('b')!, targetLanguage: 'zh-CN' });
    await expect(
      TerminologyService.updateTerminology('b', term.id, { translation: 'Old UI draft' }),
    ).rejects.toThrow('BOOK_TARGET_LANGUAGE_CHANGED');
    await TerminologyService.updateTerminology(
      'b',
      term.id,
      { translation: 'Late English task' },
      'en-US',
    );
    const saved = (await BookService.getBookById('b'))!;
    expect(saved.targetLanguage).toBe('zh-CN');
    expect(getNameTranslation(saved.terminologies![0]!, 'en-US')?.translation).toBe(
      'Late English task',
    );
    expect(getNameTranslation(saved.terminologies![0]!, 'zh-CN')).toBeUndefined();
  });
  it('编辑和清空英文译名保留简中，省略译名字段不清空英文', async () => {
    const books = await openBook();
    const term = await TerminologyService.addTerminology(
      'b',
      { name: '医者', translation: '医生' },
      'zh-CN',
    );
    const character = await CharacterSettingService.addCharacterSetting(
      'b',
      { name: '博士', translation: '博士', aliases: [{ name: 'Doc', translation: '医生' }] },
      'zh-CN',
    );
    await TerminologyService.updateTerminology('b', term.id, { translation: 'Dr. Smith' });
    await CharacterSettingService.updateCharacterSetting('b', character.id, {
      translation: 'Dr. Alice',
      aliases: [{ id: character.aliases[0]!.id!, name: 'Doc', translation: 'Dr. A.' }],
    });
    await TerminologyService.updateTerminology('b', term.id, { description: '只改描述' });
    let book = (await BookService.getBookById('b'))!;
    expect(getNameTranslation(book.terminologies![0]!, 'en-US')?.translation).toBe('Dr. Smith');
    expect(getNameTranslation(book.terminologies![0]!, 'zh-CN')?.translation).toBe('医生');
    expect(getNameTranslation(book.characterSettings![0]!, 'en-US')?.translation).toBe('Dr. Alice');
    expect(getNameTranslation(book.characterSettings![0]!.aliases[0]!, 'en-US')?.translation).toBe(
      'Dr. A.',
    );
    await CharacterSettingService.updateCharacterSetting('b', character.id, {
      translation: '',
      aliases: [{ id: character.aliases[0]!.id!, name: 'Doc', translation: '' }],
    });
    book = (await BookService.getBookById('b'))!;
    expect(getNameTranslation(book.characterSettings![0]!, 'en-US')).toBeUndefined();
    expect(getNameTranslation(book.characterSettings![0]!, 'zh-CN')?.translation).toBe('博士');
    expect(getNameTranslation(book.characterSettings![0]!.aliases[0]!, 'en-US')).toBeUndefined();
    expect(getNameTranslation(book.characterSettings![0]!.aliases[0]!, 'zh-CN')?.translation).toBe(
      '医生',
    );
    expect(books.getBookById('b')?.targetLanguage).toBe('en-US');
  });
  it('英文术语、角色和别名保存重载后保留英文标点，空别名仍为空', async () => {
    await openBook();
    await TerminologyService.addTerminology('b', { name: '医者', translation: 'Dr. Smith' });
    await CharacterSettingService.addCharacterSetting('b', {
      name: '博士',
      translation: 'Dr. "Alice"',
      aliases: [
        { name: 'Doc', translation: 'Dr. A.' },
        { name: 'Alias', translation: '' },
      ],
    });
    const book = (await BookService.getBookById('b'))!;
    expect(getNameTranslation(book.terminologies![0]!, 'en-US')?.translation).toBe('Dr. Smith');
    const character = book.characterSettings![0]!;
    expect(getNameTranslation(character, 'en-US')?.translation).toBe('Dr. "Alice"');
    expect(
      getNameTranslation(character.aliases.find((alias) => alias.name === 'Doc')!, 'en-US')
        ?.translation,
    ).toBe('Dr. A.');
    expect(
      getNameTranslation(character.aliases.find((alias) => alias.name === 'Alias')!, 'en-US'),
    ).toBeUndefined();
  });
});
