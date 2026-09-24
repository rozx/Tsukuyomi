import { draft } from './import-fixtures';
import { CATALOG, SITE, catalogPage, webTask } from './import-update-recipe-fixtures';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportWorkerFixture } from './import-worker-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportToolExecutor, importTools } from '../services/import/import-tool-executor';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { getDB } from '../utils/indexed-db';
import { TodoListService } from '../services/todo-list-service';
import type { ImportRunContext } from '../models/import';
import type { AIToolCall } from '../services/ai/types/ai-service';
import type { AssistantExecutionCheckpoint } from '../services/ai/tasks/utils/assistant-execution';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(taskId?: string) {
  const task = taskId
    ? (await ImportRepository.getTask(taskId))!
    : await ImportRepository.createTask();
  const run: ImportRunContext = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
  await (await getDB()).put('import-tasks', { ...task, state: 'running', run, runEpoch: 1 });
  const execute = new ImportToolExecutor(run);
  async function invoke(name: string, args: Record<string, unknown>) {
    const call: AIToolCall = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    };
    const checkpoint: AssistantExecutionCheckpoint = {
      messages: [{ role: 'assistant', content: '', tool_calls: [call] }],
      remainingCalls: [call],
      completedCallIds: [],
    };
    await ImportRepository.saveStep(task.id, {
      run,
      events: [
        { kind: 'tool-call', callId: call.id, toolName: name, data: call.function.arguments },
      ],
    });
    const outcome = await execute.execute(call, {
      afterResult: (result) => ({
        ...checkpoint,
        messages: [...checkpoint.messages, result],
        remainingCalls: [],
        completedCallIds: [call.id],
      }),
    });
    if (!outcome.result) throw new Error('unexpected pause');
    return { call, result: JSON.parse(outcome.result.content) as Record<string, unknown> };
  }
  return { task, run, invoke };
}

describe('导入专属工具执行器', () => {
  it('仅登记文件后，由实际工具检查、提取、编辑草稿并生成预览，全程不写书库', async () => {
    const { task, invoke } = await fixture();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['正文一\n正文二'], 'novel.txt'),
    ]);
    expect((await ImportRepository.getSource(task.id, source!.id)).status).toBe('registered');
    const inspected = await invoke('inspect_source', { source_id: source!.id });
    expect(inspected.result.success).toBe(true);
    const extracted = await invoke('extract_content', { sources: [{ source_id: source!.id }] });
    const results = extracted.result.results as { contentId: string; success: boolean }[];
    expect(results[0]?.success).toBe(true);
    const viewed = await invoke('read_source', {
      resource_id: results[0]!.contentId,
      view: 'blocks',
      limit: 1,
    });
    expect(viewed.result.nextOffset).toBe(1);
    const edited = await invoke('edit_import_draft', {
      base_draft_revision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'novel', title: '小说', sourceIds: [source!.id] }],
        },
        { op: 'upsert_volume', id: 'v', title: '卷一' },
        {
          op: 'upsert_chapter',
          chapter: {
            id: 'chapter',
            volumeId: 'v',
            title: '第一章',
            content: [{ kind: 'extraction', resourceId: results[0]!.contentId }],
            sourceIds: [],
            selected: true,
            status: 'ready',
            inferredTitle: true,
            inferredStructure: true,
          },
        },
      ],
    });
    expect(edited.result.draftRevision).toBe(1);
    expect((await invoke('rename_import_task', { name: '小说' })).result.success).toBe(true);
    const preview = await invoke('preview_import', { draft_revision: 1 });
    expect(preview.result.success).toBe(true);
    expect(preview.result).toHaveProperty('planId');
    expect(preview.result).not.toHaveProperty('book');
    expect((await ImportRepository.getTask(task.id))?.state).toBe('running');
    expect((await ImportRepository.getTask(task.id))?.checkpoint?.completedCallIds).toEqual([
      preview.call.id,
    ]);
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('文本结构的预览、分页、应用绑定检查点，参数不能伪造任务或绕过预览', async () => {
    vi.stubGlobal('Worker', ImportWorkerFixture);
    const value = await draft('第1章 开始\n正文甲\n第2章 结束\n正文乙');
    const { task, invoke } = await fixture(value.taskId);
    const preview = await invoke('preview_text_structure', {
      resource_id: value.ref.resourceId,
      base_draft_revision: 1,
      replace_chapter_ids: [value.chapter.id],
      rules: {
        mode: 'regex',
        chapter_pattern: { mode: 'regex', pattern: '^第\\d+章 [^\\r\\n]+', flags: 'm' },
      },
    });
    expect(preview.result).toMatchObject({ success: true, chapters: 2 });
    expect((await ImportRepository.getTask(task.id))?.checkpoint?.completedCallIds).toEqual([
      preview.call.id,
    ]);
    const read = await invoke('get_text_structure', { batch_id: preview.result.batchId, limit: 1 });
    expect(read.result).toMatchObject({ total: 2, nextOffset: 1 });
    expect((await invoke('preview_text_structure', { task_id: 'fake' })).result.success).toBe(
      false,
    );
    const applied = await invoke('apply_text_structure', { batch_id: preview.result.batchId });
    expect(applied.result).toMatchObject({ success: true, applied: true, draftRevision: 2 });
    expect((await ImportRepository.getTask(task.id))?.checkpoint?.completedCallIds).toEqual([
      applied.call.id,
    ]);
    expect((await ImportRepository.getTask(task.id))?.draft.chapters).toHaveLength(2);
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('宿主任务身份不能由参数更改，普通写工具和任意脚本不可执行', async () => {
    const { task, invoke } = await fixture();
    const other = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(other.id, [
      new File(['其他小说'], 'other.txt'),
    ]);
    expect((await invoke('inspect_source', { source_id: source!.id })).result.success).toBe(false);
    expect((await invoke('get_import_draft', { task_id: other.id })).result.success).toBe(false);
    expect(
      (await invoke('apply_import', { plan_id: 'anything', confirmed: true })).result.success,
    ).toBe(false);
    expect(
      (await invoke('execute_script', { script: 'window.localStorage.clear()' })).result.success,
    ).toBe(false);
    expect(importTools.some((tool) => tool.function.name === 'add_translation')).toBe(false);
    expect((await ImportRepository.getTask(other.id))?.draft.revision).toBe(0);
    expect((await ImportRepository.getTask(task.id))?.state).toBe('running');
  });

  it('参数按完整 schema 校验：整数、数组、嵌套对象和枚举错误都在执行前拒绝', async () => {
    const { task, invoke } = await fixture();
    const invalid = [
      await invoke('edit_import_draft', {
        base_draft_revision: '0',
        operations: [{ op: 'upsert_volume', title: '卷一' }],
      }),
      await invoke('edit_import_draft', {
        base_draft_revision: 0,
        operations: [{ op: 'upsert_volume', title: 42 }],
      }),
      await invoke('edit_import_draft', {
        base_draft_revision: 0,
        operations: [{ op: 'rewrite_library', title: '卷一' }],
      }),
      await invoke('edit_import_draft', {
        base_draft_revision: 0,
        operations: [{ op: 'upsert_volume', title: '卷一', confirmed: true }],
      }),
      await invoke('edit_import_draft', { base_draft_revision: 0, operations: [] }),
      await invoke('add_sources', { discovery_ids: 'discovery' }),
      await invoke('preview_import', { draft_revision: -1 }),
      await invoke('preview_import', { draft_revision: 1.5 }),
    ];
    for (const { result } of invalid) {
      expect(result.success).toBe(false);
      expect((result.error as { code: string }).code).toBe('INVALID_ARGUMENTS');
    }
    expect((invalid[1]!.result.error as { message: string }).message).toContain(
      'operations[0].title',
    );
    const saved = await ImportRepository.getTask(task.id);
    expect(saved?.draft.revision).toBe(0);
    expect(saved?.draft.volumes).toHaveLength(0);
  });

  it('待办沿用普通助手的工具约定但归属导入任务，不写入全局待办', async () => {
    const globalCreate = vi.spyOn(TodoListService, 'createTodo');
    const { task, invoke } = await fixture();
    const other = await fixture();

    const created = await invoke('create_todo', { items: ['检查目录', '提取正文'] });
    const todos = created.result.todos as { id: string; status: string }[];
    expect(todos.map((todo) => todo.status)).toEqual(['working', 'pending']);

    const done = await invoke('mark_todo_done', { ids: [todos[0]!.id] });
    expect(done.result.success).toBe(true);
    const active = await invoke('list_todos', { filter: 'active' });
    expect(active.result.todos).toMatchObject([{ id: todos[1]!.id, status: 'working' }]);

    await invoke('update_todos', { id: todos[1]!.id, text: '提取第 1–10 章正文' });
    await invoke('delete_todo', { id: todos[0]!.id });
    expect((await ImportRepository.getTask(task.id))?.todos).toMatchObject([
      { id: todos[1]!.id, text: '提取第 1–10 章正文', status: 'working' },
    ]);
    expect((await other.invoke('list_todos', {})).result.todos).toEqual([]);
    expect((await other.invoke('mark_todo_done', { id: todos[1]!.id })).result.success).toBe(false);
    expect(globalCreate).not.toHaveBeenCalled();
  });

  it('目录工具与批量追加的完成回执和来源同事务保存，追加不读取文件正文', async () => {
    const { task, invoke } = await fixture();
    const directory = await ImportSourceService.registerDirectory(task.id, [
      { file: new File(['第一章'], '1.txt'), path: '书/1.txt' },
      { file: new File(['第二章'], '2.txt'), path: '书/2.txt' },
    ]);
    const inspected = await invoke('inspect_source', { source_id: directory.id, limit: 1 });
    expect(inspected.result.nextOffset).toBe(1);
    const discoveries = inspected.result.discoveries as { id: string }[];
    const added = await invoke('add_sources', { discovery_ids: [discoveries[0]!.id] });
    const sources = added.result.sources as { id: string; status: string }[];
    expect(sources[0]?.status).toBe('registered');
    const saved = await ImportRepository.getTask(task.id);
    expect(saved?.checkpoint?.completedCallIds).toEqual([added.call.id]);
    const listed = await invoke('list_sources', { parent_source_id: directory.id });
    expect(listed.result.items).toHaveLength(1);
  });
  it('正则批量编辑通过真实工具保存预览与完成回执，工具不能传入任意正文', async () => {
    vi.stubGlobal('Worker', ImportWorkerFixture);
    const { taskId } = await draft('正文广告123尾部');
    const { invoke } = await fixture(taskId);
    const prepared = await invoke('preview_draft_batch', {
      base_draft_revision: 1,
      target: 'body',
      scope: {},
      pattern: { mode: 'regex', pattern: '广告\\d+' },
      action: 'remove_matches',
    });
    expect(prepared.result).toMatchObject({ success: true, affected: 1 });
    expect((await ImportRepository.getTask(taskId))?.draft.revision).toBe(1);
    const applied = await invoke('apply_draft_batch', { batch_id: prepared.result.batchId });
    expect(applied.result).toMatchObject({ success: true, draftRevision: 2 });
    expect((await ImportRepository.getTask(taskId))?.checkpoint?.completedCallIds).toEqual([
      applied.call.id,
    ]);
    const forged = await invoke('preview_draft_batch', {
      base_draft_revision: 2,
      target: 'body',
      scope: {},
      pattern: { mode: 'literal', pattern: '正文' },
      action: 'replace',
      replacement: '伪造正文',
    });
    expect(forged.result.success).toBe(false);
    expect((await ImportRepository.getTask(taskId))?.draft.revision).toBe(2);
  });

  it('批量添加和提取共用名称、路径正则，未命中来源不抓取', async () => {
    vi.stubGlobal('Worker', ImportWorkerFixture);
    const { task, invoke } = await fixture();
    const directory = await ImportSourceService.registerDirectory(task.id, [
      { file: new File(['正文甲'], '1.txt'), path: 'book/1.txt' },
      { file: new File(['正文乙'], '2.txt'), path: 'book/2.txt' },
      { file: new File(['广告'], 'ad.txt'), path: 'book/ad.txt' },
    ]);
    const inspected = await invoke('inspect_source', { source_id: directory.id });
    const ids = (inspected.result.discoveries as { id: string }[]).map((d) => d.id);
    const added = await invoke('add_sources', {
      discovery_ids: ids,
      filter: { locator: { mode: 'regex', pattern: '/[12]\\.txt$' } },
    });
    expect(added.result.success).toBe(true);
    const sources = added.result.sources as { id: string; name: string }[];
    expect(sources).toHaveLength(2);
    const extracted = await invoke('extract_content', {
      sources: sources.map((s) => ({ source_id: s.id })),
      filter: { name: { mode: 'regex', pattern: '1\\.txt$' } },
    });
    expect(extracted.result.results).toHaveLength(1);
    expect((await ImportRepository.getSource(task.id, sources[1]!.id)).status).toBe('registered');
  });
});

describe('record_update_recipe', () => {
  const trimLast = (resource: { id: string; blocks: { id: string }[] }) => [
    {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[0]!.id,
      endBlockId: resource.blocks.at(-2)!.id,
    },
  ];

  async function declare(web: Awaited<ReturnType<typeof webTask>>, args = {}) {
    const { invoke } = await fixture(web.taskId);
    return (
      await invoke('record_update_recipe', {
        base_draft_revision: web.revision,
        catalog_source_ids: [web.catalog.id],
        ...args,
      })
    ).result;
  }

  it('自测通过后写入草稿并递增修订号', async () => {
    const web = await webTask([{ n: 1 }, { n: 2 }]);
    const result = await declare(web);
    expect(result).toMatchObject({
      success: true,
      draftRevision: web.revision + 1,
      engine: 'html',
      verified: 2,
      pinned: 0,
    });
    const task = await ImportRepository.getTask(web.taskId);
    expect(task?.draft.revision).toBe(web.revision + 1);
    expect(task?.draft.updateRecipe).toMatchObject({
      declaredAtRevision: web.revision,
      selfTest: { ok: true, verified: 2 },
      recipe: { catalogUrls: [CATALOG], verifiedChapterCount: 2 },
    });
    expect(task?.draft.updateRecipe?.recipe.skippedUrls).toBeUndefined();
  });

  async function rejected(
    web: Awaited<ReturnType<typeof webTask>>,
    args: Record<string, unknown>,
    code: string,
  ) {
    const result = await declare(web, args);
    expect(result.success).toBe(false);
    expect((result.error as { code: string }).code).toBe(code);
    const task = await ImportRepository.getTask(web.taskId);
    expect(task?.draft.revision).toBe(web.revision);
    expect(task?.draft.updateRecipe).toBeUndefined();
    return result;
  }

  it('目录来源不属于本任务：SOURCE_NOT_FOUND', async () => {
    await rejected(await webTask([{ n: 1 }]), { catalog_source_ids: ['x'] }, 'SOURCE_NOT_FOUND');
  });

  it('目录分页缺少快照：SNAPSHOT_MISSING', async () => {
    const web = await webTask([{ n: 1 }], { catalog: catalogPage([1], '/book?p=2') });
    await rejected(web, {}, 'SNAPSHOT_MISSING');
  });

  it('拆章：UNSUPPORTED_GRANULARITY', async () => {
    const url = `${SITE}/book/12`;
    const web = await webTask([
      { n: 12, url, title: '上' },
      { n: 12, url, title: '下' },
    ]);
    await rejected(web, {}, 'UNSUPPORTED_GRANULARITY');
  });

  it('正文不一致：CONTENT_MISMATCH 并带差异示例', async () => {
    const web = await webTask([{ n: 3, lines: ['本文', '次の話へ'], content: trimLast }]);
    const result = await rejected(web, {}, 'CONTENT_MISMATCH');
    expect(result.issues).toEqual([
      expect.objectContaining({ message: '「第3话」回放多出 1 行：次の話へ' }),
    ]);
  });

  it('固定章节过多：PINNED_LIMIT', async () => {
    const web = await webTask([{ n: 1, lines: ['本文', '手工'], content: trimLast }]);
    await rejected(web, { pinned_chapter_ids: ['c1'] }, 'PINNED_LIMIT');
  });

  it('清理规则无效：CLEANUP_INVALID', async () => {
    const web = await webTask([{ n: 1 }]);
    await rejected(
      web,
      { cleanup: [{ pattern: { mode: 'regex', pattern: '(' }, action: 'remove_lines' }] },
      'CLEANUP_INVALID',
    );
  });

  it('清理规则超时：CLEANUP_TIMEOUT', async () => {
    const web = await webTask([{ n: 1 }]);
    // 声明时只有清理规则会调用解析 Worker，模拟它超时
    vi.spyOn(ImportParsingClient.prototype, 'run').mockRejectedValue(
      new Error('PROCESSING_LIMIT: Worker 解析超时'),
    );
    await rejected(
      web,
      { cleanup: [{ pattern: { mode: 'literal', pattern: 'x' }, action: 'remove_lines' }] },
      'CLEANUP_TIMEOUT',
    );
  });

  it('草稿版本过时：DRAFT_CHANGED', async () => {
    const web = await webTask([{ n: 1 }]);
    await rejected(web, { base_draft_revision: web.revision - 1 }, 'DRAFT_CHANGED');
  });
});
