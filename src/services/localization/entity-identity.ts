import type { EntityTombstone, SyncRevision } from 'src/models/localized-data';

/** 同名只用于提示冲突，不能充当已有稳定 ID 的身份。 */
export function hasDuplicateEntityNames(values: readonly { name: string }[]): boolean {
  return new Set(values.map((value) => value.name)).size !== values.length;
}
import { assertRevision } from './revision';

export function entityKey(kind: EntityTombstone['kind'], id: string, parentId?: string): string {
  return JSON.stringify([kind, parentId ?? null, id]);
}

/** 已知删除保持原记录；重试不产生新身份事件或修改审计时间。 */
export function createEntityDeletionRecorder(
  records: Record<string, EntityTombstone>,
  revision: SyncRevision,
  deletedAt: number,
) {
  return (kind: EntityTombstone['kind'], id: string, parentId?: string) => {
    const key = entityKey(kind, id, parentId);
    if (!records[key])
      records[key] = {
        kind,
        id,
        ...(parentId ? { parentId } : {}),
        revision: { ...revision },
        deletedAt,
      };
  };
}

export function normalizeTombstones(
  records: Record<string, EntityTombstone> | undefined,
): Record<string, EntityTombstone> {
  if (records === undefined) return {};
  if (!records || typeof records !== 'object' || Array.isArray(records))
    throw new Error('INVALID_ENTITY_TOMBSTONE');
  const result: Record<string, EntityTombstone> = {};
  for (const [key, record] of Object.entries(records).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (
      !record ||
      !['term', 'character', 'alias'].includes(record.kind) ||
      typeof record.id !== 'string' ||
      !record.id ||
      !Number.isFinite(record.deletedAt) ||
      record.deletedAt < 0 ||
      (record.kind === 'alias'
        ? typeof record.parentId !== 'string' || !record.parentId
        : record.parentId !== undefined) ||
      key !== entityKey(record.kind, record.id, record.parentId)
    ) {
      throw new Error('INVALID_ENTITY_TOMBSTONE');
    }
    assertRevision(record.revision);
    result[key] = { ...record, revision: { ...record.revision } };
  }
  return result;
}
