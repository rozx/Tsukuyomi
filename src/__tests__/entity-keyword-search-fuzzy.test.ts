import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminologyTools } from '../services/ai/tools/terminology-tools';
import { characterTools } from '../services/ai/tools/character-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { TerminologyService } from '../services/terminology-service';
import { CharacterSettingService } from '../services/character-setting-service';
import type { ToolContext } from '../services/ai/tools/types';

const context: ToolContext = {
  bookId: 'fixture-book',
  languages: captureExecutionLanguages('zh-CN'),
};
async function invoke(name: string, args: Record<string, unknown>) {
  const entry = [...terminologyTools, ...characterTools].find(
    (tool) => tool.definition.function.name === name,
  )!;
  return JSON.parse(await entry.handler(args, context));
}
function parameterNames(name: string): string[] {
  const entry = [...terminologyTools, ...characterTools].find(
    (tool) => tool.definition.function.name === name,
  )!;
  return Object.keys(entry.definition.function.parameters?.properties ?? {});
}
afterEach(() => vi.restoreAllMocks());

describe('站内术语 / 角色关键词搜索的模糊选项', () => {
  it('search_terms_by_keywords：默认精确，fuzzy 开启后写错一个字也能找到', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'エロ聖女', translation: '色情圣女' },
      'zh-CN',
    );
    await TerminologyService.addTerminology(
      'fixture-book',
      { name: '魔力炉心', translation: '魔力炉心' },
      'zh-CN',
    );
    expect(parameterNames('search_terms_by_keywords')).toContain('fuzzy');

    const exact = await invoke('search_terms_by_keywords', {
      keywords: ['エロ性女'],
      include_memory: false,
    });
    expect(exact.terms).toEqual([]);

    const fuzzy = await invoke('search_terms_by_keywords', {
      keywords: ['エロ性女'],
      fuzzy: true,
      include_memory: false,
    });
    expect(fuzzy.terms.map((term: { name: string }) => term.name)).toEqual(['エロ聖女']);

    // 只搜译名时同样支持模糊
    const byTranslation = await invoke('search_terms_by_keywords', {
      keywords: ['色情圣汝'],
      fuzzy: true,
      translation_only: true,
      include_memory: false,
    });
    expect(byTranslation.terms.map((term: { name: string }) => term.name)).toEqual(['エロ聖女']);
  });

  it('search_characters_by_keywords：fuzzy 同样作用于名称、译名与别名', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await CharacterSettingService.addCharacterSetting(
      'fixture-book',
      {
        name: 'アレクサンドラ',
        translation: '亚历山德拉',
        aliases: [{ name: 'サンドラ姫殿下', translation: '桑德拉公主殿下' }],
      },
      'zh-CN',
    );
    await CharacterSettingService.addCharacterSetting(
      'fixture-book',
      { name: 'ミナ', translation: '米娜' },
      'zh-CN',
    );
    expect(parameterNames('search_characters_by_keywords')).toContain('fuzzy');

    const names = async (args: Record<string, unknown>) =>
      (
        await invoke('search_characters_by_keywords', { include_memory: false, ...args })
      ).characters.map((char: { name: string }) => char.name);

    expect(await names({ keywords: ['アレクサンドロ'] })).toEqual([]);
    expect(await names({ keywords: ['アレクサンドロ'], fuzzy: true })).toEqual(['アレクサンドラ']);
    expect(await names({ keywords: ['サンドラ妃殿下'], fuzzy: true })).toEqual(['アレクサンドラ']);
    // 精确搜索的既有行为不变：名称、译名、别名任一包含关键词
    expect(await names({ keywords: ['サンドラ'] })).toEqual(['アレクサンドラ']);
    // 多个关键词取并集；精确搜索保持书里原有的存放顺序，这里不假定它
    expect((await names({ keywords: ['米娜', '桑德拉'] })).sort()).toEqual(
      ['アレクサンドラ', 'ミナ'].sort(),
    );
  });
});
