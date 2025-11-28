import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { Terminology, CharacterSetting, Novel } from 'src/models/novel';
import type { Ref } from 'vue';

/**
 * 统计唯一的操作数量（按实体类型分组）
 * @param actions 操作数组
 * @returns 包含术语和角色操作数量的对象
 */
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

  const handleActionInfoToast = (
    action: ActionInfo,
    options: {
      severity?: 'info' | 'success' | 'warn' | 'error';
      life?: number;
      withRevert?: boolean;
    } = {},
  ): void => {
    const { severity = 'info', life = 3000, withRevert = false } = options;

    // 跳过不需要显示 toast 的操作
    if (
      action.type === 'read' ||
      action.type === 'navigate' ||
      action.type === 'web_search' ||
      action.type === 'web_fetch'
    ) {
      return;
    }

    // 只处理 term 和 character 实体的创建/更新/删除操作
    if (action.entity !== 'term' && action.entity !== 'character') {
      return;
    }

    if (action.type !== 'create' && action.type !== 'update' && action.type !== 'delete') {
      return;
    }

    // 显示 CRUD 操作的 toast 通知
    const entityLabel = action.entity === 'term' ? '术语' : '角色';
    const typeLabel = action.type === 'create' ? '创建' : action.type === 'update' ? '更新' : '删除';

    let summary = '';
    let detail = '';

    if (action.type === 'delete') {
      const deleteData = action.data as { id: string; name?: string };
      const name = deleteData.name || '未知';
      summary = `已删除${entityLabel}`;
      detail = `${entityLabel} "${name}" 已被删除`;
    } else {
      const data = action.data as Terminology | CharacterSetting;
      const name = data.name || '未知';

      if (action.entity === 'term') {
        const term = data as Terminology;
        summary = `已${typeLabel}${entityLabel}`;
        const parts: string[] = [`${entityLabel} "${name}"`];
        if (term.translation?.translation) {
          parts.push(`翻译: "${term.translation.translation}"`);
        }
        detail = parts.join('，');
      } else {
        const character = data as CharacterSetting;
        summary = `已${typeLabel}${entityLabel}`;
        const parts: string[] = [`${entityLabel} "${name}"`];
        if (character.translation?.translation) {
          parts.push(`翻译: "${character.translation.translation}"`);
        }
        detail = parts.join('，');
      }
    }

    // 构建撤销回调（如果需要）
    const onRevert = withRevert
      ? async () => {
          if (!book.value) return;

          if (action.type === 'create') {
            // 撤销创建：删除创建的项目
            const data = action.data as Terminology | CharacterSetting;
            if (action.entity === 'term') {
              await TerminologyService.deleteTerminology(book.value.id, data.id);
            } else {
              await CharacterSettingService.deleteCharacterSetting(book.value.id, data.id);
            }
          } else if (action.type === 'update' && action.previousData) {
            // 撤销更新：恢复到之前的状态
            if (action.entity === 'term') {
              const previousTerm = action.previousData as Terminology;
              await TerminologyService.updateTerminology(book.value.id, previousTerm.id, {
                name: previousTerm.name,
                translation: previousTerm.translation.translation,
                ...(previousTerm.description !== undefined
                  ? { description: previousTerm.description }
                  : {}),
              });
            } else {
              const previousChar = action.previousData as CharacterSetting;
              await CharacterSettingService.updateCharacterSetting(book.value.id, previousChar.id, {
                name: previousChar.name,
                ...(previousChar.sex !== undefined ? { sex: previousChar.sex } : {}),
                translation: previousChar.translation.translation,
                ...(previousChar.description !== undefined
                  ? { description: previousChar.description }
                  : {}),
                ...(previousChar.speakingStyle !== undefined
                  ? { speakingStyle: previousChar.speakingStyle }
                  : {}),
                aliases: previousChar.aliases.map((a) => ({
                  name: a.name,
                  translation: a.translation.translation,
                })),
              });
            }
          } else if (action.type === 'delete' && action.previousData) {
            // 撤销删除：恢复删除的项目
            if (action.entity === 'term') {
              const previousTerm = action.previousData as Terminology;
              const currentBook = booksStore.getBookById(book.value.id);
              if (currentBook) {
                const current = currentBook.terminologies || [];
                if (!current.some((t) => t.id === previousTerm.id)) {
                  await booksStore.updateBook(currentBook.id, {
                    terminologies: [...current, previousTerm],
                    lastEdited: new Date(),
                  });
                }
              }
            } else {
              const previousChar = action.previousData as CharacterSetting;
              const currentBook = booksStore.getBookById(book.value.id);
              if (currentBook) {
                const current = currentBook.characterSettings || [];
                if (!current.some((c) => c.id === previousChar.id)) {
                  await booksStore.updateBook(currentBook.id, {
                    characterSettings: [...current, previousChar],
                    lastEdited: new Date(),
                  });
                }
              }
            }
          }
        }
      : undefined;

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
