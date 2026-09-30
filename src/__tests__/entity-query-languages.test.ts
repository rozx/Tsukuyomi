import { describe, expect, it } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { setNameTranslation } from '../services/localization/selection';
import { terminologyTools } from '../services/ai/tools/terminology-tools';
import { characterTools } from '../services/ai/tools/character-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
function owner(original: string, cn: string, en: string) {
  return setNameTranslation(
    { original, translation: { id: `${original}-cn`, translation: cn, aiModelId: '' } },
    'en-US',
    { id: `${original}-en`, translation: en, aiModelId: '' },
    { counter: 4, actorId: 'a' },
    0,
  );
}
async function fixture() {
  const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
  await books.updateBook('fixture-book', { targetLanguage: 'zh-CN' });
  await books.updateBook('fixture-book', {
    terminologies: [
      {
        id: 'term',
        name: 'Source term',
        description: '用户原有术语说明',
        ...owner('Source term', 'CN_TERM_SECRET', 'English term'),
      },
    ],
    characterSettings: [
      {
        id: 'hero',
        name: 'Source hero',
        sex: 'other',
        description: '用户原有角色说明',
        speakingStyle: '用户原有说话风格',
        ...owner('Source hero', 'CN_CHARACTER_SECRET', 'English hero'),
        aliases: [
          {
            id: 'alias',
            name: 'Source nickname',
            ...owner('Source nickname', 'CN_ALIAS_SECRET', 'English nickname'),
          },
        ],
      },
    ],
  });
}
const cases = [
  ['get_term', terminologyTools, { name: 'Source term' }],
  ['get_term', terminologyTools, { name: 'Source' }],
  ['search_terms_by_keywords', terminologyTools, { keywords: ['Source'] }],
  ['list_terms', terminologyTools, {}],
  ['get_character', characterTools, { name: 'Source hero' }],
  ['get_character', characterTools, { name: 'Source' }],
  ['search_characters_by_keywords', characterTools, { keywords: ['Source'] }],
  ['list_characters', characterTools, {}],
] as const;
describe('全部实体查询分支按执行目标返回', () => {
  for (const language of ['en-US', 'zh-TW'] as const)
    for (const [name, tools, args] of cases) {
      it(`${name} ${JSON.stringify(args)} / ${language}`, async () => {
        await fixture();
        const tool = tools.find((entry) => entry.definition.function.name === name)!;
        const result = await tool.handler(
          { ...args, include_memory: false },
          { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US', language) },
        );
        expect(result).not.toMatch(/CN_TERM_SECRET|CN_CHARACTER_SECRET|CN_ALIAS_SECRET/);
        expect(result).toContain('Source');
        if (language === 'en-US') expect(result).toContain('English');
        else expect(result).not.toContain('English');
        expect(result).toContain(name.includes('term') ? '用户原有术语说明' : '用户原有角色说明');
        if (!name.includes('term')) expect(result).toContain('用户原有说话风格');
      });
    }
});
