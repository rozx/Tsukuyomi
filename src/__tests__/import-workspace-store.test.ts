import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { ImportAgentService } from 'src/services/import/import-agent-service';
import { ImportRepository } from 'src/services/import/import-repository';
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportDraftService } from 'src/services/import/import-draft-service';
import { readImportTool } from 'src/services/import/import-tool-reads';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ImportRunContext, ImportTask } from 'src/models/import';
import { getDB } from 'src/utils/indexed-db';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { draft } from './import-fixtures';

const model = { id: 'm', name: '模型', enabled: true } as AIModel;

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  useImportWorkspaceStore().dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function withMessage(taskId: string, content: string) {
  await ImportRepository.saveStep(taskId, {
    events: [{ kind: 'message', message: { role: 'user', content }, data: {} }],
  });
}

describe('导入工作台状态', () => {
  it('初始化只执行一次：回收中断的任务并订阅更新，重复初始化不重复回收或订阅', async () => {
    const task = await ImportRepository.createTask('中断的任务');
    const dead: ImportRunContext = { taskId: task.id, runId: 'dead', runEpoch: 1, modelId: 'm' };
    await (
      await getDB()
    ).put('import-tasks', { ...task, state: 'running', run: dead, runEpoch: 1 });
    const recover = vi.spyOn(ImportAgentService, 'recover');
    const subscribe = vi.spyOn(ImportAgentService, 'subscribe');
    const store = useImportWorkspaceStore();

    await Promise.all([store.initialize(), store.initialize()]);
    await store.initialize();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(store.tasks.find((entry) => entry.id === task.id)?.state).toBe('paused');
    expect(ImportAgentService.activeTaskId).toBeUndefined();
  });

  it('切换任务时来源、草稿与对话各自独立；另一任务的迟到更新不写入当前视图', async () => {
    let notify: (taskId: string) => void = () => undefined;
    vi.spyOn(ImportAgentService, 'subscribe').mockImplementation((listener) => {
      notify = listener;
      return () => undefined;
    });
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    await ImportSourceService.registerFiles(a.id, [new File(['甲'], 'a.txt')]);
    await ImportSourceService.registerFiles(b.id, [new File(['乙'], 'b.txt')]);
    await withMessage(a.id, '甲的消息');
    await withMessage(b.id, '乙的消息');
    const store = useImportWorkspaceStore();
    await store.initialize();

    await store.selectTask(a.id);
    expect(store.sources.map((source) => source.name)).toEqual(['a.txt']);
    expect(store.events.map((event) => event.message?.content)).toEqual(['甲的消息']);

    await store.selectTask(b.id);
    expect(store.task?.id).toBe(b.id);
    expect(store.sources.map((source) => source.name)).toEqual(['b.txt']);
    expect(store.events.map((event) => event.message?.content)).toEqual(['乙的消息']);

    await withMessage(a.id, '甲的迟到消息');
    await ImportRepository.mutateTask(a.id, (task) => {
      task.name = '甲（已更新）';
      return Promise.resolve();
    });
    notify(a.id);
    await vi.waitFor(() =>
      expect(store.tasks.find((task) => task.id === a.id)?.name).toBe('甲（已更新）'),
    );
    expect(store.task?.id).toBe(b.id);
    expect(store.events.map((event) => event.message?.content)).toEqual(['乙的消息']);
  });

  it('快速切换时较慢的旧任务加载不会覆盖新选择', async () => {
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    await ImportSourceService.registerFiles(a.id, [new File(['甲'], 'a.txt')]);
    await ImportSourceService.registerFiles(b.id, [new File(['乙'], 'b.txt')]);
    const gate = deferred();
    const list = ImportRepository.listSources.bind(ImportRepository);
    vi.spyOn(ImportRepository, 'listSources').mockImplementation(async (taskId, options) => {
      if (taskId === a.id) await gate.promise;
      return list(taskId, options);
    });
    const store = useImportWorkspaceStore();
    const slow = store.selectTask(a.id);
    await store.selectTask(b.id);
    gate.resolve();
    await slow;
    expect(store.selectedTaskId).toBe(b.id);
    expect(store.sources.map((source) => source.name)).toEqual(['b.txt']);
  });

  it('运行归属于发起任务：运行期间切换查看不改变归属，也不启动被查看任务', async () => {
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    const release = deferred<ImportTask>();
    const run = vi.spyOn(ImportAgentService, 'run').mockReturnValue(release.promise);
    const store = useImportWorkspaceStore();
    await store.selectTask(a.id);

    const sending = store.send('请整理', model);
    await store.selectTask(b.id);
    release.resolve((await ImportRepository.getTask(a.id))!);
    await sending;

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(a.id, model, '请整理');
    expect(store.selectedTaskId).toBe(b.id);
  });

  it('未配置模型或存在必要问题时发送失败并提示，不调用运行', async () => {
    const task = await ImportRepository.createTask();
    const run = vi.spyOn(ImportAgentService, 'run');
    const store = useImportWorkspaceStore();
    await store.selectTask(task.id);
    await store.send('开始', undefined);
    expect(run).not.toHaveBeenCalled();
    expect(store.error).toContain('助手模型');
  });

  it('手动修改章节标题写入同一草稿并可被 Agent 读取；过时版本不覆盖较新的修改', async () => {
    const input = await draft('正文');
    const store = useImportWorkspaceStore();
    await store.selectTask(input.taskId);

    await store.editDraft([
      { op: 'upsert_chapter', chapter: { ...input.chapter, title: '用户改的标题' } },
    ]);
    const run: ImportRunContext = { taskId: input.taskId, runId: 'r', runEpoch: 0, modelId: 'm' };
    const read = (await readImportTool(run, 'get_import_draft', { view: 'chapters' })) as {
      chapters: { title: string }[];
    };
    expect(read.chapters[0]?.title).toBe('用户改的标题');

    const stale = store.task!.draft.revision;
    await ImportDraftService.edit(input.taskId, {
      baseDraftRevision: stale,
      operations: [{ op: 'upsert_volume', id: 'draft-v', title: 'Agent 改的卷名' }],
    });
    await store.editDraft([{ op: 'upsert_volume', id: 'draft-v', title: '界面旧版本的卷名' }]);
    expect(store.error).toContain('DRAFT_CHANGED');
    expect(store.task?.draft.revision).toBe(stale + 1);
    expect(store.task?.draft.volumes[0]?.title).toBe('Agent 改的卷名');
  });

  it('多小说选择与 Agent 问题的回答绑定当前问题，不能由界面绕过', async () => {
    const task = await ImportRepository.createTask();
    const sources = await ImportSourceService.registerFiles(task.id, [
      new File(['一'], 'one.txt'),
      new File(['二'], 'two.txt'),
    ]);
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: sources.map((source, index) => ({
            id: `n${index}`,
            title: `小说${index}`,
            sourceIds: [source.id],
          })),
        },
      ],
    });
    const store = useImportWorkspaceStore();
    await store.selectTask(task.id);
    expect(store.task?.pendingQuestion?.kind).toBe('novel');

    await store.previewPlan();
    expect(store.plan?.conflicts.map((conflict) => conflict.code)).toContain('PENDING_QUESTION');

    await store.chooseNovel('n1');
    expect(store.task?.pendingQuestion).toBeUndefined();
    expect(store.task?.draft.novelScope.selectedCandidateId).toBe('n1');
  });

  it('回答必要问题后若已配置模型则自动继续运行；取消选择不会继续', async () => {
    const task = await ImportRepository.createTask();
    const sources = await ImportSourceService.registerFiles(task.id, [
      new File(['一'], 'one.txt'),
      new File(['二'], 'two.txt'),
    ]);
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: sources.map((source, index) => ({
            id: `n${index}`,
            title: `小说${index}`,
            sourceIds: [source.id],
          })),
        },
      ],
    });
    const run = vi
      .spyOn(ImportAgentService, 'run')
      .mockImplementation((taskId) => ImportRepository.getTask(taskId).then((value) => value!));
    const assistant = {
      ...model,
      provider: 'openai',
      model: 'test',
      apiKey: 'test-only',
      baseUrl: 'https://example.test',
      temperature: 0,
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      lastEdited: new Date(),
      isDefault: {
        translation: { enabled: false, temperature: 0 },
        proofreading: { enabled: false, temperature: 0 },
        termsTranslation: { enabled: false, temperature: 0 },
        assistant: { enabled: true, temperature: 0 },
      },
    } as AIModel;
    await useAIModelsStore().addModel(assistant);
    const store = useImportWorkspaceStore();
    await store.selectTask(task.id);

    await store.chooseNovel(null);
    expect(run).not.toHaveBeenCalled();

    await store.chooseNovel('n0');
    expect(run).toHaveBeenCalledWith(task.id, expect.objectContaining({ id: 'm' }), '');
  });
});
