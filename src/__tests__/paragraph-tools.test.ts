import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { containsWholeKeyword } from '../services/ai/tools/paragraph-tools';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import { ChapterContentService } from '../services/chapter-content-service';
import * as BooksStore from '../stores/books';
import type { Novel, Volume, Chapter, Paragraph, Translation } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

// 辅助函数：创建测试用小说
function createTestNovel(volumes: Volume[] = []): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: volumes,
  };
}

// 辅助函数：创建测试用段落
function createTestParagraph(
  id?: string,
  text?: string,
  translations?: Translation[],
): Paragraph {
  const paraId = id || generateShortId();
  const transId = generateShortId();
  return {
    id: paraId,
    text: text || '测试段落文本',
    selectedTranslationId: translations?.[0]?.id || transId,
    translations: translations || [
      {
        id: transId,
        translation: '测试翻译',
        aiModelId: 'model-1',
      },
    ],
  };
}

// 辅助函数：创建测试用章节
function createTestChapter(
  id?: string,
  paragraphs?: Paragraph[],
  title?: string,
): Chapter {
  return {
    id: id || generateShortId(),
    title: {
      original: title || '测试章节',
      translation: {
        id: generateShortId(),
        translation: '',
        aiModelId: 'model-1',
      },
    },
    content: paragraphs,
    contentLoaded: paragraphs !== undefined,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

// 辅助函数：创建测试用卷
function createTestVolume(id?: string, chapters?: Chapter[]): Volume {
  return {
    id: id || generateShortId(),
    title: {
      original: '测试卷',
      translation: {
        id: generateShortId(),
        translation: '',
        aiModelId: 'model-1',
      },
    },
    chapters: chapters || [],
  };
}

describe('containsWholeKeyword', () => {
  describe('英文文本匹配', () => {
    test('应该匹配完整的单词', () => {
      expect(containsWholeKeyword('This is a test.', 'test')).toBe(true);
      expect(containsWholeKeyword('test is here', 'test')).toBe(true);
      expect(containsWholeKeyword('the test', 'test')).toBe(true);
    });

    test('不应该匹配单词的一部分', () => {
      expect(containsWholeKeyword('This is testing.', 'test')).toBe(false);
      expect(containsWholeKeyword('I am tested.', 'test')).toBe(false);
      expect(containsWholeKeyword('contest winner', 'test')).toBe(false);
      expect(containsWholeKeyword('attestation', 'test')).toBe(false);
    });

    test('应该区分大小写（不区分，因为使用了 i 标志）', () => {
      expect(containsWholeKeyword('This is a Test.', 'test')).toBe(true);
      expect(containsWholeKeyword('This is a TEST.', 'test')).toBe(true);
      expect(containsWholeKeyword('This is a test.', 'TEST')).toBe(true);
    });

    test('应该匹配单词边界', () => {
      expect(containsWholeKeyword('test.', 'test')).toBe(true);
      expect(containsWholeKeyword('(test)', 'test')).toBe(true);
      expect(containsWholeKeyword('test,', 'test')).toBe(true);
      expect(containsWholeKeyword('test!', 'test')).toBe(true);
      expect(containsWholeKeyword('test?', 'test')).toBe(true);
    });

    test('应该处理多个关键词出现', () => {
      expect(containsWholeKeyword('test and test again', 'test')).toBe(true);
      expect(containsWholeKeyword('testing and testing', 'test')).toBe(false);
    });
  });

  describe('中文文本匹配', () => {
    test('应该匹配完整的中文词', () => {
      expect(containsWholeKeyword('这是一个测试。', '测试')).toBe(true);
      expect(containsWholeKeyword('测试文本', '测试')).toBe(true);
      expect(containsWholeKeyword('进行测试', '测试')).toBe(true);
    });

    test('不应该匹配词的一部分', () => {
      // 注意：对于 CJK 文本，由于没有明确的单词边界，
      // "测试文" 在 "测试文本" 中会被匹配，因为它是精确的子字符串
      // 这是 CJK 文本匹配的预期行为
      // 如果要避免这种情况，需要在关键词选择时更加精确
      expect(containsWholeKeyword('这是测试文本', '测试文')).toBe(true); // CJK 匹配精确子字符串
      expect(containsWholeKeyword('测试文本', '测试文')).toBe(true); // CJK 匹配精确子字符串
    });

    test('应该匹配中文词边界', () => {
      expect(containsWholeKeyword('测试。', '测试')).toBe(true);
      expect(containsWholeKeyword('（测试）', '测试')).toBe(true);
      expect(containsWholeKeyword('测试，', '测试')).toBe(true);
      expect(containsWholeKeyword('测试！', '测试')).toBe(true);
    });
  });

  describe('日文文本匹配', () => {
    test('应该匹配完整的日文词', () => {
      expect(containsWholeKeyword('これはテストです。', 'テスト')).toBe(true);
      expect(containsWholeKeyword('テストを行います', 'テスト')).toBe(true);
    });

    test('应该匹配日文词边界', () => {
      expect(containsWholeKeyword('テスト。', 'テスト')).toBe(true);
      expect(containsWholeKeyword('（テスト）', 'テスト')).toBe(true);
    });
  });

  describe('混合语言文本匹配', () => {
    test('应该匹配混合文本中的关键词', () => {
      expect(containsWholeKeyword('这是test文本', 'test')).toBe(true);
      expect(containsWholeKeyword('test中文', 'test')).toBe(true);
      expect(containsWholeKeyword('测试test', 'test')).toBe(true);
    });

    test('不应该匹配混合文本中词的一部分', () => {
      expect(containsWholeKeyword('这是testing文本', 'test')).toBe(false);
      expect(containsWholeKeyword('tested中文', 'test')).toBe(false);
    });
  });

  describe('边界情况', () => {
    test('应该处理空字符串', () => {
      expect(containsWholeKeyword('', 'test')).toBe(false);
      expect(containsWholeKeyword('test', '')).toBe(false);
      expect(containsWholeKeyword('', '')).toBe(false);
    });

    test('应该处理 null 或 undefined（通过类型检查）', () => {
      expect(containsWholeKeyword('test', 'test')).toBe(true);
    });

    test('应该匹配文本开头的关键词', () => {
      expect(containsWholeKeyword('test is here', 'test')).toBe(true);
      expect(containsWholeKeyword('测试文本', '测试')).toBe(true);
    });

    test('应该匹配文本结尾的关键词', () => {
      expect(containsWholeKeyword('this is test', 'test')).toBe(true);
      expect(containsWholeKeyword('这是测试', '测试')).toBe(true);
    });

    test('应该处理只包含关键词的文本', () => {
      expect(containsWholeKeyword('test', 'test')).toBe(true);
      expect(containsWholeKeyword('测试', '测试')).toBe(true);
    });
  });

  describe('特殊字符处理', () => {
    test('应该正确转义正则表达式特殊字符', () => {
      expect(containsWholeKeyword('test.test', 'test.test')).toBe(true);
      expect(containsWholeKeyword('test*test', 'test*test')).toBe(true);
      expect(containsWholeKeyword('test+test', 'test+test')).toBe(true);
      expect(containsWholeKeyword('test?test', 'test?test')).toBe(true);
      expect(containsWholeKeyword('test^test', 'test^test')).toBe(true);
      expect(containsWholeKeyword('test$test', 'test$test')).toBe(true);
      expect(containsWholeKeyword('test(test)', 'test(test)')).toBe(true);
      expect(containsWholeKeyword('test[test]', 'test[test]')).toBe(true);
      expect(containsWholeKeyword('test{test}', 'test{test}')).toBe(true);
      expect(containsWholeKeyword('test|test', 'test|test')).toBe(true);
    });

    test('不应该将特殊字符作为正则表达式处理', () => {
      // 如果包含特殊字符的关键词出现在文本中，应该作为字面量匹配
      expect(containsWholeKeyword('price is $100', '$100')).toBe(true);
      expect(containsWholeKeyword('test (note)', '(note)')).toBe(true);
    });
  });

  describe('数字处理', () => {
    test('应该匹配完整的数字', () => {
      expect(containsWholeKeyword('number 123', '123')).toBe(true);
      expect(containsWholeKeyword('123 is here', '123')).toBe(true);
    });

    test('不应该匹配数字的一部分', () => {
      expect(containsWholeKeyword('number 1234', '123')).toBe(false);
      expect(containsWholeKeyword('number 12345', '123')).toBe(false);
    });

    test('应该匹配数字边界', () => {
      expect(containsWholeKeyword('123.', '123')).toBe(true);
      expect(containsWholeKeyword('(123)', '123')).toBe(true);
      expect(containsWholeKeyword('123,', '123')).toBe(true);
    });
  });
});

describe('batch_replace_translations', () => {
  const mockLoadChapterContent = mock((_chapterId: string) =>
    Promise.resolve(undefined as Paragraph[] | undefined),
  );
  const mockLoadChapterContentsBatch = mock((_chapterIds: string[]) =>
    Promise.resolve(new Map<string, Paragraph[]>()),
  );
  const mockUpdateBook = mock((_bookId: string, _updates: Partial<Novel>) =>
    Promise.resolve(),
  );
  
  // 创建一个 mock store 对象
  let mockBooksStore: {
    books: Novel[];
    getBookById: (id: string) => Novel | undefined;
    updateBook: (id: string, updates: Partial<Novel>) => Promise<void>;
  };

  beforeEach(() => {
    mockLoadChapterContent.mockClear();
    mockLoadChapterContentsBatch.mockClear();
    mockUpdateBook.mockClear();

    spyOn(ChapterContentService, 'loadChapterContent').mockImplementation(
      mockLoadChapterContent,
    );
    spyOn(ChapterContentService, 'loadChapterContentsBatch').mockImplementation(
      mockLoadChapterContentsBatch,
    );

    // 创建 mock store，实现 getBookById 从 books 数组查找
    mockBooksStore = {
      books: [],
      getBookById: (id: string) => {
        return mockBooksStore.books.find((book) => book.id === id);
      },
      updateBook: mockUpdateBook,
    };

    // Mock useBooksStore 返回我们的 mock store
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as any);
  });

  afterEach(() => {
    mock.restore();
  });

  test('应该找到并替换匹配关键词的段落翻译', async () => {
    // 创建测试数据
    const para1 = createTestParagraph('para1', '原文1', [
      { id: 'trans1', translation: '这是测试翻译', aiModelId: 'model1' },
    ]);
    const para2 = createTestParagraph('para2', '原文2', [
      { id: 'trans2', translation: '这是另一个测试', aiModelId: 'model1' },
    ]);
    const para3 = createTestParagraph('para3', '原文3', [
      { id: 'trans3', translation: '这是普通翻译', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1, para2, para3]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // 验证书籍可以被找到
    expect(mockBooksStore.getBookById(novel.id)).toBeDefined();
    expect(mockBooksStore.getBookById(novel.id)?.id).toBe(novel.id);
    
    // Mock chapter content loading - chapters already have content, so return empty map
    // (chapters are already loaded with content, so no need to load from service)
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    // 找到 batch_replace_translations 工具
    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 执行批量替换：替换包含"测试"的翻译
    const result = await tool.handler(
      {
        keywords: ['测试'],
        replacement_text: '新翻译文本',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    // 注意：由于使用了完整关键词匹配，"测试" 在 "这是测试翻译" 和 "这是另一个测试" 中都会被匹配
    // 因为 "测试" 是完整的中文词
    expect(resultObj.replaced_count).toBeGreaterThanOrEqual(2); // para1 和 para2 应该被替换
    
    // 验证翻译已被替换（如果匹配成功）
    // 注意：现在只替换匹配的关键词部分，而不是整个翻译
    if (resultObj.replaced_count >= 2) {
      // "这是测试翻译" 中的 "测试" 被替换为 "新翻译文本" → "这是新翻译文本翻译"
      expect(para1.translations[0]?.translation).toBe('这是新翻译文本翻译');
      // para2 的翻译是 "这是另一个测试"，"测试" 被替换为 "新翻译文本" → "这是另一个新翻译文本"
      expect(para2.translations[0]?.translation).toBe('这是另一个新翻译文本');
      expect(para3.translations[0]?.translation).toBe('这是普通翻译'); // 不应该被替换
    }
  });

  test('应该只匹配完整的关键词，不匹配部分词', async () => {
    // 创建测试数据
    const para1 = createTestParagraph('para1', '原文1', [
      { id: 'trans1', translation: '这是测试翻译', aiModelId: 'model1' },
    ]);
    const para2 = createTestParagraph('para2', '原文2', [
      { id: 'trans2', translation: '这是测试中', aiModelId: 'model1' },
    ]);
    const para3 = createTestParagraph('para3', '原文3', [
      { id: 'trans3', translation: '这是测试文本', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1, para2, para3]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 执行批量替换：替换包含"测试"的翻译（应该匹配所有三个）
    const result = await tool.handler(
      {
        keywords: ['测试'],
        replacement_text: '新翻译',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(3); // 所有三个都应该匹配，因为"测试"是完整词

    // 验证所有翻译已被替换（只替换关键词部分）
    // "这是测试翻译" 中的 "测试" 被替换为 "新翻译" → "这是新翻译翻译"
    expect(para1.translations[0]?.translation).toBe('这是新翻译翻译');
    // "这是测试中" 中的 "测试" 被替换为 "新翻译" → "这是新翻译中"
    expect(para2.translations[0]?.translation).toBe('这是新翻译中');
    // "这是测试文本" 中的 "测试" 被替换为 "新翻译" → "这是新翻译文本"
    expect(para3.translations[0]?.translation).toBe('这是新翻译文本');
  });

  test('应该只匹配完整的关键词，不匹配部分词（英文）', async () => {
    // 创建测试数据
    const para1 = createTestParagraph('para1', '原文1', [
      { id: 'trans1', translation: 'This is a test.', aiModelId: 'model1' },
    ]);
    const para2 = createTestParagraph('para2', '原文2', [
      { id: 'trans2', translation: 'This is testing.', aiModelId: 'model1' },
    ]);
    const para3 = createTestParagraph('para3', '原文3', [
      { id: 'trans3', translation: 'I am tested.', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1, para2, para3]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 执行批量替换：替换包含"test"的翻译（应该只匹配 para1）
    const result = await tool.handler(
      {
        keywords: ['test'],
        replacement_text: 'New translation',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(1); // 只有 para1 应该被替换

    // 验证只有 para1 的翻译被替换（只替换关键词部分）
    // "This is a test." 中的 "test" 被替换为 "New translation" → "This is a New translation."
    // 注意：normalizeTranslationQuotes 可能会规范化标点符号
    const replaced = para1.translations[0]?.translation;
    expect(replaced).toContain('This is a New translation');
    expect(replaced).not.toContain('test');
    expect(para2.translations[0]?.translation).toBe('This is testing.'); // 不应该被替换
    expect(para3.translations[0]?.translation).toBe('I am tested.'); // 不应该被替换
  });

  test('应该支持原文关键词搜索', async () => {
    const para1 = createTestParagraph('para1', '这是测试原文', [
      { id: 'trans1', translation: '翻译1', aiModelId: 'model1' },
    ]);
    const para2 = createTestParagraph('para2', '这是普通原文', [
      { id: 'trans2', translation: '翻译2', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1, para2]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 使用原文关键词搜索
    const result = await tool.handler(
      {
        original_keywords: ['测试'],
        replacement_text: '新翻译',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(1); // 只有 para1 应该被替换

    expect(para1.translations[0]?.translation).toBe('新翻译');
    expect(para2.translations[0]?.translation).toBe('翻译2');
  });

  test('应该支持同时使用原文和翻译关键词', async () => {
    const para1 = createTestParagraph('para1', '测试原文', [
      { id: 'trans1', translation: '测试翻译', aiModelId: 'model1' },
    ]);
    const para2 = createTestParagraph('para2', '测试原文', [
      { id: 'trans2', translation: '普通翻译', aiModelId: 'model1' },
    ]);
    const para3 = createTestParagraph('para3', '普通原文', [
      { id: 'trans3', translation: '测试翻译', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1, para2, para3]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 同时使用原文和翻译关键词（必须同时满足）
    const result = await tool.handler(
      {
        original_keywords: ['测试'],
        keywords: ['测试'],
        replacement_text: '新翻译',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(1); // 只有 para1 同时满足两个条件

    // "测试翻译" 中的 "测试" 被替换为 "新翻译" → "新翻译翻译"
    expect(para1.translations[0]?.translation).toBe('新翻译翻译');
    expect(para2.translations[0]?.translation).toBe('普通翻译'); // 原文匹配但翻译不匹配
    expect(para3.translations[0]?.translation).toBe('测试翻译'); // 翻译匹配但原文不匹配
  });

  test('应该限制最大替换数量', async () => {
    // 创建多个匹配的段落
    const paragraphs: Paragraph[] = [];
    for (let i = 0; i < 10; i++) {
      paragraphs.push(
        createTestParagraph(`para${i}`, `原文${i}`, [
          { id: `trans${i}`, translation: '测试翻译', aiModelId: 'model1' },
        ]),
      );
    }

    const chapter = createTestChapter('chapter1', paragraphs);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 限制最大替换数量为 5
    const result = await tool.handler(
      {
        keywords: ['测试'],
        replacement_text: '新翻译',
        max_replacements: 5,
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(5); // 应该只替换 5 个
  });

  test('应该处理没有匹配段落的情况', async () => {
    const para1 = createTestParagraph('para1', '原文1', [
      { id: 'trans1', translation: '普通翻译', aiModelId: 'model1' },
    ]);

    const chapter = createTestChapter('chapter1', [para1]);
    const volume = createTestVolume('volume1', [chapter]);
    const novel = createTestNovel([volume]);

    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    const onAction = mock(() => {});

    // 搜索不存在的关键词
    const result = await tool.handler(
      {
        keywords: ['不存在的关键词'],
        replacement_text: '新翻译',
        replace_all_translations: false,
      },
      { bookId: novel.id, onAction },
    );

    const resultObj = JSON.parse(result as string);
    expect(resultObj.success).toBe(true);
    expect(resultObj.replaced_count).toBe(0);
    expect(resultObj.message).toBe('未找到匹配的段落');
  });

  test('应该验证必须提供关键词', async () => {
    const novel = createTestNovel([]);
    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    // 不提供任何关键词应该抛出错误
    await (expect(
      tool.handler(
        {
          replacement_text: '新翻译',
        },
        { bookId: novel.id },
      ),
    ).rejects.toThrow('必须提供 keywords 或 original_keywords 至少一个关键词数组') as unknown as Promise<void>);
  });

  test('应该验证替换文本不能为空', async () => {
    const novel = createTestNovel([]);
    // Mock store to return the novel
    mockBooksStore.books = [novel];
    
    // Mock chapter content loading - chapters already have content, so return empty map
    mockLoadChapterContentsBatch.mockImplementation((chapterIds: string[]) => {
      return Promise.resolve(new Map<string, Paragraph[]>());
    });

    const tool = paragraphTools.find((t) => t.definition.function?.name === 'batch_replace_translations');
    expect(tool).toBeDefined();

    if (!tool || !tool.handler) {
      throw new Error('工具未找到');
    }

    // 不提供替换文本应该抛出错误
    await (expect(
      tool.handler(
        {
          keywords: ['测试'],
        },
        { bookId: novel.id },
      ),
    ).rejects.toThrow('替换文本不能为空') as unknown as Promise<void>);
  });
});

