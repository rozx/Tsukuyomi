import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateText } from '../i18n/translate';
import './setup';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { bookTools } from '../services/ai/tools/book-tools';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { setNameTranslation } from '../services/localization/selection';
import { BookService } from '../services/book-service';
import { ChapterService } from '../services/chapter-service';
import { FullTextIndexService } from '../services/full-text-index-service';
import type { ToolContext } from '../services/ai/tools/types';
afterEach(() => vi.restoreAllMocks());

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
  for (const fallback of [false, true]) {
    it(`关键词交集过滤在最终数量限制前完成（索引失败=${fallback}）`, async () => {
      const chapter = translationChapter('intersection', '00000000');
      chapter.content = Array.from({ length: 3 }, (_, index) => ({
        id: index.toString(16).padStart(8, '0'),
        text: 'same source',
        translations: [
          { id: `cn-${index}`, language: 'zh-CN' as const, translation: 'wanted', aiModelId: '' },
          {
            id: `en-${index}`,
            language: 'en-US' as const,
            translation: index === 2 ? 'wanted' : 'other',
            aiModelId: '',
          },
        ],
        selectedTranslationId: `cn-${index}`,
        selectedTranslations: {
          'en-US': { value: `en-${index}`, revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
        },
      }));
      await chapterTranslationFixture([chapter]);
      if (fallback)
        vi.spyOn(FullTextIndexService, 'search').mockRejectedValue(
          new Error('fixture index unavailable'),
        );
      const tool = paragraphTools.find(
        (entry) => entry.definition.function.name === 'find_paragraph_by_keywords',
      )!;
      const result = JSON.parse(
        await tool.handler(
          {
            keywords: ['same'],
            translation_keywords: ['wanted'],
            include_memory: false,
            max_paragraphs: 1,
          },
          {
            bookId: 'fixture-book',
            languages: captureExecutionLanguages('en-US'),
          },
        ),
      );
      expect(result.count).toBe(1);
      expect(result.paragraphs[0].id).toBe('00000002');
    });
  }

  for (const original of [false, true]) {
    it(`关键词查询仅匹配执行目标译文（同时原文=${original}）`, async () => {
      await fixture();
      const tool = paragraphTools.find(
        (entry) => entry.definition.function.name === 'find_paragraph_by_keywords',
      )!;
      const context = { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') };
      const args = {
        ...(original ? { keywords: ['source'] } : {}),
        include_memory: false,
        max_paragraphs: 10,
      };
      const other = JSON.parse(
        await tool.handler({ ...args, translation_keywords: ['CN_BODY_SECRET'] }, context),
      );
      expect(other.count).toBe(0);
      const own = JSON.parse(
        await tool.handler({ ...args, translation_keywords: ['EN_BODY'] }, context),
      );
      expect(own.count).toBe(2);
      expect(JSON.stringify(own)).not.toContain('CN_BODY_SECRET');
    });
  }
  for (const fallback of [false, true]) {
    it(`原文关键词 only_with_translation 只认目标选用（索引失败=${fallback}）`, async () => {
      await fixture();
      if (fallback)
        vi.spyOn(FullTextIndexService, 'search').mockRejectedValue(
          new Error('fixture index unavailable'),
        );
      const tool = paragraphTools.find(
        (entry) => entry.definition.function.name === 'find_paragraph_by_keywords',
      )!;
      const result = JSON.parse(
        await tool.handler(
          {
            keywords: ['source'],
            only_with_translation: true,
            include_memory: false,
            max_paragraphs: 10,
          },
          {
            bookId: 'fixture-book',
            languages: captureExecutionLanguages('en-US', 'zh-TW'),
          },
        ),
      );
      expect(result.count).toBe(0);
    });
  }

  it('缺目标选用不会被匹配空串的译文正则命中', async () => {
    await fixture();
    const tool = paragraphTools.find(
      (entry) => entry.definition.function.name === 'search_paragraphs_by_regex',
    )!;
    const result = JSON.parse(
      await tool.handler(
        { regex_pattern: '^$', search_in_translation: true },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US', 'zh-TW'),
        },
      ),
    );
    expect(result.count).toBe(0);
  });
  it('未指定查询语言时保留旧空选用回退语义', async () => {
    const chapter = translationChapter('legacy', 'aabbccdd');
    chapter.content![0]!.translations = [
      { id: 'first', translation: 'Legacy fallback', aiModelId: '' },
      { id: 'empty', translation: '', aiModelId: '' },
    ];
    chapter.content![0]!.selectedTranslationId = 'empty';
    const { books } = await chapterTranslationFixture([chapter]);
    const result = await ChapterService.searchParagraphsByRegexAsync(
      books.getBookById('fixture-book'),
      'Legacy fallback',
      undefined,
      10,
      false,
      true,
    );
    expect(result).toHaveLength(1);
  });

  it('正则查询译文只匹配执行目标选用，不匹配其他语言', async () => {
    await fixture();
    const tool = paragraphTools.find(
      (entry) => entry.definition.function.name === 'search_paragraphs_by_regex',
    )!;
    const context = { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') };
    const other = JSON.parse(
      await tool.handler(
        { regex_pattern: 'CN_BODY_SECRET', search_in_translation: true, max_paragraphs: 10 },
        context,
      ),
    );
    expect(other.count).toBe(0);
    const own = JSON.parse(
      await tool.handler(
        { regex_pattern: 'EN_BODY', search_in_translation: true, max_paragraphs: 10 },
        context,
      ),
    );
    expect(own.count).toBe(2);
    expect(JSON.stringify(own)).not.toContain('CN_BODY_SECRET');
  });
  it('正则查询仅已译时缺目标选用不能借用简中完成度', async () => {
    await fixture();
    const tool = paragraphTools.find(
      (entry) => entry.definition.function.name === 'search_paragraphs_by_regex',
    )!;
    const result = JSON.parse(
      await tool.handler(
        { regex_pattern: 'source', only_with_translation: true, max_paragraphs: 10 },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US', 'zh-TW'),
        },
      ),
    );
    expect(result.count).toBe(0);
  });
  it('书籍元信息更新保留目标设置和译文槽，反馈使用执行语言', async () => {
    await fixture();
    const tool = bookTools.find((entry) => entry.definition.function.name === 'update_book_info')!;
    const actions: unknown[] = [];
    const result = JSON.parse(
      await tool.handler(
        {
          description: 'Shared user 中文',
          tags: ['raw'],
          author: 'Author',
          alternate_titles: ['原名'],
        },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US'),
          onAction: (action) => actions.push(action),
        },
      ),
    );
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^书籍信息已更新/);
    const book = (await BookService.getBookById('fixture-book'))!;
    expect(book).toMatchObject({
      targetLanguage: 'zh-CN',
      description: 'Shared user 中文',
      tags: ['raw'],
      author: 'Author',
      alternateTitles: ['原名'],
    });
    expect(actions).toHaveLength(1);
    const paragraph = book.volumes![0]!.chapters![0]!.content?.[0];
    if (paragraph) expect(paragraph.translations).toHaveLength(2);
  });

  it('书籍摘要缺目标标题时保留空译文字段', async () => {
    const { books } = await fixture();
    const book = books.getBookById('fixture-book')!;
    const volumes = (await BookService.getBookById(book.id))!.volumes;
    volumes![0]!.title = {
      original: 'Volume',
      translation: { id: 'volume-cn', translation: 'CN_VOLUME', aiModelId: '' },
    };
    await books.updateBook(book.id, { volumes });
    const tool = bookTools.find((entry) => entry.definition.function.name === 'get_book_info')!;
    const result = JSON.parse(
      await tool.handler(
        { include_memory: false },
        {
          bookId: book.id,
          languages: captureExecutionLanguages('en-US', 'zh-TW'),
        },
      ),
    );
    expect(result.book.structure[0]).toHaveProperty('translation', '');
    expect(result.book.structure[0].chapters[0]).toHaveProperty('translation', '');
  });
  for (const name of ['get_paragraph_info', 'get_translation_history'] as const) {
    it(`${name} 等待读取期间替换上下文也保留开始时目标`, async () => {
      await fixture();
      const original = ChapterService.findParagraphLocationAsync.bind(ChapterService);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      vi.spyOn(ChapterService, 'findParagraphLocationAsync').mockImplementation(async (...args) => {
        entered.resolve();
        await release.promise;
        return original(...args);
      });
      const context: ToolContext = {
        bookId: 'fixture-book',
        languages: captureExecutionLanguages('en-US'),
      };
      const tool = paragraphTools.find((entry) => entry.definition.function.name === name)!;
      const pending = tool.handler({ paragraph_id: '11111111', include_memory: false }, context);
      await entered.promise;
      context.languages = captureExecutionLanguages('zh-CN');
      release.resolve();
      const result = await pending;
      expect(result).toContain('EN_BODY');
      expect(result).not.toContain('CN_BODY_SECRET');
    });
  }

  it('书籍工具必填反馈带稳定 code 与执行语言', async () => {
    const tool = bookTools.find((entry) => entry.definition.function.name === 'get_book_info')!;
    const result = JSON.parse(
      await tool.handler({}, { languages: captureExecutionLanguages('en-US') }),
    );
    expect(result.error_code).toBe('BOOK_ID_REQUIRED');
    expect(result.error).toBe(translateText('zh-CN', 'aiEntityFeedback.bookRequired'));
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
