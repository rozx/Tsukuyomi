import { restoreEntityAction } from 'src/services/ai/tools/entity-action-restore';
import { nextTick, type Ref } from 'vue';
import { type Router } from 'vue-router';
import co from 'co';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import {
  useChatSessionsStore,
  type ChatSessionMessage,
  type ChatSession,
  type MessageAction,
  MAX_MESSAGES_PER_SESSION,
} from 'src/stores/chat-sessions';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import { restoreTranslationAction } from 'src/services/ai/tools/translation-action-restore';
import {
  createMessageActionFromActionInfo,
  actionSummaryLabel,
  entityTypeLabel,
} from 'src/utils/action-info-utils';
import { entityNameTranslation, sexLabel } from 'src/utils/action-info/named-entity-details';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { AppLocale } from 'src/models/locale';
import type { ActionInfo } from 'src/services/ai/tools';
import type { CharacterSetting, Terminology, Translation, Alias } from 'src/models/novel';
import { v4 } from 'uuid';

export function useChatActionHandler(
  router: Router,
  toast: { add: (msg: any) => void },
  scrollToBottom: () => void,
  loadTodos: () => void,
  messages: Ref<ChatSessionMessage[]>,
  currentMessageActions: Ref<MessageAction[]>,
  setThinkingActive: (id: string, active: boolean) => void,
  getMessagesSinceSummaryCount: (session: ChatSession | null) => number,
) {
  const booksStore = useBooksStore();
  const bookDetailsStore = useBookDetailsStore();
  const contextStore = useContextStore();
  const chatSessionsStore = useChatSessionsStore();
  const settingsStore = useSettingsStore();

  /**
   * toast 是写入历史的自由文本：优先使用执行快照的界面语言生成，
   * 没有快照时使用当前界面语言；之后不再随语言切换重译。
   */
  const toastLocale = (action: ActionInfo): AppLocale =>
    action.execution?.languages.uiLocale ?? settingsStore.uiLocale;

  const text = (locale: AppLocale, key: MessageKey, values?: Record<string, string | number>) =>
    translateText(locale, key, values);

  /** 术语/角色译名按执行目标语言读取，旧操作回退书籍目标语言 */
  const entityLanguage = (action: ActionInfo, bookId: string | null): AppLocale =>
    action.execution?.languages.targetLanguage ??
    (bookId ? booksStore.getBookById(bookId)?.targetLanguage : undefined) ??
    'zh-CN';

  const formatEntityMainInfo = (
    entity: CharacterSetting | Terminology,
    language: AppLocale,
  ): string => {
    if (!entity.name) return '';
    const translation = entityNameTranslation(entity, language);
    return translation ? `${entity.name} → ${translation}` : entity.name;
  };

  const formatCharacterDetails = (character: CharacterSetting, locale: AppLocale): string[] => {
    const details: string[] = [];
    if (character.sex) {
      details.push(
        text(locale, 'activityUi.toast.sex', { value: sexLabel(locale, character.sex) }),
      );
    }
    if (character.speakingStyle) {
      details.push(
        text(locale, 'activityUi.toast.speakingStyle', { value: character.speakingStyle }),
      );
    }
    if (character.aliases && character.aliases.length > 0) {
      details.push(text(locale, 'activityUi.toast.aliases', { count: character.aliases.length }));
    }
    return details;
  };

  const formatTermDetails = (term: Terminology, locale: AppLocale): string[] =>
    term.description
      ? [text(locale, 'activityUi.toast.description', { value: term.description })]
      : [];

  const joinEntityParts = (
    mainInfo: string,
    details: string[],
    entityType: 'character' | 'term',
    fallbackName: string,
    locale: AppLocale,
  ): string => {
    if (mainInfo && details.length > 0) return `${mainInfo} | ${details.join(' | ')}`;
    if (mainInfo) return mainInfo;
    if (details.length > 0) return details.join(' | ');
    return text(locale, 'activityUi.toast.entityHandled', {
      entity: entityTypeLabel(locale, entityType),
      name: fallbackName,
    });
  };

  /**
   * 格式化角色或术语信息为显示字符串
   */
  const formatEntityInfo = (
    entity: CharacterSetting | Terminology,
    entityType: 'character' | 'term',
    locale: AppLocale,
    language: AppLocale,
  ): string => {
    const mainInfo = formatEntityMainInfo(entity, language);
    const details =
      entityType === 'character'
        ? formatCharacterDetails(entity as CharacterSetting, locale)
        : formatTermDetails(entity as Terminology, locale);
    return joinEntityParts(mainInfo, details, entityType, entity.name ?? '', locale);
  };

  const summaryOf = (action: ActionInfo): string =>
    actionSummaryLabel(toastLocale(action), action.type, action.entity);

  /**
   * 构建创建操作的 revert 回调（删除实体）
   */
  const buildCreateRevert =
    (entityType: 'character' | 'term', entityId: string, bookId: string): (() => Promise<void>) =>
    async () => {
      if (entityType === 'character')
        await CharacterSettingService.deleteCharacterSetting(bookId, entityId);
      else await TerminologyService.deleteTerminology(bookId, entityId);
    };

  /**
   * 构建删除操作的 revert 回调（重新创建实体）
   */
  const buildEntityRestore = (action: ActionInfo, bookId: string): (() => Promise<void>) => {
    const operationId = v4();
    return async () => {
      await restoreEntityAction(action, bookId, operationId);
      await booksStore.refreshBookFromStorage(bookId);
    };
  };

  /**
   * 处理角色或术语的创建/更新/删除操作 Toast 显示
   * 统一处理逻辑，避免代码重复
   */
  const handleEntityOperationToast = (
    action: ActionInfo,
    entityType: 'character' | 'term',
    shouldShowRevertToastRef: { value: boolean },
  ): void => {
    const entity = action.data as CharacterSetting | Terminology;
    const bookId = action.execution?.bookId ?? contextStore.getContext.currentBookId;
    const locale = toastLocale(action);
    const language = entityLanguage(action, bookId);
    const detail = formatEntityInfo(entity, entityType, locale, language);

    if (!bookId) return;

    shouldShowRevertToastRef.value = true;

    if (action.type === 'create') {
      // 创建操作：添加删除 revert
      toast.add({
        severity: 'success',
        summary: summaryOf(action),
        detail,
        life: 3000,
        onRevert: buildCreateRevert(entityType, entity.id, bookId),
      });
    } else if (action.type === 'update') {
      // 更新操作：添加恢复 revert
      const previousData = action.previousData as CharacterSetting | Terminology | undefined;
      if (previousData) {
        toast.add({
          severity: 'success',
          summary: summaryOf(action),
          detail,
          life: 3000,
          onRevert: buildEntityRestore(action, bookId),
        });
      }
    } else if (action.type === 'delete') {
      // 删除操作：添加重新创建 revert
      const previousData = action.previousData as CharacterSetting | Terminology | undefined;
      if (previousData) {
        const deleteDetail = formatEntityInfo(previousData, entityType, locale, language);
        toast.add({
          severity: 'success',
          summary: summaryOf(action),
          detail: deleteDetail,
          life: 3000,
          onRevert: buildEntityRestore(action, bookId),
        });
      }
    }
  };

  const performBookNavigate = (action: ActionInfo): void => {
    if (action.type !== 'navigate' || !('book_id' in action.data)) return;
    const bookId = action.data.book_id;
    const chapterId = 'chapter_id' in action.data ? action.data.chapter_id : null;
    const paragraphId = 'paragraph_id' in action.data ? action.data.paragraph_id : null;

    void co(function* () {
      try {
        yield router.push(`/books/${bookId}`);
        yield nextTick();
        if (chapterId) {
          bookDetailsStore.setSelectedChapter(bookId, chapterId);
        }
        if (paragraphId) {
          yield nextTick();
          setTimeout(() => {
            const el = document.getElementById(`paragraph-${paragraphId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 500);
        }
      } catch (error) {
        console.error('[AppRightPanel] 导航失败:', error);
      }
    });
  };

  const performHelpDocNavigate = (action: ActionInfo): void => {
    if (action.type !== 'navigate' || action.entity !== 'help_doc') return;
    if (!('doc_id' in action.data)) return;

    const docId = action.data.doc_id;
    const sectionId = 'section_id' in action.data ? action.data.section_id : null;

    void co(function* () {
      try {
        const path = sectionId ? `/help/${docId}#${sectionId}` : `/help/${docId}`;
        yield router.push(path);
      } catch (error) {
        console.error('[ChatActionHandler] 帮助文档导航失败:', error);
      }
    });
  };

  /**
   * 把 messageAction 立即推到当前助手消息里，避免响应完成前无反馈。
   */
  const attachActionToAssistantMessage = (
    messageAction: MessageAction,
    assistantMessageId: string,
  ): void => {
    const isDuplicateIn = (list: MessageAction[] | undefined): boolean =>
      Boolean(
        list?.some(
          (a) =>
            a.timestamp === messageAction.timestamp &&
            a.type === messageAction.type &&
            a.entity === messageAction.entity &&
            a.name === messageAction.name,
        ),
      );

    // 实时 badge 列表与持久化列表使用同一去重规则，避免 badge 行重复渲染
    if (!isDuplicateIn(currentMessageActions.value)) {
      currentMessageActions.value.push(messageAction);
    }

    const assistantMsg = messages.value.find((m) => m.id === assistantMessageId);
    if (!assistantMsg) return;
    if (!assistantMsg.actions) assistantMsg.actions = [];

    if (isDuplicateIn(assistantMsg.actions)) return;

    assistantMsg.actions.push(messageAction);
    void nextTick(() => {
      scrollToBottom();
    });
  };

  /**
   * 工具调用后一般切出新助手消息气泡。todo 操作例外，保持分组显示。
   */
  const rotateAssistantMessage = (
    action: ActionInfo,
    assistantMessageIdRef: { value: string },
  ): void => {
    if (action.entity === 'todo') {
      scrollToBottom();
      return;
    }

    const currentMsgCount = getMessagesSinceSummaryCount(chatSessionsStore.currentSession);
    if (currentMsgCount >= MAX_MESSAGES_PER_SESSION) {
      // 达到限制就继续用现有消息，等自动总结
      return;
    }

    const oldAssistantMessageId = assistantMessageIdRef.value;
    const newAssistantMessageId = (Date.now() + 1).toString();
    messages.value.push({
      id: newAssistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    assistantMessageIdRef.value = newAssistantMessageId;
    setThinkingActive(oldAssistantMessageId, false);
    currentMessageActions.value = [];
    scrollToBottom();
  };

  /**
   * 不需要 toast 反馈（导航/读取/搜索/ask/web_*）的 action 直接返回 true。
   * 含副作用：todo 需要刷新列表。
   */
  const shouldSkipToast = (action: ActionInfo): boolean => {
    if (
      action.type === 'web_search' ||
      action.type === 'web_fetch' ||
      action.type === 'read' ||
      action.type === 'search' ||
      action.type === 'navigate' ||
      action.type === 'ask'
    ) {
      return true;
    }
    if (action.entity === 'todo') {
      loadTodos();
      return true;
    }
    return false;
  };

  type BatchReplaceActionData = {
    tool_name: string;
    replaced_paragraph_count: number;
    replaced_translation_count: number;
    keywords?: string[];
    original_keywords?: string[];
    replacement_text: string;
    replace_all_translations: boolean;
  };

  const formatBatchReplaceKeywords = (data: BatchReplaceActionData, locale: AppLocale): string => {
    const parts: string[] = [];
    if (data.keywords && data.keywords.length > 0) {
      parts.push(
        text(locale, 'activityUi.toast.translationKeywords', {
          keywords: data.keywords.join(', '),
        }),
      );
    }
    if (data.original_keywords && data.original_keywords.length > 0) {
      parts.push(
        text(locale, 'activityUi.toast.originalKeywords', {
          keywords: data.original_keywords.join(', '),
        }),
      );
    }
    return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
  };

  const formatBatchReplaceDetail = (data: BatchReplaceActionData, locale: AppLocale): string => {
    const replacementPreview =
      data.replacement_text.length > 30
        ? data.replacement_text.substring(0, 30) + '...'
        : data.replacement_text;
    const keywordInfo = formatBatchReplaceKeywords(data, locale);
    const replaced = text(locale, 'activityUi.toast.batchReplaceDetail', {
      paragraphs: data.replaced_paragraph_count,
      translations: data.replaced_translation_count,
    });
    const replacedWith = text(locale, 'activityUi.toast.replacedWith', {
      text: replacementPreview,
    });
    return `${replaced} | ${replacedWith}${keywordInfo}`;
  };

  const buildTranslationRevert = (action: ActionInfo, bookId: string) => async () => {
    await restoreTranslationAction(action, bookId);
    await booksStore.refreshBookFromStorage(bookId);
  };

  const handleBatchReplaceTranslationToast = (action: ActionInfo): void => {
    const batchData = action.data as BatchReplaceActionData;
    const previousData = action.previousData as
      | {
          replaced_paragraphs: Array<{
            paragraph_id: string;
            chapter_id: string;
            old_selected_translation_id?: string;
            old_translations: Array<{ id: string; translation: string; aiModelId: string }>;
          }>;
        }
      | undefined;
    const bookId = action.execution?.bookId ?? contextStore.getContext.currentBookId;
    const canRevert = !!(previousData?.replaced_paragraphs && bookId);

    const toastPayload: Record<string, unknown> = {
      severity: 'success',
      summary: text(toastLocale(action), 'activityUi.toast.batchReplace'),
      detail: formatBatchReplaceDetail(batchData, toastLocale(action)),
      life: 5000,
    };
    if (canRevert && previousData) {
      toastPayload.onRevert = buildTranslationRevert(action, bookId!);
    }
    toast.add(toastPayload);
  };

  type SingleTranslationActionData = {
    paragraph_id: string;
    translation_id: string;
    old_translation: string;
    new_translation: string;
  };

  const isSingleTranslationAction = (data: unknown): data is SingleTranslationActionData =>
    typeof data === 'object' &&
    data !== null &&
    'paragraph_id' in data &&
    'translation_id' in data &&
    'old_translation' in data &&
    'new_translation' in data;

  const truncateForPreview = (text: string, max = 50): string =>
    text.length > max ? text.substring(0, max) + '...' : text;

  const handleSingleTranslationUpdateToast = (action: ActionInfo): boolean => {
    if (!isSingleTranslationAction(action.data)) return false;

    const translationData = action.data;
    const previousTranslation = action.previousData as Translation | undefined;
    const locale = toastLocale(action);
    const oldNew = text(locale, 'activityUi.toast.oldNew', {
      old: truncateForPreview(translationData.old_translation),
      new: truncateForPreview(translationData.new_translation),
    });
    const detail = `${text(locale, 'activityUi.toast.translationUpdated')} | ${oldNew}`;
    const summary = summaryOf(action);
    const bookId = action.execution?.bookId ?? contextStore.getContext.currentBookId;
    const canRevert = !!(previousTranslation && bookId);

    const toastPayload: Record<string, unknown> = {
      severity: 'success',
      summary,
      detail,
      life: 3000,
    };
    if (canRevert && previousTranslation) {
      toastPayload.onRevert = buildTranslationRevert(action, bookId!);
    }
    toast.add(toastPayload);
    return canRevert;
  };

  type ToastOutcome = {
    detail: string;
    shouldShowRevertToast: boolean;
    earlyReturn: boolean;
  };

  const resolveEntityToast = (
    action: ActionInfo,
    entityType: 'character' | 'term',
  ): Pick<ToastOutcome, 'shouldShowRevertToast'> => {
    const revertRef = { value: false };
    handleEntityOperationToast(action, entityType, revertRef);
    return { shouldShowRevertToast: revertRef.value };
  };

  const resolveDefaultDetail = (action: ActionInfo): string => {
    if (!('name' in action.data)) return '';
    if (action.type !== 'create' && action.type !== 'update' && action.type !== 'delete') {
      return '';
    }
    const locale = toastLocale(action);
    return text(locale, `activityUi.toast.done.${action.type}`, {
      entity: entityTypeLabel(locale, action.entity),
      name: String(action.data.name),
    });
  };

  const handleCreateToast = (action: ActionInfo): ToastOutcome => {
    if (!('name' in action.data))
      return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
    if (action.entity === 'character' && 'id' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'character'), earlyReturn: false };
    }
    if (action.entity === 'term' && 'id' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'term'), earlyReturn: false };
    }
    return {
      detail: resolveDefaultDetail(action),
      shouldShowRevertToast: false,
      earlyReturn: false,
    };
  };

  const handleUpdateToast = (action: ActionInfo): ToastOutcome => {
    if (action.entity === 'translation') {
      if ('tool_name' in action.data && action.data.tool_name === 'batch_replace_translations') {
        handleBatchReplaceTranslationToast(action);
        return { detail: '', shouldShowRevertToast: false, earlyReturn: true };
      }
      const shouldShowRevertToast = handleSingleTranslationUpdateToast(action);
      return { detail: '', shouldShowRevertToast, earlyReturn: false };
    }
    if (action.entity === 'character' && 'name' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'character'), earlyReturn: false };
    }
    if (action.entity === 'term' && 'name' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'term'), earlyReturn: false };
    }
    return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
  };

  const handleDeleteToast = (action: ActionInfo): ToastOutcome => {
    if (!('name' in action.data))
      return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
    if (action.entity === 'character' && action.previousData) {
      return { detail: '', ...resolveEntityToast(action, 'character'), earlyReturn: false };
    }
    if (action.entity === 'term' && action.previousData) {
      return { detail: '', ...resolveEntityToast(action, 'term'), earlyReturn: false };
    }
    return {
      detail: resolveDefaultDetail(action),
      shouldShowRevertToast: false,
      earlyReturn: false,
    };
  };

  const resolveActionToast = (action: ActionInfo): ToastOutcome => {
    if (action.type === 'create') return handleCreateToast(action);
    if (action.type === 'update') return handleUpdateToast(action);
    if (action.type === 'delete') return handleDeleteToast(action);
    return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
  };

  const handleAction = (action: ActionInfo, assistantMessageIdRef: { value: string }) => {
    const messageAction = createMessageActionFromActionInfo(action);

    performBookNavigate(action);
    performHelpDocNavigate(action);
    attachActionToAssistantMessage(messageAction, assistantMessageIdRef.value);
    rotateAssistantMessage(action, assistantMessageIdRef);

    if (shouldSkipToast(action)) return;

    const outcome = resolveActionToast(action);
    if (outcome.earlyReturn) return;

    if (!outcome.shouldShowRevertToast && outcome.detail) {
      toast.add({
        severity: 'success',
        summary: summaryOf(action),
        detail: outcome.detail,
        life: 3000,
      });
    }
  };

  return {
    handleAction,
  };
}
