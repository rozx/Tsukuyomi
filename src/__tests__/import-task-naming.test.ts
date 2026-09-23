import { describe, expect, it } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportToolExecutor, importTools } from '../services/import/import-tool-executor';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { renameImportTask } from '../services/import/import-task-naming';
import { importAgentPrompt } from '../services/import/import-agent-prompt';
import { getDB } from '../utils/indexed-db';
import type { ImportRunContext } from '../models/import';
import type { AIToolCall } from '../services/ai/types/ai-service';

async function fixture() {
  const task = await ImportRepository.createTask();
  const run: ImportRunContext = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
  await (await getDB()).put('import-tasks', { ...task, state: 'running', run, runEpoch: 1 });
  const executor = new ImportToolExecutor(run);
  async function invoke(name: string, args: Record<string, unknown>) {
    const call: AIToolCall = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    };
    await ImportRepository.saveStep(task.id, {
      run,
      events: [
        { kind: 'tool-call', callId: call.id, toolName: name, data: call.function.arguments },
      ],
    });
    const outcome = await executor.execute(call, {
      afterResult: (result) => ({
        messages: [{ role: 'assistant', content: '', tool_calls: [call] }, result],
        remainingCalls: [],
        completedCallIds: [call.id],
      }),
    });
    return JSON.parse(outcome.result!.content) as Record<string, unknown>;
  }
  return { task, invoke };
}

/** 生成一个可以预览的最小草稿，返回草稿版本。 */
type Invoke = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function readyDraft(taskId: string, invoke: Invoke) {
  const [source] = await ImportSourceService.registerFiles(taskId, [
    new File(['正文'], 'novel.txt'),
  ]);
  await invoke('inspect_source', { source_id: source!.id });
  const extracted = await invoke('extract_content', { sources: [{ source_id: source!.id }] });
  const [result] = extracted.results as { contentId: string }[];
  const contentId = result!.contentId;
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
          id: 'c',
          volumeId: 'v',
          title: '第一章',
          content: [{ kind: 'extraction', resourceId: contentId }],
          sourceIds: [],
          selected: true,
          status: 'ready',
          inferredTitle: false,
          inferredStructure: false,
        },
      },
    ],
  });
  return edited.draftRevision as number;
}

describe('导入任务命名', () => {
  it('rename_import_task 是 Agent 可用的工具，命名后记录来源为 agent', async () => {
    expect(importTools.some((tool) => tool.function.name === 'rename_import_task')).toBe(true);
    const { task, invoke } = await fixture();
    const result = await invoke('rename_import_task', { name: '  転生したらスライムだった件  ' });
    expect(result).toMatchObject({ success: true, name: '転生したらスライムだった件' });
    const saved = await ImportRepository.getTask(task.id);
    expect(saved?.name).toBe('転生したらスライムだった件');
    expect(saved?.nameSource).toBe('agent');
  });

  it('空名称或超长名称被拒绝，任务名不变', async () => {
    const { task, invoke } = await fixture();
    expect((await invoke('rename_import_task', { name: '   ' })).success).toBe(false);
    expect((await invoke('rename_import_task', { name: '长'.repeat(81) })).success).toBe(false);
    expect((await ImportRepository.getTask(task.id))?.name).toBe(task.name);
  });

  it('尚未命名任务时 preview_import 被拒绝并提示先命名，命名后可以生成方案', async () => {
    const { task, invoke } = await fixture();
    const revision = await readyDraft(task.id, invoke);
    const refused = await invoke('preview_import', { draft_revision: revision });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused)).toContain('TASK_UNNAMED');
    await invoke('rename_import_task', { name: '小说' });
    const accepted = await invoke('preview_import', { draft_revision: revision });
    expect(accepted.success).toBe(true);
  });

  it('用户手动命名后 Agent 不能覆盖，也不再要求命名', async () => {
    const { task, invoke } = await fixture();
    await ImportRepository.mutateTask(task.id, (current) =>
      Promise.resolve(renameImportTask(current, '我的任务', 'user')),
    );
    const result = await invoke('rename_import_task', { name: '另一个名字' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain('NAME_LOCKED');
    expect((await ImportRepository.getTask(task.id))?.name).toBe('我的任务');
    const revision = await readyDraft(task.id, invoke);
    expect((await invoke('preview_import', { draft_revision: revision })).success).toBe(true);
  });

  it('提示词带上当前任务名与命名状态，并要求识别书本后命名', async () => {
    const { task } = await fixture();
    const prompt = await importAgentPrompt(task.id);
    expect(prompt).toContain('rename_import_task');
    expect(prompt).toContain('"taskName":"新的导入任务"');
    expect(prompt).toContain('"taskNamedBy":null');
  });
});
