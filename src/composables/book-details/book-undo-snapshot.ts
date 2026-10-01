import type { CharacterSetting, Novel, Terminology } from 'src/models/novel';
import type { useBooksStore } from 'src/stores/books';
import { entityKey } from 'src/services/localization/entity-identity';
import { generateShortId } from 'src/utils/id-generator';

type BooksStore = ReturnType<typeof useBooksStore>;

/**
 * 把撤销 / 重做快照写回书籍。快照里若有当前已删除（带删除记录）的术语或角色，普通保存会因
 * 删除记录拒绝重新加入；这些实体改走实体恢复协议，以新身份恢复。目标语言保持当前设置。
 * 仍存在的角色中已删除的别名同理：别名以新 ID 重新加入，角色身份不变。
 */
export async function applyBookSnapshot(books: BooksStore, snapshot: Novel): Promise<void> {
  const current = books.getBookById(snapshot.id);
  const tombstones = current?.entityTombstones ?? {};
  const deletedTerms = (snapshot.terminologies ?? []).filter(
    (value) => tombstones[entityKey('term', value.id)],
  );
  const deletedCharacters = (snapshot.characterSettings ?? []).filter(
    (value) => tombstones[entityKey('character', value.id)],
  );
  // 快照是整本书的状态：缺少术语 / 角色列表表示当时没有，撤销新增时据此删除
  const without = <T extends { id: string }>(values: T[] | undefined, removed: T[]) =>
    (values ?? []).filter((value) => !removed.includes(value));
  const reviveAliases = (value: CharacterSetting): CharacterSetting => ({
    ...value,
    aliases: value.aliases.map((alias) =>
      alias.id && tombstones[entityKey('alias', alias.id, value.id)]
        ? { ...alias, id: generateShortId() }
        : alias,
    ),
  });
  const rest: Novel = {
    ...snapshot,
    targetLanguage: current?.targetLanguage ?? 'zh-CN',
    terminologies: without<Terminology>(snapshot.terminologies, deletedTerms),
    characterSettings: without<CharacterSetting>(snapshot.characterSettings, deletedCharacters).map(
      reviveAliases,
    ),
  };
  await books.updateBook(snapshot.id, rest);
  for (const term of deletedTerms)
    await books.restoreEntity(snapshot.id, 'term', term, `undo:${generateShortId()}`);
  for (const character of deletedCharacters)
    await books.restoreEntity(snapshot.id, 'character', character, `undo:${generateShortId()}`);
}
