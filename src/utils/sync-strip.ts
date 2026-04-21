import type { Memory } from 'src/models/memory';
import type { CoverHistoryItem, Novel } from 'src/models/novel';
import type { AppSettings } from 'src/models/settings';
import type { AIModel } from 'src/services/ai/types/ai-model';

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
function stripMemoryLocalFields(memory: Memory): Memory {
  if (!memory || typeof memory !== 'object') return memory;

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
function sortMemoriesById(memories: Memory[]): Memory[] {
  return [...memories].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 按 `id` 字典序排序 AI 模型数组，确保聚合条目的哈希与上传字节稳定。
 * `aiModelsStore.models` 的顺序受本地操作历史影响（新增追加、删除 splice），
 * 跨设备各自的局部顺序不同——同步路径强制 id 排序消除这一抖动。
 */
export function sortAIModelsById(models: AIModel[]): AIModel[] {
  return [...models].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 按 `id` 字典序排序封面历史数组（理由同 `sortAIModelsById`）。
 */
export function sortCoversById(covers: CoverHistoryItem[]): CoverHistoryItem[] {
  return [...covers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

/**
 * 剥离 AppSettings 中不参与同步的本地字段：
 * - `syncs`：每个设备的同步状态（lastSyncTime / lastRemoteETag / knownRemoteHashes / 删除记录等），
 *   每次同步都会更新，若参与同步会导致 hash 永远不稳定。GitHub token 等也是设备专属的。
 * - `memoryInjection.embeddingModelCached`：浏览器 Cache Storage 探测结果，是设备本地状态。
 *
 * 剥离后的 AppSettings 用于 manifest hash 与上传。下载合并时，本地 `syncs` 与
 * `embeddingModelCached` 保持不变（见 `settingsStore.importSettings` 的实现）。
 */
export function stripAppSettingsLocalFields(
  settings: AppSettings & { syncs?: unknown },
): AppSettings {
   
  const { syncs: _syncs, memoryInjection: rawMemoryInjection, ...rest } = settings;

  const memoryInjection = rawMemoryInjection
    ? (() => {
         
        const { embeddingModelCached: _c, ...miRest } = rawMemoryInjection as unknown as Record<
          string,
          unknown
        >;
        return miRest as unknown as AppSettings['memoryInjection'];
      })()
    : rawMemoryInjection;

  return {
    ...(rest as AppSettings),
    ...(memoryInjection ? { memoryInjection } : {}),
  };
}
