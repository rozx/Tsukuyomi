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
import { importTools } from './import-tool-definitions';
import { readImportTool, pageArguments, textArgument } from './import-tool-reads';
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
  assertImportKeys(args, Object.keys(tool.function.parameters.properties));
  for (const field of tool.function.parameters.required ?? [])
    if (!(field in args)) throw new Error(`INVALID_ARGUMENTS: 缺少 ${field}`);
  for (const [key, value] of Object.entries(args)) {
    const rule = tool.function.parameters.properties[key] as { type?: string; enum?: unknown[] };
    if (rule.enum && !rule.enum.includes(value))
      throw new Error(`INVALID_ARGUMENTS: ${key} 不在允许值中`);
    if (rule.type && ['string', 'boolean'].includes(rule.type) && typeof value !== rule.type)
      throw new Error(`INVALID_ARGUMENTS: ${key} 类型无效`);
  }
  return args;
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
      data = await this.dispatch(call.function.name, args, options, save, finish);
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
      ...(after?.pendingQuestion?.required ? { pause: 'waiting_user' as const } : {}),
    };
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    options: ExecutionOptions,
    save: (data: unknown, step?: SavedStep) => Promise<unknown>,
    finish: (data: unknown) => { events: NewEvent[]; checkpoint: ImportCheckpoint },
  ): Promise<unknown> {
    const taskId = this.run.taskId;
    switch (name) {
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
      case 'preview_import': {
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
        const read = await readImportTool(this.run, name, args);
        return save({ success: true, ...(read as Record<string, unknown>) });
      }
    }
  }
}
