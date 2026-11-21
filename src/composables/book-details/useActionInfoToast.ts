import { restoreEntityAction } from 'src/services/ai/tools/entity-action-restore';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { Terminology, CharacterSetting, Novel } from 'src/models/novel';
import type { Ref } from 'vue';
import { v4 } from 'uuid';
import type { AppLocale } from 'src/models/locale';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';
import { entityTypeLabel } from 'src/utils/action-info-utils';
import { entityNameTranslation } from 'src/utils/action-info/named-entity-details';

/**
 * 统计唯一的操作数量（按实体类型分组）
 * @param actions 操作数组
 * @returns 包含术语和角色操作数量的对象
 */
async function revertCreate(bookId: string, action: ActionInfo): Promise<void> {
  const data = action.data as Terminology | CharacterSetting;
  if (action.entity === 'term') {
    await TerminologyService.deleteTerminology(bookId, data.id);
  } else {
    await CharacterSettingService.deleteCharacterSetting(bookId, data.id);
  }
}

async function restorePreviousEntity(
  bookId: string,
  action: ActionInfo,
  booksStore: ReturnType<typeof useBooksStore>,
  operationId: string,
): Promise<void> {
  if (action.type === 'update' && action.execution) {
    await restoreEntityAction(action, bookId, operationId);
    await booksStore.refreshBookFromStorage(bookId);
    return;
  }
  await booksStore.restoreEntity(
    bookId,
    action.entity === 'term' ? 'term' : 'character',
    action.previousData as Terminology | CharacterSetting,
    operationId,
  );
}

export function countUniqueActions(actions: ActionInfo[]): { terms: number; characters: number } {
  const termKeys = new Set<string>();
  const characterKeys = new Set<string>();

  for (const action of actions) {
    if (action.entity !== 'term' && action.entity !== 'character') continue;
    if (action.type !== 'create' && action.type !== 'update' && action.type !== 'delete') continue;

    // 创建唯一键：entity + type + id
    // 对于 delete 操作，data 是 { id: string; name?: string }
    // 对于 create/update 操作，data 是 Terminology 或 CharacterSetting
    let id: string | undefined;
    if (action.type === 'delete') {
      const deleteData = action.data as { id?: string; name?: string };
      id = deleteData.id;
    } else {
      const entityData = action.data as Terminology | CharacterSetting;
      id = entityData.id;
    }

    if (!id) continue;

    const key = `${action.entity}:${action.type}:${id}`;

    if (action.entity === 'term') {
      termKeys.add(key);
    } else if (action.entity === 'character') {
      characterKeys.add(key);
    }
  }

  return {
    terms: termKeys.size,
    characters: characterKeys.size,
  };
}

type ToastableAction = ActionInfo & {
  entity: 'term' | 'character';
  type: 'create' | 'update' | 'delete';
};

const TOAST_SKIPPED_TYPES = new Set(['read', 'navigate', 'web_search', 'web_fetch']);

function shouldSkipActionToast(action: ActionInfo): boolean {
  if (TOAST_SKIPPED_TYPES.has(action.type)) return true;
  if (action.entity !== 'term' && action.entity !== 'character') return true;
  if (action.type !== 'create' && action.type !== 'update' && action.type !== 'delete') return true;
  return false;
}

interface ToastLanguages {
  /** toast 文字语言（执行快照的界面语言，缺省为当前界面语言） */
  locale: AppLocale;
  /** 读取术语/角色译名的目标语言 */
  language: AppLocale;
}

function buildDeleteToastMessages(
  action: ToastableAction,
  { locale }: ToastLanguages,
): { summary: string; detail: string } {
  const deleteData = action.data as { id: string; name?: string };
  const entity = entityTypeLabel(locale, action.entity);
  const name = deleteData.name || translateText(locale, 'activityUi.toast.unknown');
  return {
    summary: translateText(locale, 'activityUi.toast.deletedSummary', { entity }),
    detail: translateText(locale, 'activityUi.toast.deletedDetail', { entity, name }),
  };
}

function buildUpsertToastMessages(
  action: ToastableAction & { type: 'create' | 'update' },
  { locale, language }: ToastLanguages,
): { summary: string; detail: string } {
  const data = action.data as Terminology | CharacterSetting;
  const entity = entityTypeLabel(locale, action.entity);
  const name = data.name || translateText(locale, 'activityUi.toast.unknown');
  const parts: string[] = [translateText(locale, 'activityUi.toast.entityName', { entity, name })];
  const translation = entityNameTranslation(data, language);
  if (translation) {
    parts.push(translateText(locale, 'activityUi.toast.translationPart', { text: translation }));
  }
  return {
    summary: translateText(locale, `activityUi.toast.upsertSummary.${action.type}`, { entity }),
    detail: parts.join(translateText(locale, 'activityUi.toast.partSeparator')),
  };
}

function buildActionToastMessages(
  action: ToastableAction,
  languages: ToastLanguages,
): { summary: string; detail: string } {
  if (action.type === 'delete') return buildDeleteToastMessages(action, languages);
  return buildUpsertToastMessages(
    action as ToastableAction & { type: 'create' | 'update' },
    languages,
  );
}

/**
 * 把 AI 工具产生的 ActionInfo 转成一条 toast 消息（不显示，也不依赖组件上下文）。
 * 页面（useActionInfoToast）和任务队列共用；返回 null 表示该类动作不需要提示。
 */
export function buildActionInfoToastMessage(
  action: ActionInfo,
  fallback: { bookId?: string | undefined; targetLanguage?: AppLocale | undefined; uiLocale: AppLocale },
  options: {
    severity?: 'info' | 'success' | 'warn' | 'error';
    life?: number;
    withRevert?: boolean;
  } = {},
): ToastMessageWithHistoryOptions | null {
  if (shouldSkipActionToast(action)) return null;
  const toastable = action as ToastableAction;
  const { severity = 'info', life = 3000, withRevert = false } = options;
  const languages: ToastLanguages = {
    locale: action.execution?.languages.uiLocale ?? fallback.uiLocale,
    language: action.execution?.languages.targetLanguage ?? fallback.targetLanguage ?? 'zh-CN',
  };
  const { summary, detail } = buildActionToastMessages(toastable, languages);
  const bookId = action.execution?.bookId ?? fallback.bookId;
  const onRevert =
    withRevert && bookId
      ? (() => {
          const operationId = v4();
          return async () => {
            if (toastable.type === 'create') {
              await revertCreate(bookId, toastable);
            } else if (toastable.previousData) {
              await restorePreviousEntity(bookId, toastable, useBooksStore(), operationId);
            }
          };
        })()
      : undefined;
  return { severity, summary, detail, life, ...(onRevert ? { onRevert } : {}) };
}

/**
 * 处理 AI 工具调用产生的 ActionInfo，并显示相应的 toast 通知
 * @param book 书籍对象
 */
export function useActionInfoToast(book: Ref<Novel | undefined>) {
  const toast = useToastWithHistory();
  const settingsStore = useSettingsStore();

  const handleActionInfoToast = (
    action: ActionInfo,
    options: {
      severity?: 'info' | 'success' | 'warn' | 'error';
      life?: number;
      withRevert?: boolean;
    } = {},
  ): void => {
    const message = buildActionInfoToastMessage(
      action,
      {
        bookId: book.value?.id,
        targetLanguage: book.value?.targetLanguage,
        uiLocale: settingsStore.uiLocale,
      },
      options,
    );
    if (message) toast.add(message);
  };

  return {
    handleActionInfoToast,
    countUniqueActions,
  };
}
