import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import PrimeVue from 'primevue/config';
import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import ImportPlanConflicts from '../components/import/ImportPlanConflicts.vue';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { useBooksStore } from '../stores/books';
import type { ImportPlan } from '../models/import';
import type { Novel } from '../models/novel';

let app: App | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
});

const BOOK = {
  id: 'book',
  title: '作品',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  volumes: [
    {
      id: 'v',
      title: '正文',
      chapters: [
        { id: 'c1', title: '第1話', createdAt: new Date(0), lastEdited: new Date(0) },
        { id: 'c2', title: '第2話', createdAt: new Date(0), lastEdited: new Date(0) },
      ],
    },
  ],
} as unknown as Novel;

function replacement(signature: string, chapterId: string, confirmed = false) {
  return {
    signature,
    oldKeys: [{ chapterId, paragraphId: `${signature}-p` }],
    newKeys: [`${signature}-n1`, `${signature}-n2`],
    oldTexts: [`${signature} 旧原文`],
    newTexts: [`${signature} 新原文一`, `${signature} 新原文二`],
    clearedVersions: 2,
    confirmed,
  };
}

/** 合章后跨越 c1、c2 的替换 */
function crossReplacement(signature: string) {
  return {
    ...replacement(signature, 'c1'),
    oldKeys: [
      { chapterId: 'c1', paragraphId: `${signature}-p1` },
      { chapterId: 'c2', paragraphId: `${signature}-p2` },
    ],
  };
}

function plan(extra: ReturnType<typeof replacement>[] = []): ImportPlan {
  return {
    targetBookId: 'book',
    chapterChanges: [],
    conflicts: [
      {
        code: 'REPLACEMENT_REQUIRED',
        message: '多对多修订需要确认替换范围及译文损失',
        chapterId: 'd1',
      },
      {
        code: 'REPLACEMENT_REQUIRED',
        message: '多对多修订需要确认替换范围及译文损失',
        chapterId: 'd1',
      },
      {
        code: 'REPLACEMENT_REQUIRED',
        message: '多对多修订需要确认替换范围及译文损失',
        chapterId: 'd2',
      },
      { code: 'TARGET_CONFIRMATION_REQUIRED', message: '请确认更新目标', chapterId: '' },
    ],
    replacements: [
      replacement('r1', 'c1'),
      replacement('r2', 'c1'),
      replacement('r3', 'c2'),
      replacement('r4', 'c1', true),
      ...extra,
    ],
  } as unknown as ImportPlan;
}

async function mount(extra: ReturnType<typeof replacement>[] = []) {
  host = document.createElement('div');
  document.body.appendChild(host);
  useBooksStore().$patch({ books: [BOOK] });
  app = createApp({ render: () => h(ImportPlanConflicts, { plan: plan(extra), disabled: false }) });
  app.use(PrimeVue);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  app.mount(host);
  await nextTick();
  return host;
}

const buttons = (root: Element, label: string) =>
  [...root.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes(label));
const groups = (root: Element) => [...root.querySelectorAll('[data-testid="ipc-replacement"]')];

describe('方案待处理项：多段替换按受影响章节合并', () => {
  it('每章一行，替换带出的冲突不再单独列出，其他冲突照常显示', async () => {
    const root = await mount();
    expect(root.textContent).not.toContain('多对多修订需要确认替换范围及译文损失');
    expect(root.textContent).toContain('请确认更新目标');
    expect(groups(root)).toHaveLength(2);
    expect(root.querySelector('.ipl-count')!.textContent).toBe('3');
  });

  it('章节行汇总本章的替换处数、段数与译文损失', async () => {
    const root = await mount();
    const [first, second] = groups(root);
    expect(first!.textContent).toContain('第1話');
    expect(first!.textContent).toContain('2 处替换：2 段旧原文 → 4 段新原文，清空 4 个译文版本');
    expect(second!.textContent).toContain('第2話');
    expect(second!.textContent).toContain('1 处替换：1 段旧原文 → 2 段新原文，清空 2 个译文版本');
  });

  it('展开后逐处对比本章的旧原文与新原文', async () => {
    const root = await mount();
    const first = groups(root)[0]!;
    expect(first.textContent).not.toContain('r1 旧原文');
    buttons(first, '查看原文')[0]!.click();
    await nextTick();
    expect(first.textContent).toContain('r1 旧原文');
    expect(first.textContent).toContain('r2 新原文二');
    expect(first.textContent).not.toContain('r3 旧原文');
  });

  it('确认本章：一次提交本章全部签名', async () => {
    const root = await mount();
    const confirm = vi
      .spyOn(useImportWorkspaceStore(), 'confirmReplacements')
      .mockResolvedValue(undefined as never);
    buttons(groups(root)[0]!, '确认本章')[0]!.click();
    expect(confirm).toHaveBeenCalledWith(['r1', 'r2']);
  });

  it('全部确认替换：一次提交所有未确认的签名', async () => {
    const root = await mount();
    const confirm = vi
      .spyOn(useImportWorkspaceStore(), 'confirmReplacements')
      .mockResolvedValue(undefined as never);
    buttons(root, '全部确认替换')[0]!.click();
    expect(confirm).toHaveBeenCalledWith(['r1', 'r2', 'r3']);
  });

  it('跨章替换单独一行，列出全部受影响章节，确认只提交跨章的签名', async () => {
    const root = await mount([crossReplacement('r5')]);
    const confirm = vi
      .spyOn(useImportWorkspaceStore(), 'confirmReplacements')
      .mockResolvedValue(undefined as never);
    expect(groups(root)).toHaveLength(3);
    expect(root.querySelector('.ipl-count')!.textContent).toBe('4');

    const cross = groups(root)[2]!;
    expect(cross.textContent).toContain('跨 2 章');
    expect(cross.textContent).toContain('第1話');
    expect(cross.textContent).toContain('第2話');
    expect(buttons(cross, '确认本章')).toHaveLength(0);
    buttons(cross, '确认跨章替换')[0]!.click();
    expect(confirm).toHaveBeenLastCalledWith(['r5']);

    buttons(groups(root)[0]!, '确认本章')[0]!.click();
    expect(confirm).toHaveBeenLastCalledWith(['r1', 'r2']);
  });
});
