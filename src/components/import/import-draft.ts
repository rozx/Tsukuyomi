import { computed } from 'vue';
import type { ImportDraftChapter } from 'src/models/import';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

/** 草稿编辑操作只接受不带匹配建议的章节对象。 */
export function plainChapter(chapter: ImportDraftChapter): Omit<ImportDraftChapter, 'match'> {
  const { match: _match, ...plain } = chapter;
  return plain;
}

/** 月詠运行中或尚未完成多小说选择时，草稿编辑暂时锁定。 */
export function useDraftLock() {
  const store = useImportWorkspaceStore();
  return computed(
    () =>
      store.isRunning ||
      Boolean(store.task?.run || store.task?.draft.novelScope.needsChoice) ||
      ['apply', 'revert', 'delete-draft'].includes(store.pendingAction ?? '') ||
      ['applying', 'reverting'].includes(store.task?.state ?? ''),
  );
}
