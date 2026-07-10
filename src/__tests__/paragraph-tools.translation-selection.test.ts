import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { paragraphTools } from '../services/ai/tools/paragraph-tools';
import * as BooksStore from '../stores/books';
import * as AIModelsStore from '../stores/ai-models';
import type { Novel, Volume, Chapter, Paragraph, Translation } from '../models/novel';
import type { ActionInfo } from '../services/ai/tools/types';

/**
 * 回归测试：
 * 1. add_translation 在 5 条上限逐出当前选中翻译时，selectedTranslationId 不得悬空；
 * 2. select_translation 是写操作，必须上报 type: 'update' 的 action（带 previousData），
 *    且校验失败时不得上报 action。
 */

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
function createTestParagraph(id: string, text: string, translations: Translation[]): Paragraph {
  return {
    id,
    text,
    selectedTranslationId: translations[0]?.id || '',
    translations,
  };
}

// 辅助函数：创建测试用章节
function createTestChapter(id: string, paragraphs: Paragraph[]): Chapter {
  return {
    id,
    title: {
      original: '测试章节',
      translation: { id: 'title-trans', translation: '', aiModelId: 'model-1' },
    },
    content: paragraphs,
    contentLoaded: true,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

// 辅助函数：创建测试用卷
function createTestVolume(id: string, chapters: Chapter[]): Volume {
  return {
    id,
    title: {
      original: '测试卷',
      translation: { id: 'vol-title-trans', translation: '', aiModelId: 'model-1' },
    },
    chapters,
  };
}

// 辅助函数：构造 n 条翻译
function makeTranslations(count: number): Translation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `trans-${i + 1}`,
    translation: `翻译版本 ${i + 1}`,
    aiModelId: 'model-1',
  }));
}

const mockUpdateBook = mock((_bookId: string, _updates: Partial<Novel>) => Promise.resolve());

const mockBooksStore: {
  books: Novel[];
  getBookById: (id: string) => Novel | undefined;
  updateBook: (id: string, updates: Partial<Novel>) => Promise<void>;
} = {
  books: [],
  getBookById: (id: string) => mockBooksStore.books.find((book) => book.id === id),
  updateBook: mockUpdateBook,
};

const mockUseAIModelsStore = mock(() => ({
  getModelById: mock((id: string) => ({
    id,
    name: `Model ${id}`,
    provider: 'openai',
    model: 'gpt-4',
  })),
  getDefaultModelForTask: mock(() => ({ id: 'model-default', name: '默认模型' })),
}));

function getTool(name: string) {
  const tool = paragraphTools.find((t) => t.definition.function?.name === name);
  if (!tool) throw new Error(`工具未找到: ${name}`);
  return tool;
}

describe('add_translation 选中翻译被 5 条上限逐出', () => {
  beforeEach(() => {
    mockUpdateBook.mockClear();
    mockBooksStore.books = [];
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as never);
    spyOn(AIModelsStore, 'useAIModelsStore').mockImplementation(mockUseAIModelsStore as never);
  });

  afterEach(() => {
    mock.restore();
  });

  test('set_as_selected=false 且选中翻译被逐出时，应改选新添加的翻译', async () => {
    const translations = makeTranslations(5);
    const para = createTestParagraph('para1', '原文段落', translations);
    // 选中最旧的一条（数组开头，将被 5 条上限逐出）
    para.selectedTranslationId = 'trans-1';
    const novel = createTestNovel([createTestVolume('vol1', [createTestChapter('ch1', [para])])]);
    mockBooksStore.books = [novel];

    const tool = getTool('add_translation');
    const result = await tool.handler(
      { paragraph_id: 'para1', translation: '第六条翻译', set_as_selected: false },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(para.translations.length).toBe(5);
    // trans-1 已被逐出
    expect(para.translations.some((t) => t.id === 'trans-1')).toBe(false);
    // 选中 ID 不得悬空，应落到新添加的翻译上
    expect(para.selectedTranslationId).toBe(resultObj.translation_id);
    expect(para.translations.some((t) => t.id === para.selectedTranslationId)).toBe(true);
  });

  test('set_as_selected=false 且选中翻译未被逐出时，应保持原选中不变', async () => {
    const translations = makeTranslations(4);
    const para = createTestParagraph('para1', '原文段落', translations);
    para.selectedTranslationId = 'trans-2';
    const novel = createTestNovel([createTestVolume('vol1', [createTestChapter('ch1', [para])])]);
    mockBooksStore.books = [novel];

    const tool = getTool('add_translation');
    const result = await tool.handler(
      { paragraph_id: 'para1', translation: '第五条翻译', set_as_selected: false },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(para.selectedTranslationId).toBe('trans-2');
  });

  test('set_as_selected=true 时新翻译直接成为选中翻译', async () => {
    const translations = makeTranslations(5);
    const para = createTestParagraph('para1', '原文段落', translations);
    para.selectedTranslationId = 'trans-1';
    const novel = createTestNovel([createTestVolume('vol1', [createTestChapter('ch1', [para])])]);
    mockBooksStore.books = [novel];

    const tool = getTool('add_translation');
    const result = await tool.handler(
      { paragraph_id: 'para1', translation: '第六条翻译', set_as_selected: true },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(para.selectedTranslationId).toBe(resultObj.translation_id);
  });
});

describe('select_translation action 上报', () => {
  beforeEach(() => {
    mockUpdateBook.mockClear();
    mockBooksStore.books = [];
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as never);
    spyOn(AIModelsStore, 'useAIModelsStore').mockImplementation(mockUseAIModelsStore as never);
  });

  afterEach(() => {
    mock.restore();
  });

  test('成功选择翻译时应上报 update 类型 action，并携带 previousData', async () => {
    const translations = makeTranslations(3);
    const para = createTestParagraph('para1', '原文段落', translations);
    para.selectedTranslationId = 'trans-1';
    const novel = createTestNovel([createTestVolume('vol1', [createTestChapter('ch1', [para])])]);
    mockBooksStore.books = [novel];

    const actions: ActionInfo[] = [];
    const tool = getTool('select_translation');
    const result = await tool.handler(
      { paragraph_id: 'para1', translation_id: 'trans-3' },
      { bookId: 'novel-1', onAction: (a: ActionInfo) => actions.push(a) },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(para.selectedTranslationId).toBe('trans-3');

    expect(actions.length).toBe(1);
    const action = actions[0]!;
    // 选择翻译会写入 DB，是更新操作而非读取
    expect(action.type).toBe('update');
    expect(action.entity).toBe('translation');
    expect(action.previousData).toEqual({ selectedTranslationId: 'trans-1' });
    expect(action.data).toMatchObject({
      paragraph_id: 'para1',
      translation_id: 'trans-3',
      tool_name: 'select_translation',
    });
  });

  test('translation_id 无效时不应上报 action', async () => {
    const translations = makeTranslations(2);
    const para = createTestParagraph('para1', '原文段落', translations);
    const novel = createTestNovel([createTestVolume('vol1', [createTestChapter('ch1', [para])])]);
    mockBooksStore.books = [novel];

    const actions: ActionInfo[] = [];
    const tool = getTool('select_translation');
    const result = await tool.handler(
      { paragraph_id: 'para1', translation_id: 'not-exist' },
      { bookId: 'novel-1', onAction: (a: ActionInfo) => actions.push(a) },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(false);
    expect(actions.length).toBe(0);
  });
});

describe('段落索引基准的自描述文档', () => {
  const toolsWithMixedIndexes = [
    'get_previous_paragraphs',
    'get_next_paragraphs',
    'find_paragraph_by_keywords',
    'search_paragraphs_by_regex',
    'get_paragraph_info',
  ];

  test.each(toolsWithMixedIndexes)('%s 的描述应说明索引基准', (name) => {
    const tool = getTool(name);
    const description = tool.definition.function?.description || '';
    // paragraph_index 为 1-based 展示序号，chapter/volume 索引为 0-based，必须在描述中说明
    expect(description).toContain('从 1 开始');
    expect(description).toContain('从 0 开始');
  });
});
