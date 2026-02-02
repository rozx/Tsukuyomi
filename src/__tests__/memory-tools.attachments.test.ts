import './setup';
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { memoryTools } from 'src/services/ai/tools/memory-tools';
import { MemoryService } from 'src/services/memory-service';
import type { ToolContext } from 'src/services/ai/tools/types';
import type { Memory } from 'src/models/memory';

describe('MemoryTools - attachments', () => {
  const bookId = 'book-1';
  const context: ToolContext = { bookId };

  const baseMemory: Memory = {
    id: 'm1',
    bookId,
    content: '内容',
    summary: '摘要',
    attachedTo: [{ type: 'book', id: bookId }],
    createdAt: 1000,
    lastAccessedAt: 2000,
  };

  let createMemorySpy: ReturnType<typeof spyOn>;
  let updateMemorySpy: ReturnType<typeof spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let getMemorySpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createMemorySpy = spyOn(MemoryService, 'createMemory').mockResolvedValue(baseMemory);
    getMemorySpy = spyOn(MemoryService, 'getMemory').mockResolvedValue(baseMemory);
    updateMemorySpy = spyOn(MemoryService, 'updateMemory').mockResolvedValue({
      ...baseMemory,
      attachedTo: [{ type: 'character', id: 'char-1' }],
    });
  });

  afterEach(() => {
    mock.restore();
  });

  test('create_memory 支持 attached_to 参数', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'create_memory');
    expect(tool).toBeDefined();

    const attachedTo = [{ type: 'character', id: 'char-1' }];
    const result = await tool!.handler(
      { content: '内容', summary: '摘要', attached_to: attachedTo },
      context,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(createMemorySpy).toHaveBeenCalledWith(bookId, '内容', '摘要', attachedTo);
  });

  test('update_memory 支持 attached_to 参数', async () => {
    const tool = memoryTools.find((t) => t.definition.function.name === 'update_memory');
    expect(tool).toBeDefined();

    const attachedTo = [{ type: 'character', id: 'char-1' }];
    const result = await tool!.handler(
      { memory_id: 'm1', content: '新内容', summary: '新摘要', attached_to: attachedTo },
      context,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(updateMemorySpy).toHaveBeenCalledWith(bookId, 'm1', '新内容', '新摘要', attachedTo);
  });
});
