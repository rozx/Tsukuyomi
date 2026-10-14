import './setup';
import { describe, expect, it } from 'vitest';
import { getDB } from '../utils/indexed-db';
import { MemoryService } from '../services/memory-service';

function memory(id: string, bookId: string) {
  return { id, bookId, content: id, summary: '', createdAt: 1, lastAccessedAt: 1 };
}

describe('MemoryService.countAllMemories', () => {
  it('空库为 0', async () => {
    expect(await MemoryService.countAllMemories()).toBe(0);
  });

  it('统计所有书籍的 Memory 总数', async () => {
    const db = await getDB();
    await db.put('memories', memory('a', 'b1'));
    await db.put('memories', memory('b', 'b1'));
    await db.put('memories', memory('c', 'b2'));
    expect(await MemoryService.countAllMemories()).toBe(3);
  });
});
