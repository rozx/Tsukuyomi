import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportDraft, ImportDraftRemoval } from 'src/models/import';

function deletionDetails(draft: ImportDraft, removal: ImportDraftRemoval) {
  switch (removal.op) {
    case 'remove_chapter': {
      const chapter = draft.chapters.find((entry) => entry.id === removal.chapterId);
      return chapter
        ? {
            header: '删除草稿章节',
            message: `将从草稿中删除「${chapter.title}」。`,
            acceptLabel: '删除章节',
          }
        : undefined;
    }
    case 'remove_volume': {
      const volume = draft.volumes.find((entry) => entry.id === removal.volumeId);
      const count = draft.chapters.filter((entry) => entry.volumeId === removal.volumeId).length;
      return volume
        ? {
            header: '删除草稿卷',
            message: `将从草稿中删除「${volume.title}」及其中的 ${count} 章。`,
            acceptLabel: '删除整卷',
          }
        : undefined;
    }
    case 'clear_structure':
      return draft.volumes.length || draft.chapters.length
        ? {
            header: '清空全部卷章草稿',
            message: `将清空草稿中的 ${draft.volumes.length} 卷、${draft.chapters.length} 章。`,
            acceptLabel: '清空卷章',
          }
        : undefined;
  }
}

/** 三个设备变体共用一个确认入口，确认范围固定在打开弹窗时。 */
export function useImportDraftDeletion() {
  const store = useImportWorkspaceStore();
  const confirm = useConfirm();
  return (removal: ImportDraftRemoval): void => {
    const task = store.task;
    if (!task) return;
    const details = deletionDetails(task.draft, removal);
    if (!details) return;
    const taskId = task.id;
    const revision = task.draft.revision;
    const operation = { ...removal };
    confirm.require({
      ...details,
      message: `${details.message}来源、书籍信息和已导入书库的内容会保留。`,
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: '取消',
      acceptClass: 'p-button-danger',
      accept: () => void store.removeDraft(taskId, revision, operation),
    });
  };
}
