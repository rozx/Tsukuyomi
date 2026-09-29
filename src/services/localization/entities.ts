import type { Alias, CharacterSetting, Novel, Terminology } from 'src/models/novel';
import type { EntityField, EntityTombstone, FieldRevisions } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { normalizeBookEntities } from './normalize';
import { mergeLanguageSlots } from './versioned-values';
import { entityKey } from './entity-identity';
import { compareRevision } from './revision';

type Entity = Terminology | CharacterSetting | Alias;
const FIELDS: EntityField[] = ['name', 'description', 'sex', 'speakingStyle'];

function mergeEntity<T extends Entity>(a: T, b: T): T {
  const result = { ...a };
  if ('legacyConflict' in a || 'legacyConflict' in b) {
    (result as Alias).legacyConflict =
      (a as Alias).legacyConflict === true || (b as Alias).legacyConflict === true;
  }
  const fields: FieldRevisions = {};
  for (const key of FIELDS) {
    const left = a.fieldRevisions?.[key];
    const right = b.fieldRevisions?.[key];
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
    const order = left && right ? compareRevision(left, right) : left ? 1 : -1;
    if (left && right && order === 0 && canonicalStringify(av) !== canonicalStringify(bv))
      throw new Error('SYNC_REVISION_CONFLICT');
    const winner = order >= 0 ? left : right;
    if (winner) {
      fields[key] = { ...winner };
      (result as unknown as Record<string, unknown>)[key] = structuredClone(order >= 0 ? av : bv);
    }
  }
  const translationsByLanguage = mergeLanguageSlots(
    a.translationsByLanguage,
    b.translationsByLanguage,
  );
  return {
    ...result,
    fieldRevisions: fields,
    translationsByLanguage,
    translation: translationsByLanguage['zh-CN']?.value ?? {
      id: '',
      translation: '',
      aiModelId: '',
      language: 'zh-CN',
    },
  };
}

/** 删除记录永久参与裁决；任何同 ID 编辑都不能使已删实体复活。 */
export function mergeBookEntityState(a: Novel, b: Novel): ReturnType<typeof normalizeBookEntities> {
  const left = normalizeBookEntities(a);
  const right = normalizeBookEntities(b);
  const tombstones: Record<string, EntityTombstone> = {};
  for (const source of [left.entityTombstones, right.entityTombstones]) {
    for (const [key, item] of Object.entries(source ?? {})) {
      const previous = tombstones[key];
      const order = previous ? compareRevision(item.revision, previous.revision) : 1;
      if (order > 0) tombstones[key] = structuredClone(item);
      else if (order === 0)
        tombstones[key]!.deletedAt = Math.max(previous!.deletedAt, item.deletedAt);
    }
  }
  function mergeList<T extends Entity>(
    first: T[] = [],
    second: T[] = [],
    kind: EntityTombstone['kind'],
    parentId?: string,
  ): T[] {
    const result = new Map<string, T>();
    for (const source of [first, second]) {
      const ids = new Set<string>();
      for (const item of source) {
        if (!item.id || ids.has(item.id)) throw new Error('INVALID_ENTITY_ID');
        ids.add(item.id);
        if (tombstones[entityKey(kind, item.id, parentId)]) continue;
        const previous = result.get(item.id);
        const merged = mergeEntity(previous ?? item, item);
        if (kind === 'character') {
          (merged as CharacterSetting).aliases = mergeList(
            (previous as CharacterSetting | undefined)?.aliases,
            (item as CharacterSetting).aliases,
            'alias',
            item.id,
          );
        }
        result.set(item.id, merged);
      }
    }
    return [...result.entries()]
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([, value]) => value);
  }
  return {
    entitySyncVersion: 1,
    entityTombstones: Object.fromEntries(
      Object.entries(tombstones).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
    ),
    terminologies: mergeList(left.terminologies, right.terminologies, 'term'),
    characterSettings: mergeList(left.characterSettings, right.characterSettings, 'character'),
  };
}
