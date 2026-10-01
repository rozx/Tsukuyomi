import { cloneDeep } from 'lodash';
import type { CharacterSetting, Novel, Terminology } from 'src/models/novel';
import { normalizeBookLanguages } from './normalize';
import type { EntityUpdates } from './entity-edit';
import { legacyAliasId } from './revision';

type Entity = Terminology | CharacterSetting;

function findImportTarget<T extends Entity>(values: T[], incoming: T): T | undefined {
  const byId = values.find((value) => value.id === incoming.id);
  if (
    byId ||
    incoming.translationsByLanguage !== undefined ||
    incoming.fieldRevisions !== undefined
  )
    return byId;
  const byName = values.filter((value) => value.name === incoming.name);
  if (byName.length > 1) throw new Error('AMBIGUOUS_ENTITY_NAME');
  return byName[0];
}

function prepareAliases(
  bookId: string,
  incoming: CharacterSetting,
  raw: CharacterSetting,
  existing?: CharacterSetting,
) {
  const legacyNames = new Set(
    (raw.aliases ?? []).filter((alias) => alias.id === undefined).map((alias) => alias.name),
  );
  return (incoming.aliases ?? []).map((alias) => {
    if (!legacyNames.has(alias.name) || alias.id !== legacyAliasId(bookId, incoming.id, alias.name))
      return alias;
    const matches = existing?.aliases.filter((value) => value.name === alias.name) ?? [];
    if (matches.length > 1) throw new Error('AMBIGUOUS_ALIAS_NAME');
    return matches[0]?.id ? { ...alias, id: matches[0].id } : alias;
  });
}

/** 文件携带的语言槽为权威输入；旧文件只提供简中，缺席语言保留现有成果。 */
export function prepareImportedEntities<T extends Entity>(
  book: Novel,
  kind: 'term' | 'character',
  incoming: readonly T[],
): { updates: EntityUpdates; addedIds: string[]; updatedBefore: T[] } {
  if (new Set(incoming.map((value) => value.id)).size !== incoming.length)
    throw new Error('INVALID_ENTITY_ID');
  const current = (kind === 'term' ? book.terminologies : book.characterSettings) as
    | T[]
    | undefined;
  const values = new Map((current ?? []).map((value) => [value.id, value]));
  const addedIds: string[] = [];
  const resolvedIds = new Set<string>();
  const updatedBefore: T[] = [];
  for (const entry of cloneDeep(incoming)) {
    if (!entry.id || typeof entry.name !== 'string' || !entry.name.trim())
      throw new Error('INVALID_ENTITY_ID');
    const previous = findImportTarget([...values.values()], entry);
    if (previous) updatedBefore.push(cloneDeep(previous));
    else addedIds.push(entry.id);
    const identified = { ...entry, id: previous?.id ?? entry.id };
    if (resolvedIds.has(identified.id)) throw new Error('DUPLICATE_IMPORT_TARGET');
    resolvedIds.add(identified.id);
    const normalized = normalizeBookLanguages({
      ...book,
      terminologies: kind === 'term' ? [identified as Terminology] : [],
      characterSettings: kind === 'character' ? [identified as CharacterSetting] : [],
    });
    const imported = (
      kind === 'term' ? normalized.terminologies![0] : normalized.characterSettings![0]
    )! as T;
    if (kind === 'character')
      (imported as CharacterSetting).aliases = prepareAliases(
        book.id,
        imported as CharacterSetting,
        identified as CharacterSetting,
        previous as CharacterSetting | undefined,
      );
    values.set(imported.id, {
      ...previous,
      ...imported,
      translationsByLanguage: {
        ...previous?.translationsByLanguage,
        ...imported.translationsByLanguage,
      },
    });
  }
  // 重新生成固定简中投影，避免把投影当作当前界面语言的新译名。
  const prepared = normalizeBookLanguages({
    ...book,
    ...(kind === 'term'
      ? { terminologies: [...values.values()] as Terminology[] }
      : { characterSettings: [...values.values()] as CharacterSetting[] }),
  });
  return {
    updates:
      kind === 'term'
        ? { terminologies: prepared.terminologies }
        : { characterSettings: prepared.characterSettings },
    addedIds,
    updatedBefore,
  };
}
