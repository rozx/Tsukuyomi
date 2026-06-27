import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { ref } from 'vue';
import type { Paragraph, Translation, Chapter, Novel } from 'src/models/novel';
import { useParagraphNavigation } from 'src/composables/book-details/useParagraphNavigation';
import { useSearchReplace } from 'src/composables/book-details/useSearchReplace';
import * as ToastHistory from 'src/composables/useToastHistory';

function makePara(id: string, text = '一些原文内容', translation?: string): Paragraph {
  const translations: Translation[] = translation
    ? [{ id: `${id}-t`, translation } as unknown as Translation]
    : [];
  return {
    id,
    text,
    selectedTranslationId: translation ? `${id}-t` : '',
    translations,
  };
}

describe('useParagraphNavigation · 索引驱动滚动', () => {
  test('navigateToParagraph(scroll=true) 按目标索引调用 chapterScrollToIndex(align:auto)', () => {
    const paragraphs = ref<Paragraph[]>([makePara('a'), makePara('b'), makePara('c')]);
    const scrollableContentRef = ref<HTMLElement | null>(null);
    const editingId = ref<string | null>(null);
    const calls: Array<{ index: number; align?: string }> = [];
    const chapterScrollToIndex = ref<
      ((index: number, opts?: { align?: string }) => void) | null
    >((index, opts) => {
      calls.push({ index, ...(opts ?? {}) });
    });

    const nav = useParagraphNavigation(
      paragraphs,
      scrollableContentRef,
      editingId,
      chapterScrollToIndex,
    );
    nav.navigateToParagraph(2, true, true);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.index).toBe(2);
    expect(calls[0]!.align).toBe('auto');
  });

  test('navigateToParagraph(scroll=false) 不触发滚动', () => {
    const paragraphs = ref<Paragraph[]>([makePara('a'), makePara('b')]);
    const scrollableContentRef = ref<HTMLElement | null>(null);
    const editingId = ref<string | null>(null);
    let called = 0;
    const chapterScrollToIndex = ref<((index: number) => void) | null>(() => {
      called += 1;
    });

    const nav = useParagraphNavigation(
      paragraphs,
      scrollableContentRef,
      editingId,
      chapterScrollToIndex,
    );
    nav.navigateToParagraph(1, false, true);

    expect(called).toBe(0);
  });
});

describe('useSearchReplace · 索引驱动滚动到匹配', () => {
  // useSearchReplace 内部调用 useToastWithHistory → PrimeVue useToast,
  // bun:test 不加载 vitest-setup.ts 的全局 useToast mock,这里显式打桩。
  beforeEach(() => {
    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({
      add: () => {},
    } as never);
  });

  test('nextMatch 按匹配段落索引调用 chapterScrollToIndex', () => {
    const paragraphs = ref<Paragraph[]>([
      makePara('a', '原文1', '无关译文'),
      makePara('b', '原文2', '这里有命中关键字'),
      makePara('c', '原文3', '另一段命中关键字'),
    ]);
    const book = ref<Novel | undefined>(undefined);
    const selectedChapter = ref<Chapter | null>(null);
    const editingId = ref<string | null>(null);
    const calls: number[] = [];
    const chapterScrollToIndex = ref<((index: number, opts?: unknown) => void) | null>((index) => {
      calls.push(index);
    });

    const sr = useSearchReplace(
      book,
      selectedChapter,
      paragraphs,
      async () => {},
      editingId,
      undefined,
      undefined,
      chapterScrollToIndex,
    );

    sr.searchQuery.value = '命中关键字';
    expect(sr.searchMatches.value.length).toBe(2);
    sr.nextMatch();

    expect(calls.length).toBe(1);
    // searchMatches 第一个匹配是索引 1（段落 b）
    expect(calls[0]).toBe(1);
  });
});
