import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportToolExecutor, importTools } from '../services/import/import-tool-executor';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { getDB } from '../utils/indexed-db';
import type { ImportRunContext } from '../models/import';
import type { AIToolCall } from '../services/ai/types/ai-service';
import type { AssistantExecutionCheckpoint } from '../services/ai/tasks/utils/assistant-execution';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const task = await ImportRepository.createTask();
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
});
