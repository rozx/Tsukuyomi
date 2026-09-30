import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { ChapterContentService } from '../services/chapter-content-service';
import { BookService } from '../services/book-service';
import { getLanguageTranslation } from '../services/localization/selection';
import type { ToolContext } from '../services/ai/tools/types';
const context: ToolContext = {
  bookId: 'fixture-book',
  languages: captureExecutionLanguages('en-US'),
  aiModelId: 'fixture-model',
};
async function invoke(name: string, args: Record<string, unknown>) {
  return JSON.parse(
    await paragraphTools
      .find((entry) => entry.definition.function.name === name)!
      .handler(args, context),
  );
}
async function setup() {
  const chapter = translationChapter('c', '11111111');
  chapter.content![0]!.translations = [
    { id: 'cn', translation: 'CN original', language: 'zh-CN', aiModelId: '' },
    { id: 'en', translation: 'English original', language: 'en-US', aiModelId: '' },
    { id: 'en2', translation: 'English second', language: 'en-US', aiModelId: '' },
  ];
  chapter.content![0]!.selectedTranslationId = 'cn';
  chapter.content![0]!.selectedTranslations = {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  };
  return chapterTranslationFixture([chapter]);
}
const load = async () => (await ChapterContentService.loadChapterContent('c'))![0]!;
afterEach(() => vi.restoreAllMocks());

describe('段落工具执行语言', () => {
  for (const name of ['select_translation', 'update_translation', 'remove_translation']) {
    it(`${name} 拒绝其他语言 ID，不改变数据库与选用`, async () => {
      await setup();
      const before = await load();
      await expect(
        invoke(name, {
          paragraph_id: '11111111',
          translation_id: 'cn',
          new_translation: 'Wrong language',
        }),
      ).rejects.toThrow('TRANSLATION_LANGUAGE_MISMATCH');
      expect(await load()).toEqual(before);
    });
  }
  it('选择、修改、删除只更新英文选用，最后一个英文被删后不借用简中', async () => {
    await setup();
    await invoke('select_translation', { paragraph_id: '11111111', translation_id: 'en2' });
    expect(getLanguageTranslation(await load(), 'en-US')?.id).toBe('en2');
    await invoke('update_translation', {
      paragraph_id: '11111111',
      translation_id: 'en2',
      new_translation: 'Dr. "A".',
    });
    expect(getLanguageTranslation(await load(), 'en-US')?.translation).toBe('Dr. "A".');
    await invoke('remove_translation', { paragraph_id: '11111111', translation_id: 'en2' });
    expect(getLanguageTranslation(await load(), 'en-US')?.id).toBe('en');
    await invoke('remove_translation', { paragraph_id: '11111111', translation_id: 'en' });
    expect(getLanguageTranslation(await load(), 'en-US')).toBeUndefined();
    expect(getLanguageTranslation(await load(), 'zh-CN')?.translation).toBe('CN original');
  });
  it('新增英文合并最新正文与目标，不能用模型参数指定简中槽', async () => {
    const { books } = await setup();
    await books.updateBook('fixture-book', {
      targetLanguage: 'zh-TW',
      description: 'Latest metadata',
    });
    const result = await invoke('add_translation', {
      paragraph_id: '11111111',
      translation: 'New English',
      language: 'zh-CN',
    });
    const saved = await load();
    expect(saved.translations.find((value) => value.id === result.translation_id)?.language).toBe(
      'en-US',
    );
    expect(getLanguageTranslation(saved, 'en-US')?.translation).toBe('New English');
    expect(getLanguageTranslation(saved, 'zh-CN')?.translation).toBe('CN original');
    expect(await BookService.getBookById('fixture-book')).toMatchObject({
      targetLanguage: 'zh-TW',
      description: 'Latest metadata',
    });
  });
  it('批量替换只修改目标选用版本，兼容参数不能修改其他历史版本', async () => {
    await setup();
    const result = await invoke('batch_replace_translations', {
      keywords: ['English'],
      replacement_text: 'Updated',
      replace_all_translations: true,
    });
    expect(result.replaced_count).toBe(1);
    const saved = await load();
    expect(getLanguageTranslation(saved, 'en-US')?.translation).toBe('Updated original');
    expect(saved.translations.find((value) => value.id === 'en2')?.translation).toBe(
      'English second',
    );
    expect(getLanguageTranslation(saved, 'zh-CN')?.translation).toBe('CN original');
    expect(result.replace_all_translations).toBe(false);
  });
  it('批量替换不会因其他语言关键词命中而修改该语言', async () => {
    await setup();
    const before = await load();
    const result = await invoke('batch_replace_translations', {
      keywords: ['CN'],
      replacement_text: 'Wrong',
    });
    expect(result.replaced_count).toBe(0);
    expect(await load()).toEqual(before);
  });
});
