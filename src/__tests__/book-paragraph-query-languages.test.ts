import { describe, expect, it } from 'vitest';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { bookTools } from '../services/ai/tools/book-tools';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { setNameTranslation } from '../services/localization/selection';
import { BookService } from '../services/book-service';

async function fixture() {
  const chapter = translationChapter('c', '11111111');
  chapter.title = setNameTranslation(
    {
      original: 'Source title',
      translation: { id: 'cn-title', translation: 'CN_TITLE_SECRET', aiModelId: '' },
    },
    'en-US',
    {
      id: 'en-title',
      translation: 'EN_TITLE',
      aiModelId: '',
    },
    { counter: 20, actorId: 'a' },
    0,
  );
  const paragraph = chapter.content![0]!;
  paragraph.translations = [
    { id: 'cn', language: 'zh-CN', translation: 'CN_BODY_SECRET', aiModelId: '' },
    { id: 'en', language: 'en-US', translation: 'EN_BODY', aiModelId: '' },
  ];
  paragraph.selectedTranslationId = 'cn';
  paragraph.selectedTranslations = {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  };
  const adjacent = structuredClone(chapter);
  adjacent.id = 'c2';
  adjacent.content![0]!.id = '22222222';
  const result = await chapterTranslationFixture([chapter, adjacent]);
  await result.books.updateBook('fixture-book', { targetLanguage: 'zh-CN' });
  return result;
}
describe('书籍和段落查询只自动提供目标成果', () => {
  it('书籍工具必填反馈带稳定 code 与执行语言', async () => {
    const tool = bookTools.find((entry) => entry.definition.function.name === 'get_book_info')!;
    const result = JSON.parse(
      await tool.handler({}, { languages: captureExecutionLanguages('en-US') }),
    );
    expect(result.error_code).toBe('BOOK_ID_REQUIRED');
    expect(result.error).toBe('Book ID is required');
  });
  it('缺失繁中成果时章节回原文、完成数为零，不借用其他语言', async () => {
    await fixture();
    const tool = bookTools.find((entry) => entry.definition.function.name === 'get_chapter_info')!;
    const result = JSON.parse(
      await tool.handler(
        { chapter_id: 'c', include_memory: false },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US', 'zh-TW'),
        },
      ),
    );
    expect(result.chapter.title).toBe('Source title');
    expect(result.chapter.title_translation).toBe('');
    expect(result.chapter.translatedCount).toBe(0);
    expect(result.chapter.paragraphs[0].translation).toBe('');
    expect(result.chapter.paragraphs[0].translationCount).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/CN_TITLE_SECRET|CN_BODY_SECRET|EN_TITLE|EN_BODY/);
  });
  it('缺失目标历史时空选用和空历史，不选用任意首个版本', async () => {
    await fixture();
    const tool = paragraphTools.find(
      (entry) => entry.definition.function.name === 'get_translation_history',
    )!;
    const result = JSON.parse(
      await tool.handler(
        { paragraph_id: '11111111', include_memory: false },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US', 'zh-TW'),
        },
      ),
    );
    expect(result.selected_translation_id).toBe('');
    expect(result.translation_history).toEqual([]);
    expect(result.total_count).toBe(0);
  });
  for (const name of ['get_book_info', 'list_chapters', 'get_chapter_info'] as const) {
    it(`${name} 英文执行读取英文标题/内容而非书籍当前目标`, async () => {
      await fixture();
      const tool = bookTools.find((entry) => entry.definition.function.name === name)!;
      const result = await tool.handler(
        { chapter_id: 'c', include_memory: false },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US'),
        },
      );
      expect(result).not.toMatch(/CN_TITLE_SECRET|CN_BODY_SECRET/);
      expect(result).toContain('EN_TITLE');
      if (name === 'get_chapter_info') expect(result).toContain('EN_BODY');
      expect((await BookService.getBookById('fixture-book'))!.targetLanguage).toBe('zh-CN');
    });
  }
  for (const [name, id] of [
    ['get_next_chapter', 'c'],
    ['get_previous_chapter', 'c2'],
  ] as const) {
    it(`${name} 相邻章节内容与标题采用执行目标`, async () => {
      await fixture();
      const tool = bookTools.find((entry) => entry.definition.function.name === name)!;
      const result = await tool.handler(
        { chapter_id: id, include_memory: false },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US'),
        },
      );
      expect(result).not.toMatch(/CN_TITLE_SECRET|CN_BODY_SECRET/);
      expect(result).toContain('EN_TITLE');
    });
  }
  it('分卷列表返回目标章节标题', async () => {
    await fixture();
    const tool = bookTools.find(
      (entry) => entry.definition.function.name === 'list_chapters_by_volume',
    )!;
    const result = await tool.handler(
      { volume_ids: ['fixture-volume'] },
      {
        bookId: 'fixture-book',
        languages: captureExecutionLanguages('en-US'),
      },
    );
    expect(result).toContain('EN_TITLE');
    expect(result).not.toContain('CN_TITLE_SECRET');
  });
  for (const name of ['get_paragraph_info', 'get_translation_history'] as const) {
    it(`${name} 返回目标选用和目标历史`, async () => {
      await fixture();
      const tool = paragraphTools.find((entry) => entry.definition.function.name === name)!;
      const result = JSON.parse(
        await tool.handler(
          { paragraph_id: '11111111', include_memory: false },
          {
            bookId: 'fixture-book',
            languages: captureExecutionLanguages('en-US'),
          },
        ),
      );
      expect(JSON.stringify(result)).not.toMatch(/CN_TITLE_SECRET|CN_BODY_SECRET/);
      expect(JSON.stringify(result)).toContain('EN_BODY');
      expect(result.paragraph?.selectedTranslationId ?? result.selected_translation_id).toBe('en');
    });
  }
});
