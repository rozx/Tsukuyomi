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

function plan(): ImportPlan {
  return {
    targetBookId: 'book',
    chapterChanges: [],
    conflicts: [
      {
        code: 'REPLACEMENT_REQUIRED',
        message: '多对多修订需要确认替换范围及译文损失',
        chapterId: 'd1',
        newKeys: ['r1-n1', 'r1-n2'],
      },
      {
        code: 'REPLACEMENT_REQUIRED',
        message: '多对多修订需要确认替换范围及译文损失',
        chapterId: 'd2',
        newKeys: ['r2-n1', 'r2-n2'],
      },
      { code: 'TARGET_CONFIRMATION_REQUIRED', message: '请确认更新目标', chapterId: '' },
    ],
    replacements: [replacement('r1', 'c1'), replacement('r2', 'c2'), replacement('r3', 'c1', true)],
  } as unknown as ImportPlan;
}

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  useBooksStore().$patch({ books: [BOOK] });
  app = createApp({ render: () => h(ImportPlanConflicts, { plan: plan(), disabled: false }) });
  app.use(PrimeVue);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  app.mount(host);
  await nextTick();
  return host;
}

const buttons = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes(label));

describe('方案待处理项：多段替换', () => {
  it('替换对应的冲突不再单独列一行，其他冲突照常显示', async () => {
    const root = await mount();
    expect(root.textContent).not.toContain('多对多修订需要确认替换范围及译文损失');
    expect(root.textContent).toContain('请确认更新目标');
    expect(root.querySelectorAll('[data-testid="ipc-replacement"]')).toHaveLength(2);
  });

  it('每条替换写明所在章节，展开后对比旧原文与新原文', async () => {
    const root = await mount();
    const rows = [...root.querySelectorAll('[data-testid="ipc-replacement"]')];
    expect(rows[0]!.textContent).toContain('第1話');
    expect(rows[1]!.textContent).toContain('第2話');
    expect(rows[0]!.textContent).not.toContain('r1 旧原文');

    buttons(rows[0] as HTMLElement, '查看原文')[0]!.click();
    await nextTick();
    expect(rows[0]!.textContent).toContain('r1 旧原文');
    expect(rows[0]!.textContent).toContain('r1 新原文一');
    expect(rows[0]!.textContent).toContain('r1 新原文二');
  });

  it('全部确认替换：一次提交所有未确认的签名', async () => {
    const root = await mount();
    const store = useImportWorkspaceStore();
    const confirmAll = vi.spyOn(store, 'confirmReplacements').mockResolvedValue(undefined as never);

    buttons(root, '全部确认替换')[0]!.click();

    expect(confirmAll).toHaveBeenCalledWith(['r1', 'r2']);
  });

  it('单条确认也走批量接口', async () => {
    const root = await mount();
    const store = useImportWorkspaceStore();
    const confirm = vi.spyOn(store, 'confirmReplacements').mockResolvedValue(undefined as never);
    const row = root.querySelectorAll('[data-testid="ipc-replacement"]')[1] as HTMLElement;

    buttons(row, '确认替换')[0]!.click();

    expect(confirm).toHaveBeenCalledWith(['r2']);
  });
});
