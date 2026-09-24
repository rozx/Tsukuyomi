import type { ImportResource } from 'src/models/import';
import { ImportRepository } from './import-repository';
import { filterImportSourceIds } from './import-source-filter';
import type { ImportBatchInput } from 'src/models/import-batch';
import type { ImportTransaction } from './import-repository';
import { ImportSourceService } from './import-source-service';

/** 只在保存的发现集合内选择；登记与计划写入使用同一事务，任一失败全部回滚。 */
export async function batchSourceIds(
  taskId: string,
  input: ImportBatchInput,
  tx: ImportTransaction,
): Promise<string[]> {
  if (
    [input.source_ids, input.discovery_ids, input.catalog].filter((value) => value !== undefined)
      .length !== 1
  )
    throw new Error('INVALID_ARGUMENTS: source_ids、discovery_ids、catalog 必须且只能选择一种');
  if (input.source_ids) return input.source_ids;
  let discoveries = input.discovery_ids;
  if (input.catalog) {
    discoveries = await catalogIds(taskId, input.catalog, (id) =>
      tx.objectStore('import-resources').get(id),
    );
  }
  const ids: string[] = [];
  for (const id of discoveries ?? []) {
    const found = await tx.objectStore('import-resources').get(id);
    if (
      found?.kind !== 'discovery' ||
      !['chapter', 'file', 'unknown'].includes(found.discovery.relation)
    )
      throw new Error('SOURCE_SCOPE: 请选择章节或文件引用，目录、封面和下一页不能批量建章');
    ids.push((await ImportSourceService.addDiscoveryInTransaction(taskId, id, tx)).id);
  }
  return ids;
}

async function catalogIds(
  taskId: string,
  catalog: NonNullable<ImportBatchInput['catalog']>,
  read: (id: string) => Promise<ImportResource | undefined>,
): Promise<string[]> {
  const { snapshot_id, offset, limit } = catalog;
  const snapshot = await read(snapshot_id);
  if (snapshot?.taskId !== taskId || snapshot.kind !== 'snapshot' || !snapshot.inspection)
    throw new Error('SOURCE_SCOPE: 目录快照不属于当前任务或尚未检查');
  const chapters: string[] = [];
  for (const id of snapshot.inspection.discoveryIds) {
    const found = await read(id);
    if (
      found?.kind === 'discovery' &&
      found.taskId === taskId &&
      found.discovery.snapshotId === snapshot.id &&
      found.discovery.relation === 'chapter'
    )
      chapters.push(id);
  }
  if (offset + limit > chapters.length)
    throw new Error('INVALID_PAGE: 范围超出当前快照已发现的章节，不能把截断当作完整目录');
  return chapters.slice(offset, offset + limit);
}

export async function filterChapterBatchInput(
  taskId: string,
  input: ImportBatchInput,
  signal?: AbortSignal,
): Promise<ImportBatchInput> {
  if (!input.filter) return input;
  if (
    [input.source_ids, input.discovery_ids, input.catalog].filter((v) => v !== undefined).length !==
    1
  )
    throw new Error('INVALID_ARGUMENTS: source_ids、discovery_ids、catalog 必须且只能选择一种');
  const ids =
    input.source_ids ??
    input.discovery_ids ??
    (await catalogIds(taskId, input.catalog!, (id) => ImportRepository.getResource(taskId, id)));
  const selected = await filterImportSourceIds(
    taskId,
    ids,
    input.source_ids ? 'source' : 'discovery',
    input.filter,
    signal,
  );
  if (!selected.length) throw new Error('NO_MATCHES: 当前来源范围没有匹配项');
  const {
    source_ids: _sources,
    discovery_ids: _discoveries,
    catalog: _catalog,
    filter: _filter,
    ...rest
  } = input;
  return {
    ...rest,
    ...(input.source_ids ? { source_ids: selected } : { discovery_ids: selected }),
  };
}
