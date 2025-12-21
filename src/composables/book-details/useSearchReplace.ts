import { ref, computed, nextTick, watch } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Chapter, Paragraph, Novel } from 'src/models/novel';
import { formatTranslationForDisplay } from 'src/utils';
import { useBooksStore } from 'src/stores/books';

export function useSearchReplace(
  book: Ref<Novel | undefined>,
  selectedChapter: Ref<Chapter | null>,
  selectedChapterParagraphs: Ref<Paragraph[]>,
  updateParagraphTranslation: (paragraphId: string, newTranslation: string) => Promise<void>,
  currentlyEditingParagraphId?: Ref<string | null>,
) {
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();

  // Search State
  const isSearchVisible = ref(false);
  const showReplace = ref(false);
  const searchQuery = ref('');
  const replaceQuery = ref('');
  const currentSearchMatchIndex = ref(-1);

  /**
   * 获取段落翻译文本（应用显示层格式化）
   * 如果段落正在编辑，从 DOM 中的 textarea 获取当前编辑内容（不应用过滤器）
   */
  const getParagraphTranslationText = (paragraph: Paragraph): string => {
    // 如果段落正在编辑，尝试从 DOM 获取当前编辑内容（不应用过滤器）
    if (currentlyEditingParagraphId?.value === paragraph.id) {
      const paragraphElement = document.getElementById(`paragraph-${paragraph.id}`);
      if (paragraphElement) {
        // 查找段落内的 textarea 元素（用于编辑翻译）
        // PrimeVue Textarea 组件会将 textarea 包装在内部
        const textarea = paragraphElement.querySelector(
          '.paragraph-translation-edit textarea',
        ) as HTMLTextAreaElement | null;
        if (textarea && textarea.value !== undefined) {
          return textarea.value;
        }
      }
    }

    // 否则返回保存的翻译内容（应用缩进过滤器）
    if (!paragraph.selectedTranslationId || !paragraph.translations) {
      return '';
    }
    const selectedTranslation = paragraph.translations.find(
      (t) => t.id === paragraph.selectedTranslationId,
    );
    const translation = selectedTranslation?.translation || '';
    // 应用显示层格式化（缩进过滤/符号规范化等）
    return formatTranslationForDisplay(translation, book.value, selectedChapter.value || undefined);
  };

  // Search Matches
  const searchMatches = computed(() => {
    if (!searchQuery.value || !selectedChapterParagraphs.value) return [];
    const matches: { index: number; id: string }[] = [];
    selectedChapterParagraphs.value.forEach((p, index) => {
      const text = getParagraphTranslationText(p);
      if (text && text.toLowerCase().includes(searchQuery.value.toLowerCase())) {
        matches.push({ index, id: p.id });
      }
    });
    return matches;
  });

  // Actions
  const scrollToMatch = (id: string) => {
    const el = document.getElementById(`paragraph-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const toggleSearch = () => {
    isSearchVisible.value = !isSearchVisible.value;
    if (!isSearchVisible.value) {
      searchQuery.value = '';
      replaceQuery.value = '';
      showReplace.value = false;
      currentSearchMatchIndex.value = -1;
    } else {
      void nextTick(() => {
        const input = document.querySelector('.search-toolbar input') as HTMLInputElement;
        if (input) input.focus();
      });
    }
  };

  const nextMatch = () => {
    if (!searchMatches.value.length) return;
    currentSearchMatchIndex.value =
      (currentSearchMatchIndex.value + 1) % searchMatches.value.length;
    const match = searchMatches.value[currentSearchMatchIndex.value];
    if (match) scrollToMatch(match.id);
  };

  const prevMatch = () => {
    if (!searchMatches.value.length) return;
    currentSearchMatchIndex.value =
      (currentSearchMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length;
    const match = searchMatches.value[currentSearchMatchIndex.value];
    if (match) scrollToMatch(match.id);
  };

  // Regex escape helper
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const replaceCurrent = async () => {
    const match = searchMatches.value[currentSearchMatchIndex.value];
    if (!match) return;

    // 从 selectedChapterParagraphs 中查找段落，确保使用正确的数据源（包含当前编辑内容）
    const paragraph = selectedChapterParagraphs.value.find((p) => p.id === match.id);
    if (!paragraph) return;

    // 获取当前文本（如果正在编辑，会从 DOM 获取）
    const text = getParagraphTranslationText(paragraph);
    const regex = new RegExp(escapeRegex(searchQuery.value), 'gi');
    const newText = text.replace(regex, replaceQuery.value);

    if (newText !== text) {
      // 如果段落正在编辑，需要先更新 DOM 中的 textarea，然后再保存
      if (currentlyEditingParagraphId?.value === paragraph.id) {
        const paragraphElement = document.getElementById(`paragraph-${paragraph.id}`);
        if (paragraphElement) {
          const textarea = paragraphElement.querySelector(
            '.paragraph-translation-edit textarea',
          ) as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.value = newText;
            // 触发 input 事件以确保 Vue 的 v-model 更新
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }

      await updateParagraphTranslation(match.id, newText);
      toast.add({ severity: 'success', summary: '已替换', life: 3000 });
    }
  };

  const replaceAll = async () => {
    if (!searchMatches.value.length) return;
    // 使用 selectedChapterParagraphs 来获取段落，因为它来自 selectedChapterWithContent，确保有内容
    const paragraphs = selectedChapterParagraphs.value;
    if (!paragraphs || paragraphs.length === 0) return;

    const chapter = selectedChapter.value;
    if (!chapter) return;

    let count = 0;
    const matches = [...searchMatches.value];

    // Batch update in memory first
    // We can't use updateParagraphTranslation here easily because it might save one by one or we want to batch save.
    // Let's replicate the logic for batch update here or expose a batch update method.
    // Actually, updating the book object in memory and then saving once is what the original code did.

    // To avoid duplicating complex logic, let's try to do it directly here since we have access to booksStore and book.
    if (!book.value) return;

    // Create a deep copy or modify directly? Original code modified directly then saved.
    // We need to iterate over paragraphs and update translations.

    // Since we are in a composable, let's use the store to update.
    // But we need to construct the updated volumes.

    // Reuse logic from original file:

    // We will update the book object's structure.
    // NOTE: This assumes `book.value` is reactive and connected to the store or we update the store.
    // The original code updated `book.value.volumes` then called `booksStore.updateBook`.
    // `book` prop here is a Ref to the book from the store.

    // Wait, `book` in `BookDetailsPage` comes from `booksStore.getBookById`.
    // Modifying it directly might not be best practice if it's a store object, but let's follow the original pattern for now
    // which seemed to modify local state (if it was a copy) or store state.
    // Actually `booksStore.getBookById` returns the reactive object from the store state in Pinia usually.

    // Let's be safe and clone the volumes to update.

    // However, since we need to update `translation` inside `paragraph.translations`, we need to find them.

    // Let's just implement the loop logic here.

    // We can't easily "update" the local `book.value` if it's read-only from store getters (if it is).
    // But in the original code: `book` was a computed: `return booksStore.getBookById(bookId.value);`.
    // And they did `const updatedVolumes = ...` then `booksStore.updateBook`.
    // Wait, `replaceAll` in original code:
    /*
      for (const match of matches) {
        const paragraph = chapter.content.find(...)
        // ... update paragraph.translations ...
      }
      await booksStore.updateBook(...)
    */
    // It seems it was modifying the `paragraph` object in place (which is part of `selectedChapter` which is part of `book`).
    // This implies `book` is reactive and mutable.

    for (const match of matches) {
      // 从 selectedChapterParagraphs 中查找段落，确保使用正确的数据源
      const paragraph = paragraphs.find((p) => p.id === match.id);
      if (!paragraph) continue;

      // 获取当前文本（如果正在编辑，会从 DOM 获取）
      const text = getParagraphTranslationText(paragraph);
      const regex = new RegExp(escapeRegex(searchQuery.value), 'gi');
      const newText = text.replace(regex, replaceQuery.value);

      if (newText !== text) {
        // 如果段落正在编辑，需要先更新 DOM 中的 textarea
        if (currentlyEditingParagraphId?.value === paragraph.id) {
          const paragraphElement = document.getElementById(`paragraph-${paragraph.id}`);
          if (paragraphElement) {
            const textarea = paragraphElement.querySelector(
              '.paragraph-translation-edit textarea',
            ) as HTMLTextAreaElement | null;
            if (textarea) {
              textarea.value = newText;
              // 触发 input 事件以确保 Vue 的 v-model 更新
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }

        // 更新保存的翻译内容
        if (paragraph.selectedTranslationId && paragraph.translations) {
          const translation = paragraph.translations.find(
            (t) => t.id === paragraph.selectedTranslationId,
          );
          if (translation) {
            translation.translation = newText;
            count++;
          }
        }
      }
    }

    if (count > 0 && book.value) {
      await booksStore.updateBook(book.value.id, { volumes: book.value.volumes });
      toast.add({ severity: 'success', summary: `已替换 ${count} 处内容`, life: 3000 });
    }
  };

  // Watchers
  watch(searchQuery, () => {
    currentSearchMatchIndex.value = -1;
    if (searchMatches.value.length > 0) {
      currentSearchMatchIndex.value = 0;
      const match = searchMatches.value[0];
      if (match) scrollToMatch(match.id);
    }
  });

  return {
    isSearchVisible,
    showReplace,
    searchQuery,
    replaceQuery,
    searchMatches,
    currentSearchMatchIndex,
    toggleSearch,
    nextMatch,
    prevMatch,
    replaceCurrent,
    replaceAll,
  };
}
