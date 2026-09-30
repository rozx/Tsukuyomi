import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { bookTools } from '../services/ai/tools/book-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { getNameTranslation } from '../services/localization/selection';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
const tool = bookTools.find((entry) => entry.definition.function.name === 'update_chapter_title')!;
const context = {
  bookId: 'fixture-book',
  languages: captureExecutionLanguages('en-US'),
  aiModelId: 'fixture-model',
};
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const chapter = translationChapter('c', '11111111');
  chapter.title = {
    original: 'Original',
    translation: { id: 'cn', translation: 'CN title', aiModelId: '' },
  };
  return chapterTranslationFixture([chapter]);
}
describe('标题工具语言归属', () => {
  it('晚到英文标题保留简中、最新目标和最新正文，响应显示英文', async () => {
    const { books } = await setup();
    await books.updateBook('fixture-book', {
      targetLanguage: 'zh-TW',
      description: 'Latest description',
    });
    await BookService.editParagraphTranslations('fixture-book', 'c', 'zh-CN', [
      {
        type: 'append',
        paragraphId: '11111111',
        originalText: 'source 11111111',
        translation: { id: 'body', translation: 'Latest body', aiModelId: '' },
      },
    ]);
    const result = JSON.parse(
      await tool.handler(
        { chapter_id: 'c', title_translation: 'Dr. "Smith".', language: 'zh-CN' },
        context,
      ),
    );
    expect(result).toMatchObject({ success: true, new_title_translation: 'Dr. "Smith".' });
    const saved = (await BookService.getBookById('fixture-book'))!;
    const title = saved.volumes![0]!.chapters![0]!.title;
    expect(typeof title).toBe('object');
    if (typeof title === 'string') throw new Error('Missing title translations');
    expect(getNameTranslation(title, 'zh-CN')?.translation).toBe('CN title');
    expect(getNameTranslation(title, 'en-US')).toMatchObject({
      translation: 'Dr. "Smith".',
      aiModelId: 'fixture-model',
    });
    expect(getNameTranslation(title, 'zh-TW')).toBeUndefined();
    expect(saved).toMatchObject({ targetLanguage: 'zh-TW', description: 'Latest description' });
    expect(
      (await ChapterContentService.loadChapterContent('c'))![0]!.translations[0]!.translation,
    ).toBe('Latest body');
  });
  it('显式空译名只清空执行语言槽', async () => {
    const { books } = await setup();
    await books.editTitle('fixture-book', 'en-US', {
      kind: 'chapter',
      id: 'c',
      expectedOriginal: 'Original',
      translation: 'English',
    });
    const result = JSON.parse(
      await tool.handler({ chapter_id: 'c', title_translation: '' }, context),
    );
    expect(result.success).toBe(true);
    const title = (await BookService.getBookById('fixture-book'))!.volumes![0]!.chapters![0]!.title;
    if (typeof title === 'string') throw new Error('Missing title translations');
    expect(getNameTranslation(title, 'en-US')).toBeUndefined();
    expect(getNameTranslation(title, 'zh-CN')?.translation).toBe('CN title');
  });
});
