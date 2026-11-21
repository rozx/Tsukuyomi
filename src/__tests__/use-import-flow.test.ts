import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import messages from '../i18n';
import { provideImportPage } from '../composables/import-page/useImportPage';
import { useImportFlow } from '../composables/import-page/useImportFlow';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { ImportRepository } from '../services/import/import-repository';
import { webLocksFixture } from './web-locks-fixture';

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: webLocksFixture(), languages: ['en-US'] });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  useImportWorkspaceStore().dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import/:taskId?', component: { render: () => null } }],
  });
  await router.push('/import');
  let flow!: ReturnType<typeof useImportFlow>;
  let ctx!: ReturnType<typeof provideImportPage>;
  // inject 只能看到父组件 provide 的值：useImportFlow 放在子组件里
  const Child = defineComponent({
    setup() {
      flow = useImportFlow();
      return () => h('div');
    },
  });
  app = createApp(
    defineComponent({
      setup() {
        ctx = provideImportPage();
        return () => h(Child);
      },
    }),
  );
  app
    .use(router)
    .use(createI18n({ legacy: false, locale: 'en-US', messages }))
    .mount(document.createElement('div'));
  const store = useImportWorkspaceStore();
  const task = await ImportRepository.createTask('Task');
  store.selectedTaskId = task.id;
  store.task = task;
  store.sources = [];
  await nextTick();
  return { flow, ctx, store };
}

describe('useImportFlow', () => {
  it('分区为任务或对话时按进度落在当前步；步骤带标签与完成状态', async () => {
    const { flow, ctx } = await mount();
    ctx.section.value = 'chat';
    expect(flow.current.value).toBe('sources');
    expect(flow.steps.value.map((step) => [step.label, step.done, step.active])).toEqual([
      ['Sources', false, true],
      ['Organize', false, false],
      ['Import', false, false],
    ]);
  });

  it('来源一步点「让月詠开始整理」：开始运行并转到整理查看进展', async () => {
    const { flow, ctx, store } = await mount();
    const send = vi.spyOn(store, 'send').mockResolvedValue();
    store.sources = [{ id: 's', status: 'extracted', purpose: 'content-root' } as never];
    ctx.section.value = 'sources';
    await nextTick();
    expect(flow.action.value?.kind).toBe('continue');
    expect(flow.actionLabel.value).toBe('Let Tsukuyomi organize');
    await flow.runAction();
    expect(send).toHaveBeenCalledWith('');
    expect(ctx.section.value).toBe('draft');
  });

  it('整理一步点「生成导入方案」：生成后转到导入', async () => {
    const { flow, ctx, store } = await mount();
    const preview = vi.spyOn(store, 'previewPlan').mockResolvedValue();
    store.sources = [{ id: 's', status: 'extracted', purpose: 'content-root' } as never];
    store.task = {
      ...store.task!,
      draft: { ...store.task!.draft, chapters: [{ id: 'c', status: 'ready' } as never] },
    };
    ctx.section.value = 'draft';
    await nextTick();
    expect(flow.action.value?.kind).toBe('preview');
    await flow.runAction();
    expect(preview).toHaveBeenCalled();
    expect(ctx.section.value).toBe('plan');
  });

  it('整理一步：月詠问了必填问题还没回答时，「生成导入方案」不可点', async () => {
    const { flow, ctx, store } = await mount();
    store.sources = [{ id: 's', status: 'extracted', purpose: 'content-root' } as never];
    store.task = {
      ...store.task!,
      state: 'waiting_user',
      pendingQuestion: { id: 'q', question: '选哪一个？', required: true } as never,
      draft: { ...store.task!.draft, chapters: [{ id: 'c', status: 'ready' } as never] },
    };
    ctx.section.value = 'draft';
    await nextTick();
    expect(flow.action.value).toEqual({ kind: 'preview', disabled: true });
  });

  it('整理一步中途暂停：主按钮是继续整理，还有待执行调用时是继续执行', async () => {
    const { flow, ctx, store } = await mount();
    store.sources = [{ id: 's', status: 'extracted', purpose: 'content-root' } as never];
    const chapters = [{ id: 'c', status: 'ready' } as never];
    store.task = { ...store.task!, state: 'paused', draft: { ...store.task!.draft, chapters } };
    ctx.section.value = 'draft';
    await nextTick();
    expect(flow.action.value?.kind).toBe('continue');
    expect(flow.actionLabel.value).toBe('Continue organizing');

    store.task = {
      ...store.task!,
      state: 'failed',
      checkpoint: { remainingCalls: [{ id: '1', name: 'x', arguments: '{}' }] } as never,
    };
    await nextTick();
    expect(flow.action.value?.kind).toBe('continue');
    expect(flow.actionLabel.value).toBe('Resume');
  });
});
