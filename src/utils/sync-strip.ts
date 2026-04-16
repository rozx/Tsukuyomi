import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';

/**
 * 剥离 Memory 的本地字段：
 * - `embedding`：256 维本地向量，按需生成（EmbeddingQueue 异步填充），不应参与同步
 * - `embeddingModel`：embedding 版本标识，同样是本地状态
 * - `attachedTo`：已废弃字段，防御性清理
 *
 * 剥离后的 Memory 用于：
 * 1. 计算 manifest hash（确保相同内容产生相同 hash，不受 embedding 填充进度影响）
 * 2. 上传到 Gist（远端不需要本地 embedding）
 */
export function stripMemoryLocalFields(memory: Memory): Memory {
  if (!memory || typeof memory !== 'object') return memory;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding: _e, embeddingModel: _em, ...rest } = memory as Memory & {
    attachedTo?: unknown;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (rest as any).attachedTo;
  return rest as Memory;
}

/**
 * 剥离 Novel 树中所有 Translation 的 `memoryScoreBreakdown` 字段。
 * 该字段是记忆打分的 UI 调试数据，AI 翻译时填充，不参与同步。
 */
export function stripNovelLocalFields(novel: Novel): Novel {
  if (!novel || !Array.isArray(novel.volumes)) return novel;

  const stripTranslation = (t: unknown): unknown => {
    if (!t || typeof t !== 'object') return t;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { memoryScoreBreakdown: _b, ...rest } = t as Record<string, unknown>;
    return rest;
  };

  const cleanedVolumes = novel.volumes.map((volume) => {
    if (!volume || !Array.isArray(volume.chapters)) return volume;
    const cleanedChapters = volume.chapters.map((chapter) => {
      if (!chapter || !Array.isArray(chapter.content)) return chapter;
      const cleanedContent = chapter.content.map((paragraph) => {
        if (!paragraph) return paragraph;
        const cleanedTranslations = Array.isArray(paragraph.translations)
          ? (paragraph.translations.map(stripTranslation) as typeof paragraph.translations)
          : paragraph.translations;
        return { ...paragraph, translations: cleanedTranslations };
      });
      return { ...chapter, content: cleanedContent };
    });
    return { ...volume, chapters: cleanedChapters };
  });

  return { ...novel, volumes: cleanedVolumes } as Novel;
}

/**
 * 按 `id` 字典序排序 Memory 数组，确保哈希输入顺序稳定。
 * `MemoryService.getAllMemories` 按 `lastAccessedAt` 排序，每次读写都可能改变顺序，
 * 会导致同内容不同哈希。同步路径统一用 id 排序消除这一不稳定性。
 */
export function sortMemoriesById(memories: Memory[]): Memory[] {
  return [...memories].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 一次性对按书籍分组的 memories 做"剥离 + 排序"规范化，便于同步使用
 */
export function normalizeMemoriesForSync(
  memoriesByBook: Record<string, Memory[]>,
): Record<string, Memory[]> {
  const result: Record<string, Memory[]> = {};
  for (const [bookId, memories] of Object.entries(memoriesByBook)) {
    result[bookId] = sortMemoriesById(memories.map(stripMemoryLocalFields));
  }
  return result;
}
