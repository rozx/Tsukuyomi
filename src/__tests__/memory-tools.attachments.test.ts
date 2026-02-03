import './setup';
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { ToolContext } from 'src/services/ai/tools/types';
import type { Memory } from 'src/models/memory';
import { MemoryService } from 'src/services/memory-service';

// Mock functions
let mockCreateMemory: ReturnType<typeof mock>;
let mockUpdateMemory: ReturnType<typeof mock>;
let mockGetBookById: ReturnType<typeof mock>;

// Dynamic imports
let memoryTools: any;
let memoryService: typeof MemoryService;

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

  beforeEach(async () => {
    // Create mock functions
    mockCreateMemory = mock(() => Promise.resolve(baseMemory));
    mockUpdateMemory = mock(() =>
      Promise.resolve({
        ...baseMemory,
        attachedTo: [{ type: 'character', id: 'char-1' }],
      }),
    );
    mockGetBookById = mock((id: string) => {
      if (id === bookId) {
        return {
          id: bookId,
          title: 'Test Book',
          characterSettings: [{ id: 'char-1', name: 'Test Character' }],
          terminologies: [],
          volumes: [],
        };
      }
      return null;
    });

    // Mock useBooksStore to avoid Pinia errors
    await mock.module('src/stores/books', () => ({
      useBooksStore: () => ({
        getBookById: mockGetBookById,
      }),
    }));

    // Import modules after mocking
    const toolsModule = await import('src/services/ai/tools/memory-tools');
    memoryTools = toolsModule.memoryTools;
    memoryService = MemoryService;

    spyOn(memoryService, 'createMemory').mockImplementation(
      mockCreateMemory as typeof MemoryService.createMemory,
    );
    spyOn(memoryService, 'updateMemory').mockImplementation(
      mockUpdateMemory as typeof MemoryService.updateMemory,
    );
    spyOn(memoryService, 'getMemory').mockImplementation(
      mock(() => Promise.resolve(baseMemory)) as typeof MemoryService.getMemory,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('create_memory 支持 attached_to 参数', async () => {
    const tool = memoryTools.find((t: any) => t.definition.function.name === 'create_memory');
    expect(tool).toBeDefined();

    const attachedTo = [{ type: 'character', id: 'char-1' }];
    const result = await tool!.handler(
      { content: '内容', summary: '摘要', attached_to: attachedTo },
      context,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockCreateMemory).toHaveBeenCalledWith(bookId, '内容', '摘要', attachedTo);
  });

  test('update_memory 支持 attached_to 参数', async () => {
    const tool = memoryTools.find((t: any) => t.definition.function.name === 'update_memory');
    expect(tool).toBeDefined();

    const attachedTo = [{ type: 'character', id: 'char-1' }];
    const result = await tool!.handler(
      { memory_id: 'm1', content: '新内容', summary: '新摘要', attached_to: attachedTo },
      context,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockUpdateMemory).toHaveBeenCalledWith(bookId, 'm1', '新内容', '新摘要', attachedTo);
  });
});
