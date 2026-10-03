import type { Memory } from 'src/models/memory';

/** 旧数据没有独立修改时间，迁移时冻结原访问时间，后续访问不再改变它。 */
export function memoryModifiedAt(
  memory: Pick<Memory, 'updatedAt' | 'lastAccessedAt' | 'createdAt'>,
): number {
  return memory.updatedAt ?? memory.lastAccessedAt ?? memory.createdAt;
}
