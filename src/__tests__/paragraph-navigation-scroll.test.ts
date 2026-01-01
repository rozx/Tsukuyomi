import { describe, expect, it, mock } from 'bun:test';
import { computed, ref } from 'vue';
import { useParagraphNavigation } from '../composables/book-details/useParagraphNavigation';
import type { Paragraph } from '../models/novel';

function createParagraph(id: string, text: string): Paragraph {
  return { id, text, selectedTranslationId: '', translations: [] };
}

function createRafQueue() {
  const queue: Array<(t: number) => void> = [];
  const raf = mock((cb: (t: number) => void) => {
    queue.push(cb);
    return 0;
  });
  const flush = (times: number[]) => {
    let i = 0;
    // 避免死循环：最多执行 times.length 次
    while (queue.length > 0 && i < times.length) {
      const cb = queue.shift()!;
      cb(times[i]!);
      i++;
    }
  };
  return { raf, flush };
}

describe('useParagraphNavigation - scrollToElementFast', () => {
  it('当目标段落已在可视区域内时，不应强制居中滚动', () => {
    const rafQueue = createRafQueue();
    (globalThis as any).requestAnimationFrame = rafQueue.raf;

    const paragraphs = computed<Paragraph[]>(() => [createParagraph('p1', '段落1')]);
    const scrollableContentRef = ref<HTMLElement | null>(null);
    const currentlyEditingParagraphId = ref<string | null>(null);

    const nav = useParagraphNavigation(paragraphs, scrollableContentRef, currentlyEditingParagraphId);

    const container = {
      scrollTop: 200,
      getBoundingClientRect: () => ({ top: 0, height: 1000 }),
    } as unknown as HTMLElement;

    const element = {
      getBoundingClientRect: () => ({ top: 300, height: 100 }), // elementTopRelative = 300 - 0 + 200 = 500
      focus: mock(() => {}),
    } as unknown as HTMLElement;

    scrollableContentRef.value = container;

    // 元素在可视区域内（不应滚动）
    nav.scrollToElementFast(element);
    rafQueue.flush([0, 1000]);
    expect((container as any).scrollTop).toBe(200);
  });

  it('当目标段落在下方不可见时，应只滚动到刚好可见（不居中）', () => {
    const rafQueue = createRafQueue();
    (globalThis as any).requestAnimationFrame = rafQueue.raf;

    const paragraphs = computed<Paragraph[]>(() => [createParagraph('p1', '段落1')]);
    const scrollableContentRef = ref<HTMLElement | null>(null);
    const currentlyEditingParagraphId = ref<string | null>(null);
    const nav = useParagraphNavigation(paragraphs, scrollableContentRef, currentlyEditingParagraphId);

    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, height: 1000 }),
    } as unknown as HTMLElement;

    const element = {
      // elementTopRelative = 1500 - 0 + 0 = 1500, bottom=1600
      getBoundingClientRect: () => ({ top: 1500, height: 100 }),
      focus: mock(() => {}),
    } as unknown as HTMLElement;

    scrollableContentRef.value = container;
    nav.scrollToElementFast(element);
    rafQueue.flush([0, 1000]);

    // marginPx = min(120, max(24, 1000 * 0.15=150)) = 120
    // 目标：elementBottom(1600) - containerHeight(1000) + margin(120) = 720
    expect((container as any).scrollTop).toBe(720);
  });

  it('当目标段落在上方不可见时，应只滚动到刚好可见（不居中）', () => {
    const rafQueue = createRafQueue();
    (globalThis as any).requestAnimationFrame = rafQueue.raf;

    const paragraphs = computed<Paragraph[]>(() => [createParagraph('p1', '段落1')]);
    const scrollableContentRef = ref<HTMLElement | null>(null);
    const currentlyEditingParagraphId = ref<string | null>(null);
    const nav = useParagraphNavigation(paragraphs, scrollableContentRef, currentlyEditingParagraphId);

    const container = {
      scrollTop: 800,
      getBoundingClientRect: () => ({ top: 0, height: 1000 }),
    } as unknown as HTMLElement;

    const element = {
      // elementTopRelative = 100 - 0 + 800 = 900 (在可视范围内) -> 我们需要一个在上方的：top=0 => relative=800
      getBoundingClientRect: () => ({ top: -200, height: 100 }), // elementTopRelative = -200 - 0 + 800 = 600
      focus: mock(() => {}),
    } as unknown as HTMLElement;

    scrollableContentRef.value = container;
    nav.scrollToElementFast(element);
    rafQueue.flush([0, 1000]);

    // marginPx = 120
    // visibleTop=800，topThreshold=920，elementTop=600 < 920 => target = elementTop - margin = 480
    expect((container as any).scrollTop).toBe(480);
  });
});


