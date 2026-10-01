import type { AppLocale } from './locale';

export interface SyncRevision {
  counter: number;
  actorId: string;
}
export interface LocalizedSlot<T> {
  value: T | null;
  revision: SyncRevision;
  updatedAt: number;
}
export type LocalizedMap<T> = Partial<Record<AppLocale, LocalizedSlot<T>>>;
export type EntityField = 'name' | 'description' | 'sex' | 'speakingStyle';
export type FieldRevisions = Partial<Record<EntityField, SyncRevision>>;

export interface EntityTombstone {
  kind: 'term' | 'character' | 'alias';
  id: string;
  parentId?: string;
  revision: SyncRevision;
  deletedAt: number;
}
