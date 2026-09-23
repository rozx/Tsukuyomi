import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type {
  ImportCheckpoint,
  ImportEvent,
  ImportOperation,
  ImportResource,
  ImportRunContext,
  ImportSource,
  ImportTask,
} from 'src/models/import';
import { getDB } from 'src/utils/indexed-db';
import { ImportStorageStatus } from './import-storage-status';

const WRITE_STORES = [
  'import-tasks',
  'import-sources',
  'import-resources',
  'import-events',
  'import-operations',
] as const;
type ImportDatabase = Awaited<ReturnType<typeof getDB>>;
export type ImportTransaction = IDBPTransaction<
  ImportDatabase extends IDBPDatabase<infer Schema> ? Schema : never,
  typeof WRITE_STORES,
  'readwrite'
>;

/** 写失败必须回滚整步，并消费事务的拒绝，避免未处理的 Promise 错误。 */
export async function withImportWrite<T>(work: (tx: ImportTransaction) => Promise<T>): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(WRITE_STORES, 'readwrite');
  return completeIdbTransaction(tx, () => work(tx));
}

function pageLimit(limit = 50): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('INVALID_PAGE: 每页须为 1–100 条');
  return limit;
}

export type NewEvent = Omit<ImportEvent, 'id' | 'taskId' | 'sequence' | 'createdAt'>;

export interface ImportTaskWriter {
  toolEvents(taskId: string, callId: string): Promise<ImportEvent[]>;
  event(event: ImportEvent): Promise<unknown>;
  task(task: ImportTask): Promise<unknown>;
}

export async function finishImportTask(
  task: ImportTask,
  finished: { events?: NewEvent[]; checkpoint?: ImportCheckpoint } | undefined,
  writer: ImportTaskWriter,
): Promise<void> {
  await writeEvents(writer, task, finished?.events ?? []);
  if (finished?.checkpoint) await updateCheckpoint(writer, task, finished.checkpoint);
  task.updatedAt = Date.now();
  await writer.task(task);
}

export interface ImportTaskMutationOptions<T> {
  run?: ImportRunContext;
  finish?: (result: T) => { events?: NewEvent[]; checkpoint?: ImportCheckpoint };
}

async function updateCheckpoint(
  writer: ImportTaskWriter,
  task: ImportTask,
  checkpoint: ImportCheckpoint,
): Promise<void> {
  for (const call of checkpoint.remainingCalls) checkToolArguments(call.arguments);
  for (const id of checkpoint.completedCallIds) {
    const events = await writer.toolEvents(task.id, id);
    if (!events.some((event) => event.kind === 'tool-result'))
      throw new Error('TOOL_PAIR: 检查点引用未完成的调用');
  }
  task.checkpoint = checkpoint;
}

export function checkImportRun(task: ImportTask, run?: ImportRunContext): void {
  if (
    run &&
    (run.taskId !== task.id ||
      run.runEpoch !== task.runEpoch ||
      run.runId !== task.run?.runId ||
      task.state !== 'running')
  ) {
    throw new Error('RUN_STALE: 执行已停止或被新的运行替代');
  }
}

function checkToolArguments(value: unknown): void {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  } catch {
    throw new Error('INCOMPLETE_TOOL_CALL: 工具参数尚未完整返回');
  }
}

async function writeEvents(
  writer: ImportTaskWriter,
  task: ImportTask,
  events: NewEvent[],
): Promise<void> {
  for (const event of events) {
    if (event.kind === 'tool-call' || event.kind === 'tool-result') {
      if (!event.callId || !event.toolName) throw new Error('TOOL_PAIR: 缺少工具调用身份');
      const prior = await writer.toolEvents(task.id, event.callId);
      if (event.kind === 'tool-call') {
        checkToolArguments(event.data);
        if (prior.length) throw new Error('TOOL_PAIR: 工具调用已记录');
      } else if (
        !prior.some((e) => e.kind === 'tool-call' && e.toolName === event.toolName) ||
        prior.some((e) => e.kind === 'tool-result')
      ) {
        throw new Error('TOOL_PAIR: 工具结果缺少调用或已保存');
      }
    }
    await writer.event({
      ...event,
      id: crypto.randomUUID(),
      taskId: task.id,
      sequence: ++task.eventSequence,
      createdAt: Date.now(),
    });
  }
}

async function addSources(
  tx: ImportTransaction,
  taskId: string,
  sources: ImportSource[],
): Promise<void> {
  const store = tx.objectStore('import-sources');
  for (const source of sources) {
    if (
      source.taskId !== taskId ||
      (source.origin === 'agent' && source.purpose === 'content-root')
    )
      throw new Error('SOURCE_SCOPE: 来源授权无效');
    if (source.parentSourceId) {
      const parent =
        sources.find((item) => item.id === source.parentSourceId) ??
        (await store.get(source.parentSourceId));
      if (
        !parent ||
        parent.taskId !== taskId ||
        (parent.purpose === 'metadata-only' && source.purpose !== 'metadata-only')
      )
        throw new Error('SOURCE_SCOPE: 父来源不允许此用途');
    } else if (source.purpose === 'content-derived')
      throw new Error('SOURCE_SCOPE: 正文派生来源缺少父来源');
    await store.add(source);
  }
}

async function writeResources(
  tx: ImportTransaction,
  taskId: string,
  resources: ImportResource[],
): Promise<void> {
  const store = tx.objectStore('import-resources');
  for (const resource of resources) {
    const source = await tx.objectStore('import-sources').get(resource.sourceId);
    if (resource.taskId !== taskId || source?.taskId !== taskId)
      throw new Error('SOURCE_SCOPE: 资源不属于当前来源');
    if (resource.kind === 'extraction') {
      const snapshot = await store.get(resource.snapshotId);
      if (
        snapshot?.kind !== 'snapshot' ||
        snapshot.taskId !== taskId ||
        snapshot.sourceId !== resource.sourceId
      ) {
        throw new Error('SOURCE_SCOPE: 提取结果没有有效来源快照');
      }
    }
    await store.add(resource);
  }
}

async function updateSources(
  tx: ImportTransaction,
  taskId: string,
  sources: ImportSource[],
): Promise<void> {
  const store = tx.objectStore('import-sources');
  for (const source of sources) {
    const prior = await store.get(source.id);
    if (!prior || prior.taskId !== taskId || source.taskId !== taskId)
      throw new Error('SOURCE_SCOPE: 来源不属于当前任务');
    for (const key of [
      'purpose',
      'origin',
      'parentSourceId',
      'discoveryId',
      'inputResourceId',
      'removedAt',
      'url',
      'kind',
    ] as const) {
      if (prior[key] !== source[key]) throw new Error('SOURCE_SCOPE: 不能变更来源授权');
    }
    if (source.currentSnapshotId) {
      const snapshot = await tx.objectStore('import-resources').get(source.currentSnapshotId);
      if (
        snapshot?.kind !== 'snapshot' ||
        snapshot.sourceId !== source.id ||
        snapshot.taskId !== taskId
      )
        throw new Error('SOURCE_SCOPE: 快照不属于当前来源');
    }
    await store.put(source);
  }
}

export class ImportRepository {
  /** 宿主业务修改与工具完成记录共用事务；回调中只能等待此事务内的请求。 */
  static async mutateTask<T>(
    taskId: string,
    update: (task: ImportTask, tx: ImportTransaction) => Promise<T>,
    options: ImportTaskMutationOptions<T> = {},
  ): Promise<T> {
    return ImportStorageStatus.track(taskId, () => this.mutateTaskOnce(taskId, update, options));
  }

  private static async mutateTaskOnce<T>(
    taskId: string,
    update: (task: ImportTask, tx: ImportTransaction) => Promise<T>,
    options: ImportTaskMutationOptions<T>,
  ): Promise<T> {
    return withImportWrite(async (tx) => {
      const task = await tx.objectStore('import-tasks').get(taskId);
      if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
      checkImportRun(task, options.run);
      const result = await update(task, tx);
      const finished = options.finish?.(result);
      await finishImportTask(task, finished, {
        toolEvents: (id, callId) =>
          tx.objectStore('import-events').index('by-task-call').getAll([id, callId]),
        event: (event) => tx.objectStore('import-events').add(event),
        task: (updated) => tx.objectStore('import-tasks').put(updated),
      });
      return result;
    });
  }
  static async createTask(name = '新的导入任务'): Promise<ImportTask> {
    const now = Date.now();
    const task: ImportTask = {
      id: crypto.randomUUID(),
      name,
      state: 'draft',
      createdAt: now,
      updatedAt: now,
      runEpoch: 0,
      eventSequence: 0,
      todos: [],
      draft: {
        revision: 0,
        metadata: {},
        volumes: [],
        chapters: [],
        target: { kind: 'new' },
        novelScope: { revision: 0, candidates: [], needsChoice: false },
        completeness: { confirmed: false, missing: [] },
      },
    };
    const db = await getDB();
    await db.add('import-tasks', task);
    return task;
  }

  static async getTask(taskId: string): Promise<ImportTask | undefined> {
    return (await getDB()).get('import-tasks', taskId);
  }

  /** 在昂贵的批量计算前读取并核对草稿；提交时仍须在事务内复核。 */
  static async getDraftTask(run: ImportRunContext, revision: number): Promise<ImportTask> {
    const task = await this.getTask(run.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    checkImportRun(task, run);
    if (task.draft.revision !== revision) throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
    return task;
  }

  static async listTasks(
    options: { limit?: number; cursor?: string | undefined } = {},
  ): Promise<{ items: ImportTask[]; cursor?: string }> {
    const limit = pageLimit(options.limit);
    const db = await getDB();
    const items: ImportTask[] = [];
    const position: unknown = options.cursor ? JSON.parse(options.cursor) : undefined;
    if (
      position !== undefined &&
      (!Array.isArray(position) ||
        typeof position[0] !== 'number' ||
        typeof position[1] !== 'string')
    ) {
      throw new Error('INVALID_PAGE: 游标无效');
    }
    let cursor = await db
      .transaction('import-tasks')
      .store.index('by-updatedAt')
      .openCursor(null, 'prev');
    while (cursor) {
      if (
        !Array.isArray(position) ||
        cursor.key < position[0] ||
        (cursor.key === position[0] && cursor.primaryKey < position[1])
      ) {
        if (items.length === limit) {
          const last = items[items.length - 1]!;
          return { items, cursor: JSON.stringify([last.updatedAt, last.id]) };
        }
        items.push(cursor.value);
      }
      cursor = await cursor.continue();
    }
    return { items };
  }

  static async listSources(
    taskId: string,
    options: {
      limit?: number;
      cursor?: string | undefined;
      parentSourceId?: string;
      status?: ImportSource['status'];
    } = {},
  ): Promise<{ items: ImportSource[]; cursor?: string }> {
    const limit = pageLimit(options.limit);
    const db = await getDB();
    const index = db.transaction('import-sources').store.index('by-task');
    let cursor = await index.openCursor(IDBKeyRange.only(taskId));
    const items: ImportSource[] = [];
    while (cursor) {
      const source = cursor.value;
      if (
        source.removedAt === undefined &&
        (!options.cursor || source.id > options.cursor) &&
        (options.parentSourceId === undefined ||
          source.parentSourceId === options.parentSourceId) &&
        (options.status === undefined || source.status === options.status)
      ) {
        if (items.length === limit) return { items, cursor: items[items.length - 1]!.id };
        items.push(source);
      }
      cursor = await cursor.continue();
    }
    return { items };
  }

  static async getSource(taskId: string, sourceId: string): Promise<ImportSource> {
    const source = await (await getDB()).get('import-sources', sourceId);
    if (!source || source.taskId !== taskId) throw new Error('SOURCE_SCOPE: 来源不属于当前任务');
    return source;
  }

  /** 新的检查、提取和发现操作不能继续使用用户已移除的入口。 */
  static async getActiveSource(taskId: string, sourceId: string): Promise<ImportSource> {
    const source = await this.getSource(taskId, sourceId);
    if (source.removedAt !== undefined)
      throw new Error('SOURCE_REMOVED: 来源已被用户移除，请先重新添加；已生成的草稿仍然保留');
    return source;
  }

  static async getResource(
    taskId: string,
    resourceId: string,
  ): Promise<ImportResource | undefined> {
    const resource = await (await getDB()).get('import-resources', resourceId);
    if (resource && resource.taskId !== taskId) throw new Error('SOURCE_SCOPE: 资源不属于当前任务');
    return resource;
  }

  /** 仅登记来源和原始 Blob，不请求、解析或生成章节。调用者为宿主服务。 */
  static async registerSources(
    taskId: string,
    sources: ImportSource[],
    resources: ImportResource[],
  ): Promise<void> {
    await ImportStorageStatus.track(taskId, () =>
      withImportWrite(async (tx) => {
        const task = await tx.objectStore('import-tasks').get(taskId);
        if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
        await addSources(tx, taskId, sources);
        await writeResources(tx, taskId, resources);
        task.updatedAt = Date.now();
        await tx.objectStore('import-tasks').put(task);
      }),
    );
  }

  /** 宿主保存一个完整步骤；不得从工具参数直接透传此对象。 */
  static async saveStep(
    taskId: string,
    step: {
      run?: ImportRunContext;
      resources?: ImportResource[];
      newSources?: ImportSource[];
      sources?: ImportSource[];
      events?: NewEvent[];
      checkpoint?: ImportCheckpoint;
      state?: 'draft' | 'paused' | 'waiting_user' | 'failed';
      /** 宿主将同一步的派生草稿与进度写入同一事务；不可从模型参数透传。 */
      update?: (task: ImportTask, tx: ImportTransaction) => Promise<void>;
    },
  ): Promise<void> {
    await this.mutateTask(
      taskId,
      async (task, tx) => {
        await addSources(tx, taskId, step.newSources ?? []);
        await writeResources(tx, taskId, step.resources ?? []);
        await updateSources(tx, taskId, step.sources ?? []);
        await step.update?.(task, tx);
        if (step.state) task.state = step.state;
      },
      {
        ...(step.run ? { run: step.run } : {}),
        finish: () => ({
          events: step.events ?? [],
          ...(step.checkpoint ? { checkpoint: step.checkpoint } : {}),
        }),
      },
    );
  }

  static async listEvents(
    taskId: string,
    options: { afterSequence?: number | undefined; limit?: number } = {},
  ): Promise<{ items: ImportEvent[]; hasMore: boolean }> {
    const limit = pageLimit(options.limit);
    const db = await getDB();
    const range = IDBKeyRange.bound(
      [taskId, options.afterSequence ?? 0],
      [taskId, Number.MAX_SAFE_INTEGER],
      true,
    );
    const items = await db.getAllFromIndex('import-events', 'by-task-sequence', range, limit + 1);
    return { items: items.slice(0, limit), hasMore: items.length > limit };
  }

  /** 任务的导入方案与应用记录，按创建时间排序；不含其他任务的记录。 */
  static async listOperations(taskId: string): Promise<ImportOperation[]> {
    const operations = await (
      await getDB()
    ).getAllFromIndex('import-operations', 'by-task', taskId);
    return operations.sort((a, b) => a.plan.createdAt - b.plan.createdAt);
  }

  static async deleteTask(taskId: string): Promise<void> {
    await withImportWrite(async (tx) => {
      const task = await tx.objectStore('import-tasks').get(taskId);
      if (!task) return;
      if (['running', 'pausing', 'applying', 'reverting'].includes(task.state)) {
        throw new Error('TASK_BUSY: 请先等待任务停止');
      }
      // 已导入小说的缓存／索引补维护依赖操作记录，删除前必须先完成
      const operations = await tx.objectStore('import-operations').index('by-task').getAll(taskId);
      if (operations.some((operation) => operation.pendingMaintenance.length))
        throw new Error('MAINTENANCE_PENDING: 已导入小说的缓存与索引维护尚未完成，请先重试维护');
      for (const name of [
        'import-sources',
        'import-resources',
        'import-events',
        'import-operations',
      ] as const) {
        const store = tx.objectStore(name);
        const keys = await store.index('by-task').getAllKeys(taskId);
        for (const key of keys) await store.delete(key);
      }
      await tx.objectStore('import-tasks').delete(taskId);
    });
  }
}
