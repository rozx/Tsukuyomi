import { v5 } from 'uuid';
import type { LocalizedSlot, SyncRevision } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { translationBusinessValue } from './translation-value';

const LEGACY_NAMESPACE = '63f35ce4-5af5-5a3e-81cf-8126ef27517b';

export function assertRevision(value: SyncRevision): void {
  if (
    !value ||
    !Number.isSafeInteger(value.counter) ||
    value.counter < 0 ||
    typeof value.actorId !== 'string' ||
    !value.actorId.trim()
  ) {
    throw new Error('INVALID_SYNC_REVISION');
  }
}

export function compareRevision(a: SyncRevision, b: SyncRevision): number {
  assertRevision(a);
  assertRevision(b);
  return a.counter - b.counter || (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0);
}

export function assertNewRevision(revision: SyncRevision, previous?: SyncRevision): void {
  assertRevision(revision);
  if (revision.counter === 0 || (previous && compareRevision(revision, previous) <= 0)) {
    throw new Error('STALE_SYNC_REVISION');
  }
}

export function legacyRevision(value: unknown): SyncRevision {
  return {
    counter: 0,
    actorId: `legacy:${v5(canonicalStringify(translationBusinessValue(value ?? null)), LEGACY_NAMESPACE)}`,
  };
}

export function legacyAliasId(bookId: string, characterId: string, name: string): string {
  return `legacy-alias:${v5(canonicalStringify([bookId, characterId, name]), LEGACY_NAMESPACE)}`;
}

export function legacySlot<T>(value: T | null, updatedAt: number): LocalizedSlot<T> {
  return { value, revision: legacyRevision(value), updatedAt };
}
