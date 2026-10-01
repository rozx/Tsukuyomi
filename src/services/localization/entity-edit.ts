import { cloneDeep } from 'lodash';
import { v4 } from 'uuid';
import type {
  Alias,
  CharacterSetting,
  Novel,
  Paragraph,
  Terminology,
  Translation,
} from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import { APP_LOCALES } from 'src/models/locale';
import type { EntityField, EntityTombstone, SyncRevision } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { normalizeBookEntities } from './normalize';
import { mergeBookEntityState } from './entities';
import { createEntityDeletionRecorder, entityKey } from './entity-identity';
import { setNameTranslation } from './selection';

export type EntityUpdates = Pick<Partial<Novel>, 'terminologies' | 'characterSettings'>;
type Entity = Terminology | CharacterSetting | Alias;
const FIELDS: EntityField[] = ['name', 'description', 'sex', 'speakingStyle'];
const differs = (a: unknown, b: unknown) => canonicalStringify(a) !== canonicalStringify(b);

/** 新别名只分配一次身份，事务重试沿用同一请求中的身份。 */
export function identifyEntityUpdates(base: Novel, updates: EntityUpdates): EntityUpdates {
  const result = cloneDeep(updates);
  for (const character of result.characterSettings ?? []) {
    const old = base.characterSettings?.find((item) => item.id === character.id);
    for (const alias of character.aliases ?? []) {
      if (alias.id) continue;
      const matches = old?.aliases.filter((item) => item.name === alias.name) ?? [];
      if (matches.length > 1) throw new Error('AMBIGUOUS_ALIAS_NAME');
      alias.id = matches[0]?.id ?? v4();
    }
  }
  return result;
}

/** 将表单相对打开时快照的变化应用到最新状态，未改字段保留最新值。 */
export function applyBookEntityEdit(
  base: Novel,
  updates: EntityUpdates,
  current: Novel,
  locale: AppLocale,
  revision: SyncRevision,
  now: number,
): ReturnType<typeof normalizeBookEntities> {
  const previous = normalizeBookEntities(base);
  const state = cloneDeep(normalizeBookEntities(current));
  const tombstones = mergeBookEntityState(current, {
    ...current,
    terminologies: [],
    characterSettings: [],
    entityTombstones: previous.entityTombstones ?? {},
  }).entityTombstones!;
  const remove = createEntityDeletionRecorder(tombstones, revision, now);

  function updateList<T extends Entity>(
    old: T[] = [],
    requested: T[] | undefined,
    latest: T[] = [],
    kind: EntityTombstone['kind'],
    parentId?: string,
  ): T[] {
    if (requested === undefined) return latest;
    const desiredIds = new Set<string>();
    for (const item of requested) {
      if (!item.id || desiredIds.has(item.id)) throw new Error('INVALID_ENTITY_ID');
      desiredIds.add(item.id);
    }
    for (const item of old) {
      if (desiredIds.has(item.id!)) continue;
      remove(kind, item.id!, parentId);
      if (kind === 'character') {
        for (const alias of (item as CharacterSetting).aliases) remove('alias', alias.id!, item.id);
      }
    }
    const result = new Map(latest.map((item) => [item.id!, item]));
    for (const desired of requested) {
      const next = updateEntity(
        desired,
        old.find((item) => item.id === desired.id),
        result.get(desired.id!),
        kind,
        parentId,
      );
      if (next) result.set(desired.id!, next);
    }
    return [...result.values()].filter((item) => !tombstones[entityKey(kind, item.id!, parentId)]);
  }
  function updateEntity<T extends Entity>(
    desired: T,
    before: T | undefined,
    latest: T | undefined,
    kind: EntityTombstone['kind'],
    parentId?: string,
  ): T | undefined {
    let next = latest;
    const changedFields = FIELDS.filter((field) => {
      const desiredValue = (desired as unknown as Record<string, unknown>)[field];
      const oldValue = (before as unknown as Record<string, unknown> | undefined)?.[field];
      return differs(desiredValue, oldValue);
    });
    const slotEdits = APP_LOCALES.filter(
      (language) =>
        desired.translationsByLanguage?.[language] !== undefined &&
        differs(
          desired.translationsByLanguage[language]?.value,
          before?.translationsByLanguage?.[language]?.value,
        ),
    );
    const projectionEdited = !before || differs(desired.translation, before.translation);
    const aliasesEdited =
      kind === 'character' &&
      differs(
        (desired as CharacterSetting).aliases,
        (before as CharacterSetting | undefined)?.aliases,
      );
    if (tombstones[entityKey(kind, desired.id!, parentId)]) {
      if (!before || changedFields.length || slotEdits.length || projectionEdited || aliasesEdited)
        throw new Error('ENTITY_DELETED');
      return undefined;
    }
    if (before && !next) throw new Error('ENTITY_MISSING');
    if (!next) next = { ...cloneDeep(desired), translationsByLanguage: {}, fieldRevisions: {} };
    else next = cloneDeep(next);
    if (kind === 'alias' && (desired as Alias).legacyConflict)
      (next as Alias).legacyConflict = true;
    for (const field of changedFields) {
      (next as unknown as Record<string, unknown>)[field] = cloneDeep(
        (desired as unknown as Record<string, unknown>)[field],
      );
      next.fieldRevisions = { ...next.fieldRevisions, [field]: { ...revision } };
    }
    for (const language of slotEdits) {
      next = setNameTranslation(
        next,
        language,
        desired.translationsByLanguage![language]!.value,
        revision,
        now,
      );
    }
    if (
      projectionEdited &&
      (before || desired.translationsByLanguage === undefined) &&
      !slotEdits.includes(locale)
    ) {
      next = setNameTranslation(
        next,
        locale,
        { ...desired.translation, language: locale } as Translation,
        revision,
        now,
      );
    }
    if (kind === 'character') {
      (next as CharacterSetting).aliases = updateList(
        (before as CharacterSetting | undefined)?.aliases,
        (desired as CharacterSetting).aliases,
        (latest as CharacterSetting | undefined)?.aliases,
        'alias',
        desired.id,
      );
    }
    return next;
  }
  state.terminologies = updateList(
    previous.terminologies,
    updates.terminologies,
    state.terminologies,
    'term',
  );
  state.characterSettings = updateList(
    previous.characterSettings,
    updates.characterSettings,
    state.characterSettings,
    'character',
  );
  return mergeBookEntityState(
    { ...current, ...state, entityTombstones: tombstones },
    { ...current, ...state, entityTombstones: tombstones },
  );
}

/** 观察实体、标题和选用槽；只遍历协议字段，不读取用户自由文本中的相似对象。 */
export function collectBookRevisions(book: Novel): SyncRevision[] {
  const revisions: SyncRevision[] = [];
  function owner(value: {
    fieldRevisions?: Entity['fieldRevisions'];
    translationsByLanguage?: Entity['translationsByLanguage'];
  }) {
    revisions.push(...Object.values(value.fieldRevisions ?? {}));
    for (const slot of Object.values(value.translationsByLanguage ?? {}))
      revisions.push(slot.revision);
  }
  for (const entity of [...(book.terminologies ?? []), ...(book.characterSettings ?? [])])
    owner(entity);
  for (const character of book.characterSettings ?? [])
    for (const alias of character.aliases) owner(alias);
  for (const deleted of Object.values(book.entityTombstones ?? {}))
    revisions.push(deleted.revision);
  for (const volume of book.volumes ?? []) {
    if (typeof volume.title === 'object') owner(volume.title);
    for (const chapter of volume.chapters ?? []) {
      if (typeof chapter.title === 'object') owner(chapter.title);
      revisions.push(...collectParagraphRevisions(chapter.content ?? []));
    }
  }
  return revisions;
}

/**
 * 段落内所有逻辑版本：各语言选用槽，以及原地修改过的译文版本自身的 revision。
 * 后者也必须交给同步时钟观察，否则同步下来的高版本会让本机后续修改预留到更低的 revision。
 */
export function collectParagraphRevisions(content: Paragraph[]): SyncRevision[] {
  return content.flatMap((paragraph) => [
    ...Object.values(paragraph.selectedTranslations ?? {}).map((slot) => slot.revision),
    ...paragraph.translations.flatMap((value) => (value.revision ? [value.revision] : [])),
  ]);
}
