import { useConfirm } from 'primevue/useconfirm';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useSettingsStore } from 'src/stores/settings';
import type { ImportDraft, ImportDraftRemoval } from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

/** 确认弹窗的标题、说明与按钮，按界面语言生成；删除范围不存在时返回 undefined。 */
export function importDraftDeletionDetails(
  draft: Pick<ImportDraft, 'volumes' | 'chapters'>,
  removal: ImportDraftRemoval,
  locale: AppLocale,
) {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(locale, key, values);
  switch (removal.op) {
    case 'remove_chapter': {
      const chapter = draft.chapters.find((entry) => entry.id === removal.chapterId);
      return chapter
        ? {
            header: t('importUi.deletion.chapterHeader'),
            message: t('importUi.deletion.chapterMessage', { title: chapter.title }),
            acceptLabel: t('importUi.deletion.chapterAccept'),
          }
        : undefined;
    }
    case 'remove_volume': {
      const volume = draft.volumes.find((entry) => entry.id === removal.volumeId);
      const count = draft.chapters.filter((entry) => entry.volumeId === removal.volumeId).length;
      return volume
        ? {
            header: t('importUi.deletion.volumeHeader'),
            message: t('importUi.deletion.volumeMessage', { title: volume.title, count }),
            acceptLabel: t('importUi.deletion.volumeAccept'),
          }
        : undefined;
    }
    case 'clear_structure':
      return draft.volumes.length || draft.chapters.length
        ? {
            header: t('importUi.deletion.structureHeader'),
            message: t('importUi.deletion.structureMessage', {
              volumes: draft.volumes.length,
              chapters: draft.chapters.length,
            }),
            acceptLabel: t('importUi.deletion.structureAccept'),
          }
        : undefined;
  }
}

/** 三个设备变体共用一个确认入口，确认范围固定在打开弹窗时。 */
export function useImportDraftDeletion() {
  const store = useImportWorkspaceStore();
  const settings = useSettingsStore();
  const confirm = useConfirm();
  return (removal: ImportDraftRemoval): void => {
    const task = store.task;
    if (!task) return;
    const locale = settings.uiLocale;
    const details = importDraftDeletionDetails(task.draft, removal, locale);
    if (!details) return;
    const taskId = task.id;
    const revision = task.draft.revision;
    const operation = { ...removal };
    confirm.require({
      ...details,
      message: translateText(locale, 'importUi.deletion.kept', { message: details.message }),
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: translateText(locale, 'importUi.common.cancel'),
      acceptClass: 'p-button-danger',
      accept: () => void store.removeDraft(taskId, revision, operation),
    });
  };
}
