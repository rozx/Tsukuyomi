import { restoreEntityAction } from 'src/services/ai/tools/entity-action-restore';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { Terminology, CharacterSetting, Novel } from 'src/models/novel';
import type { Ref } from 'vue';
import { v4 } from 'uuid';

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

function buildDeleteToastMessages(
  action: ToastableAction,
  entityLabel: string,
): { summary: string; detail: string } {
  const deleteData = action.data as { id: string; name?: string };
  const name = deleteData.name || '未知';
  return {
    summary: `已删除${entityLabel}`,
    detail: `${entityLabel} "${name}" 已被删除`,
  };
}

function buildUpsertToastMessages(
  action: ToastableAction,
  entityLabel: string,
  typeLabel: string,
): { summary: string; detail: string } {
  const data = action.data as Terminology | CharacterSetting;
  const name = data.name || '未知';
  const parts: string[] = [`${entityLabel} "${name}"`];
  const translation = data.translation?.translation;
  if (translation) {
    parts.push(`翻译: "${translation}"`);
  }
  return {
    summary: `已${typeLabel}${entityLabel}`,
    detail: parts.join('，'),
  };
}

function buildActionToastMessages(action: ToastableAction): { summary: string; detail: string } {
  const entityLabel = action.entity === 'term' ? '术语' : '角色';
  if (action.type === 'delete') return buildDeleteToastMessages(action, entityLabel);
  const typeLabel = action.type === 'create' ? '创建' : '更新';
  return buildUpsertToastMessages(action, entityLabel, typeLabel);
}

/**
 * 处理 AI 工具调用产生的 ActionInfo，并显示相应的 toast 通知
 * @param book 书籍对象
 * @param action ActionInfo 对象
 * @param options 可选配置
 * @param options.severity toast 严重级别，默认为 'info'
 * @param options.life toast 显示时长（毫秒），默认为 3000
 * @param options.withRevert 是否包含撤销功能，默认为 false
 */
export function useActionInfoToast(book: Ref<Novel | undefined>) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();

  const buildRevertHandler = (action: ToastableAction) => {
    const bookId = action.execution?.bookId ?? book.value?.id;
    const operationId = v4();
    return async () => {
      if (!bookId) return;
      if (action.type === 'create') {
        await revertCreate(bookId, action);
      } else if (action.previousData) {
        await restorePreviousEntity(bookId, action, booksStore, operationId);
      }
    };
  };

  const handleActionInfoToast = (
    action: ActionInfo,
    options: {
      severity?: 'info' | 'success' | 'warn' | 'error';
      life?: number;
      withRevert?: boolean;
    } = {},
  ): void => {
    if (shouldSkipActionToast(action)) return;
    const toastable = action as ToastableAction;

    const { severity = 'info', life = 3000, withRevert = false } = options;
    const { summary, detail } = buildActionToastMessages(toastable);
    const onRevert = withRevert ? buildRevertHandler(toastable) : undefined;

    toast.add({
      severity,
      summary,
      detail,
      life,
      ...(onRevert ? { onRevert } : {}),
    });
  };

  return {
    handleActionInfoToast,
    countUniqueActions,
  };
}
