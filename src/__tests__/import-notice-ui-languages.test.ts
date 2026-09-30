import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { provideImportPage } from '../composables/import-page/useImportPage';
import { ImportRepository } from '../services/import/import-repository';
import { vi } from 'vitest';
import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import ImportExcludedList from '../components/import/ImportExcludedList.vue';
import ImportPlanRecipe from '../components/import/ImportPlanRecipe.vue';
import { importFailure } from '../services/import/import-error';
import type { ImportPlan } from '../models/import';
vi.mock('src/composables/import-page/useImportDraftDeletion', () => ({
  useImportDraftDeletion: () => () => undefined,
}));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});
describe('导入持久化提示的界面显示', () => {
  it('真实来源预览异常保留身份，英文及切繁中时显示对应说明', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await useSettingsStore().setUiLocale('en-US');
    const task = await ImportRepository.createTask();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/import/:taskId?', component: { render: () => null } }],
    });
    await router.push(`/import/${task.id}`);
    let ctx!: ReturnType<typeof provideImportPage>;
    app = createApp({
      setup() {
        ctx = provideImportPage();
        return () => h('div', ctx.sourceTextError.value ?? '');
      },
    });
    app
      .use(pinia)
      .use(router)
      .mount(document.body.appendChild(document.createElement('div')));
    for (let n = 0; n < 20; n++) {
      await Promise.resolve();
      await nextTick();
    }
    await useImportWorkspaceStore().selectTask(task.id);
    await ctx.showSource('missing');
    expect(ctx.sourceTextError.value).toContain('source');
    expect(ctx.sourceTextError.value).not.toMatch(/\p{Script=Han}/u);
    await useSettingsStore().setUiLocale('zh-TW');
    await nextTick();
    expect(ctx.sourceTextError.value).toContain('來源');
    useImportWorkspaceStore().dispose();
  });

  it('排除原因跟随界面语言，原文与旧自定义原因不翻译', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({
      setup: () => () =>
        h(ImportExcludedList, {
          entries: [
            { text: '用户原文', reason: importFailure('METADATA_BLOCK', 'noticeMetadata') },
            { text: 'Original', reason: '用户保留的原因' },
          ],
        }),
    });
    app.use(i18n).mount(document.body.appendChild(document.createElement('div')));
    document.querySelector<HTMLButtonElement>('button')!.click();
    await nextTick();
    expect(document.body.textContent).toContain('Metadata');
    expect(document.body.textContent).toContain('用户原文');
    expect(document.body.textContent).toContain('用户保留的原因');
    expect(document.body.textContent).not.toContain('[object Object]');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(document.body.textContent).toContain('中繼資料');
  });
  it('配方失效原因与自有问题本地化，用户标题保留', () => {
    const issue = importFailure('CONTENT_MISMATCH', 'recipeExtraLines', {
      title: '用户标题',
      count: 1,
      sample: 'Original sample',
    });
    const plan = {
      recipeChange: {
        kind: 'stale',
        verified: 0,
        reason: importFailure('RECIPE_STALE', 'recipeStale', { detail: 'External detail' }),
        issues: [issue],
      },
    } as unknown as ImportPlan;
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    app = createApp({ setup: () => () => h(ImportPlanRecipe, { plan }) });
    app
      .use(PrimeVue)
      .use(i18n)
      .mount(document.body.appendChild(document.createElement('div')));
    expect(document.querySelector('[data-testid="ipr-reason"]')?.textContent).toContain(
      'will not be saved',
    );
    expect(document.querySelector('.ipr-issues')?.textContent).toContain('extra lines');
    expect(document.body.textContent).toContain('用户标题');
    expect(document.body.textContent).not.toContain('[object Object]');
  });
});
