import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportAgentService } from '../services/import/import-agent-service';
import type { AIModel } from '../services/ai/types/ai-model';
import type { ImportTask } from '../models/import';
import { draft } from './import-fixtures';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { useToastHistoryStore } from '../stores/toast-history';
import * as maintenance from '../services/chapter-content-maintenance';
import { effectScope } from 'vue';
import type { EffectScope } from 'vue';
import * as toastHistory from '../composables/useToastHistory';
import { useImportNotifications } from '../composables/import-page/useImportNotifications';

let toastScope: EffectScope | undefined;
function notifications() {
  const add = vi.fn();
  vi.spyOn(toastHistory, 'useToastWithHistory').mockReturnValue({
    add,
    remove: vi.fn(),
    removeGroup: vi.fn(),
    removeAllGroups: vi.fn(),
  });
  toastScope = effectScope();
  toastScope.run(useImportNotifications);
  return add;
}

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  toastScope?.stop();
  useImportWorkspaceStore().dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function plannedTask() {
  const input = await draft('准备导入的正文');
  const store = useImportWorkspaceStore();
  await store.selectTask(input.taskId);
  await store.previewPlan();
  return { input, store };
}

describe('导入操作反馈', () => {
  it('成功反馈通过系统 toast 包装器写入通知历史', async () => {
    const { store } = await plannedTask();
    toastScope = effectScope();
    toastScope.run(useImportNotifications);
    await store.applyPlan();
    await vi.waitFor(() =>
      expect(useToastHistoryStore().historyItems.some((item) => item.summary === '导入成功')).toBe(
        true,
      ),
    );
  });

  it('添加来源、保存草稿和撤销有反馈；相同错误再次发生仍逐次通知', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    await store.addUrl('https://example.com/book');
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '来源已添加' }));
    await store.editDraft([{ op: 'upsert_volume', id: 'draft-v', title: '改过的卷名' }]);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '草稿已保存' }));
    await store.previewPlan();
    const applied = (await store.applyPlan())!;
    await store.revertOperation(applied.id);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '已撤销导入' }));
    toast.mockClear();
    await store.addUrl('invalid');
    await store.addUrl('invalid');
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'error', summary: '添加来源失败' }),
    );
  });

  it('切换任务后的失败通知仍写明原任务，当前任务错误栏不受影响', async () => {
    const a = await ImportRepository.createTask('任务甲');
    const b = await ImportRepository.createTask('任务乙');
    const store = useImportWorkspaceStore();
    await store.selectTask(a.id);
    const toast = notifications();
    const gate = deferred<ImportTask>();
    vi.spyOn(ImportAgentService, 'run').mockReturnValue(gate.promise);
    const sending = store.send('继续', { id: 'm', enabled: true } as AIModel);
    await store.selectTask(b.id);
    gate.reject(new Error('FETCH_FAILED: 请求失败'));
    await sending;
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'error', detail: '任务甲：请求失败' }),
    );
    expect(store.error).toBeNull();
  });

  it('通知订阅重挂载或查看既有任务不会重放之前的成功通知', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    await store.applyPlan();
    toastScope?.stop();
    const reattached = notifications();
    await store.selectTask(store.selectedTaskId);
    expect(reattached).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('书库已写入但维护失败时提示警告，不报告导入失败', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(maintenance, 'maintainChapterContent').mockRejectedValue(new Error('维护失败'));
    const operation = await store.applyPlan();
    expect(operation?.state).toBe('applied');
    expect(operation?.pendingMaintenance.length).toBeGreaterThan(0);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        severity: 'warn',
        summary: '导入成功',
        detail: expect.stringContaining('维护尚未完成'),
      }),
    );
  });

  it('取消小说选择不弹出已选择的成功通知', async () => {
    const { store } = await plannedTask();
    const id = store.task!.id;
    await ImportRepository.mutateTask(id, (task) => {
      task.pendingQuestion = {
        id: 'q',
        toolCallId: 'q',
        kind: 'novel',
        required: true,
        question: '选哪本',
        options: [],
        scopeRevision: task.draft.novelScope.revision,
        draftRevision: task.draft.revision,
      };
      return Promise.resolve();
    });
    await store.selectTask(id);
    const toast = notifications();
    await store.chooseNovel(null);
    expect(toast).not.toHaveBeenCalled();
  });

  it('创建与删除任务都有通知，创建失败也能反馈', async () => {
    const store = useImportWorkspaceStore();
    const toast = notifications();
    const task = (await store.createTask('我的导入'))!;
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '导入任务已创建' }));
    await store.deleteTask(task.id);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '导入任务已删除' }));
    vi.spyOn(ImportRepository, 'createTask').mockRejectedValue(new Error('保存失败'));
    expect(await store.createTask()).toBeUndefined();
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'error', summary: '创建导入任务失败' }),
    );
  });

  it('预览成功只表示方案已生成，有冲突时提示待处理', async () => {
    const input = await draft('正文');
    const store = useImportWorkspaceStore();
    await store.selectTask(input.taskId);
    const toast = notifications();
    await store.previewPlan();
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'success', summary: '导入方案已生成' }),
    );
    await store.editDraft([{ op: 'remove_chapter', chapterId: input.chapter.id }]);
    await store.previewPlan();
    expect(store.plan?.conflicts.length).toBeGreaterThan(0);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'warn', summary: '导入方案仍有待处理项' }),
    );
    expect(
      toast.mock.calls.every(([value]) => (value as { summary: string }).summary !== '导入成功'),
    ).toBe(true);
  });

  it('未配置模型会通知，Agent 草稿就绪和等待回答都有准确提示', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    await store.send('继续', undefined);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'error', summary: '整理导入草稿失败' }),
    );
    const task = store.task!;
    const run = vi.spyOn(ImportAgentService, 'run');
    run.mockResolvedValueOnce({ ...task, state: 'ready' });
    await store.send('继续', { id: 'm', enabled: true } as AIModel);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '导入草稿已就绪' }));
    run.mockResolvedValueOnce({ ...task, state: 'waiting_user' });
    await store.send('继续', { id: 'm', enabled: true } as AIModel);
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'info', summary: '导入任务需要你的回答' }),
    );
  });

  it('暂停仍在收尾时不提前报告已暂停', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    const pause = vi.spyOn(ImportAgentService, 'pause');
    pause.mockResolvedValueOnce({ ...store.task!, state: 'pausing' } as ImportTask);
    await store.pause();
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: 'info', summary: '正在暂停导入任务' }),
    );
    pause.mockResolvedValueOnce({ ...store.task!, state: 'paused' } as ImportTask);
    await store.pause();
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ summary: '导入任务已暂停' }));
  });

  it('实际应用草稿成功后提供导入成功通知', async () => {
    const { store } = await plannedTask();
    const toast = notifications();
    expect((await store.applyPlan())?.state).toBe('applied');
    expect(store).toHaveProperty(
      'feedback',
      expect.objectContaining({ severity: 'success', summary: '导入成功' }),
    );
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'success', summary: '导入成功' }),
    );
  });

  it('过时草稿应用失败时保留页面错误并提供失败通知', async () => {
    const { input, store } = await plannedTask();
    const toast = notifications();
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: store.task!.draft.revision,
        operations: [{ op: 'set_metadata', field: 'title', value: '新标题' }],
      },
      { actor: 'user' },
    );
    expect(await store.applyPlan()).toBeUndefined();
    expect(store.error).toContain('PLAN_STALE');
    expect(store).toHaveProperty(
      'feedback',
      expect.objectContaining({ severity: 'error', summary: '导入失败' }),
    );
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'error', summary: '导入失败' }),
    );
  });
});
