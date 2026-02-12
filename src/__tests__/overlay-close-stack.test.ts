import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { effectScope, nextTick, ref } from 'vue';
import {
  useOverlayCloseStack,
  resetOverlayCloseStackForTests,
} from 'src/composables/useOverlayCloseStack';

const dispatchEscape = () => {
  const event = new Event('keydown') as KeyboardEvent;
  Object.defineProperty(event, 'key', {
    value: 'Escape',
    configurable: true,
  });
  globalThis.dispatchEvent(event);
};

describe('useOverlayCloseStack', () => {
  beforeEach(() => {
    resetOverlayCloseStackForTests();
  });
  it('应按后进先出顺序响应 Escape 关闭叠层', async () => {
    const closed: string[] = [];
    const firstOpen = ref(false);
    const secondOpen = ref(false);

    const scope = effectScope();
    scope.run(() => {
      useOverlayCloseStack({
        isOpen: firstOpen,
        onClose: () => {
          closed.push('first');
        },
      });
      useOverlayCloseStack({
        isOpen: secondOpen,
        onClose: () => {
          closed.push('second');
        },
      });
    });

    firstOpen.value = true;
    await nextTick();
    secondOpen.value = true;
    await nextTick();

    dispatchEscape();
    expect(closed).toEqual(['second']);

    secondOpen.value = false;
    await nextTick();

    dispatchEscape();
    expect(closed).toEqual(['second', 'first']);

    scope.stop();
  });

  it('禁用状态下不应响应 Escape', async () => {
    const closed: string[] = [];
    const open = ref(true);
    const enabled = ref(false);

    const scope = effectScope();
    scope.run(() => {
      useOverlayCloseStack({
        isOpen: open,
        enabled,
        onClose: () => {
          closed.push('closed');
        },
      });
    });

    await nextTick();
    dispatchEscape();

    expect(closed).toEqual([]);

    scope.stop();
  });
});
