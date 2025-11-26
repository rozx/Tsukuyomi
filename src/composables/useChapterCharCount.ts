import { ref, watch, type Ref } from 'vue';
import type { Chapter, Volume } from 'src/models/novel';
import { getChapterCharCount, getChapterCharCountAsync } from 'src/utils';

/**
 * 章节字符数加载和缓存 composable
 * 提供章节级别的字符数加载、缓存和加载状态管理
 */
export function useChapterCharCount(availableVolumes?: Ref<Volume[]>, expandedVolumes?: Ref<Set<string>>) {
  // 章节字符数缓存（使用对象而不是 Map，确保 Vue 响应式）
  const chapterCharCounts = ref<Record<string, number>>({});
  // 正在加载字符数的章节 ID 集合
  const loadingChapterCharCounts = ref<Set<string>>(new Set());

  /**
   * 异步加载章节字符数
   * @param chapter 章节对象
   * @returns 字符数
   */
  const loadChapterCharCount = async (chapter: Chapter): Promise<number> => {
    // 如果已缓存，直接返回
    if (chapterCharCounts.value[chapter.id] !== undefined) {
      return chapterCharCounts.value[chapter.id] || 0;
    }

    // 先尝试同步计算（如果内容已加载）
    const syncCount = getChapterCharCount(chapter);
    // 如果章节内容已加载，使用同步结果
    if (chapter.content !== undefined) {
      chapterCharCounts.value[chapter.id] = syncCount;
      return syncCount;
    }

    // 异步加载（从 IndexedDB）
    loadingChapterCharCounts.value.add(chapter.id);
    try {
      const count = await getChapterCharCountAsync(chapter);
      chapterCharCounts.value[chapter.id] = count;
      return count;
    } catch (error) {
      console.error(`Failed to load char count for chapter ${chapter.id}:`, error);
      // 如果异步加载失败，使用同步结果作为后备
      chapterCharCounts.value[chapter.id] = syncCount;
      return syncCount;
    } finally {
      loadingChapterCharCounts.value.delete(chapter.id);
    }
  };

  /**
   * 获取章节字符数（带缓存）
   * @param chapter 章节对象
   * @returns 字符数，如果未加载则使用同步计算的结果
   */
  const getChapterCharCountDisplay = (chapter: Chapter): number => {
    return chapterCharCounts.value[chapter.id] ?? getChapterCharCount(chapter);
  };

  /**
   * 检查章节是否正在加载字符数
   * @param chapter 章节对象
   * @returns 是否正在加载
   */
  const isLoadingChapterCharCount = (chapter: Chapter): boolean => {
    return loadingChapterCharCounts.value.has(chapter.id);
  };

  /**
   * 加载所有可见章节的字符数
   * 如果提供了 availableVolumes 和 expandedVolumes，则只加载展开的卷中的章节
   */
  const loadAllVisibleChapterCharCounts = async () => {
    if (!availableVolumes?.value) {
      return;
    }

    const volumes = availableVolumes.value;
    const loadPromises: Promise<void>[] = [];

    for (const volume of volumes) {
      // 如果提供了 expandedVolumes，只加载展开的卷中的章节
      if (expandedVolumes && !expandedVolumes.value.has(volume.id)) {
        continue;
      }

      if (volume.chapters) {
        for (const chapter of volume.chapters) {
          loadPromises.push(loadChapterCharCount(chapter).then(() => {}));
        }
      }
    }

    await Promise.all(loadPromises);
  };

  /**
   * 清除指定章节的缓存
   * @param chapterId 章节 ID，如果不提供则清除所有缓存
   */
  const clearCache = (chapterId?: string) => {
    if (chapterId) {
      delete chapterCharCounts.value[chapterId];
      loadingChapterCharCounts.value.delete(chapterId);
    } else {
      // 清除所有缓存
      chapterCharCounts.value = {};
      loadingChapterCharCounts.value.clear();
    }
  };

  // 如果提供了 availableVolumes 和 expandedVolumes，设置自动加载
  if (availableVolumes && expandedVolumes) {
    // 当展开的卷变化时，加载字符数
    watch(
      () => expandedVolumes.value,
      async () => {
        await loadAllVisibleChapterCharCounts();
      },
      { deep: true },
    );

    // 当章节列表变化时，清除缓存并重新加载
    watch(
      () => availableVolumes.value,
      async () => {
        chapterCharCounts.value = {};
        await loadAllVisibleChapterCharCounts();
      },
      { deep: true },
    );
  }

  return {
    chapterCharCounts,
    loadingChapterCharCounts,
    loadChapterCharCount,
    getChapterCharCountDisplay,
    isLoadingChapterCharCount,
    loadAllVisibleChapterCharCounts,
    clearCache,
  };
}

