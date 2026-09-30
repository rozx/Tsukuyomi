import { importError } from './import-error';
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
    throw importError('INVALID_ARGUMENTS', 'invalidArgumentsChooseExactlyOneOfSourceIds', {});
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
      throw importError('SOURCE_SCOPE', 'sourceScopeSelectChapterOrFileReferencesContents', {});
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
    throw importError('SOURCE_SCOPE', 'sourceScopeTheContentsSnapshotBelongsToAnother', {});
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
    throw importError('INVALID_PAGE', 'invalidPageTheRangeExceedsDiscoveredChaptersA', {});
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
    throw importError('INVALID_ARGUMENTS', 'invalidArgumentsChooseExactlyOneOfSourceIds', {});
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
  if (!selected.length) throw importError('NO_MATCHES', 'noMatchesNoMatchesInTheCurrentSource', {});
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
