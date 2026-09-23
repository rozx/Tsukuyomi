import type { AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type {
  AssistantExecutionCheckpoint,
  AssistantExecutionProfile,
} from 'src/services/ai/tasks/utils/assistant-execution';
import type {
  ImportCheckpoint,
  ImportDraftEdit,
  ImportExtractionRules,
  ImportPlan,
  ImportRunContext,
} from 'src/models/import';
import { ImportRepository, checkImportRun } from './import-repository';
import type { NewEvent } from './import-repository';
import { ImportExtractionService } from './import-extraction-service';
import { ImportSourceService } from './import-source-service';
import { ImportDraftService } from './import-draft-service';
import { ImportPlanService } from './import-plan-service';
import { ImportMetadataService } from './import-metadata-service';
import { assertImportKeys } from './import-draft-validation';
import { validateImportToolArguments } from './import-tool-arguments';
import { ImportQuestionService, awaitingImportAnswer } from './import-question-service';
import { IMPORT_TODO_TOOLS, applyImportTodoTool } from './import-todos';
import { importTools } from './import-tool-definitions';
import { assertImportTaskNamed, renameImportTask } from './import-task-naming';
import { readImportTool, pageArguments, textArgument } from './import-tool-reads';
import { ImportChapterBatchService } from './import-chapter-batch';
import type { ImportBatchInput } from 'src/models/import-batch';
import { runChapterBatch } from './import-batch-runner';
import { readChapterBatch, chapterBatchSummary } from './import-batch-state';
export { importTools } from './import-tool-definitions';

type ExecutionOptions = Parameters<AssistantExecutionProfile['executeTool']>[1];
type Outcome = Awaited<ReturnType<AssistantExecutionProfile['executeTool']>>;
type SavedStep = Parameters<typeof ImportRepository.saveStep>[1];

export function importCheckpoint(checkpoint: AssistantExecutionCheckpoint): ImportCheckpoint {
  return {
    ...checkpoint,
    remainingCalls: checkpoint.remainingCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
  };
}

function parseArguments(call: AIToolCall, exposed: Set<string>): Record<string, unknown> {
  const tool = importTools.find((entry) => entry.function.name === call.function.name);
  if (!tool || !exposed.has(call.function.name))
    throw new Error('TOOL_NOT_ALLOWED: 工具未在本次导入执行中提供');
  if (call.function.arguments.length > 128000)
    throw new Error('ARGUMENT_LIMIT: 请缩小本次操作范围');
  const args: unknown = JSON.parse(call.function.arguments);
  validateImportToolArguments({ ...tool.function.parameters, type: 'object' }, args);
  return args as Record<string, unknown>;
}
function extractionInputs(args: Record<string, unknown>) {
  if (!Array.isArray(args.sources)) throw new Error('INVALID_ARGUMENTS: sources 必须是数组');
  return args.sources.map((value: unknown) => {
    assertImportKeys(value, ['source_id', 'snapshot_id', 'rules']);
    if (value.rules !== undefined)
      assertImportKeys(value.rules, [
        'preset',
        'selector',
        'excludeSelectors',
        'ranges',
        'excludeRanges',
        'encoding',
      ]);
    return {
      sourceId: textArgument(value, 'source_id'),
      ...(typeof value.snapshot_id === 'string' ? { snapshotId: value.snapshot_id } : {}),
      ...(value.rules ? { rules: value.rules as ImportExtractionRules } : {}),
    };
  });
}
function planResult(plan: ImportPlan) {
  return {
    success: true,
    planId: plan.id,
    draftRevision: plan.draftRevision,
    targetBookId: plan.targetBookId,
    targetKind: plan.targetKind,
    summary: plan.summary,
    conflicts: plan.conflicts,
    completeness: plan.completeness,
    metadataChanges: plan.metadataChanges,
  };
}

/** 构造时捕获宿主运行身份；模型不能选择任务、运行代次或最终确认。 */
export class ImportToolExecutor {
  private readonly exposed: Set<string>;
  constructor(
    private readonly run: ImportRunContext,
    private readonly extraction = new ImportExtractionService(),
    toolNames = importTools.map((tool) => tool.function.name),
    private readonly onProgress?: () => void,
  ) {
    this.exposed = new Set(toolNames);
  }

  async execute(call: AIToolCall, options: ExecutionOptions): Promise<Outcome> {
    const task = await ImportRepository.getTask(this.run.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    checkImportRun(task, this.run);
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException('已取消', 'AbortError');
    const reply = (data: unknown): AIToolCallResult => ({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: JSON.stringify(data),
    });
    const finish = (data: unknown) => ({
      events: [
        { kind: 'tool-result' as const, callId: call.id, toolName: call.function.name, data },
      ],
      checkpoint: importCheckpoint(options.afterResult(reply(data))),
    });
    const save = async (data: unknown, step: SavedStep = {}) => {
      await ImportRepository.saveStep(this.run.taskId, { ...step, run: this.run, ...finish(data) });
      return data;
    };
    let data: unknown;
    try {
      const args = parseArguments(call, this.exposed);
      if (call.function.name === 'ask_user' || call.function.name === 'ask_user_batch') {
        data = await ImportQuestionService.ask(this.run, call.id, call.function.name, args, finish);
        // 问题已保存但尚未回答：让出运行，调用保留在检查点中等待恢复
        if (data === undefined) return { pause: 'waiting_user' };
      } else data = await this.dispatch(call.function.name, args, options, save, finish, call.id);
    } catch (error) {
      if (
        options.signal?.aborted ||
        !(error instanceof Error) ||
        !/^[A-Z_]+:/.test(error.message) ||
        error.message.startsWith('RUN_STALE')
      )
        throw error;
      data = await save({
        success: false,
        error: { code: error.message.split(':', 1)[0], message: error.message },
      });
    }
    const after = await ImportRepository.getTask(this.run.taskId);
    return {
      result: reply(data),
      checkpointCommitted: true,
      ...(after && awaitingImportAnswer(after) ? { pause: 'waiting_user' as const } : {}),
    };
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    options: ExecutionOptions,
    save: (data: unknown, step?: SavedStep) => Promise<unknown>,
    finish: (data: unknown) => { events: NewEvent[]; checkpoint: ImportCheckpoint },
    callId: string,
  ): Promise<unknown> {
    const taskId = this.run.taskId;
    switch (name) {
      case 'run_chapter_batch':
        return save(
          await runChapterBatch(
            this.run,
            {
              batch_id: textArgument(args, 'batch_id'),
              base_draft_revision: args.base_draft_revision as number,
              retry_failed: args.retry_failed === true,
            },
            callId,
            this.extraction,
            options.signal,
            this.onProgress,
          ),
        );
      case 'get_chapter_batch': {
        const batch = await readChapterBatch(taskId, textArgument(args, 'batch_id'));
        const { offset = 0, limit = 50 } = pageArguments(args);
        return save({
          ...chapterBatchSummary(batch),
          items: batch.items.slice(offset, offset + limit).map((item) => ({
            chapterId: item.chapter.id,
            title: item.chapter.title,
            sourceId: item.sourceId,
            status: item.status,
            contentId: item.contentId,
            characters: item.characters,
            error: item.error,
            warnings: item.warnings,
          })),
          ...(offset + limit < batch.items.length ? { nextOffset: offset + limit } : {}),
        });
      }
      case 'prepare_chapter_batch':
        return ImportChapterBatchService.prepare(
          this.run,
          args as unknown as ImportBatchInput,
          finish,
        );
      case 'inspect_source':
      case 'extract_novel_info': {
        const sourceId = textArgument(args, 'source_id');
        const source = await ImportRepository.getSource(taskId, sourceId);
        if (source.kind === 'directory') {
          const prepared = await ImportSourceService.prepareDirectoryInspection(
            taskId,
            sourceId,
            pageArguments(args),
          );
          return save(
            {
              success: true,
              sourceId,
              format: 'directory',
              discoveries: prepared.discoveries,
              totalDiscoveries: prepared.total,
              ...(prepared.nextOffset !== undefined ? { nextOffset: prepared.nextOffset } : {}),
            },
            { resources: prepared.resources, sources: [{ ...source, status: 'inspected' }] },
          );
        }
        const prepared = await this.extraction.prepareInspection(taskId, sourceId, {
          ...pageArguments(args),
          ...(args.refresh === true ? { refresh: true } : {}),
          ...(typeof args.encoding === 'string' ? { encoding: args.encoding } : {}),
          ...(typeof args.snapshot_id === 'string' ? { snapshotId: args.snapshot_id } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        return save(prepared.result, prepared);
      }
      case 'extract_content': {
        const prepared = await this.extraction.prepareExtraction(
          taskId,
          extractionInputs(args),
          options.signal,
        );
        return save(
          { success: prepared.results.some((result) => result.success), results: prepared.results },
          prepared,
        );
      }
      case 'add_sources': {
        const sources = await ImportSourceService.addDiscoveredBatch(
          taskId,
          args.discovery_ids as string[],
          { run: this.run, finish: (values) => finish({ success: true, sources: values }) },
        );
        return { success: true, sources };
      }
      case 'edit_import_draft': {
        const draft = await ImportDraftService.edit(
          taskId,
          {
            baseDraftRevision: args.base_draft_revision as number,
            operations: args.operations as ImportDraftEdit['operations'],
          },
          {
            run: this.run,
            finish: (draft) =>
              finish({
                success: true,
                draftRevision: draft.revision,
                chapterCount: draft.chapters.length,
              }),
          },
        );
        return {
          success: true,
          draftRevision: draft.revision,
          chapterCount: draft.chapters.length,
        };
      }
      case 'rename_import_task':
        return ImportRepository.mutateTask(
          taskId,
          (task) => Promise.resolve(renameImportTask(task, textArgument(args, 'name'), 'agent')),
          { run: this.run, finish },
        );
      case 'preview_import': {
        const task = await ImportRepository.getTask(taskId);
        if (task) assertImportTaskNamed(task);
        const plan = await ImportPlanService.preview(taskId, args.draft_revision as number, {
          run: this.run,
          ...(options.signal ? { signal: options.signal } : {}),
          finish: (plan) => finish(planResult(plan)),
        });
        return planResult(plan);
      }
      case 'search_web': {
        const prepared = await ImportMetadataService.prepareSearch(
          taskId,
          textArgument(args, 'query'),
          options.signal,
        );
        return save(prepared.result, { newSources: prepared.newSources });
      }
      default: {
        if ((IMPORT_TODO_TOOLS as readonly string[]).includes(name))
          return ImportRepository.mutateTask(
            taskId,
            (task) => Promise.resolve(applyImportTodoTool(task, name, args)),
            { run: this.run, finish },
          );
        const read = await readImportTool(this.run, name, args);
        return save({ success: true, ...(read as Record<string, unknown>) });
      }
    }
  }
}
