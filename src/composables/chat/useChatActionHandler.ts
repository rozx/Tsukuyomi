import { nextTick, type Ref } from 'vue';
import { type Router } from 'vue-router';
import co from 'co';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import {
  useChatSessionsStore,
  type ChatMessage,
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
  messages: Ref<ChatMessage[]>,
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
   * 构建更新操作的 revert 回调（恢复到之前的数据）
   */
  const buildUpdateRevert = (
    entityType: 'character' | 'term',
    previousData: CharacterSetting | Terminology,
  ): (() => Promise<void>) => {
    return async () => {
      if (contextStore.getContext.currentBookId) {
        if (entityType === 'character') {
          const previousCharacter = previousData as CharacterSetting;
          await CharacterSettingService.updateCharacterSetting(
            contextStore.getContext.currentBookId,
            previousCharacter.id,
            {
              name: previousCharacter.name,
              sex: previousCharacter.sex,
              translation: previousCharacter.translation.translation,
              ...(previousCharacter.description !== undefined
                ? { description: previousCharacter.description }
                : {}),
              ...(previousCharacter.speakingStyle !== undefined
                ? { speakingStyle: previousCharacter.speakingStyle }
                : {}),
              ...(previousCharacter.aliases !== undefined
                ? {
                    aliases: previousCharacter.aliases.map((a: Alias) => ({
                      name: a.name,
                      translation: a.translation.translation,
                    })),
                  }
                : {}),
            },
          );
        } else {
          const previousTerm = previousData as Terminology;
          await TerminologyService.updateTerminology(
            contextStore.getContext.currentBookId,
            previousTerm.id,
            {
              name: previousTerm.name,
              translation: previousTerm.translation.translation,
              ...(previousTerm.description !== undefined
                ? { description: previousTerm.description }
                : {}),
            },
          );
        }
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
      if (contextStore.getContext.currentBookId) {
        if (entityType === 'character') {
          const previousCharacter = previousData as CharacterSetting;
          await CharacterSettingService.addCharacterSetting(contextStore.getContext.currentBookId, {
            name: previousCharacter.name,
            sex: previousCharacter.sex,
            translation: previousCharacter.translation.translation,
            ...(previousCharacter.description !== undefined
              ? { description: previousCharacter.description }
              : {}),
            ...(previousCharacter.speakingStyle !== undefined
              ? { speakingStyle: previousCharacter.speakingStyle }
              : {}),
            ...(previousCharacter.aliases !== undefined
              ? {
                  aliases: previousCharacter.aliases.map((a: Alias) => ({
                    name: a.name,
                    translation: a.translation.translation,
                  })),
                }
              : {}),
          });
        } else {
          const previousTerm = previousData as Terminology;
          await TerminologyService.addTerminology(contextStore.getContext.currentBookId, {
            name: previousTerm.name,
            translation: previousTerm.translation.translation,
            ...(previousTerm.description !== undefined
              ? { description: previousTerm.description }
              : {}),
          });
        }
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

  const handleAction = (action: ActionInfo, assistantMessageIdRef: { value: string }) => {
    // 记录操作到当前消息
    const messageAction = createMessageActionFromActionInfo(action);

    // 处理导航操作
    if (action.type === 'navigate' && 'book_id' in action.data) {
      const bookId = action.data.book_id as string;
      const chapterId = 'chapter_id' in action.data ? (action.data.chapter_id as string) : null;
      const paragraphId =
        'paragraph_id' in action.data ? (action.data.paragraph_id as string) : null;

      // 导航到书籍详情页面
      void co(function* () {
        try {
          yield router.push(`/books/${bookId}`);
          // 等待路由完成后再设置选中的章节
          yield nextTick();
          if (chapterId) {
            bookDetailsStore.setSelectedChapter(bookId, chapterId);
          }

          // 如果有段落 ID，滚动到该段落
          if (paragraphId) {
            yield nextTick();
            // 等待章节加载完成后再滚动
            setTimeout(() => {
              const paragraphElement = document.getElementById(`paragraph-${paragraphId}`);
              if (paragraphElement) {
                paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 500); // 给章节内容加载一些时间
          }
        } catch (error) {
          console.error('[AppRightPanel] 导航失败:', error);
        }
      });
    }

    // 处理帮助文档导航操作
    if (action.type === 'navigate' && action.entity === 'help_doc' && 'doc_id' in action.data) {
      const docId = action.data.doc_id as string;
      const sectionId = 'section_id' in action.data ? (action.data.section_id as string) : null;

      void co(function* () {
        try {
          const path = sectionId ? `/help/${docId}#${sectionId}` : `/help/${docId}`;
          yield router.push(path);
        } catch (error) {
          console.error('[ChatActionHandler] 帮助文档导航失败:', error);
        }
      });
    }

    // 立即将操作添加到临时数组（用于后续保存）
    currentMessageActions.value.push(messageAction);

    // 立即将操作添加到当前助手消息，使其立即显示在 UI 中
    const assistantMsg = messages.value.find((m) => m.id === assistantMessageIdRef.value);
    if (assistantMsg) {
      if (!assistantMsg.actions) {
        assistantMsg.actions = [];
      }
      // 检查是否已经添加过（避免重复）
      const existingAction = assistantMsg.actions.find(
        (a) => a.timestamp === messageAction.timestamp && a.type === messageAction.type,
      );
      if (!existingAction) {
        assistantMsg.actions.push(messageAction);
        // 触发响应式更新并滚动到底部
        void nextTick(() => {
          scrollToBottom();
        });
      }
    }

    // 在调用工具后，创建新的助手消息用于后续回复
    // 这样后续的 AI 回复会显示在新的消息气泡中
    // 但对于 todo 操作，不创建新消息，以便多个 todo 可以在同一消息中分组显示
    if (action.entity !== 'todo') {
      // 检查是否接近消息限制，如果是，则不创建新消息，防止在单次响应中超出限制
      const currentSessionForLimit = chatSessionsStore.currentSession;
      const currentMsgCount = getMessagesSinceSummaryCount(currentSessionForLimit);

      // 只有当消息数量未达到硬限制时才创建新消息
      if (currentMsgCount < MAX_MESSAGES_PER_SESSION) {
        // 首先，标记当前消息的思考过程为非活动状态
        // 捕获旧 ID 以便在更新 assistantMessageId 后使用
        const oldAssistantMessageId = assistantMessageIdRef.value;

        const newAssistantMessageId = (Date.now() + 1).toString();
        const newAssistantMessage: ChatMessage = {
          id: newAssistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        messages.value.push(newAssistantMessage);

        // 更新 assistantMessageId，使后续的 onChunk 和 onThinkingChunk 都更新到新消息
        assistantMessageIdRef.value = newAssistantMessageId;

        // 使用旧 ID 停止思考动画
        setThinkingActive(oldAssistantMessageId, false);

        // 重置当前消息操作列表，因为新消息还没有操作
        currentMessageActions.value = [];

        // 滚动到底部以显示新消息气泡
        scrollToBottom();
      }
      // 如果已达到限制，继续使用当前消息，后续会在响应完成后触发自动总结
    } else {
      scrollToBottom();
    }

    // 显示操作通知

    // 处理网络搜索和网页获取操作（不显示 toast 通知）
    if (action.type === 'web_search') {
      return;
    }

    if (action.type === 'web_fetch') {
      return;
    }

    // 处理读取和搜索操作（不显示 toast 通知，但会在消息中显示操作标签）
    if (action.type === 'read' || action.type === 'search') {
      return;
    }

    // 处理导航操作（不显示 toast 通知，导航已在上面处理）
    if (action.type === 'navigate') {
      return;
    }

    // 处理用户问答操作（不显示 toast 通知，已有全屏 UI）
    if (action.type === 'ask') {
      return;
    }

    // 处理待办事项操作（不显示 toast 通知，根据需求）
    if (action.entity === 'todo') {
      // 刷新待办事项列表
      loadTodos();
      return;
    }

    // 构建详细的 toast 消息
    let detail = '';
    let shouldShowRevertToast = false;
    const shouldShowRevertToastRef = { value: false };

    if (action.type === 'create' && 'name' in action.data) {
      // 创建操作：显示详细信息
      if (action.entity === 'character' && 'id' in action.data) {
        handleEntityOperationToast(action, 'character', shouldShowRevertToastRef);
        shouldShowRevertToast = shouldShowRevertToastRef.value;
      } else if (action.entity === 'term' && 'id' in action.data) {
        handleEntityOperationToast(action, 'term', shouldShowRevertToastRef);
        shouldShowRevertToast = shouldShowRevertToastRef.value;
      } else {
        // 默认创建消息
        detail = `${ENTITY_LABELS[action.entity]} "${action.data.name}" 已${ACTION_LABELS[action.type]}`;
      }
    } else if (action.type === 'update' && action.entity === 'character' && 'name' in action.data) {
      // 角色更新操作：使用统一处理函数
      handleEntityOperationToast(action, 'character', shouldShowRevertToastRef);
      shouldShowRevertToast = shouldShowRevertToastRef.value;
    } else if (action.type === 'update' && action.entity === 'term' && 'name' in action.data) {
      // 术语更新操作：使用统一处理函数
      handleEntityOperationToast(action, 'term', shouldShowRevertToastRef);
      shouldShowRevertToast = shouldShowRevertToastRef.value;
    } else if (action.type === 'update' && action.entity === 'translation') {
      // 检查是否是批量替换操作
      if ('tool_name' in action.data && action.data.tool_name === 'batch_replace_translations') {
        // 批量替换操作：显示汇总信息
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

        detail = `已批量替换 ${batchData.replaced_paragraph_count} 个段落（共 ${batchData.replaced_translation_count} 个翻译版本） | 替换为: "${replacementPreview}"${keywordInfo}`;

        // 获取 previousData 中的替换数据以便恢复
        const previousData = action.previousData as
          | {
              replaced_paragraphs: Array<{
                paragraph_id: string;
                chapter_id: string;
                old_selected_translation_id?: string;
                old_translations: Array<{
                  id: string;
                  translation: string;
                  aiModelId: string;
                }>;
              }>;
            }
          | undefined;

        // 添加 revert 功能
        if (
          previousData &&
          previousData.replaced_paragraphs &&
          contextStore.getContext.currentBookId
        ) {
          toast.add({
            severity: 'success',
            summary: '批量替换翻译',
            detail,
            life: 5000,
            onRevert: async () => {
              if (
                previousData &&
                previousData.replaced_paragraphs &&
                contextStore.getContext.currentBookId
              ) {
                const bookId = contextStore.getContext.currentBookId;
                const book = booksStore.getBookById(bookId);
                if (!book) return;

                // 先按需加载“被影响的章节”，避免 findParagraphLocation 只能查已加载章节导致撤销失效
                const chapterIds = Array.from(
                  new Set(
                    previousData.replaced_paragraphs
                      .map((p) => p.chapter_id)
                      .filter((id): id is string => !!id),
                  ),
                );
                const chaptersToLoad: string[] = [];
                for (const chapterId of chapterIds) {
                  const found = ChapterService.findChapterById(book, chapterId);
                  if (!found) continue;
                  if (found.chapter.content === undefined) {
                    chaptersToLoad.push(chapterId);
                  }
                }
                if (chaptersToLoad.length > 0) {
                  const contentsMap =
                    await ChapterContentService.loadChapterContentsBatch(chaptersToLoad);
                  for (const chapterId of chaptersToLoad) {
                    const found = ChapterService.findChapterById(book, chapterId);
                    if (!found) continue;
                    const content = contentsMap.get(chapterId);
                    found.chapter.content = content || [];
                    found.chapter.contentLoaded = true;
                  }
                }

                // 恢复所有被替换的翻译（基于 chapter_id 定位，避免全书遍历）
                for (const replacedParagraph of previousData.replaced_paragraphs) {
                  const chapterInfo = ChapterService.findChapterById(
                    book,
                    replacedParagraph.chapter_id,
                  );
                  if (!chapterInfo?.chapter.content) continue;
                  const paragraph = chapterInfo.chapter.content.find(
                    (p) => p?.id === replacedParagraph.paragraph_id,
                  );
                  if (!paragraph) continue;

                  // 确保段落有翻译数组
                  if (!paragraph.translations || paragraph.translations.length === 0) {
                    continue;
                  }

                  // 恢复段落的选中翻译 ID（批量替换可能会在“无选中翻译”时自动设置）
                  if ('old_selected_translation_id' in replacedParagraph) {
                    paragraph.selectedTranslationId =
                      replacedParagraph.old_selected_translation_id || '';
                  }

                  // 恢复每个翻译
                  for (const oldTranslation of replacedParagraph.old_translations) {
                    const translationIndex = paragraph.translations.findIndex(
                      (t) => t.id === oldTranslation.id,
                    );
                    if (translationIndex !== -1 && paragraph.translations[translationIndex]) {
                      // 恢复原始翻译文本
                      paragraph.translations[translationIndex]!.translation =
                        oldTranslation.translation;
                      // 恢复原始模型信息（更完整的回滚）
                      paragraph.translations[translationIndex]!.aiModelId =
                        oldTranslation.aiModelId;
                    }
                  }
                }

                // 更新书籍
                if (book.volumes) {
                  await booksStore.updateBook(bookId, { volumes: book.volumes });
                }
              }
            },
          });
        } else {
          // 如果没有 previousData，仍然显示 toast（但不提供撤销）
          toast.add({
            severity: 'success',
            summary: '批量替换翻译',
            detail,
            life: 5000,
          });
        }
        return; // 批量替换操作已处理，不需要继续处理
      }

      // 翻译更新操作：显示详细信息
      if (
        'paragraph_id' in action.data &&
        'translation_id' in action.data &&
        'old_translation' in action.data &&
        'new_translation' in action.data
      ) {
        const translationData = action.data as {
          paragraph_id: string;
          translation_id: string;
          old_translation: string;
          new_translation: string;
        };
        const previousTranslation = action.previousData as Translation | undefined;

        // 构建详细信息
        const oldText = translationData.old_translation;
        const newText = translationData.new_translation;
        const previewLength = 50;
        const oldPreview =
          oldText.length > previewLength ? oldText.substring(0, previewLength) + '...' : oldText;
        const newPreview =
          newText.length > previewLength ? newText.substring(0, previewLength) + '...' : newText;

        detail = `段落翻译已更新 | 旧: "${oldPreview}" → 新: "${newPreview}"`;

        // 添加 revert 功能
        if (previousTranslation && contextStore.getContext.currentBookId) {
          shouldShowRevertToast = true;
          toast.add({
            severity: 'success',
            summary: `${ACTION_LABELS[action.type as keyof typeof ACTION_LABELS]}${ENTITY_LABELS[action.entity as keyof typeof ENTITY_LABELS]}`,
            detail,
            life: 3000,
            onRevert: async () => {
              if (previousTranslation && contextStore.getContext.currentBookId) {
                const bookId = contextStore.getContext.currentBookId;
                const book = booksStore.getBookById(bookId);
                if (!book) return;

                // 查找段落
                const location = ChapterService.findParagraphLocation(
                  book,
                  translationData.paragraph_id,
                );
                if (!location) return;

                const { paragraph } = location;

                // 查找要恢复的翻译
                const translationIndex = paragraph.translations.findIndex(
                  (t) => t.id === translationData.translation_id,
                );
                if (translationIndex === -1) return;

                // 恢复原始翻译
                const translationToRestore = paragraph.translations[translationIndex];
                if (translationToRestore) {
                  translationToRestore.translation = previousTranslation.translation;
                }

                // 更新书籍
                if (book.volumes) {
                  await booksStore.updateBook(bookId, { volumes: book.volumes });
                }
              }
            },
          });
        } else {
          // 如果没有 previousData，仍然显示 toast（但不提供撤销）
          toast.add({
            severity: 'success',
            summary: `${ACTION_LABELS[action.type as keyof typeof ACTION_LABELS]}${ENTITY_LABELS[action.entity as keyof typeof ENTITY_LABELS]}`,
            detail,
            life: 3000,
          });
        }
      }
    } else if (action.type === 'delete' && 'name' in action.data) {
      // 删除操作：使用统一处理函数
      if (action.entity === 'character' && action.previousData) {
        handleEntityOperationToast(action, 'character', shouldShowRevertToastRef);
        shouldShowRevertToast = shouldShowRevertToastRef.value;
      } else if (action.entity === 'term' && action.previousData) {
        handleEntityOperationToast(action, 'term', shouldShowRevertToastRef);
        shouldShowRevertToast = shouldShowRevertToastRef.value;
      } else {
        // 默认删除消息
        detail = `${ENTITY_LABELS[action.entity]} "${action.data.name}" 已${ACTION_LABELS[action.type]}`;
      }
    }

    if (!shouldShowRevertToast && detail) {
      toast.add({
        severity: 'success',
        summary: `${ACTION_LABELS[action.type as keyof typeof ACTION_LABELS]}${ENTITY_LABELS[action.entity as keyof typeof ENTITY_LABELS]}`,
        detail,
        life: 3000,
      });
    }
  };

  return {
    handleAction,
  };
}
