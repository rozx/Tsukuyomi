import type { CharacterSetting, Novel } from 'src/models/novel';
import type { useBooksStore } from 'src/stores/books';
import type { EntityRestoreSet } from 'src/services/library-persistence';
import { entityKey } from 'src/services/localization/entity-identity';
import { restoredEntityId } from 'src/services/localization/restore';
import { canonicalStringify } from 'src/utils/canonical-json';

type BooksStore = ReturnType<typeof useBooksStore>;

/**
 * 按快照顺序拆分实体：未删除的照常保存；已删除但本操作已恢复过的沿用恢复后的身份，
 * 重试时不会被当作多余实体删掉；其余已删除实体交给恢复协议。
 */
function splitDeleted<T extends { id: string }>(
  values: T[] | undefined,
  current: T[] | undefined,
  isDeleted: (id: string) => boolean,
  restoredId: (id: string) => string,
): { kept: T[]; restore: T[] } {
  const kept: T[] = [];
  const restore: T[] = [];
  for (const value of values ?? []) {
    if (!isDeleted(value.id)) {
      kept.push(value);
      continue;
    }
    const restored = current?.find((item) => item.id === restoredId(value.id));
    if (restored) kept.push(restored);
    else restore.push(value);
  }
  return { kept, restore };
}

interface SnapshotPlan {
  /** 普通保存写入的术语与角色 */
  entities: EntityRestoreSet;
  /** 需走恢复协议的已删除术语与角色 */
  restore: EntityRestoreSet;
}

/**
 * 依据给定的书籍记录（含删除记录）规划快照写回。仍存在的角色中已删除的别名以新 ID 重新加入，
 * 新 ID 由操作 ID 确定，重试不会产生第二份。
 */
function planSnapshot(
  snapshot: Novel,
  current: Novel | undefined,
  operationId: string,
): SnapshotPlan {
  const tombstones = current?.entityTombstones ?? {};
  const restoredId = (kind: 'term' | 'character' | 'alias', id: string, parentId?: string) =>
    restoredEntityId(operationId, snapshot.id, kind, id, parentId);
  const split = <T extends { id: string }>(
    kind: 'term' | 'character',
    values: T[] | undefined,
    currentValues: T[] | undefined,
  ) =>
    splitDeleted(
      values,
      currentValues,
      (id) => Boolean(tombstones[entityKey(kind, id)]),
      (id) => restoredId(kind, id),
    );
  const terms = split('term', snapshot.terminologies, current?.terminologies);
  const characters = split('character', snapshot.characterSettings, current?.characterSettings);
  const reviveAliases = (value: CharacterSetting): CharacterSetting => ({
    ...value,
    aliases: value.aliases.map((alias) =>
      alias.id && tombstones[entityKey('alias', alias.id, value.id)]
        ? { ...alias, id: restoredId('alias', alias.id, value.id) }
        : alias,
    ),
  });
  return {
    entities: {
      terminologies: terms.kept,
      characterSettings: characters.kept.map(reviveAliases),
    },
    restore: { terminologies: terms.restore, characterSettings: characters.restore },
  };
}

/**
 * 把撤销 / 重做快照写回书籍。快照里若有当前已删除（带删除记录）的术语或角色，普通保存会因
 * 删除记录跳过它们；这些实体改走实体恢复协议，以新身份恢复。目标语言保持当前设置。
 * 内存副本可能还没收到其他标签页的删除，普通保存后按已提交的记录重新规划，补上被跳过的实体。
 * 所有已删除实体在一个事务中恢复，任一失败都不写入；失败后以同一 operationId 重试，
 * 沿用同一恢复回执分配的身份和版本。
 */
export async function applyBookSnapshot(
  books: BooksStore,
  snapshot: Novel,
  operationId: string,
): Promise<void> {
  const restoreOperationId = `undo:${operationId}`;
  const initial = planSnapshot(snapshot, books.getBookById(snapshot.id), restoreOperationId);
  // 快照是整本书的状态：缺少术语 / 角色列表表示当时没有，撤销新增时据此删除
  await books.updateBook(snapshot.id, {
    ...snapshot,
    targetLanguage: books.getBookById(snapshot.id)?.targetLanguage ?? 'zh-CN',
    ...initial.entities,
  });
  const committed = planSnapshot(snapshot, books.getBookById(snapshot.id), restoreOperationId);
  if (canonicalStringify(committed.entities) !== canonicalStringify(initial.entities))
    await books.updateBook(snapshot.id, { ...committed.entities });
  const { terminologies, characterSettings } = committed.restore;
  if (terminologies.length || characterSettings.length)
    await books.restoreEntities(snapshot.id, committed.restore, restoreOperationId);
}
