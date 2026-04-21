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
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import {
  createMessageActionFromActionInfo,
  ACTION_LABELS,
  ENTITY_LABELS,
} from 'src/utils/action-info-utils';
import type { ActionInfo } from 'src/services/ai/tools';
import type { CharacterSetting, Terminology, Translation, Alias } from 'src/models/novel';

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

  /**
   * 格式化角色或术语信息为显示字符串
   * @param entity - 实体对象
   * @param entityType - 实体类型 ('character' 或 'term')
   * @returns 格式化后的详情字符串
   */
  const formatEntityInfo = (
    entity: CharacterSetting | Terminology,
    entityType: 'character' | 'term',
  ): string => {
    const parts: string[] = [];

    // 名称和翻译（主要信息）
    if (entity.name) {
      const translation = entity.translation?.translation;
      if (translation) {
        parts.push(`${entity.name} → ${translation}`);
      } else {
        parts.push(entity.name);
      }
    }

    // 其他详细信息
    const details: string[] = [];

    if (entityType === 'character') {
      const character = entity as CharacterSetting;
      // 性别
      if (character.sex) {
        const sexLabels: Record<string, string> = {
          male: '男',
          female: '女',
          other: '其他',
        };
        details.push(`性别：${sexLabels[character.sex] || character.sex}`);
      }
      // 说话口吻
      if (character.speakingStyle) {
        details.push(`口吻：${character.speakingStyle}`);
      }
      // 别名数量
      if (character.aliases && character.aliases.length > 0) {
        details.push(`别名：${character.aliases.length} 个`);
      }
    } else if (entityType === 'term') {
      const term = entity as Terminology;
      // 描述
      if (term.description) {
        details.push(`描述：${term.description}`);
      }
    }

    // 组合消息
    const mainInfo = parts.join(' | ');
    if (mainInfo && details.length > 0) {
      return `${mainInfo} | ${details.join(' | ')}`;
    } else if (mainInfo) {
      return mainInfo;
    } else if (details.length > 0) {
      return details.join(' | ');
    } else {
      const entityLabel = entityType === 'character' ? '角色' : '术语';
      return `${entityLabel} "${entity.name}" 已处理`;
    }
  };

  /**
   * 构建创建操作的 revert 回调（删除实体）
   */
  const buildCreateRevert = (
    entityType: 'character' | 'term',
    entityId: string,
  ): (() => Promise<void>) => {
    return async () => {
      if (contextStore.getContext.currentBookId) {
        if (entityType === 'character') {
          await CharacterSettingService.deleteCharacterSetting(
            contextStore.getContext.currentBookId,
            entityId,
          );
        } else {
          await TerminologyService.deleteTerminology(
            contextStore.getContext.currentBookId,
            entityId,
          );
        }
      }
    };
  };

  /**
   * 将 CharacterSetting 展开为 add/update 接口所需的 payload（保留可选字段的 exactOptionalPropertyTypes 语义）。
   */
  const serializeCharacterForService = (character: CharacterSetting) => ({
    name: character.name,
    sex: character.sex,
    translation: character.translation.translation,
    ...(character.description !== undefined ? { description: character.description } : {}),
    ...(character.speakingStyle !== undefined ? { speakingStyle: character.speakingStyle } : {}),
    ...(character.aliases !== undefined
      ? {
          aliases: character.aliases.map((a: Alias) => ({
            name: a.name,
            translation: a.translation.translation,
          })),
        }
      : {}),
  });

  /**
   * 将 Terminology 展开为 add/update 接口所需的 payload。
   */
  const serializeTermForService = (term: Terminology) => ({
    name: term.name,
    translation: term.translation.translation,
    ...(term.description !== undefined ? { description: term.description } : {}),
  });

  /**
   * 构建更新操作的 revert 回调（恢复到之前的数据）
   */
  const buildUpdateRevert = (
    entityType: 'character' | 'term',
    previousData: CharacterSetting | Terminology,
  ): (() => Promise<void>) => {
    return async () => {
      const bookId = contextStore.getContext.currentBookId;
      if (!bookId) return;
      if (entityType === 'character') {
        const previousCharacter = previousData as CharacterSetting;
        await CharacterSettingService.updateCharacterSetting(
          bookId,
          previousCharacter.id,
          serializeCharacterForService(previousCharacter),
        );
      } else {
        const previousTerm = previousData as Terminology;
        await TerminologyService.updateTerminology(
          bookId,
          previousTerm.id,
          serializeTermForService(previousTerm),
        );
      }
    };
  };

  /**
   * 构建删除操作的 revert 回调（重新创建实体）
   */
  const buildDeleteRevert = (
    entityType: 'character' | 'term',
    previousData: CharacterSetting | Terminology,
  ): (() => Promise<void>) => {
    return async () => {
      const bookId = contextStore.getContext.currentBookId;
      if (!bookId) return;
      if (entityType === 'character') {
        await CharacterSettingService.addCharacterSetting(
          bookId,
          serializeCharacterForService(previousData as CharacterSetting),
        );
      } else {
        await TerminologyService.addTerminology(
          bookId,
          serializeTermForService(previousData as Terminology),
        );
      }
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
    const detail = formatEntityInfo(entity, entityType);

    if (!contextStore.getContext.currentBookId) {
      return;
    }

    shouldShowRevertToastRef.value = true;

    if (action.type === 'create') {
      // 创建操作：添加删除 revert
      toast.add({
        severity: 'success',
        summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
        detail,
        life: 3000,
        onRevert: buildCreateRevert(entityType, entity.id),
      });
    } else if (action.type === 'update') {
      // 更新操作：添加恢复 revert
      const previousData = action.previousData as CharacterSetting | Terminology | undefined;
      if (previousData) {
        toast.add({
          severity: 'success',
          summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
          detail,
          life: 3000,
          onRevert: buildUpdateRevert(entityType, previousData),
        });
      }
    } else if (action.type === 'delete') {
      // 删除操作：添加重新创建 revert
      const previousData = action.previousData as CharacterSetting | Terminology | undefined;
      if (previousData) {
        const deleteDetail = formatEntityInfo(previousData, entityType);
        toast.add({
          severity: 'success',
          summary: `${ACTION_LABELS[action.type]}${ENTITY_LABELS[action.entity]}`,
          detail: deleteDetail,
          life: 3000,
          onRevert: buildDeleteRevert(entityType, previousData),
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
    currentMessageActions.value.push(messageAction);

    const assistantMsg = messages.value.find((m) => m.id === assistantMessageId);
    if (!assistantMsg) return;
    if (!assistantMsg.actions) assistantMsg.actions = [];

    const duplicated = assistantMsg.actions.find(
      (a) =>
        a.timestamp === messageAction.timestamp &&
        a.type === messageAction.type &&
        a.entity === messageAction.entity &&
        a.name === messageAction.name,
    );
    if (duplicated) return;

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

  const handleBatchReplaceTranslationToast = (action: ActionInfo): void => {
    const batchData = action.data as {
      tool_name: string;
      replaced_paragraph_count: number;
      replaced_translation_count: number;
      keywords?: string[];
      original_keywords?: string[];
      replacement_text: string;
      replace_all_translations: boolean;
    };

    const keywordParts: string[] = [];
    if (batchData.keywords && batchData.keywords.length > 0) {
      keywordParts.push(`翻译关键词: ${batchData.keywords.join(', ')}`);
    }
    if (batchData.original_keywords && batchData.original_keywords.length > 0) {
      keywordParts.push(`原文关键词: ${batchData.original_keywords.join(', ')}`);
    }

    const keywordInfo = keywordParts.length > 0 ? ` | ${keywordParts.join(' | ')}` : '';
    const replacementPreview =
      batchData.replacement_text.length > 30
        ? batchData.replacement_text.substring(0, 30) + '...'
        : batchData.replacement_text;

    const detail = `已批量替换 ${batchData.replaced_paragraph_count} 个段落（共 ${batchData.replaced_translation_count} 个翻译版本） | 替换为: "${replacementPreview}"${keywordInfo}`;

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

    const canRevert = !!(
      previousData?.replaced_paragraphs && contextStore.getContext.currentBookId
    );

    const toastPayload: Record<string, unknown> = {
      severity: 'success',
      summary: '批量替换翻译',
      detail,
      life: 5000,
    };
    if (canRevert && previousData) {
      toastPayload.onRevert = () => revertBatchReplaceTranslations(previousData);
    }
    toast.add(toastPayload);
  };

  type ReplacedParagraph = {
    paragraph_id: string;
    chapter_id: string;
    old_selected_translation_id?: string;
    old_translations: Array<{ id: string; translation: string; aiModelId: string }>;
  };

  type BatchReplaceRevertData = {
    replaced_paragraphs: ReplacedParagraph[];
  };

  const collectChaptersNeedingLoad = (
    book: ReturnType<typeof booksStore.getBookById> & object,
    replacedParagraphs: ReplacedParagraph[],
  ): string[] => {
    const chapterIds = Array.from(
      new Set(replacedParagraphs.map((p) => p.chapter_id).filter((id): id is string => !!id)),
    );
    return chapterIds.filter((chapterId) => {
      const found = ChapterService.findChapterById(book, chapterId);
      return !!found && found.chapter.content === undefined;
    });
  };

  const ensureChaptersLoadedForRevert = async (
    book: ReturnType<typeof booksStore.getBookById> & object,
    chaptersToLoad: string[],
  ): Promise<void> => {
    if (chaptersToLoad.length === 0) return;
    const contentsMap = await ChapterContentService.loadChapterContentsBatch(chaptersToLoad);
    for (const chapterId of chaptersToLoad) {
      const found = ChapterService.findChapterById(book, chapterId);
      if (!found) continue;
      found.chapter.content = contentsMap.get(chapterId) || [];
      found.chapter.contentLoaded = true;
    }
  };

  const restoreTranslationsInPlace = (
    paragraph: NonNullable<
      NonNullable<ReturnType<typeof ChapterService.findChapterById>>['chapter']['content']
    >[number],
    oldTranslations: ReplacedParagraph['old_translations'],
  ): void => {
    if (!paragraph?.translations || paragraph.translations.length === 0) return;
    for (const oldTranslation of oldTranslations) {
      const idx = paragraph.translations.findIndex((t) => t.id === oldTranslation.id);
      const target = paragraph.translations[idx];
      if (idx !== -1 && target) {
        target.translation = oldTranslation.translation;
        target.aiModelId = oldTranslation.aiModelId;
      }
    }
  };

  const applyRevertToBook = (
    book: ReturnType<typeof booksStore.getBookById> & object,
    replacedParagraphs: ReplacedParagraph[],
  ): void => {
    for (const replaced of replacedParagraphs) {
      const chapterInfo = ChapterService.findChapterById(book, replaced.chapter_id);
      if (!chapterInfo?.chapter.content) continue;
      const paragraph = chapterInfo.chapter.content.find((p) => p?.id === replaced.paragraph_id);
      if (!paragraph?.translations || paragraph.translations.length === 0) continue;
      if ('old_selected_translation_id' in replaced) {
        paragraph.selectedTranslationId = replaced.old_selected_translation_id || '';
      }
      restoreTranslationsInPlace(paragraph, replaced.old_translations);
    }
  };

  const revertBatchReplaceTranslations = async (
    previousData: BatchReplaceRevertData,
  ): Promise<void> => {
    const bookId = contextStore.getContext.currentBookId;
    if (!bookId) return;
    const book = booksStore.getBookById(bookId);
    if (!book) return;

    // 按需加载尚未加载的章节，避免 findParagraphLocation 查不到导致撤销失效
    const chaptersToLoad = collectChaptersNeedingLoad(book, previousData.replaced_paragraphs);
    await ensureChaptersLoadedForRevert(book, chaptersToLoad);

    applyRevertToBook(book, previousData.replaced_paragraphs);

    if (book.volumes) {
      await booksStore.updateBook(bookId, { volumes: book.volumes });
    }
  };

  const handleSingleTranslationUpdateToast = (action: ActionInfo): boolean => {
    if (
      !('paragraph_id' in action.data) ||
      !('translation_id' in action.data) ||
      !('old_translation' in action.data) ||
      !('new_translation' in action.data)
    ) {
      return false;
    }

    const translationData = action.data as {
      paragraph_id: string;
      translation_id: string;
      old_translation: string;
      new_translation: string;
    };
    const previousTranslation = action.previousData as Translation | undefined;

    const previewLength = 50;
    const oldPreview =
      translationData.old_translation.length > previewLength
        ? translationData.old_translation.substring(0, previewLength) + '...'
        : translationData.old_translation;
    const newPreview =
      translationData.new_translation.length > previewLength
        ? translationData.new_translation.substring(0, previewLength) + '...'
        : translationData.new_translation;

    const detail = `段落翻译已更新 | 旧: "${oldPreview}" → 新: "${newPreview}"`;
    const summary = `${ACTION_LABELS[action.type as keyof typeof ACTION_LABELS]}${ENTITY_LABELS[action.entity as keyof typeof ENTITY_LABELS]}`;
    const canRevert = !!(previousTranslation && contextStore.getContext.currentBookId);

    const toastPayload: Record<string, unknown> = {
      severity: 'success',
      summary,
      detail,
      life: 3000,
    };
    if (canRevert && previousTranslation) {
      toastPayload.onRevert = () =>
        revertSingleTranslationUpdate(translationData, previousTranslation);
    }
    toast.add(toastPayload);
    return canRevert;
  };

  const revertSingleTranslationUpdate = async (
    translationData: { paragraph_id: string; translation_id: string },
    previousTranslation: Translation,
  ): Promise<void> => {
    const bookId = contextStore.getContext.currentBookId;
    if (!bookId) return;
    const book = booksStore.getBookById(bookId);
    if (!book) return;

    const location = ChapterService.findParagraphLocation(book, translationData.paragraph_id);
    if (!location) return;

    const { paragraph } = location;
    const translationIndex = paragraph.translations.findIndex(
      (t) => t.id === translationData.translation_id,
    );
    if (translationIndex === -1) return;

    const translationToRestore = paragraph.translations[translationIndex];
    if (translationToRestore) {
      translationToRestore.translation = previousTranslation.translation;
    }

    if (book.volumes) {
      await booksStore.updateBook(bookId, { volumes: book.volumes });
    }
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

  const resolveDefaultDetail = (action: ActionInfo): string =>
    'name' in action.data
      ? `${ENTITY_LABELS[action.entity]} "${action.data.name}" 已${ACTION_LABELS[action.type]}`
      : '';

  const handleCreateToast = (action: ActionInfo): ToastOutcome => {
    if (!('name' in action.data)) return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
    if (action.entity === 'character' && 'id' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'character'), earlyReturn: false };
    }
    if (action.entity === 'term' && 'id' in action.data) {
      return { detail: '', ...resolveEntityToast(action, 'term'), earlyReturn: false };
    }
    return { detail: resolveDefaultDetail(action), shouldShowRevertToast: false, earlyReturn: false };
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
    if (!('name' in action.data)) return { detail: '', shouldShowRevertToast: false, earlyReturn: false };
    if (action.entity === 'character' && action.previousData) {
      return { detail: '', ...resolveEntityToast(action, 'character'), earlyReturn: false };
    }
    if (action.entity === 'term' && action.previousData) {
      return { detail: '', ...resolveEntityToast(action, 'term'), earlyReturn: false };
    }
    return { detail: resolveDefaultDetail(action), shouldShowRevertToast: false, earlyReturn: false };
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
        summary: `${ACTION_LABELS[action.type as keyof typeof ACTION_LABELS]}${ENTITY_LABELS[action.entity as keyof typeof ENTITY_LABELS]}`,
        detail: outcome.detail,
        life: 3000,
      });
    }
  };

  return {
    handleAction,
  };
}
