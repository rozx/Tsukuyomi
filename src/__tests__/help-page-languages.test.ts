import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import * as Vue from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import axios from 'axios';
import { provideHelpPage } from '../composables/help-page/useHelpPage';
import messages from '../i18n';
import { helpDocsTools } from '../services/ai/tools/help-docs-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import MobileBottomSheet from '../components/layout/MobileBottomSheet.vue';
vi.mock('vue', async (importOriginal) => {
  const original = await importOriginal<typeof Vue>();
  return { ...original, nextTick: vi.fn(original.nextTick) };
});
const device = vi.hoisted(() => ({ variant: 'desktop' }));
vi.mock('src/composables/useResponsiveLayout', async () => {
  const { ref } = await import('vue');
  return {
    useResponsiveLayout: () => ({
      isPhone: ref(device.variant === 'mobile'),
      isTablet: ref(device.variant === 'tablet'),
    }),
  };
});
let app: App | undefined;
const oldScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeEach(() =>
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  }),
);
afterEach(() => {
  device.variant = 'desktop';
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.scrollTop = 0;
  if (oldScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', oldScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
const urlLocale = (url: unknown) =>
  String(url).includes('/en-US/') ? 'en-US' : String(url).includes('/zh-TW/') ? 'zh-TW' : 'zh-CN';
const index = (title: string, locale: string) => [
  {
    id: 'front-page',
    title,
    file: 'front-page.md',
    path: `help/${locale}`,
    category: title === 'Quick start' ? 'User guides' : '使用指南',
    categoryId: 'guides',
    description: '',
    sectionAliases: { 设置: 'front-settings' },
  },
];
function resources() {
  return vi.spyOn(axios, 'get').mockImplementation((url) => {
    const locale = urlLocale(url);
    if (String(url).endsWith('index.json'))
      return Promise.resolve({
        data: index(
          locale === 'en-US' ? 'Quick start' : locale === 'zh-TW' ? '快速開始' : '快速开始',
          locale,
        ),
      });
    return Promise.resolve({
      data:
        locale === 'en-US'
          ? '# Quick start {#front-start}\n\n## Settings {#front-settings}\nFull English content.'
          : '# 快速开始 {#front-start}\n\n## 设置 {#front-settings}\n完整简中正文。',
    });
  });
}
async function flush() {
  for (let n = 0; n < 16; n++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(path = '/help/front-page#front-settings', withTocSheet = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/help/:docId?', component: { render: () => null } }],
  });
  await router.push(path);
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
  let ctx!: ReturnType<typeof provideHelpPage>;
  app = createApp({
    setup() {
      ctx = provideHelpPage();
      return () =>
        h('div', [
          h('div', { class: 'help-content-scroll' }, [
            h('article', { innerHTML: ctx.content.value }),
          ]),
          withTocSheet
            ? h(MobileBottomSheet, { visible: ctx.showTocDrawer.value, title: '目录' })
            : null,
        ]);
    },
  });
  app.use(router).use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await flush();
  return { ctx, i18n, router };
}
describe('帮助页面语言切换', () => {
  for (const variant of ['desktop', 'tablet', 'mobile']) {
    it(`${variant}初次打开帮助默认读取快速开始完整正文`, async () => {
      device.variant = variant;
      resources();
      const { ctx } = await mount('/help');
      expect(ctx.currentDoc.value?.id).toBe('front-page');
      expect(ctx.content.value).toContain('完整简中正文');
    });
  }

  it('英文执行导航到已切繁中的同文档章节，工具反馈为简中单源', async () => {
    resources();
    const { ctx, i18n, router } = await mount();
    i18n.global.locale.value = 'zh-TW';
    await flush();
    const tool = helpDocsTools.find(
      (entry) => entry.definition.function.name === 'navigate_to_help_doc',
    )!;
    const actions: Array<{ data: Record<string, unknown> }> = [];
    const result = JSON.parse(
      await tool.handler(
        { doc_id: 'front-page', section_id: '设置' },
        {
          languages: captureExecutionLanguages('en-US'),
          onAction: (action) => actions.push(action as { data: Record<string, unknown> }),
        },
      ),
    );
    const action = actions[0]!;
    await router.push(`/help/${String(action.data.doc_id)}#${String(action.data.section_id)}`);
    await flush();
    expect(result.message).toMatch(/^已导航到帮助文档: /);
    expect(ctx.currentDoc.value?.title).toBe('快速開始');
    expect(ctx.activeHeading.value).toBe('front-settings');
  });

  it('缓存定位等待期间切语言后不再滚动旧章节', async () => {
    const get = resources();
    const { ctx, i18n } = await mount();
    ctx.activeHeading.value = '';
    await flush();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(Vue, 'nextTick').mockImplementationOnce(() => {
      entered.resolve();
      return release.promise;
    });
    const pending = ctx.loadDocumentIndex();
    await entered.promise;
    const normal = get.getMockImplementation()!;
    const newIndex = Promise.withResolvers<void>();
    get.mockImplementation(async (url, options) => {
      if (String(url).endsWith('help/en-US/index.json')) await newIndex.promise;
      return normal(url, options);
    });
    i18n.global.locale.value = 'en-US';
    const heading = document.body.appendChild(document.createElement('h2'));
    heading.id = 'front-settings';
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    scroll.mockClear();
    release.resolve();
    await pending;
    expect(scroll).not.toHaveBeenCalled();
    heading.remove();
    newIndex.resolve();
    await flush();
  });
  for (const hash of ['#model-settings', '']) {
    it(`跨文档导航采用新章节或置顶（hash=${hash}）`, async () => {
      const get = resources();
      const normal = get.getMockImplementation()!;
      get.mockImplementation((url, options) => {
        if (String(url).endsWith('index.json'))
          return Promise.resolve({
            data: [
              ...index('快速开始', urlLocale(url)),
              {
                ...index('模型指南', urlLocale(url))[0],
                id: 'ai-models-guide',
                file: 'ai-models-guide.md',
              },
            ],
          });
        if (String(url).endsWith('ai-models-guide.md'))
          return Promise.resolve({
            data: `# Models {#model-start}

## Model settings {#model-settings}
Configure models.`,
          });
        return normal(url, options);
      });
      const { ctx, router } = await mount();
      ctx.scrollToHeading('front-settings');
      await flush();
      document.querySelector<HTMLElement>('.help-content-scroll')!.scrollTop = 500;
      await router.push(`/help/ai-models-guide${hash}`);
      await flush();
      expect(router.currentRoute.value.hash).toBe(hash);
      if (hash) expect(ctx.activeHeading.value).toBe('model-settings');
      else expect(document.querySelector<HTMLElement>('.help-content-scroll')!.scrollTop).toBe(0);
    });
  }

  it('主题绑定稳定文档ID，不按翻译后的标题猜测', async () => {
    const get = resources();
    const normal = get.getMockImplementation()!;
    get.mockImplementation((url, options) => {
      if (String(url).endsWith('index.json'))
        return Promise.resolve({
          data: [
            ...index(String(url).includes('/en-US/') ? 'Quick start' : '快速开始', urlLocale(url)),
            {
              ...index('Quick start', urlLocale(url))[0],
              id: 'books-page-guide',
              file: 'books-page-guide.md',
              title: String(url).includes('/en-US/') ? 'Book library' : '书籍列表页',
              description: 'Search and sort books',
            },
          ],
        });
      return normal(url, options);
    });
    const { ctx, i18n } = await mount();
    i18n.global.locale.value = 'en-US';
    await flush();
    expect(ctx.topicTiles.value[0]!.doc?.id).toBe('books-page-guide');
    expect(ctx.topicTiles.value[0]!.label).toBe('Book library');
    expect(ctx.quickStartSteps.value[0]!.t).toBe('Configure AI models');
  });
  it('导航到新分类的文档仍展开该分类，同文档语言切换保留折叠', async () => {
    const get = resources();
    const normal = get.getMockImplementation()!;
    get.mockImplementation((url, options) =>
      String(url).endsWith('index.json')
        ? Promise.resolve({
            data: [
              ...index('快速开始', urlLocale(url)),
              {
                id: 'v1',
                title: 'v1',
                file: 'RELEASE_NOTES_v1.md',
                path: 'releaseNotes',
                category: '更新日志',
                categoryId: 'release-notes',
                description: '',
              },
            ],
          })
        : normal(url, options),
    );
    const { ctx, router } = await mount();
    expect(ctx.isCategoryExpanded('release-notes')).toBe(false);
    await router.push('/help/v1');
    await flush();
    expect(ctx.isCategoryExpanded('release-notes')).toBe(true);
  });

  it('普通滚动阅读未写hash时切语言仍保留可对应章节位置', async () => {
    resources();
    const { ctx, i18n, router } = await mount();
    await router.replace('/help/front-page');
    await flush();
    ctx.activeHeading.value = '';
    const container = document.querySelector<HTMLElement>('.help-content-scroll')!;
    container.scrollTop = 400;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 700,
    } as DOMRect);
    vi.spyOn(document.getElementById('front-start')!, 'getBoundingClientRect').mockReturnValue({
      top: -300,
    } as DOMRect);
    vi.spyOn(document.getElementById('front-settings')!, 'getBoundingClientRect').mockReturnValue({
      top: 95,
    } as DOMRect);
    i18n.global.locale.value = 'en-US';
    await flush();
    expect(ctx.activeHeading.value).toBe('front-settings');
    expect(ctx.content.value).toContain('Full English content');
  });

  it('手机文档滚动后切语言保留视口正在阅读的章节，而非旧 hash', async () => {
    device.variant = 'mobile';
    resources();
    const { ctx, i18n } = await mount('/help/front-page#front-start');
    document.documentElement.scrollTop = 400;
    const header = document.body.appendChild(document.createElement('div'));
    header.className = 'mobile-shell-sysbar';
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ bottom: 37 } as DOMRect);
    vi.spyOn(
      document.querySelector('.help-content-scroll')!,
      'getBoundingClientRect',
    ).mockReturnValue({
      top: -300,
    } as DOMRect);
    vi.spyOn(document.getElementById('front-start')!, 'getBoundingClientRect').mockReturnValue({
      top: -280,
    } as DOMRect);
    vi.spyOn(document.getElementById('front-settings')!, 'getBoundingClientRect').mockReturnValue({
      top: 30,
    } as DOMRect);

    i18n.global.locale.value = 'en-US';
    await flush();

    expect(ctx.activeHeading.value).toBe('front-settings');
    expect(ctx.content.value).toContain('Full English content');
    document.documentElement.scrollTop = 0;
  });

  it('手机目录跳转先关闭抽屉并释放文档滚动锁，再定位章节', async () => {
    device.variant = 'mobile';
    resources();
    const { ctx } = await mount('/help/front-page#front-start', true);
    ctx.showTocDrawer.value = true;
    await flush();
    expect(document.body.style.overflow).toBe('hidden');
    const lockedAtScroll: boolean[] = [];
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {
      lockedAtScroll.push(document.body.style.overflow === 'hidden');
    });

    ctx.scrollToHeading('front-settings');
    await flush();

    expect(lockedAtScroll.length).toBeGreaterThan(0);
    expect(lockedAtScroll).not.toContain(true);
    expect(ctx.showTocDrawer.value).toBe(false);
  });

  for (const pendingPart of ['index', 'markdown'] as const) {
    it(`旧语言${pendingPart}晚返回不覆盖新页面`, async () => {
      const get = resources();
      const normal = get.getMockImplementation()!;
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      get.mockImplementation(async (url, options) => {
        const path = String(url);
        if (
          path.endsWith(
            pendingPart === 'index' ? 'help/zh-CN/index.json' : 'help/zh-CN/front-page.md',
          )
        ) {
          entered.resolve();
          await release.promise;
        }
        return normal(url, options);
      });
      const { ctx, i18n } = await mount();
      await entered.promise;
      i18n.global.locale.value = 'en-US';
      await flush();
      expect(ctx.content.value).toContain('Full English content');
      release.resolve();
      await flush();
      expect(ctx.content.value).toContain('Full English content');
      expect(ctx.currentDoc.value?.title).toBe('Quick start');
      expect(ctx.documents.value[0]?.title).toBe('Quick start');
      expect(ctx.loading.value).toBe(false);
    });
  }
  it('分类按稳定ID保留折叠，旧中文章节链接映射新ID', async () => {
    resources();
    const { ctx, i18n, router } = await mount();
    expect(ctx.isCategoryExpanded('guides')).toBe(true);
    ctx.toggleCategory('guides');
    i18n.global.locale.value = 'en-US';
    await flush();
    expect(ctx.isCategoryExpanded('guides')).toBe(false);
    expect(ctx.groupedDocuments.value['guides']).toHaveLength(1);
    ctx.scrollToHeading('设置');
    await flush();
    expect(router.currentRoute.value.hash).toBe('#front-settings');
    expect(ctx.activeHeading.value).toBe('front-settings');
  });
  it('卸载后未完成的文档请求不再写回', async () => {
    const get = resources();
    const normal = get.getMockImplementation()!;
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    get.mockImplementation(async (url, options) => {
      if (String(url).endsWith('help/zh-CN/front-page.md')) {
        entered.resolve();
        await release.promise;
      }
      return normal(url, options);
    });
    const { ctx } = await mount();
    await entered.promise;
    app!.unmount();
    app = undefined;
    release.resolve();
    await flush();
    expect(ctx.content.value).toBe('');
    expect(ctx.loading.value).toBe(false);
  });

  it('简中资源正常显示，切语言保留文档与章节并读取完整对应正文', async () => {
    resources();
    const { ctx, i18n, router } = await mount();
    expect(ctx.currentDoc.value?.title).toBe('快速开始');
    expect(ctx.content.value).toContain('完整简中正文');
    i18n.global.locale.value = 'en-US';
    await flush();
    expect(ctx.currentDoc.value?.id).toBe('front-page');
    expect(ctx.currentDoc.value?.title).toBe('Quick start');
    expect(ctx.content.value).toContain('Full English content');
    expect(ctx.toc.value.some((heading) => heading.id === 'front-settings')).toBe(true);
    expect(router.currentRoute.value.hash).toBe('#front-settings');
  });
});
