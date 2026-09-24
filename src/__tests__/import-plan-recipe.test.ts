import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, h } from 'vue';
import type { App } from 'vue';
import PrimeVue from 'primevue/config';
import ImportPlanRecipe from '../components/import/ImportPlanRecipe.vue';
import type { ImportPlan, ImportRecipeSummary } from '../models/import';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

const summary = (engine: string, url: string): ImportRecipeSummary => ({
  engine,
  catalogUrls: [url],
  cleanupRules: 1,
  pinned: 0,
  stripHeading: false,
  verifiedChapterCount: 9,
});
const before = summary('builtin:kakuyomu', 'https://kakuyomu.jp/works/1');
const after = summary('html', 'https://example.com/book');

function render(recipeChange?: ImportPlan['recipeChange']): HTMLElement {
  const host = document.createElement('div');
  app = createApp({
    setup: () => () => h(ImportPlanRecipe, { plan: { recipeChange } as unknown as ImportPlan }),
  });
  app.use(PrimeVue).mount(host);
  return host;
}
const text = (host: HTMLElement, id: string) =>
  host.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

describe('导入预览的更新配方区块', () => {
  it('新增：显示新配方与可复现章节数', () => {
    const host = render({ kind: 'add', verified: 12, after });
    expect(text(host, 'ipr-kind')).toBe('新增');
    expect(text(host, 'ipr-verified')).toBe('12 章');
    expect(host.textContent).toContain('通用网页');
    expect(host.textContent).toContain('https://example.com/book');
  });

  it('替换：显示新配方', () => {
    const host = render({ kind: 'replace', verified: 3, before, after });
    expect(text(host, 'ipr-kind')).toBe('替换');
    expect(host.textContent).toContain('https://example.com/book');
    expect(host.textContent).not.toContain('kakuyomu.jp');
  });

  it('保留原有：显示原配方', () => {
    const host = render({ kind: 'keep', verified: 9, before });
    expect(text(host, 'ipr-kind')).toBe('保留原有');
    expect(host.textContent).toContain('内置站点（kakuyomu）');
    expect(text(host, 'ipr-verified')).toBe('9 章');
  });

  it('已失效：说明原因和不一致的章节', () => {
    const host = render({
      kind: 'stale',
      verified: 1,
      before,
      after,
      reason: '配方已失效，本次不会写入配方：「第2话」回放多出 1 行：次の話へ',
      issues: [{ code: 'CONTENT_MISMATCH', message: '「第2话」回放多出 1 行：次の話へ' }],
    });
    expect(text(host, 'ipr-kind')).toBe('已失效');
    expect(text(host, 'ipr-reason')).toContain('配方已失效，本次不会写入配方');
    expect(host.querySelector('.ipr-issues')?.textContent).toContain('「第2话」');
  });

  it('没有配方变化时不显示', () => {
    expect(render(undefined).querySelector('[data-testid="ipr-recipe"]')).toBeNull();
  });
});
