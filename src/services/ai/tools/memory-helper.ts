import { MemoryService } from 'src/services/memory-service';
import type { MemoryAttachment } from 'src/models/memory';

/**
 * 搜索相关记忆并返回简化格式（只包含 id 和 summary）
 * 
 * 充分利用 MemoryService 的优化：
 * - 搜索结果缓存：重复搜索从 50-200ms 降至 < 1ms
 * - LRU 缓存：常用记忆访问极快
 * - 批量更新优化：写操作性能提升
 * - 延迟更新：不阻塞搜索结果返回
 * 
 * @param bookId 书籍 ID
 * @param keywords 搜索关键词数组
 * @param limit 返回的记忆数量限制（默认 5）
 * @returns 简化的记忆数组（只包含 id 和 summary）
 */
export async function searchRelatedMemories(
  bookId: string,
  keywords: string[],
  limit: number = 5,
): Promise<Array<{ id: string; summary: string }>> {
  if (!bookId || !keywords || keywords.length === 0) {
    return [];
  }
  try {
    // 直接使用 MemoryService，它会自动利用缓存和优化
    // searchMemoriesByKeywords 会：
    // 1. 检查搜索结果缓存（如果存在，几乎瞬间返回）
    // 2. 从数据库搜索匹配的记忆（如果缓存未命中）
    // 3. 将结果添加到缓存中
    // 4. 异步更新匹配记忆的 lastAccessedAt（不阻塞）
    const memories = await MemoryService.searchMemoriesByKeywords(bookId, keywords);

    // 限制返回数量，只返回 id 和 summary（不返回 content）
    // 如果 AI 需要完整内容，可以调用 get_memory 工具
    return memories.slice(0, limit).map((memory) => ({
      id: memory.id,
      summary: memory.summary,
    }));
  } catch (error) {
    // 静默失败，不影响工具的主要功能
    console.warn('Failed to search related memories:', error);
    return [];
  }
}

/**
 * 附件 + 关键词混合检索相关记忆（并行、合并、去重）
 * - 优先返回附件命中的记忆
 * - 再补充关键词命中的记忆
 */
export async function searchRelatedMemoriesHybrid(
  bookId: string,
  attachments: MemoryAttachment[],
  keywords: string[],
  limit: number = 5,
): Promise<Array<{ id: string; summary: string }>> {
  if (!bookId) {
    return [];
  }

  const validAttachments = Array.isArray(attachments)
    ? attachments.filter((attachment) => !!attachment?.type && !!attachment?.id)
    : [];
  const validKeywords = Array.isArray(keywords)
    ? keywords.map((keyword) => keyword?.trim()).filter((keyword) => !!keyword)
    : [];

  if (validAttachments.length === 0 && validKeywords.length === 0) {
    return [];
  }

  try {
    const [attachedMemories, keywordMemories] = await Promise.all([
      validAttachments.length > 0
        ? MemoryService.getMemoriesByAttachments(bookId, validAttachments)
        : Promise.resolve([]),
      validKeywords.length > 0
        ? MemoryService.searchMemoriesByKeywords(bookId, validKeywords)
        : Promise.resolve([]),
    ]);

    const merged = new Map<string, { id: string; summary: string }>();

    for (const memory of attachedMemories) {
      if (!merged.has(memory.id)) {
        merged.set(memory.id, { id: memory.id, summary: memory.summary });
      }
    }

    for (const memory of keywordMemories) {
      if (!merged.has(memory.id)) {
        merged.set(memory.id, { id: memory.id, summary: memory.summary });
      }
    }

    return Array.from(merged.values()).slice(0, limit);
  } catch (error) {
    console.warn('Failed to search related memories (hybrid):', error);
    return [];
  }
}
