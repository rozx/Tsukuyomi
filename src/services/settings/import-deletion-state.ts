import type { ImportResult } from 'src/models/settings';
import type { DeletionRecord, SyncConfig } from 'src/models/sync';
import {
  parseChapterGroupEntryKey,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
} from 'src/models/manifest';

type ImportedSections = Partial<NonNullable<ImportResult['data']>>;

type DeletionPropagationPatch = Pick<
  SyncConfig,
  'deletedNovelIds' | 'deletedModelIds' | 'deletedMemoryIds' | 'knownRemoteTombstones'
>;

function withoutIds(records: DeletionRecord[] | undefined, ids: Set<string>): DeletionRecord[] {
  return (records ?? []).filter((record) => !ids.has(record.id));
}

/** 墓碑 entry key 所属的书籍（novel / chapters / memories 条目）；其他条目返回 null */
function tombstoneBookId(key: string): string | null {
  return (
    parseNovelEntryKey(key) ?? parseChapterGroupEntryKey(key)?.bookId ?? parseMemoriesEntryKey(key)
  );
}

/**
 * 导入文件没有 sync 字段时，本机同步配置保持不变，但其中指向「被导入条目」的删除记录
 * 与远端墓碑必须移除，否则下次同步会把刚导入的内容再次删除。
 * 只清理与导入条目相关的记录；其余尚未传播的删除照常保留，避免已删除条目在其他设备复活。
 */
export function pruneDeletionStateForImport(
  config: SyncConfig,
  data: ImportedSections,
): DeletionPropagationPatch {
  const novelIds = new Set((data.novels ?? []).map((novel) => novel.id));
  const modelIds = new Set((data.models ?? []).map((model) => model.id));
  const memoryIds = new Set((data.memories ?? []).map((memory) => memory.id));
  const bookIds = new Set([...novelIds, ...(data.memories ?? []).map((memory) => memory.bookId)]);
  return {
    deletedNovelIds: withoutIds(config.deletedNovelIds, novelIds),
    deletedModelIds: withoutIds(config.deletedModelIds, modelIds),
    deletedMemoryIds: withoutIds(config.deletedMemoryIds, memoryIds),
    knownRemoteTombstones: Object.fromEntries(
      Object.entries(config.knownRemoteTombstones ?? {}).filter(([key]) => {
        const bookId = tombstoneBookId(key);
        return bookId === null || !bookIds.has(bookId);
      }),
    ),
  };
}
