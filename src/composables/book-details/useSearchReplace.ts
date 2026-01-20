import { ref, computed, nextTick, watch } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import type { Chapter, Paragraph, Novel, Volume } from 'src/models/novel';

export function useSearchReplace(
  book: Ref<Novel | undefined>,
  selectedChapter: Ref<Chapter | null>,
  selectedChapterParagraphs: Ref<Paragraph[]>,
  updateParagraphTranslation: (paragraphId: string, newTranslation: string) => Promise<void>,
  currentlyEditingParagraphId?: Ref<string | null>,
  saveState?: (description?: string) => void,
  updateSelectedChapterWithContent?: (updatedVolumes: Volume[]) => void,
) {
  const toast = useToastWithHistory();

  // Search State
  const isSearchVisible = ref(false);
  const showReplace = ref(false);
  const searchQuery = ref('');
  const replaceQuery = ref('');
  const currentSearchMatchIndex = ref(-1);

  /**
   * 获取段落翻译文本（原始数据源，禁止应用显示层格式化）
   *
   * 重要：搜索/替换必须基于“原始翻译文本”，否则会把显示层的缩进过滤/符号规范化结果
   * 写回数据库，导致原始缩进与标点永久丢失。
   *
   * 如果段落正在编辑，从 DOM 中的 textarea 获取当前编辑内容（不应用任何显示层过滤器）
   */
  const getParagraphRawTranslationText = (paragraph: Paragraph): string => {
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

    // 否则返回保存的翻译内容（原始值，不做任何格式化）
    if (!paragraph.selectedTranslationId || !paragraph.translations) {
      return '';
    }
    const selectedTranslation = paragraph.translations.find(
      (t) => t.id === paragraph.selectedTranslationId,
    );
    return selectedTranslation?.translation || '';
  };

  // Regex escape helper（用于构建“严格匹配”模式）
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 构建搜索/替换的正则：
   * - 默认严格按用户输入匹配
   * - 当开启“显示层符号规范化”时，为提升一致性，允许匹配半角/全角等常见变体
   *
   * 注意：即使做“宽松匹配”，我们也只替换命中的片段，不会把整段文本规范化后写回。
   */
  const buildSearchRegex = (query: string, flags: string): RegExp => {
    const q = query ?? '';
    if (!q) {
      return new RegExp('$a'); // 永远不匹配
    }

    const normalizeOnDisplay = book.value?.normalizeSymbolsOnDisplay ?? false;
    if (!normalizeOnDisplay) {
      return new RegExp(escapeRegex(q), flags);
    }

    // 宽松匹配：把常见的半角/全角符号视为等价
    const symbolMap: Record<string, string> = {
      ' ': '[ \\u3000]',
      '　': '[ \\u3000]',
      ',': '[,，]',
      '，': '[,，]',
      '.': '[\\.。]',
      '。': '[\\.。]',
      '?': '[\\?？]',
      '？': '[\\?？]',
      '!': '[!！]',
      '！': '[!！]',
      ':': '[:：]',
      '：': '[:：]',
      ';': '[;；]',
      '；': '[;；]',
      '(': '[\\(（]',
      '（': '[\\(（]',
      ')': '[\\)）]',
      '）': '[\\)）]',
      '[': '[\\[【]',
      '【': '[\\[【]',
      ']': '[\\]】]',
      '】': '[\\]】]',
      '<': '[<＜《]',
      '＜': '[<＜《]',
      '《': '[<＜《]',
      '>': '[>＞》]',
      '＞': '[>＞》]',
      '》': '[>＞》]',
      '"': '["“”]',
      '“': '["“”]',
      '”': '["“”]',
      "'": "['‘’]",
      '‘': "['‘’]",
      '’': "['‘’]",
      '~': '[~～]',
      '～': '[~～]',
      '-': '[-－—–]',
      '－': '[-－—–]',
      '—': '[-－—–]',
      '–': '[-－—–]',
      '…': '(?:…|\\.{3,}|。{3,})',
    };

    let pattern = '';
    for (const ch of q) {
      const mapped = symbolMap[ch];
      pattern += mapped ?? escapeRegex(ch);
    }
    return new RegExp(pattern, flags);
  };

  /**
   * 在“原始翻译文本”上执行替换，并尽量保留原始格式：
   * - preserveIndents=false 时：仅对每行“去掉行首缩进后的内容”做替换，缩进保持不动
   * - preserveIndents=true 时：直接在整段原文上替换
   */
  const replaceOnRawText = (rawText: string): string => {
    if (!rawText) return rawText;

    const chapter = selectedChapter.value || undefined;
    const preserveIndents = chapter?.preserveIndents ?? book.value?.preserveIndents ?? true;
    const regex = buildSearchRegex(searchQuery.value, 'gi');

    if (preserveIndents) {
      return rawText.replace(regex, replaceQuery.value);
    }

    return rawText
      .split('\n')
      .map((line) => {
        const leadingMatch = line.match(/^(\s*)/);
        const leading = leadingMatch ? leadingMatch[1]! : '';
        const rest = line.slice(leading.length);
        return leading + rest.replace(regex, replaceQuery.value);
      })
      .join('\n');
  };

  // Search Matches
  const searchMatches = computed(() => {
    if (!searchQuery.value || !selectedChapterParagraphs.value) return [];
    const matches: { index: number; id: string }[] = [];
    // 使用与替换一致的匹配逻辑（大小写不敏感）
    const re = buildSearchRegex(searchQuery.value, 'i');
    selectedChapterParagraphs.value.forEach((p, index) => {
      const text = getParagraphRawTranslationText(p);
      if (text && re.test(text)) {
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
  };

  watch(isSearchVisible, (newValue) => {
    if (!newValue) {
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
  });

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

  const replaceCurrent = async () => {
    const match = searchMatches.value[currentSearchMatchIndex.value];
    if (!match) return;

    // 从 selectedChapterParagraphs 中查找段落，确保使用正确的数据源（包含当前编辑内容）
    const paragraph = selectedChapterParagraphs.value.find((p) => p.id === match.id);
    if (!paragraph) return;

    // 重要：替换必须基于原始文本，避免把显示层格式化结果写回数据库
    const rawText = getParagraphRawTranslationText(paragraph);
    const newText = replaceOnRawText(rawText);

    if (newText !== rawText) {
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

      try {
        await updateParagraphTranslation(match.id, newText);
        toast.add({ severity: 'success', summary: '已替换', life: 3000 });
      } catch (error) {
        console.error('Failed to replace paragraph translation:', error);
        toast.add({ severity: 'error', summary: '替换失败', detail: '无法保存更改', life: 3000 });
      }
    }
  };

  const replaceAll = async () => {
    if (!searchMatches.value.length) return;
    const paragraphs = selectedChapterParagraphs.value;
    if (!paragraphs || paragraphs.length === 0) return;

    const chapter = selectedChapter.value;
    const bookValue = book.value;
    if (!chapter || !bookValue) return;

    saveState?.('批量替换');

    const updates = new Map<string, string>();
    const editedParagraphIds: string[] = [];

    for (const match of searchMatches.value) {
      const paragraph = paragraphs.find((p) => p.id === match.id);
      if (!paragraph) continue;

      const rawText = getParagraphRawTranslationText(paragraph);
      const newText = replaceOnRawText(rawText);

      if (newText !== rawText) {
        updates.set(paragraph.id, newText);
        if (currentlyEditingParagraphId?.value === paragraph.id) {
          editedParagraphIds.push(paragraph.id);
        }
      }
    }

    if (updates.size === 0) return;

    const booksStore = useBooksStore();
    const updatedContent = selectedChapterParagraphs.value.map((para) => {
      const newTranslation = updates.get(para.id);
      if (newTranslation !== undefined) {
        return {
          ...para,
          translations: para.translations
            ? para.translations.map((t) =>
                t.id === para.selectedTranslationId ? { ...t, translation: newTranslation } : t,
              )
            : para.translations,
        };
      }
      return para;
    });

    const updatedChapter: Chapter = {
      ...chapter,
      content: updatedContent,
      lastEdited: new Date(),
    };

    try {
      await ChapterService.saveChapterContent(updatedChapter);

      const updatedVolumes = ChapterService.updateChapter(bookValue, chapter.id, {
        content: updatedContent,
        lastEdited: new Date(),
      });

      await booksStore.updateBook(bookValue.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });

      updateSelectedChapterWithContent?.(updatedVolumes);
    } catch (error) {
      console.error('Failed to replace all:', error);
      toast.add({ severity: 'error', summary: '批量替换失败', detail: '无法保存更改', life: 3000 });
      return;
    }

    for (const [paragraphId, newText] of updates.entries()) {
      if (editedParagraphIds.includes(paragraphId)) {
        const paragraphElement = document.getElementById(`paragraph-${paragraphId}`);
        if (paragraphElement) {
          const textarea = paragraphElement.querySelector(
            '.paragraph-translation-edit textarea',
          ) as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.value = newText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    }

    for (const id of editedParagraphIds) {
      if (currentlyEditingParagraphId?.value === id) {
        currentlyEditingParagraphId.value = null;
      }
    }

    toast.add({ severity: 'success', summary: `已替换 ${updates.size} 处内容`, life: 3000 });
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
