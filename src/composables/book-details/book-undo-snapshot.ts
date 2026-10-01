import type { CharacterSetting, Novel } from 'src/models/novel';
import type { useBooksStore } from 'src/stores/books';
import { entityKey } from 'src/services/localization/entity-identity';
import { restoredEntityId } from 'src/services/localization/restore';
import { generateShortId } from 'src/utils/id-generator';

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

/**
 * 把撤销 / 重做快照写回书籍。快照里若有当前已删除（带删除记录）的术语或角色，普通保存会因
 * 删除记录拒绝重新加入；这些实体改走实体恢复协议，以新身份恢复。目标语言保持当前设置。
 * 仍存在的角色中已删除的别名同理：别名以新 ID 重新加入，角色身份不变。
 * 所有已删除实体在一个事务中恢复，任一失败都不写入；失败后以同一 operationId 重试，
 * 沿用同一恢复回执分配的身份和版本。
 */
export async function applyBookSnapshot(
  books: BooksStore,
  snapshot: Novel,
  operationId: string,
): Promise<void> {
  const current = books.getBookById(snapshot.id);
  const tombstones = current?.entityTombstones ?? {};
  const restoreOperationId = `undo:${operationId}`;
  const split = <T extends { id: string }>(
    kind: 'term' | 'character',
    values: T[] | undefined,
    currentValues: T[] | undefined,
  ) =>
    splitDeleted(
      values,
      currentValues,
      (id) => Boolean(tombstones[entityKey(kind, id)]),
      (id) => restoredEntityId(restoreOperationId, snapshot.id, kind, id),
    );
  const terms = split('term', snapshot.terminologies, current?.terminologies);
  const characters = split('character', snapshot.characterSettings, current?.characterSettings);
  const reviveAliases = (value: CharacterSetting): CharacterSetting => ({
    ...value,
    aliases: value.aliases.map((alias) =>
      alias.id && tombstones[entityKey('alias', alias.id, value.id)]
        ? { ...alias, id: generateShortId() }
        : alias,
    ),
  });
  // 快照是整本书的状态：缺少术语 / 角色列表表示当时没有，撤销新增时据此删除
  await books.updateBook(snapshot.id, {
    ...snapshot,
    targetLanguage: current?.targetLanguage ?? 'zh-CN',
    terminologies: terms.kept,
    characterSettings: characters.kept.map(reviveAliases),
  });
  if (terms.restore.length || characters.restore.length)
    await books.restoreEntities(
      snapshot.id,
      { terminologies: terms.restore, characterSettings: characters.restore },
      restoreOperationId,
    );
}
