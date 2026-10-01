import { cloneDeep } from 'lodash';
import { v5 } from 'uuid';
import type { IDBPDatabase } from 'idb';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import type { Alias, CharacterSetting, Novel, Terminology } from 'src/models/novel';
import type { EntityField, EntityTombstone, SyncRevision } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { stripNovelLocalFields } from 'src/utils/sync-strip';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { normalizeBookLanguages } from './normalize';
import { collectBookRevisions } from './entity-edit';
import { reserveSyncRevision } from './clock';
import { createEntityDeletionRecorder, entityKey } from './entity-identity';
import { mergeBookEntityState } from './entities';
import type { EntityRestoreOperation } from './restore';
import { replaceLanguageSlots } from './versioned-values';
import { replaceBookLanguageSlots } from './book-slots';

type Entity = Terminology | CharacterSetting | Alias;
type Identity = { id: string; parentId?: string };
type IdentityMap = NonNullable<EntityRestoreOperation['identityMap']>;
const FORCE_NAMESPACE = '48a25856-7c6a-478b-8263-66e9fa1a3a35';
const FIELDS: EntityField[] = ['name', 'description', 'sex', 'speakingStyle'];

function identityMapper(
  tombstones: Record<string, EntityTombstone>,
  mapping: IdentityMap,
  key: string,
) {
  return (kind: EntityTombstone['kind'], source: Identity, parentId?: string): Identity => {
    let current = { ...source };
    const seen = new Set<string>();
    while (true) {
      const from = entityKey(kind, current.id, current.parentId);
      if (seen.has(from)) throw new Error('INVALID_FORCE_MAPPING');
      seen.add(from);
      const mapped = mapping[from];
      if (mapped) {
        current = { ...mapped };
        continue;
      }
      const parentChanged = kind === 'alias' && current.parentId !== parentId;
      if (!tombstones[from] && !parentChanged) return current;
      const next: Identity = {
        id: v5(canonicalStringify([key, from, parentId ?? null]), FORCE_NAMESPACE),
        ...(kind === 'alias' && parentId ? { parentId } : {}),
      };
      mapping[from] = next;
      current = next;
    }
  };
}

function forceValues<T extends Entity>(
  local: T,
  remote: T | undefined,
  revision: SyncRevision,
  now: number,
): T {
  const result = cloneDeep(local);
  const fields = new Set([
    ...Object.keys(local.fieldRevisions ?? {}),
    ...Object.keys(remote?.fieldRevisions ?? {}),
  ]);
  result.fieldRevisions = {};
  for (const field of FIELDS) if (fields.has(field)) result.fieldRevisions[field] = { ...revision };
  result.translationsByLanguage = replaceLanguageSlots(
    local.translationsByLanguage,
    remote?.translationsByLanguage,
    revision,
    now,
  );
  result.translation = result.translationsByLanguage['zh-CN']?.value ?? {
    id: '',
    translation: '',
    aiModelId: '',
    language: 'zh-CN',
  };
  return result;
}

function buildForceBook(
  local: Novel,
  remote: Novel | undefined,
  mapping: IdentityMap,
  key: string,
  revision: SyncRevision,
): Novel {
  const result = cloneDeep(local);
  const peer = remote ?? {
    ...local,
    terminologies: [],
    characterSettings: [],
    entityTombstones: {},
  };
  const tombstones = mergeBookEntityState(
    { ...local, terminologies: [], characterSettings: [] },
    { ...peer, terminologies: [], characterSettings: [] },
  ).entityTombstones!;
  const now = Date.now();
  const remove = createEntityDeletionRecorder(tombstones, revision, now);
  const identity = identityMapper(tombstones, mapping, key);
  const terms = (local.terminologies ?? []).map((term) => {
    const target = identity('term', { id: term.id });
    return {
      ...forceValues(
        term,
        peer.terminologies?.find((item) => item.id === target.id),
        revision,
        now,
      ),
      id: target.id,
    };
  });
  const characters = (local.characterSettings ?? []).map((character) => {
    const target = identity('character', { id: character.id });
    const other = peer.characterSettings?.find((item) => item.id === target.id);
    const aliases = character.aliases.map((alias) => {
      const mapped = identity('alias', { id: alias.id!, parentId: character.id }, target.id);
      if (target.id !== character.id || mapped.id !== alias.id)
        remove('alias', alias.id!, character.id);
      return {
        ...forceValues(
          alias,
          other?.aliases.find((item) => item.id === mapped.id),
          revision,
          now,
        ),
        id: mapped.id,
      };
    });
    return { ...forceValues(character, other, revision, now), id: target.id, aliases };
  });
  for (const term of peer.terminologies ?? [])
    if (!terms.some((item) => item.id === term.id)) remove('term', term.id);
  for (const character of peer.characterSettings ?? []) {
    const kept = characters.find((item) => item.id === character.id);
    if (!kept) remove('character', character.id);
    for (const alias of character.aliases)
      if (!kept?.aliases.some((item) => item.id === alias.id))
        remove('alias', alias.id!, character.id);
  }
  replaceBookLanguageSlots(result, peer, revision, now);
  return {
    ...result,
    ...mergeBookEntityState(
      {
        ...result,
        terminologies: terms,
        characterSettings: characters,
        entityTombstones: tombstones,
      },
      { ...result, terminologies: [], characterSettings: [], entityTombstones: tombstones },
    ),
  };
}

/** 强制推送只读取远端协议信息，本地业务值是覆盖意图；失败重试沿用已确定的身份。 */
export async function prepareForceBook(
  db: IDBPDatabase<TsukuyomiDB>,
  localBook: Novel,
  remoteBook: Novel | undefined,
  operationId: string,
): Promise<Novel> {
  if (!operationId.trim()) throw new Error('INVALID_FORCE_OPERATION');
  const local = normalizeBookLanguages(localBook);
  const remote = remoteBook ? normalizeBookLanguages(remoteBook) : undefined;
  const signature = canonicalStringify(stripNovelLocalFields(local));
  const sourceSignature = canonicalStringify(remote ? stripNovelLocalFields(remote) : null);
  const key = canonicalStringify(['force-book', operationId, local.id]);
  const previous = await db.get('entity-operations', key);
  if (previous && previous.scope !== 'force-book') throw new Error('INVALID_FORCE_OPERATION');
  const preparedSignature = previous?.result
    ? canonicalStringify(stripNovelLocalFields(previous.result))
    : undefined;
  if (
    previous?.result &&
    (signature === previous.signature || signature === preparedSignature) &&
    (sourceSignature === previous.sourceSignature || sourceSignature === preparedSignature)
  )
    return previous.result;
  const revision = await reserveSyncRevision(db, [
    ...collectBookRevisions(local),
    ...(remote ? collectBookRevisions(remote) : []),
  ]);
  const mapping = cloneDeep(previous?.identityMap ?? {});
  const result = buildForceBook(local, remote, mapping, key, revision);
  const tx = db.transaction('entity-operations', 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const latest = await tx.store.get(key);
    if (canonicalStringify(latest) !== canonicalStringify(previous))
      throw new Error('FORCE_OPERATION_CHANGED');
    await tx.store.put({
      id: key,
      scope: 'force-book',
      state: 'prepared',
      bookId: local.id,
      signature,
      sourceSignature,
      identityMap: mapping,
      result,
    });
    return result;
  });
}
