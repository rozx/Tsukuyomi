import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App, Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import type { AppLocale } from '../models/locale';
import ImportPageDesktop from '../pages/import-page/ImportPageDesktop.vue';
import ImportPageTablet from '../pages/import-page/ImportPageTablet.vue';
import ImportPageMobile from '../pages/import-page/ImportPageMobile.vue';
import { provideImportPage } from '../composables/import-page/useImportPage';
import type { ImportPageContext } from '../composables/import-page/useImportPage';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { useSettingsStore } from '../stores/settings';
import { ImportRepository } from '../services/import/import-repository';
import { ImportDraftService } from '../services/import/import-draft-service';
import { webLocksFixture } from './web-locks-fixture';
import { draft } from './import-fixtures';

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));
// jsdom 没有 ResizeObserver；自动增高的文本框与本测试无关
vi.mock('primevue/textarea', () => ({ default: { render: () => null } }));

const CJK = /[぀-ヿ㐀-鿿]/;
/**
 * 不属于导入工作台的文字：共用聊天组件（消息列表空状态、头像、发送按钮、未配置模型占位）
 * 由聊天面板迁移负责；「小说」是测试草稿夹具中的候选作品名（用户数据）。
 */
const OUT_OF_SCOPE = [
  '妾身月詠，于此恭候',
  '可问翻译、术语、章节诸事',
  '月詠',
  '未配置助手模型',
  '发送',
  '小说',
];
function withoutOutOfScope(text: string): string {
  return OUT_OF_SCOPE.reduce((rest, entry) => rest.split(entry).join(''), text);
}
/** 只在简体中出现的常见字，繁中界面不应出现。 */
const SIMPLIFIED = /[导来务择选设载据预应进这没还为页码]/;

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: webLocksFixture(), languages: ['en-US'] });
  // jsdom 缺少的浏览器接口：标签页与下拉框挂载时会用到
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  useImportWorkspaceStore().dispose();
  vi.unstubAllGlobals();
});

/** 用户数据全部为 ASCII：界面中出现的中文只可能来自固定文字。 */
async function asciiTask(): Promise<string> {
  const input = await draft('Line one');
  await ImportRepository.mutateTask(input.taskId, (task) => {
    task.name = 'Task A';
    return Promise.resolve(undefined);
  });
  await ImportDraftService.edit(input.taskId, {
    baseDraftRevision: 1,
    operations: [
      { op: 'set_metadata', field: 'title', value: 'Novel A' },
      { op: 'upsert_volume', id: 'draft-v', title: 'Volume A' },
      { op: 'upsert_chapter', chapter: { ...input.chapter, title: 'Chapter A' } },
    ],
  });
  return input.taskId;
}

async function settle() {
  for (let n = 0; n < 30; n++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mountVariant(variant: Component, locale: AppLocale, taskId: string | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().setUiLocale(locale);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import/:taskId?', component: { render: () => null } }],
  });
  await router.push(taskId ? `/import/${taskId}` : '/import');
  let ctx!: ImportPageContext;
  const Host = defineComponent({
    setup() {
      ctx = provideImportPage();
      return () => h(variant);
    },
  });
  app = createApp(Host);
  app
    .use(pinia)
    .use(router)
    .use(PrimeVue, { unstyled: true })
    .use(createI18n({ legacy: false, locale, messages }))
    .mount(document.body.appendChild(document.createElement('div')));
  await settle();
  if (taskId) {
    await useImportWorkspaceStore().selectTask(taskId);
    await useImportWorkspaceStore().previewPlan();
  }
  await settle();
  return ctx;
}

/** 依次打开每个分区，收集整页可见文字与无障碍标签。 */
function snapshot(texts: string[]): void {
  texts.push(document.body.textContent ?? '');
  for (const element of document.querySelectorAll('[aria-label], [title], [placeholder]'))
    for (const name of ['aria-label', 'title', 'placeholder'])
      texts.push(element.getAttribute(name) ?? '');
}

/** 依次打开每个分区（以及来源内容、章节正文检查），收集整页可见文字与无障碍标签。 */
async function collect(ctx: ImportPageContext): Promise<string> {
  const texts: string[] = [];
  for (const section of ['tasks', 'chat', 'sources', 'draft', 'plan'] as const) {
    ctx.section.value = section;
    await settle();
    snapshot(texts);
    if (section === 'sources') {
      await ctx.showSource(useImportWorkspaceStore().sources[0]!.id);
      await vi.waitFor(() => expect(ctx.sourceText.value).not.toBeNull());
    } else if (section === 'draft') {
      ctx.selectChapter('draft-c');
      await vi.waitFor(() => expect(ctx.preview.value).not.toBeNull());
    } else continue;
    await settle();
    snapshot(texts);
    if (section === 'draft') ctx.selectChapter(null);
  }
  return texts.join('\n');
}

const VARIANTS: [string, Component][] = [
  ['Desktop', ImportPageDesktop],
  ['Tablet', ImportPageTablet],
  ['Mobile', ImportPageMobile],
];

describe('导入工作台三个设备变体跟随界面语言', () => {
  for (const [name, variant] of VARIANTS) {
    it(`${name}：英文界面没有中文固定文字`, async () => {
      const taskId = await asciiTask();
      const ctx = await mountVariant(variant, 'en-US', taskId);
      const text = withoutOutOfScope(await collect(ctx));
      expect(text).toContain('Volume A');
      expect(text).toContain('Line one');
      expect(text).not.toContain('importUi.');
      const leaks = [...text.matchAll(/.{0,30}[\u3040-\u30ff\u3400-\u9fff]+.{0,30}/g)].map(
        (m) => m[0],
      );
      expect([...new Set(leaks)]).toEqual([]);
    });

    it(`${name}：繁中界面使用繁体固定文字`, async () => {
      const taskId = await asciiTask();
      const ctx = await mountVariant(variant, 'zh-TW', taskId);
      const text = withoutOutOfScope(await collect(ctx));
      expect(text).toMatch(/匯入|來源/);
      expect(text).not.toContain('importUi.');
      expect(text.split('\n').filter((line) => SIMPLIFIED.test(line))).toEqual([]);
    });
  }

  it('没有任务时的桌面空状态与任务列表按界面语言显示', async () => {
    await mountVariant(ImportPageDesktop, 'en-US', null);
    expect(document.body.textContent).toContain('AI import');
    expect(document.body.textContent).not.toMatch(CJK);
  });
});
