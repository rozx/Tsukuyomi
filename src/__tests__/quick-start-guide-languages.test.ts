import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Slots } from 'vue';
import { createI18n } from 'vue-i18n';
import axios from 'axios';
import messages from '../i18n';
import QuickStartGuideDialog from '../components/dialogs/QuickStartGuideDialog.vue';

vi.mock('src/components/layout/AdaptiveDialog.vue', () => ({
  default: {
    props: ['header'],
    setup:
      (props: { header: string }, { slots }: { slots: Slots }) =>
      () =>
        h('section', [h('header', props.header), slots.default?.(), slots.footer?.()]),
  },
}));
vi.mock('primevue/button', () => ({
  default: { props: ['label'], template: '<button>{{ label }}</button>' },
}));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
async function flush() {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
function resources() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('# 快速开始 {#start}\n完整简中指南。'),
  );
  return vi.spyOn(axios, 'get').mockImplementation((url) => {
    const english = String(url).includes('/en-US/');
    if (String(url).endsWith('index.json'))
      return Promise.resolve({
        data: [
          {
            id: 'front-page',
            title: english ? 'Quick start' : '快速开始',
            description: '',
            category: 'guides',
            path: english ? 'help/en-US' : 'help',
            file: 'front-page.md',
          },
        ],
      });
    return Promise.resolve({
      data: english
        ? '# Quick start {#start}\nComplete English guide.'
        : '# 快速开始 {#start}\n完整简中指南。',
    });
  });
}
async function mount() {
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
  app = createApp(QuickStartGuideDialog, { visible: true });
  app.use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await flush();
  return i18n;
}
describe('首次启动指南使用共用语言资源', () => {
  it('切到未完成语言后切回已读取语言仍显示完整正文', async () => {
    const get = resources();
    const normal = get.getMockImplementation()!;
    const release = Promise.withResolvers<void>();
    get.mockImplementation(async (url, options) => {
      if (String(url).includes('/zh-TW/')) await release.promise;
      return normal(url, options);
    });
    const i18n = await mount();
    expect(document.body.textContent).toContain('Complete English guide.');
    i18n.global.locale.value = 'zh-TW';
    await flush();
    i18n.global.locale.value = 'en-US';
    await flush();
    expect(document.body.textContent).toContain('Complete English guide.');
    release.resolve();
    await flush();
  });

  it('英文首开与切简中使用完整对应正文和本地化按钮，不显示锚点标记', async () => {
    resources();
    const i18n = await mount();
    expect(document.body.textContent).toContain('Complete English guide.');
    expect(document.querySelector('header')?.textContent).toBe('Quick start guide');
    expect(document.body.textContent).not.toContain('{#');
    i18n.global.locale.value = 'zh-CN';
    await flush();
    expect(document.body.textContent).toContain('完整简中指南。');
    expect(document.body.textContent).not.toContain('Complete English guide.');
  });
  it('旧语言正文晚返回不能覆盖新语言', async () => {
    const get = resources();
    const normal = get.getMockImplementation()!;
    const release = Promise.withResolvers<void>();
    get.mockImplementation(async (url, options) => {
      if (String(url).endsWith('help/en-US/front-page.md')) await release.promise;
      return normal(url, options);
    });
    const i18n = await mount();
    i18n.global.locale.value = 'zh-CN';
    await flush();
    release.resolve();
    await flush();
    expect(document.body.textContent).toContain('完整简中指南。');
    expect(document.body.textContent).not.toContain('Complete English guide.');
  });
});
