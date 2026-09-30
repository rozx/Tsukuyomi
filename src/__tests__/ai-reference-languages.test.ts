import { describe, expect, it } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import {
  buildSingleParagraphDefaultContext,
  buildIndependentChunkPrompt,
  buildChapterSemanticQuery,
} from '../services/ai/tasks/utils/context-builder';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { setNameTranslation } from '../services/localization/selection';
import type { CharacterSetting, Terminology } from '../models/novel';

async function references(english: boolean) {
  const chapter = translationChapter('c', '11111111');
  chapter.content![0]!.text = 'Hero uses Magic. Nick is nearby.';
  const { books } = await chapterTranslationFixture([chapter]);
  // 模拟简中历史资料的写入，英文执行仍使用独立捕获的目标。
  await books.updateBook('fixture-book', { targetLanguage: 'zh-CN' });
  let term: Terminology = {
    id: 't',
    name: 'Magic',
    description: '用户原有术语说明',
    translation: { id: 'cn-t', translation: '简中术语秘密', aiModelId: '' },
  };
  let character: CharacterSetting = {
    id: 'hero',
    name: 'Hero',
    sex: 'male',
    description: '用户原有角色说明',
    speakingStyle: '用户原有说话风格',
    translation: { id: 'cn-c', translation: '简中角色秘密', aiModelId: '' },
    aliases: [
      {
        id: 'alias',
        name: 'Nick',
        translation: {
          id: 'cn-a',
          translation: '简中别名秘密',
          aiModelId: '',
        },
      },
    ],
  };
  if (english) {
    const revision = { counter: 20, actorId: 'fixture' };
    term = setNameTranslation(
      term,
      'en-US',
      { id: 'en-t', translation: 'Magic EN', aiModelId: '' },
      revision,
      0,
    );
    character = setNameTranslation(
      character,
      'en-US',
      { id: 'en-c', translation: 'Hero EN', aiModelId: '' },
      revision,
      0,
    );
    character.aliases[0] = setNameTranslation(
      character.aliases[0]!,
      'en-US',
      {
        id: 'en-a',
        translation: 'Nick EN',
        aiModelId: '',
      },
      revision,
      0,
    );
  }
  await books.updateBook('fixture-book', { terminologies: [term], characterSettings: [character] });
  return chapter;
}
function expectReferences(text: string, english: boolean) {
  expect(text).not.toMatch(/简中术语秘密|简中角色秘密|简中别名秘密/);
  expect(text).toContain('Magic → ' + (english ? 'Magic EN' : ''));
  expect(text).toContain('Hero → ' + (english ? 'Hero EN' : ''));
  expect(text).toContain('Nick → ' + (english ? 'Nick EN' : ''));
  expect(text).toContain('用户原有角色说明');
  expect(text).toContain('用户原有说话风格');
}
describe('AI 自动参考内容按执行目标投影', () => {
  for (const english of [false, true]) {
    it(`单段术语/角色/别名使用目标槽，存在英文=${english}`, async () => {
      const chapter = await references(english);
      const context = await buildSingleParagraphDefaultContext({
        languages: captureExecutionLanguages('en-US'),
        currentParagraphId: '11111111',
        allChapterParagraphs: chapter.content!,
        bookId: 'fixture-book',
        chapterId: 'c',
      });
      expectReferences(context, english);
      expect(context).toContain('别名：');
    });
    it(`批次参考内容使用目标槽，存在英文=${english}`, async () => {
      const chapter = await references(english);
      const prompt = await buildIndependentChunkPrompt(
        'translation',
        0,
        1,
        chapter.content![0]!.text,
        '',
        '',
        'c',
        undefined,
        'fixture-book',
        false,
        undefined,
        captureExecutionLanguages('en-US'),
      );
      expectReferences(prompt, english);
    });
  }
  it('章节语义参考只使用原始标题和目标标题', () => {
    const title = setNameTranslation(
      {
        original: 'Original title',
        translation: {
          id: 'cn',
          translation: '简中标题秘密',
          aiModelId: '',
        },
      },
      'en-US',
      { id: 'en', translation: 'English title', aiModelId: '' },
      { counter: 20, actorId: 'fixture' },
      0,
    );
    expect(
      buildChapterSemanticQuery({ ...translationChapter('c', '11111111'), title }, 'en-US'),
    ).toBe('Original title\nEnglish title');
  });
});
