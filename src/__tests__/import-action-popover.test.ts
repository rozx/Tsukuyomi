import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ChatActionDetailsPopover from '../components/layout/ChatActionDetailsPopover.vue';

let app: App | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.useRealTimers();
});

describe('导入操作详情浮层', () => {
  it('展示完整的多行详情，鼠标移入浮层后仍可停留查看，离开后关闭', async () => {
    vi.useFakeTimers();
    const panel = ref<InstanceType<typeof ChatActionDetailsPopover>>();
    const full = '^' + '完整规则'.repeat(50) + '$';
    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({
      setup: () => () =>
        h('div', [
          h('button', { onClick: (event: MouseEvent) => panel.value?.toggle(event) }, '操作'),
          h(ChatActionDetailsPopover, {
            ref: panel,
            action: {
              type: 'read',
              entity: 'chapter',
              name: '预览正文清理',
              nameIsDescription: true,
              timestamp: 1,
              descriptionDetails: [
                { label: '正则表达式', value: full },
                { label: '修改前', value: '广告\n正文' },
              ],
            },
            context: { getBookById: () => undefined, getCurrentBookId: () => null },
          }),
        ]),
    });
    app.use(createPinia()).use(PrimeVue).mount(host);
    host.querySelector('button')!.click();
    await nextTick();
    expect(document.body.textContent).toContain(full);
    panel.value!.hide();
    document.querySelector('.action-popover-content')!.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();
    expect(document.querySelector('.action-popover-content')?.textContent).toContain('广告\n正文');
    document.querySelector('.action-popover-content')!.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(800);
    await nextTick();
    expect(document.querySelector('.action-popover-content')).toBeNull();
  });
});
