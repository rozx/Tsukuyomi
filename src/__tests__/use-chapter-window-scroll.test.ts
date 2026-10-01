import { afterEach, describe, expect, it } from 'bun:test';
import './setup';
import { vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope } from 'vue';
import type { Paragraph } from '../models/novel';
import { useChapterVirtualizer } from '../composables/book-details/useChapterVirtualizer';

const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
let scope: EffectScope | undefined;

afterEach(() => {
  scope?.stop();
  scope = undefined;
  vi.restoreAllMocks();
  if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
});

describe('章节列表使用窗口滚动', () => {
  it('窗口滚动后显示后续段落，并保持渲染数量有限', async () => {
    let offset = 0;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => offset });
    const paragraphs = ref<Paragraph[]>(
      Array.from({ length: 300 }, (_, index) => ({
        id: `paragraph-${index}`,
        text: '章节正文。',
        translations: [],
        selectedTranslationId: '',
      })),
    );
    scope = effectScope();
    const api = scope.run(() =>
      useChapterVirtualizer({
        scrollElement: ref(document.documentElement),
        scrollTarget: 'window',
        paragraphs,
        mode: 'mobile',
        scrollMargin: ref(120),
      }),
    )!;
    await nextTick();

    expect(api.virtualRows.value[0]?.index).toBe(0);
    expect(api.virtualRows.value.length).toBeLessThan(40);

    offset = 3000;
    window.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(api.virtualRows.value[0]?.index).toBeGreaterThan(20);
    expect(api.virtualRows.value.length).toBeLessThan(40);
    expect(api.blockStart.value).toBeGreaterThan(0);
  });
});
