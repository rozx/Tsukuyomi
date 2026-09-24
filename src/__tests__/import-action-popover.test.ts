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

describe('更新配方声明的详情浮层', () => {
  it('展示阶段、引擎、可复现章节数和全部差异示例', async () => {
    const { importEventsToMessages } =
      await import('../composables/import-page/import-chat-messages');
    const call = {
      id: 'r',
      type: 'function' as const,
      function: {
        name: 'record_update_recipe',
        arguments: JSON.stringify({ base_draft_revision: 2, catalog_source_ids: ['cat'] }),
      },
    };
    const [action] = importEventsToMessages(
      [
        {
          id: 'm',
          taskId: 't',
          sequence: 1,
          createdAt: 1,
          kind: 'message',
          data: {},
          message: { role: 'assistant', content: '', tool_calls: [call] },
        },
        {
          id: 'res',
          taskId: 't',
          sequence: 2,
          createdAt: 2,
          kind: 'tool-result',
          callId: 'r',
          toolName: 'record_update_recipe',
          data: {
            success: false,
            error: { code: 'CONTENT_MISMATCH', message: '「第3话」回放多出 1 行：次の話へ' },
            issues: [
              { code: 'CONTENT_MISMATCH', message: '「第3话」回放多出 1 行：次の話へ' },
              { code: 'CONTENT_MISMATCH', message: '「第5话」回放缺少 1 行：あとがき' },
            ],
            engine: 'html',
            verified: 4,
            pinned: 0,
          },
        },
      ],
      {
        sourceNames: new Map([['cat', '作品目录']]),
        task: { name: '书', draft: { chapters: [], volumes: [] } },
      },
    ).flatMap((message) => message.actions ?? []);
    const panel = ref<InstanceType<typeof ChatActionDetailsPopover>>();
    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({
      setup: () => () =>
        h('div', [
          h('button', { onClick: (event: MouseEvent) => panel.value?.toggle(event) }, '操作'),
          h(ChatActionDetailsPopover, {
            ref: panel,
            action: action!,
            context: { getBookById: () => undefined, getCurrentBookId: () => null },
          }),
        ]),
    });
    app.use(createPinia()).use(PrimeVue).mount(host);
    host.querySelector('button')!.click();
    await nextTick();
    const text = document.querySelector('.action-popover-content')?.textContent ?? '';
    expect(text).toContain('自测未通过，草稿未修改');
    expect(text).toContain('通用网页');
    expect(text).toContain('可复现章节');
    expect(text).toContain('「第5话」回放缺少 1 行：あとがき');
  });
});
