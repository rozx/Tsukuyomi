import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { terminologyTools } from '../services/ai/tools/terminology-tools';
import { characterTools } from '../services/ai/tools/character-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { TerminologyService } from '../services/terminology-service';
import { CharacterSettingService } from '../services/character-setting-service';
import { BookService } from '../services/book-service';
import { getNameTranslation } from '../services/localization/selection';
import type { ToolContext } from '../services/ai/tools/types';
import { vi } from 'vitest';
const context: ToolContext = {
  bookId: 'fixture-book',
  languages: captureExecutionLanguages('en-US'),
};
async function invoke(
  name: string,
  args: Record<string, unknown>,
  taskContext: ToolContext = context,
) {
  const entry = [...terminologyTools, ...characterTools].find(
    (tool) => tool.definition.function.name === name,
  )!;
  return JSON.parse(await entry.handler(args, taskContext));
}
afterEach(() => vi.restoreAllMocks());

describe('译名工具执行语言', () => {
  for (const language of ['zh-CN', 'zh-TW'] as const) {
    it(`${language} 工具保持既有中文引号及标点规范化`, async () => {
      await chapterTranslationFixture([translationChapter('c', '11111111')]);
      const result = await invoke(
        'create_term',
        { name: 'Doctor', translation: 'Dr. "Smith"' },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US', language),
        },
      );
      expect(result.term.translation).toBe('Dr。 「Smith」');
      const saved = (await BookService.getBookById('fixture-book'))!;
      expect(getNameTranslation(saved.terminologies![0]!, language)?.translation).toBe(
        'Dr。 「Smith」',
      );
      expect(getNameTranslation(saved.terminologies![0]!, 'en-US')).toBeUndefined();
    });
  }

  it('晚到术语更新保留当前新目标与简中槽，并原样保存英文标点', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const term = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Doctor', translation: 'CNONLY' },
      'zh-CN',
    );
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    const result = await invoke('update_term', {
      term_id: term.id,
      translation: 'Dr. Smith says "Hello".',
      targetLanguage: 'zh-CN',
    });
    const saved = (await BookService.getBookById('fixture-book'))!;
    expect(saved.targetLanguage).toBe('zh-TW');
    expect(getNameTranslation(saved.terminologies![0]!, 'zh-CN')?.translation).toBe('CNONLY');
    expect(getNameTranslation(saved.terminologies![0]!, 'en-US')?.translation).toBe(
      'Dr. Smith says "Hello".',
    );
    expect(getNameTranslation(saved.terminologies![0]!, 'zh-TW')).toBeUndefined();
    expect(result.term.translation).toBe('Dr. Smith says "Hello".');
  });
  it('角色及稳定别名更新使用执行语言，显式空译名只清空英文', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const character = await CharacterSettingService.addCharacterSetting(
      'fixture-book',
      {
        name: 'Doctor',
        translation: 'CNCHAR',
        aliases: [{ name: 'Doc', translation: 'CNALIAS' }],
      },
      'zh-CN',
    );
    const aliasId = character.aliases![0]!.id!;
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    const result = await invoke('update_character', {
      character_id: character.id,
      translation: 'Dr. Smith',
      aliases: [{ id: aliasId, name: 'Doc', translation: 'Dr. "S".' }],
    });
    expect(result.character.translation).toBe('Dr. Smith');
    expect(result.character.aliases[0]).toMatchObject({ id: aliasId, translation: 'Dr. "S".' });
    await invoke('update_character', {
      character_id: character.id,
      translation: '',
      aliases: [{ id: aliasId, name: 'Doc', translation: '' }],
    });
    const saved = (await BookService.getBookById('fixture-book'))!.characterSettings![0]!;
    expect(getNameTranslation(saved, 'en-US')).toBeUndefined();
    expect(getNameTranslation(saved.aliases![0]!, 'en-US')).toBeUndefined();
    expect(getNameTranslation(saved, 'zh-CN')?.translation).toBe('CNCHAR');
    expect(getNameTranslation(saved.aliases![0]!, 'zh-CN')?.translation).toBe('CNALIAS');
  });
  it('创建工具的目标只由宿主快照确定，返回目标译名且重载后标点不变', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    const term = await invoke('create_term', {
      name: 'Term',
      translation: 'Dr. Smith',
      language: 'zh-CN',
    });
    const character = await invoke('create_character', {
      name: 'Alice',
      translation: 'Alice "A".',
      aliases: [{ name: 'A', translation: 'A.' }],
    });
    expect(term.term.translation).toBe('Dr. Smith');
    expect(character.character.translation).toBe('Alice "A".');
    const saved = (await BookService.getBookById('fixture-book'))!;
    expect(getNameTranslation(saved.terminologies![0]!, 'en-US')?.translation).toBe('Dr. Smith');
    expect(
      getNameTranslation(saved.characterSettings![0]!.aliases![0]!, 'en-US')?.translation,
    ).toBe('A.');
    expect(saved.targetLanguage).toBe('zh-TW');
  });
  it('查询、列表和关键词搜索只暴露目标译名，缺失保持空白', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const term = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Guild', translation: 'CNTERM' },
      'zh-CN',
    );
    await TerminologyService.updateTerminology(
      'fixture-book',
      term.id,
      { translation: 'ENTERM' },
      'en-US',
    );
    const char = await CharacterSettingService.addCharacterSetting(
      'fixture-book',
      { name: 'Alice', translation: 'CNCHAR', aliases: [{ name: 'Al', translation: 'CNALIAS' }] },
      'zh-CN',
    );
    await CharacterSettingService.updateCharacterSetting(
      'fixture-book',
      char.id,
      { translation: 'ENCHAR' },
      'en-US',
    );
    const missing = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Missing', translation: 'CNMISSING' },
      'zh-CN',
    );
    for (const [name, args] of [
      ['get_term', { name: 'Guild', include_memory: false }],
      ['list_terms', {}],
      ['search_terms_by_keywords', { keywords: ['ENTERM'], include_memory: false }],
      ['get_character', { name: 'Alice', include_memory: false }],
      ['list_characters', {}],
      ['search_characters_by_keywords', { keywords: ['ENCHAR'], include_memory: false }],
    ] as const) {
      const data = await invoke(name, args);
      const json = JSON.stringify(data);
      expect(json).not.toMatch(/CN(TERM|CHAR|ALIAS|MISSING)/);
      if (name.includes('terms')) expect(data.terms).not.toHaveLength(0);
      if (name.includes('characters')) expect(data.characters).not.toHaveLength(0);
    }
    const data = await invoke('get_term', { name: missing.name, include_memory: false });
    expect(data.term.translation).toBe('');
    expect(
      (await invoke('search_terms_by_keywords', { keywords: ['CNTERM'], include_memory: false }))
        .terms,
    ).toEqual([]);
  });
});
