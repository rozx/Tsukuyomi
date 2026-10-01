import { APP_LOCALES, isAppLocale } from 'src/models/locale';
import type { LocalizedMap, LocalizedSlot, SyncRevision } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { assertNewRevision, assertRevision, compareRevision } from './revision';
import { translationBusinessValue } from './translation-value';
import { cloneDeep } from 'lodash';

function checkedSlot<T>(slot: LocalizedSlot<T> | undefined): LocalizedSlot<T> | undefined {
  if (slot === undefined) return undefined;
  if (!slot || typeof slot !== 'object' || slot.value === undefined)
    throw new Error('INVALID_LANGUAGE_SLOT');
  assertRevision(slot.revision);
  if (!Number.isFinite(slot.updatedAt) || slot.updatedAt < 0)
    throw new Error('INVALID_LANGUAGE_SLOT');
  return { ...slot, value: translationBusinessValue(slot.value) };
}

export function mergeLanguageSlots<T>(
  a: LocalizedMap<T> = {},
  b: LocalizedMap<T> = {},
): LocalizedMap<T> {
  if ([...Object.keys(a), ...Object.keys(b)].some((key) => !isAppLocale(key)))
    throw new Error('INVALID_LOCALE');
  const merged: LocalizedMap<T> = {};
  for (const locale of APP_LOCALES) {
    const left = checkedSlot(a[locale]);
    const right = checkedSlot(b[locale]);
    if (!left || !right) {
      if (left || right) merged[locale] = structuredClone((left ?? right)!);
      continue;
    }
    const order = compareRevision(left.revision, right.revision);
    if (order !== 0) {
      merged[locale] = structuredClone(order > 0 ? left : right);
      continue;
    }
    if (canonicalStringify(left.value) !== canonicalStringify(right.value))
      throw new Error('SYNC_REVISION_CONFLICT');
    merged[locale] = {
      ...structuredClone(left),
      updatedAt: Math.max(left.updatedAt, right.updatedAt),
    };
  }
  return merged;
}

/** 明确覆盖语言集合：本地省略而旧状态存在的语言写入清空事件。 */
export function replaceLanguageSlots<T>(
  desired: LocalizedMap<T> = {},
  previous: LocalizedMap<T> = {},
  revision: SyncRevision,
  updatedAt: number,
): LocalizedMap<T> {
  const result: LocalizedMap<T> = {};
  for (const language of APP_LOCALES) {
    const value = checkedSlot(desired[language]);
    const old = checkedSlot(previous[language]);
    if (!value && !old) continue;
    assertNewRevision(revision, old?.revision);
    result[language] = {
      value: cloneDeep(value?.value ?? null),
      revision: { ...revision },
      updatedAt,
    };
  }
  return result;
}
