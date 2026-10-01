import { describe, expect, it } from 'vitest';
import './setup';
import { createTranslationTools } from '../services/ai/tools/translation-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { useAIProcessingStore } from '../stores/ai-processing';
import type { AppLocale } from '../models/locale';
const tool = createTranslationTools().find(
  (entry) => entry.definition.function.name === 'add_translation_batch',
)!;
async function submit(original: string, translation: string, target: AppLocale, existing = false) {
  const chapter = translationChapter('c', '11111111');
  chapter.content![0]!.text = original;
  if (existing) {
    chapter.content![0]!.translations = [
      { id: 'prior', translation, language: target, aiModelId: '' },
    ];
    chapter.content![0]!.selectedTranslations = {
      [target]: { value: 'prior', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    };
  }
  await chapterTranslationFixture([chapter]);
  const store = useAIProcessingStore();
  const taskId = await store.addTask({
    type: 'translation',
    modelName: 'Fixture',
    status: 'processing',
    workflowStatus: 'working',
    bookId: 'fixture-book',
    chapterId: 'c',
  });
  return JSON.parse(
    await tool.handler(
      {
        paragraphs: [
          {
            paragraph_id: '11111111',
            original_text_prefix: original.slice(0, 10),
            translated_text: translation,
          },
        ],
      },
      {
        bookId: 'fixture-book',
        taskId,
        aiModelId: 'fixture-model',
        aiProcessingStore: createAIProcessingStoreAdapter(store),
        languages: captureExecutionLanguages('en-US', target),
        enableOriginalTextValidation: true,
      },
    ),
  );
}
describe('目标语言批次校验', () => {
  it('英文 ASCII 双引号成对可承载日文对白，简繁保留现有规则', async () => {
    expect((await submit('「こんにちは」', '"Hello"', 'en-US')).success).toBe(true);
  });
  it('英文不平衡的 ASCII 双引号不能通过', async () => {
    expect((await submit('「こんにちは」', '"Hello', 'en-US')).success).toBe(false);
  });
  it('英文原文中的英寸符号原样提交时仍计为已处理', async () => {
    const result = await submit('He is 6" tall.', 'He is 6" tall.', 'en-US');
    expect(result.success).toBe(true);
    expect(result.processed_count).toBe(1);
  });
  it('无对白的原文翻译为英文时，英寸符号不会被当成缺失引号', async () => {
    expect((await submit('長さは六インチだ。', 'It is 6" long.', 'en-US')).success).toBe(true);
  });
  it('不同类型的原文对白不能重复使用弯引号和 ASCII 引号', async () => {
    const result = await submit('「一」「二」『三』', '“One” and "two"; three', 'en-US');
    expect(result.success).toBe(false);
    expect(result.accepted_paragraphs ?? []).toEqual([]);
  });
  it('弯单引号与弯双引号的合法组合应按可用类型分配', async () => {
    expect(
      (await submit('「こんにちは」“さようなら”', '‘Hello’ and “goodbye”', 'en-US')).success,
    ).toBe(true);
  });
  it('不同类型的原文对白不能共用一对 ASCII 引号', async () => {
    const result = await submit('「こんにちは」と『さようなら』', '"Hello", and goodbye', 'en-US');
    expect(result.success).toBe(false);
    expect(result.accepted_paragraphs ?? []).toEqual([]);
  });
  it('足够的 ASCII 引号对可保留不同类型的原文对白', async () => {
    expect(
      (await submit('「こんにちは」と『さようなら』', '"Hello", and "goodbye"', 'en-US')).success,
    ).toBe(true);
  });
  it('重复当前选用的原样英文仍计为已处理，无遗漏翻译或改写警告', async () => {
    const result = await submit('Already English.', 'Already English.', 'en-US', true);
    expect(result.success).toBe(true);
    expect(result.processed_count).toBe(1);
    expect(result.accepted_paragraphs).toEqual([
      { paragraph_id: '11111111', translated_text: 'Already English.' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/检查翻译完整性|遗漏|请不要提交|please.*rewrite/i);
  });
});
