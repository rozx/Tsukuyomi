import './setup';
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { memoryTools } from 'src/services/ai/tools/memory-tools';
import { MemoryService } from 'src/services/memory-service';
import { ToolRegistry } from 'src/services/ai/tools';
import type { ToolContext } from 'src/services/ai/tools/types';
import type { Memory } from 'src/models/memory';

describe('MemoryTools - list_memories', () => {
  const bookId = 'book-1';

  const memories: Memory[] = [
    {
      id: 'm1',
      bookId,
      content: 'content-1',
      summary: 'summary-1',
      attachedTo: [{ type: 'book', id: bookId }],
      createdAt: 100,
      lastAccessedAt: 500,
    },
    {
      id: 'm2',
      bookId,
      content: 'content-2',
      summary: 'summary-2',
      attachedTo: [{ type: 'book', id: bookId }],
      createdAt: 300,
      lastAccessedAt: 200,
    },
    {
      id: 'm3',
      bookId,
      content: 'content-3',
      summary: 'summary-3',
      attachedTo: [{ type: 'book', id: bookId }],
      createdAt: 200,
      lastAccessedAt: 900,
    },
  ];

  beforeEach(() => {
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue(memories);
  });

  afterEach(() => {
    mock.restore();
  });

  test('无 bookId 时返回 success:false', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'list_memories');
    expect(tool).toBeDefined();

    const result = await tool!.handler({}, {} as ToolContext);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('书籍 ID 不能为空');
  });

  test('分页与排序参数生效（sort_by=createdAt, offset/limit）', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'list_memories');
    expect(tool).toBeDefined();

    const result = await tool!.handler(
      { offset: 1, limit: 1, sort_by: 'createdAt', include_content: false },
      { bookId } as ToolContext,
    );
    const parsed = JSON.parse(result);

    // createdAt desc: m2(300), m3(200), m1(100) -> offset 1, limit 1 => m3
    expect(parsed.success).toBe(true);
    expect(parsed.total).toBe(3);
    expect(parsed.count).toBe(1);
    expect(parsed.offset).toBe(1);
    expect(parsed.limit).toBe(1);
    expect(parsed.sort_by).toBe('createdAt');
    expect(parsed.memories[0].id).toBe('m3');
  });

  test('include_content=false 不返回 content', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'list_memories');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ include_content: false }, { bookId } as ToolContext);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.memories.length).toBeGreaterThan(0);
    expect(parsed.memories[0].content).toBeUndefined();
  });

  test('include_content=true 返回 content', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'list_memories');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ include_content: true, limit: 1 }, {
      bookId,
    } as ToolContext);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].content).toBeDefined();
  });

  test('作用域：getAllTools(Assistant) 包含 list_memories，但 getTranslationTools 不包含', () => {
    const allTools = ToolRegistry.getAllTools(bookId);
    expect(allTools.some((t) => t.function.name === 'list_memories')).toBe(true);

    const translationTools = ToolRegistry.getTranslationTools(bookId);
    expect(translationTools.some((t) => t.function.name === 'list_memories')).toBe(false);
  });
});
