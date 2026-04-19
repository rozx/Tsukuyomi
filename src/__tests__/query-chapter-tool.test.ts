import './setup';
import { describe, test, expect, afterEach, beforeEach, spyOn, mock } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { bookTools } from 'src/services/ai/tools/book-tools';
import { EmbeddingService } from 'src/services/embedding-service';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import { useSettingsStore } from 'src/stores/settings';
import type { ToolContext } from 'src/services/ai/tools/types';

function getQueryChapterTool() {
  const tool = bookTools.find((t) => t.definition.function.name === 'query_chapter');
  if (!tool) throw new Error('query_chapter tool not found');
  return tool;
}

describe('AI tool: query_chapter', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 默认开启总开关,让原有断言关注服务层逻辑
    useSettingsStore().settings.enableLocalEmbedding = true;
  });

  afterEach(() => {
    mock.restore();
  });

  test('schema 定义正确:query 必填,limit 可选,scope 到 current book(无 book_id 入参)', () => {
    const tool = getQueryChapterTool();
    const fn = tool.definition.function;

    expect(fn.name).toBe('query_chapter');
    expect(fn.parameters.required).toContain('query');
    expect(fn.parameters.required).not.toContain('book_id');
    const props = fn.parameters.properties as Record<string, { type: string }>;
    expect(props).toHaveProperty('query');
    expect(props).toHaveProperty('limit');
    expect(props.query?.type).toBe('string');
    expect(props.limit?.type).toBe('number');
  });

  test('未提供 bookId 时返回结构化错误', async () => {
    const tool = getQueryChapterTool();
    const result = await tool.handler({ query: '主角醒来' }, {} as ToolContext);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('书籍 ID 不能为空');
  });

  test('query 为空字符串时返回结构化错误', async () => {
    const tool = getQueryChapterTool();
    const result = await tool.handler({ query: '' }, { bookId: 'book-1' } as ToolContext);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('query 不能为空');
  });

  test('query 为纯空白时返回结构化错误', async () => {
    const tool = getQueryChapterTool();
    const result = await tool.handler(
      { query: '   \n  ' },
      { bookId: 'book-1' } as ToolContext,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('query 不能为空');
  });

  test('总开关关闭时返回 feature_disabled 错误,不访问 EmbeddingService', async () => {
    useSettingsStore().settings.enableLocalEmbedding = false;
    const isReadySpy = spyOn(EmbeddingService, 'isReady').mockReturnValue(true);

    const tool = getQueryChapterTool();
    const result = await tool.handler(
      { query: '主角醒来' },
      { bookId: 'book-1' } as ToolContext,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.feature_disabled).toBe(true);
    expect(parsed.error).toContain('本地嵌入功能未启用');
    // 开关关闭的分支应在进入 EmbeddingService 前就返回
    expect(isReadySpy).not.toHaveBeenCalled();
  });

  test('EmbeddingService 未就绪时返回结构化错误与 service_status', async () => {
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
    spyOn(EmbeddingService, 'getStatus').mockReturnValue('loading');

    const tool = getQueryChapterTool();
    const result = await tool.handler(
      { query: '主角醒来' },
      { bookId: 'book-1' } as ToolContext,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('嵌入服务未就绪');
    expect(parsed.service_status).toBe('loading');
  });

  test('服务就绪 + 有匹配结果:返回 matches 数组,含 preview / score', async () => {
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const querySpy = spyOn(ChapterEmbeddingService, 'queryChapters').mockResolvedValue([
      {
        chapter_id: 'ch-A',
        title: '第一章 觉醒',
        score: 0.87,
        preview: '主角在古代神社醒来...',
      },
      {
        chapter_id: 'ch-B',
        title: '第二章 邂逅',
        score: 0.62,
        preview: '樱花树下的相遇...',
      },
    ]);

    const onAction = mock(() => {});
    const tool = getQueryChapterTool();
    const result = await tool.handler(
      { query: '主角醒来', limit: 2 },
      {
        bookId: 'book-1',
        onAction,
      } as unknown as ToolContext,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.matches[0].chapter_id).toBe('ch-A');
    expect(parsed.matches[0].preview).toContain('古代神社');
    expect(parsed.matches[0].score).toBeCloseTo(0.87, 5);

    // bookId 被注入到 queryChapters
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0]?.[0]).toBe('book-1');
    expect(querySpy.mock.calls[0]?.[1]).toBe('主角醒来');
    expect(querySpy.mock.calls[0]?.[2]).toBe(2);

    // onAction 回调被触发,记录 search 操作
    expect(onAction).toHaveBeenCalledTimes(1);
    const action = (onAction.mock.calls[0] as unknown as [{ type: string; data: { tool_name: string; book_id: string } }])[0];
    expect(action.type).toBe('search');
    expect(action.data.tool_name).toBe('query_chapter');
    expect(action.data.book_id).toBe('book-1');
  });

  test('limit 未传时使用默认值 5', async () => {
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const querySpy = spyOn(ChapterEmbeddingService, 'queryChapters').mockResolvedValue([]);

    const tool = getQueryChapterTool();
    await tool.handler({ query: '主角' }, { bookId: 'book-1' } as ToolContext);

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0]?.[2]).toBe(5);
  });

  test('queryChapters 抛错时返回结构化错误而非崩溃', async () => {
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    spyOn(ChapterEmbeddingService, 'queryChapters').mockRejectedValue(new Error('embed 失败'));

    const tool = getQueryChapterTool();
    const result = await tool.handler(
      { query: '主角' },
      { bookId: 'book-1' } as ToolContext,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('embed 失败');
  });
});
