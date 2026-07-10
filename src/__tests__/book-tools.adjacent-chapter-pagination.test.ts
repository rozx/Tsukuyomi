import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { bookTools } from '../services/ai/tools/book-tools';
import { BookService } from '../services/book-service';
import type { Novel, Volume, Chapter, Paragraph } from '../models/novel';

/**
 * 回归测试：get_previous_chapter / get_next_chapter 必须像 get_chapter_info 一样
 * 对章节内容分页（默认 30 段，最大 200），防止超长章节一次性塞爆工具结果上下文。
 */

function createTestParagraph(id: string, text: string): Paragraph {
  return {
    id,
    text,
    selectedTranslationId: '',
    translations: [],
  };
}

function createTestChapter(id: string, paragraphs: Paragraph[], title: string): Chapter {
  return {
    id,
    title: {
      original: title,
      translation: { id: `${id}-title-trans`, translation: '', aiModelId: 'model-1' },
    },
    content: paragraphs,
    contentLoaded: true,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

function createTestNovel(chapters: Chapter[]): Novel {
  const volume: Volume = {
    id: 'vol1',
    title: {
      original: '测试卷',
      translation: { id: 'vol-title-trans', translation: '', aiModelId: 'model-1' },
    },
    chapters,
  };
  return {
    id: 'novel-1',
    title: 'Test Novel',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: [volume],
  };
}

function makeParagraphs(count: number): Paragraph[] {
  return Array.from({ length: count }, (_, i) =>
    createTestParagraph(`para-${i}`, `第 ${i} 段原文内容`),
  );
}

function getTool(name: string) {
  const tool = bookTools.find((t) => t.definition.function?.name === name);
  if (!tool) throw new Error(`工具未找到: ${name}`);
  return tool;
}

describe('get_previous_chapter / get_next_chapter 分页', () => {
  beforeEach(() => {
    const bigChapter = createTestChapter('ch-big', makeParagraphs(50), '超长章节');
    const currentChapter = createTestChapter('ch-current', makeParagraphs(3), '当前章节');
    // ch-big 在前，ch-current 在后：get_previous_chapter(ch-current) → ch-big，
    // get_next_chapter(ch-big) → ch-current
    const novel = createTestNovel([bigChapter, currentChapter]);
    spyOn(BookService, 'getBookById').mockImplementation(
      (_bookId: string) => Promise.resolve(novel) as never,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('get_previous_chapter 默认最多返回 30 段内容，并附带分页元信息', async () => {
    const tool = getTool('get_previous_chapter');
    const result = await tool.handler(
      { chapter_id: 'ch-current', include_memory: false },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(resultObj.chapter.id).toBe('ch-big');
    expect(resultObj.chapter.paragraphCount).toBe(50);

    // 内容必须被分页裁剪：只包含前 30 段
    const contentLines = (resultObj.chapter.content as string).split('\n');
    expect(contentLines.length).toBe(30);

    // 分页元信息
    expect(resultObj.chapter.pagination).toMatchObject({
      offset: 0,
      limit: 30,
      returned: 30,
      hasMore: true,
      nextOffset: 30,
    });
  });

  test('get_previous_chapter 支持 limit/offset 翻页读取', async () => {
    const tool = getTool('get_previous_chapter');
    const result = await tool.handler(
      { chapter_id: 'ch-current', include_memory: false, limit: 10, offset: 45 },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    const contentLines = (resultObj.chapter.content as string).split('\n');
    expect(contentLines.length).toBe(5);
    expect(contentLines[0]).toContain('第 45 段');
    expect(resultObj.chapter.pagination).toMatchObject({
      offset: 45,
      returned: 5,
      hasMore: false,
      nextOffset: null,
    });
  });

  test('get_next_chapter 同样应用分页', async () => {
    const tool = getTool('get_next_chapter');
    const result = await tool.handler(
      { chapter_id: 'ch-current', include_memory: false },
      { bookId: 'novel-1' },
    );

    // ch-current 是最后一章，先换个方向：从 ch-big 取下一章（段落少不触发分页边界），
    // 再直接验证 50 段章节的 next 方向
    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(false);

    const result2 = await tool.handler(
      { chapter_id: 'ch-big', include_memory: false, limit: 2 },
      { bookId: 'novel-1' },
    );
    const resultObj2 = JSON.parse(result2);
    expect(resultObj2.success).toBe(true);
    expect(resultObj2.chapter.id).toBe('ch-current');
    const contentLines = (resultObj2.chapter.content as string).split('\n');
    expect(contentLines.length).toBe(2);
    expect(resultObj2.chapter.pagination).toMatchObject({
      offset: 0,
      limit: 2,
      returned: 2,
      hasMore: true,
      nextOffset: 2,
    });
  });

  test('summary_only=true 时不返回内容也不返回分页信息', async () => {
    const tool = getTool('get_previous_chapter');
    const result = await tool.handler(
      { chapter_id: 'ch-current', include_memory: false, summary_only: true },
      { bookId: 'novel-1' },
    );

    const resultObj = JSON.parse(result);
    expect(resultObj.success).toBe(true);
    expect(resultObj.chapter.content).toBe('');
    expect(resultObj.chapter.pagination).toBeUndefined();
  });

  test('工具 schema 应声明 limit/offset 分页参数', () => {
    for (const name of ['get_previous_chapter', 'get_next_chapter'] as const) {
      const tool = getTool(name);
      const properties = tool.definition.function?.parameters?.properties as Record<
        string,
        unknown
      >;
      expect(properties.limit).toBeDefined();
      expect(properties.offset).toBeDefined();
      // 描述需告知模型内容是分页返回的
      expect(tool.definition.function?.description).toContain('分页');
    }
  });
});
