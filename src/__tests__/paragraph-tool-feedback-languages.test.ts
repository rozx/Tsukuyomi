import { describe, expect, it } from 'vitest';
import { agentText } from '../i18n/translate';
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
  it('返回给模型的未知模型标签及模型校验为简中单源，关键词缺省保持固定code', async () => {
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
    expect(history.translation_history[0].aiModelName).toBe(
      agentText('aiParagraphFeedback.unknownModel'),
    );
    const missing = await invoke(
      'add_translation',
      { paragraph_id: '11111111', translation: 'New', ai_model_id: 'missing-model' },
      'en-US',
    );
    expect(missing.error_code).toBe('AI_MODEL_NOT_FOUND');
    expect(missing.error).toBe(
      agentText('aiParagraphFeedback.modelMissing', { id: 'missing-model' }),
    );
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
      // 说明为简中单源，与执行语言无关
      expect(missing.error).toMatch(/^段落不存在/);
      expect(version.error).toMatch(/\p{Script=Han}/u);
    });
    it(`${locale} 正则校验固定code并保留提供方细节`, async () => {
      await fixture();
      const result = await invoke('search_paragraphs_by_regex', { regex_pattern: '[' }, locale);
      expect(result.error_code).toBe('PARAGRAPH_REGEX_INVALID');
      expect(result.error).toMatch(/^无效的正则表达式模式/);
    });
  }
  for (const [name, args, expected] of [
    ['update_translation', { translation_id: 'en', new_translation: 'Dr. "A".' }, '翻译已更新'],
    ['select_translation', { translation_id: 'en' }, '翻译已选择'],
    ['add_translation', { translation: 'User 原文 {x}|text' }, '翻译已添加'],
    ['remove_translation', { translation_id: 'en' }, '翻译已删除'],
    [
      'batch_replace_translations',
      { keywords: ['English'], replacement_text: 'Updated' },
      '成功替换 1 个段落的翻译',
    ],
  ] as const) {
    it(`${name} 英文执行的成功反馈为简中单源，用户文本不转换`, async () => {
      await fixture();
      const result = await invoke(name, { paragraph_id: '11111111', ...args }, 'en-US');
      expect(result.success).toBe(true);
      expect(result.message).toContain(expected);
      if (name === 'add_translation') expect(result.translation).toBe('User 原文 {x}|text');
      if (name === 'update_translation') expect(result.new_translation).toBe('Dr. "A".');
    });
  }
  it('必填拒绝采用稳定code，说明为简中单源', async () => {
    await fixture();
    await expect(invoke('get_paragraph_info', {}, 'en-US')).rejects.toMatchObject({
      code: 'PARAGRAPH_ID_REQUIRED',
      message: agentText('aiParagraphFeedback.paragraphRequired'),
    });
    await expect(
      invoke('get_paragraph_info', { paragraph_id: '11111111' }, 'en-US', ''),
    ).rejects.toMatchObject({ code: 'BOOK_ID_REQUIRED' });
  });
});
