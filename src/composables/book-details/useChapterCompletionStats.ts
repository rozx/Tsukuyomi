import { reactive, ref, watch, type Ref } from 'vue';
import type { Novel, Paragraph } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getChapterTranslationStats } from 'src/utils';
import { useTaskQueueStore } from 'src/stores/task-queue';

type Loader = (chapterIds: string[]) => Promise<Map<string, Paragraph[] | undefined>>;

/**
 * 多选模式下章节的翻译完成度（按书籍目标语言）。
 *
 * 章节元数据没有翻译统计：优先使用书籍详情页打开时已算好的整书进度，缺失的章节按需读取正文计算。
 * 任务队列写入某章后该章强制重算。
 */
export function createChapterCompletionStats(
  book: Ref<Novel | undefined>,
  options: {
    load?: Loader;
    /** 书籍详情页已算好的整书进度；有就直接用，不再读取正文 */
    seed?: () => Map<string, { translated: number; total: number }> | undefined;
  } = {},
) {
  const load: Loader =
    options.load ?? ((ids) => ChapterContentService.loadChapterContentsBatch(ids));
  const stats = reactive(new Map<string, { translated: number; total: number }>());
  const loading = ref(false);

  const reset = () => stats.clear();
  watch(
    () => [book.value?.id, book.value?.targetLanguage],
    () => reset(),
  );

  /** 自己算过的优先（写入后会重算），否则用页面已算好的进度 */
  const lookup = (chapterId: string) => stats.get(chapterId) ?? options.seed?.()?.get(chapterId);

  /** 读取正文并（重新）计算指定章节 */
  const refresh = async (chapterIds: string[]) => {
    if (chapterIds.length === 0) return;
    loading.value = true;
    try {
      const language = book.value?.targetLanguage ?? 'zh-CN';
      const contents = await load(chapterIds);
      for (const id of chapterIds) {
        stats.set(id, getChapterTranslationStats(contents.get(id) ?? [], language));
      }
    } finally {
      loading.value = false;
    }
  };

  /** 计算尚未缓存的章节 */
  const ensure = (chapterIds: string[]) => refresh(chapterIds.filter((id) => !lookup(id)));

  /** 百分比；尚未计算返回 null */
  const percent = (chapterId: string): number | null => {
    const value = lookup(chapterId);
    if (!value) return null;
    if (value.total === 0) return 100;
    return Math.round((value.translated / value.total) * 100);
  };
  const isComplete = (chapterId: string) => percent(chapterId) === 100;
  const hasTranslation = (chapterId: string) => (lookup(chapterId)?.translated ?? 0) > 0;

  const queue = useTaskQueueStore();
  watch(
    () => queue.lastChapterWrite,
    (event) => {
      if (!event || event.bookId !== book.value?.id || !lookup(event.chapterId)) return;
      // 页面的整书进度可能已过时，强制按最新正文重算
      void refresh([event.chapterId]);
    },
  );

  return { loading, ensure, percent, isComplete, hasTranslation, reset };
}

export type ChapterCompletionStats = ReturnType<typeof createChapterCompletionStats>;
