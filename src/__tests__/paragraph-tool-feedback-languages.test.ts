import { describe, expect, it } from 'vitest';
import './setup';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';

async function fixture() {
  const chapter = translationChapter('c', '11111111');
  chapter.content![0]!.translations = [
    { id: 'en', language: 'en-US', translation: 'Old English', aiModelId: 'fixture-model' },
  ];
  chapter.content![0]!.selectedTranslationId = '';
  chapter.content![0]!.selectedTranslations = {
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 0 },
  };
  return chapterTranslationFixture([chapter]);
}
async function invoke(
  name: string,
  args: Record<string, unknown>,
  locale: 'zh-CN' | 'zh-TW' | 'en-US',
  bookId: string | undefined = 'fixture-book',
) {
  return JSON.parse(
    await paragraphTools
      .find((entry) => entry.definition.function.name === name)!
      .handler(args, {
        ...(bookId ? { bookId } : {}),
        languages: captureExecutionLanguages(locale, 'en-US'),
        aiModelId: 'fixture-model',
      }),
  );
}
describe('段落工具自有反馈本地化', () => {
  it('未知模型标签及模型校验采用UI语言，关键词缺省保持固定code', async () => {
    const { books } = await fixture();
    const chapter = books.getBookById('fixture-book')!.volumes![0]!.chapters![0]!;
    const content = chapter.content!.map((paragraph) => ({
      ...paragraph,
      translations: paragraph.translations.map((translation) => ({
        ...translation,
        aiModelId: 'missing-model',
      })),
    }));
    await books.updateBook('fixture-book', {
      volumes: [
        { ...books.getBookById('fixture-book')!.volumes![0]!, chapters: [{ ...chapter, content }] },
      ],
    });
    const history = await invoke(
      'get_translation_history',
      { paragraph_id: '11111111', include_memory: false },
      'en-US',
    );
    expect(history.translation_history[0].aiModelName).toBe('Unknown model');
    const missing = await invoke(
      'add_translation',
      { paragraph_id: '11111111', translation: 'New', ai_model_id: 'missing-model' },
      'en-US',
    );
    expect(missing.error_code).toBe('AI_MODEL_NOT_FOUND');
    expect(missing.error).toBe('AI model not found: missing-model');
    await expect(invoke('find_paragraph_by_keywords', {}, 'en-US')).rejects.toMatchObject({
      code: 'PARAGRAPH_KEYWORDS_REQUIRED',
    });
    await expect(
      invoke('batch_replace_translations', { replacement_text: 'Next' }, 'en-US'),
    ).rejects.toMatchObject({ code: 'REPLACEMENT_KEYWORDS_REQUIRED' });
  });

  for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
    it(`${locale} 缺段落与缺译文反馈固定code`, async () => {
      await fixture();
      const missing = await invoke('get_paragraph_info', { paragraph_id: 'missing' }, locale);
      expect(missing.error_code).toBe('PARAGRAPH_NOT_FOUND');
      const version = await invoke(
        'update_translation',
        { paragraph_id: '11111111', translation_id: 'missing', new_translation: 'Next' },
        locale,
      );
      expect(version.error_code).toBe('TRANSLATION_NOT_FOUND');
      if (locale === 'en-US') {
        expect(missing.error).not.toMatch(/\p{Script=Han}/u);
        expect(version.error).not.toMatch(/\p{Script=Han}/u);
      }
    });
    it(`${locale} 正则校验固定code并保留提供方细节`, async () => {
      await fixture();
      const result = await invoke('search_paragraphs_by_regex', { regex_pattern: '[' }, locale);
      expect(result.error_code).toBe('PARAGRAPH_REGEX_INVALID');
      if (locale === 'en-US') expect(result.error).not.toMatch(/\p{Script=Han}/u);
    });
  }
  for (const [name, args, expected] of [
    [
      'update_translation',
      { translation_id: 'en', new_translation: 'Dr. "A".' },
      'Translation updated',
    ],
    ['select_translation', { translation_id: 'en' }, 'Translation selected'],
    ['add_translation', { translation: 'User 原文 {x}|text' }, 'Translation added'],
    ['remove_translation', { translation_id: 'en' }, 'Translation removed'],
    [
      'batch_replace_translations',
      { keywords: ['English'], replacement_text: 'Updated' },
      'Replaced translations',
    ],
  ] as const) {
    it(`${name} 成功反馈英文，用户文本不转换`, async () => {
      await fixture();
      const result = await invoke(name, { paragraph_id: '11111111', ...args }, 'en-US');
      expect(result.success).toBe(true);
      expect(result.message).toContain(expected);
      if (name === 'add_translation') expect(result.translation).toBe('User 原文 {x}|text');
      if (name === 'update_translation') expect(result.new_translation).toBe('Dr. "A".');
    });
  }
  it('必填拒绝采用稳定code和英文异常说明', async () => {
    await fixture();
    await expect(invoke('get_paragraph_info', {}, 'en-US')).rejects.toMatchObject({
      code: 'PARAGRAPH_ID_REQUIRED',
      message: 'Paragraph ID is required',
    });
    await expect(
      invoke('get_paragraph_info', { paragraph_id: '11111111' }, 'en-US', ''),
    ).rejects.toMatchObject({ code: 'BOOK_ID_REQUIRED' });
  });
});
