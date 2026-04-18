import { MemoryService } from 'src/services/memory-service';

/**
 * 兼容性类型：附件系统已被移除，保留此类型以兼容旧调用点的参数签名。
 * 新的 keyword + semantic 打分系统不再依赖此结构。
 */
export interface DeprecatedAttachmentRef {
  type: string;
  id: string;
}

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
    const memories = await MemoryService.searchMemories(bookId, keywords.join(' '));

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
 * @deprecated 附件系统已被移除。此函数为保持向后兼容,实现上等同于
 * `searchRelatedMemories(bookId, keywords, limit)` —— 第二个参数 `attachments`
 * 会被静默忽略。后续清理将把所有调用点迁移到 `searchRelatedMemories`。
 */
export async function searchRelatedMemoriesHybrid(
  bookId: string,
   
  _attachments: DeprecatedAttachmentRef[],
  keywords: string[],
  limit: number = 5,
): Promise<Array<{ id: string; summary: string }>> {
  return searchRelatedMemories(bookId, keywords, limit);
}
