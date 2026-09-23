import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import ImportDraftPanel from '../components/import/ImportDraftPanel.vue';
import { provideImportPage } from '../composables/import-page/useImportPage';
import type { ImportPageContext } from '../composables/import-page/useImportPage';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportPreviewService } from '../services/import/import-preview-service';
import { draft } from './import-fixtures';
import { deferred, webLocksFixture } from './web-locks-fixture';

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirm }) }));
// 元信息表单不参与卷章删除，避免 jsdom 中无关的 Textarea ResizeObserver。
vi.mock('src/components/import/ImportDraftMetadata.vue', () => ({
  default: { render: () => null },
}));

let app: App | undefined;
let host: HTMLElement | undefined;
let ctx: ImportPageContext;
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: webLocksFixture() });
  confirm.mockClear();
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  useImportWorkspaceStore().dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountDraft() {
  const input = await draft('草稿原文');
  await ImportDraftService.edit(
    input.taskId,
    {
      baseDraftRevision: 1,
      operations: [
        { op: 'upsert_volume', id: 'v2', title: '第二卷' },
        {
          op: 'upsert_chapter',
          chapter: { ...input.chapter, id: 'c2', title: '第二章', volumeId: 'v2' },
        },
      ],
    },
    { actor: 'user' },
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import/:taskId?', component: { render: () => null } }],
  });
  await router.push(`/import/${input.taskId}`);
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({
    setup() {
      ctx = provideImportPage();
      return () => h(ImportDraftPanel);
    },
  });
  app.use(getActivePinia()!).use(router).use(PrimeVue, { unstyled: true });
  app.mount(host);
  await vi.waitFor(() => expect(ctx.ready.value).toBe(true));
  return { input, store: useImportWorkspaceStore() };
}

function request(label: string) {
  const button = host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  button!.click();
  expect(confirm).toHaveBeenCalledTimes(1);
  return confirm.mock.calls[0]![0] as { message: string; accept: () => unknown };
}

describe('草稿删除入口与确认范围', () => {
  it('删除正在查看的章节后关闭正文，迟到的读取不能重新显示已删除章节', async () => {
    const { input } = await mountDraft();
    const oldPreview = await ImportPreviewService.chapter(input.taskId, input.chapter.id);
    const gate = deferred<typeof oldPreview>();
    vi.spyOn(ImportPreviewService, 'chapter').mockReturnValue(gate.promise);
    ctx.selectChapter(input.chapter.id);
    const dialog = request('删除草稿章节 原章');
    dialog.accept();
    await vi.waitFor(() => expect(ctx.selectedChapterId.value).toBeNull());
    gate.resolve(oldPreview);
    await nextTick();
    expect(ctx.preview.value).toBeNull();
    expect(ctx.previewLoading.value).toBe(false);
  });

  it.each([
    ['删除草稿章节 原章', 1, 2, '原章'],
    ['删除草稿卷 卷一', 1, 1, '1 章'],
    ['清空全部卷章草稿', 0, 0, '2 卷、2 章'],
  ])('%s 只在确认后删除对应范围', async (label, remainingChapters, remainingVolumes, scope) => {
    const { store } = await mountDraft();
    const dialog = request(label);
    expect(dialog.message).toContain(scope);
    expect(dialog.message).toContain('已导入书库');
    expect(store.task?.draft.chapters).toHaveLength(2);
    dialog.accept();
    await vi.waitFor(() => expect(store.task?.draft.chapters).toHaveLength(remainingChapters));
    expect(store.task?.draft.volumes).toHaveLength(remainingVolumes);
    expect(store.sources).toHaveLength(1);
  });

  it('打开确认框后草稿新增章节，旧确认不会删除新范围', async () => {
    const { input, store } = await mountDraft();
    const dialog = request('清空全部卷章草稿');
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [
          { op: 'upsert_chapter', chapter: { ...input.chapter, id: 'new', title: '刚添加的章节' } },
        ],
      },
      { actor: 'user' },
    );
    await store.selectTask(input.taskId);
    dialog.accept();
    await vi.waitFor(() => expect(store.feedback?.severity).toBe('error'));
    expect(store.task?.draft.chapters).toHaveLength(3);
  });

  it('确认框打开后切换任务，删除仍绑定原任务', async () => {
    const { input, store } = await mountDraft();
    const dialog = request('删除草稿章节 原章');
    const other = await draft('另一任务正文');
    await store.selectTask(other.taskId);
    dialog.accept();
    await vi.waitFor(async () =>
      expect((await ImportRepository.getTask(input.taskId))?.draft.chapters).toHaveLength(1),
    );
    expect(store.task?.id).toBe(other.taskId);
    expect(store.task?.draft.chapters).toHaveLength(1);
  });
});
