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

/**
 * 段落内某个译文版本 ID 的删除记录。合并时删除压过 revision 不新于它的同 ID 副本；
 * 撤销/重新加回时以更新的 revision 盖戳的副本压过删除。`deletedAt` 只用于保留期清理。
 */
export interface TranslationDeletion {
  revision: SyncRevision;
  deletedAt: number;
}
