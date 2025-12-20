import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { TranslationService, PolishService, ProofreadingService } from 'src/services/ai';
import { ChapterService } from 'src/services/chapter-service';
import { isEmptyParagraph, hasParagraphTranslation } from 'src/utils';
import { generateShortId } from 'src/utils/id-generator';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MenuItem } from 'primevue/menuitem';
import co from 'co';

export function useChapterTranslation(
  book: Ref<Novel | undefined>,
  selectedChapter: Ref<Chapter | null>,
  selectedChapterWithContent: Ref<Chapter | null>,
  selectedChapterParagraphs: ComputedRef<Paragraph[]>,
  updateSelectedChapterWithContent: (updatedVolumes: Novel['volumes']) => void,
  handleActionInfoToast: (
    action: ActionInfo,
    options?: {
      severity?: 'info' | 'success' | 'warn' | 'error';
      life?: number;
      withRevert?: boolean;
    },
  ) => void,
  countUniqueActions: (actions: ActionInfo[]) => { terms: number; characters: number },
  saveState: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();
  const aiProcessingStore = useAIProcessingStore();

  /**
   * 创建新的段落翻译对象
   */
  const createParagraphTranslation = (translation: string, aiModelId: string) => {
    return {
      id: generateShortId(),
      translation: translation.trim(),
      aiModelId,
    };
  };

  /**
   * 更新段落翻译的通用辅助函数（立即更新 UI，后台保存）
   */
  const updateParagraphsFromResults = (
    paragraphResults: { id: string; translation: string }[],
    aiModelId: string,
  ) => {
    if (!book.value || !selectedChapterWithContent.value) return;

    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

        const content = ChapterService.getChapterContentForUpdate(
          chapter,
          selectedChapterWithContent.value,
        );

        if (!content) return chapter;

        const updatedContent = content.map((para) => {
          const result = paragraphResults.find((pt) => pt.id === para.id);
          if (!result) return para;

          const newTranslation = createParagraphTranslation(result.translation, aiModelId);
          const updatedTranslations = ChapterService.addParagraphTranslation(
            para.translations || [],
            newTranslation,
          );

          return {
            id: para.id,
            text: para.text,
            translations: updatedTranslations,
            selectedTranslationId: newTranslation.id,
          };
        });

        return {
          ...chapter,
          content: updatedContent,
          lastEdited: new Date(),
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });

    // 找到更新后的章节
    const updatedChapter = updatedVolumes
      ? updatedVolumes
          .flatMap((v) => v.chapters || [])
          .find((c) => c.id === selectedChapterWithContent.value!.id)
      : undefined;

    // 立即更新 UI（在任何 async 操作之前）
    if (updatedChapter && updatedChapter.content) {
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        ...updatedChapter,
        content: updatedChapter.content,
      };
    }

    // 后台保存书籍
    const bookId = book.value?.id;
    if (bookId && updatedVolumes) {
      void co(function* () {
        try {
          yield booksStore.updateBook(bookId, {
            volumes: updatedVolumes,
            lastEdited: new Date(),
          });
        } catch (error) {
          console.error('[useChapterTranslation] 更新书籍失败:', error);
        }
      });
    }
  };

  /**
   * 更新章节中的段落翻译并保存
   * @param paragraphUpdates 段落更新映射，key 为段落 ID，value 为翻译文本
   * @param aiModelId AI 模型 ID
   * @param updateSelected 是否更新 selectedChapterWithContent
   */
  const updateParagraphsAndSave = async ( // eslint-disable-line @typescript-eslint/require-await -- 立即更新UI，后台保存，不需要await
    paragraphUpdates: Map<string, string>,
    aiModelId: string,
    updateSelected: boolean = true,
  ): Promise<void> => {
    if (!book.value || !selectedChapterWithContent.value || paragraphUpdates.size === 0) return;

    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

        const content = ChapterService.getChapterContentForUpdate(
          chapter,
          selectedChapterWithContent.value,
        );
        if (!content) return chapter;

        const updatedContent = content.map((para) => {
          const translation = paragraphUpdates.get(para.id);
          if (!translation) return para;

          const newTranslation = createParagraphTranslation(translation, aiModelId);
          const updatedTranslations = ChapterService.addParagraphTranslation(
            para.translations || [],
            newTranslation,
          );

          return {
            id: para.id,
            text: para.text,
            translations: updatedTranslations,
            selectedTranslationId: newTranslation.id,
          };
        });

        return {
          ...chapter,
          content: updatedContent,
          lastEdited: new Date(),
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });

    // 找到更新后的章节
    const updatedChapter = updatedVolumes
      ? updatedVolumes
          .flatMap((v) => v.chapters || [])
          .find((c) => c.id === selectedChapterWithContent.value!.id)
      : undefined;

    // 立即更新 UI（在任何 async 操作之前）
    if (updateSelected && updatedChapter && updatedChapter.content) {
      // 确保创建全新的对象引用以触发 Vue 响应式更新
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        ...updatedChapter,
        content: [...updatedChapter.content], // 创建新的数组引用
      };
    }

    // 后台保存：直接保存章节内容到 IndexedDB，避免通过 updateBook 保存整个书籍
    if (updatedChapter && updatedChapter.content) {
      void co(function* () {
        try {
          yield ChapterService.saveChapterContent(updatedChapter);
        } catch (error) {
          console.error('[useChapterTranslation] 保存章节内容失败:', error);
        }
      });
    }

    // 后台保存书籍（由于 updatedContent 是完整数组，updateBook 会跳过内容保留逻辑）
    if (book.value) {
      void co(function* () {
        try {
          yield booksStore.updateBook(book.value!.id, {
            volumes: updatedVolumes,
            lastEdited: new Date(),
          });
        } catch (error) {
          console.error('[useChapterTranslation] 更新书籍失败:', error);
        }
      });
    }
  };

  /**
   * 更新章节标题翻译并保存
   * @param translation 标题翻译文本
   * @param aiModelId AI 模型 ID
   */
  const updateTitleTranslation = async ( // eslint-disable-line @typescript-eslint/require-await -- 立即更新UI，后台保存，不需要await
    translation: string,
    aiModelId: string,
  ): Promise<void> => {
    if (!book.value || !selectedChapterWithContent.value) return;

    const newTitleTranslation = {
      id: generateShortId(),
      translation: translation.trim(),
      aiModelId,
    };

    // 立即更新 UI（在任何 async 操作之前）
    selectedChapterWithContent.value = {
      ...selectedChapterWithContent.value,
      title: {
        original: selectedChapterWithContent.value.title.original,
        translation: newTitleTranslation,
      },
      lastEdited: new Date(),
    };

    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

        return {
          ...chapter,
          title: {
            original: chapter.title.original,
            translation: newTitleTranslation,
          },
          lastEdited: new Date(),
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });

    // 后台保存书籍
    const bookId = book.value?.id;
    if (bookId && updatedVolumes) {
      void co(function* () {
        try {
          yield booksStore.updateBook(bookId, {
            volumes: updatedVolumes,
            lastEdited: new Date(),
          });
        } catch (error) {
          console.error('[useChapterTranslation] 更新标题翻译失败:', error);
        }
      });
    }
  };

  /**
   * 批量更新段落翻译并保存（用于增量更新）
   * @param paragraphTranslations 段落翻译数组
   * @param aiModelId AI 模型 ID
   * @param updatedParagraphIds 已更新段落 ID 集合（用于去重）
   * @returns 更新后的段落数量
   */
  const updateParagraphsIncrementally = async (
    paragraphTranslations: { id: string; translation: string }[],
    aiModelId: string,
    updatedParagraphIds: Set<string>,
  ): Promise<number> => {
    if (!book.value || !selectedChapterWithContent.value) return 0;

    const newTranslations = paragraphTranslations.filter(
      (pt) => pt.id && pt.translation && !updatedParagraphIds.has(pt.id),
    );

    if (newTranslations.length === 0) return 0;

    newTranslations.forEach((pt) => updatedParagraphIds.add(pt.id));

    const translationMap = new Map<string, string>();
    newTranslations.forEach((pt) => {
      translationMap.set(pt.id, pt.translation);
    });

    await updateParagraphsAndSave(translationMap, aiModelId, true);

    // 从正在翻译的集合中移除已完成的段落 ID，使 skeleton 消失并显示翻译
    newTranslations.forEach((pt) => {
      translatingParagraphIds.value.delete(pt.id);
    });

    return newTranslations.length;
  };

  // 翻译章节所有段落的状态
  const isTranslatingChapter = ref(false);
  const translationProgress = ref({
    current: 0,
    total: 0,
    message: '',
  });
  const translationAbortController = ref<AbortController | null>(null);
  const translatingParagraphIds = ref<Set<string>>(new Set());

  // 润色章节所有段落的状态
  const isPolishingChapter = ref(false);
  const polishProgress = ref({
    current: 0,
    total: 0,
    message: '',
  });
  const polishAbortController = ref<AbortController | null>(null);
  const polishingParagraphIds = ref<Set<string>>(new Set());

  // 校对章节所有段落的状态
  const isProofreadingChapter = ref(false);
  const proofreadingProgress = ref({
    current: 0,
    total: 0,
    message: '',
  });
  const proofreadingAbortController = ref<AbortController | null>(null);
  const proofreadingParagraphIds = ref<Set<string>>(new Set());

  // 润色单个段落
  const polishParagraph = async (paragraphId: string) => {
    if (
      !book.value ||
      !selectedChapterWithContent.value ||
      !selectedChapterWithContent.value.content
    ) {
      return;
    }

    // 查找段落
    const paragraph = selectedChapterWithContent.value.content.find((p) => p.id === paragraphId);
    if (!paragraph) {
      toast.add({
        severity: 'error',
        summary: '润色失败',
        detail: '未找到要润色的段落',
        life: 3000,
      });
      return;
    }

    // 检查段落是否有翻译
    if (!hasParagraphTranslation(paragraph)) {
      toast.add({
        severity: 'error',
        summary: '润色失败',
        detail: '该段落还没有翻译，请先翻译段落',
        life: 3000,
      });
      return;
    }

    // 检查是否有可用的润色模型（使用校对模型配置）
    const selectedModel = aiModelsStore.getDefaultModelForTask('proofreading');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '润色失败',
        detail: '未找到可用的润色模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 添加段落 ID 到正在润色的集合中
    polishingParagraphIds.value.add(paragraphId);

    // 创建 AbortController 用于取消润色
    const abortController = new AbortController();

    try {
      // 调用润色服务
      await PolishService.polish([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapterWithContent.value.id,
        currentParagraphId: paragraphId,
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphPolish: (paragraphPolishes) => {
          updateParagraphsFromResults(paragraphPolishes, selectedModel.id);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
      });

      toast.add({
        severity: 'success',
        summary: '润色完成',
        detail: '段落已润色',
        life: 3000,
      });
    } catch (error) {
      console.error('润色段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在润色的集合中移除段落 ID
      polishingParagraphIds.value.delete(paragraphId);
    }
  };

  // 校对单个段落
  const proofreadParagraph = async (paragraphId: string) => {
    if (
      !book.value ||
      !selectedChapterWithContent.value ||
      !selectedChapterWithContent.value.content
    ) {
      return;
    }

    // 查找段落
    const paragraph = selectedChapterWithContent.value.content.find((p) => p.id === paragraphId);
    if (!paragraph) {
      toast.add({
        severity: 'error',
        summary: '校对失败',
        detail: '未找到要校对的段落',
        life: 3000,
      });
      return;
    }

    // 检查段落是否有翻译
    if (!hasParagraphTranslation(paragraph)) {
      toast.add({
        severity: 'error',
        summary: '校对失败',
        detail: '该段落还没有翻译，请先翻译段落',
        life: 3000,
      });
      return;
    }

    // 检查是否有可用的校对模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('proofreading');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '校对失败',
        detail: '未找到可用的校对模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 添加段落 ID 到正在校对的集合中
    proofreadingParagraphIds.value.add(paragraphId);

    // 创建 AbortController 用于取消校对
    const abortController = new AbortController();

    try {
      // 调用校对服务
      await ProofreadingService.proofread([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapterWithContent.value.id,
        currentParagraphId: paragraphId,
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphProofreading: (paragraphProofreadings) => {
          updateParagraphsFromResults(paragraphProofreadings, selectedModel.id);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
      });

      toast.add({
        severity: 'success',
        summary: '校对完成',
        detail: '段落已校对',
        life: 3000,
      });
    } catch (error) {
      console.error('校对段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在校对的集合中移除段落 ID
      proofreadingParagraphIds.value.delete(paragraphId);
    }
  };

  // 重新翻译单个段落
  const retranslateParagraph = async (paragraphId: string) => {
    if (
      !book.value ||
      !selectedChapterWithContent.value ||
      !selectedChapterWithContent.value.content
    ) {
      return;
    }

    // 查找段落
    const paragraph = selectedChapterWithContent.value.content.find((p) => p.id === paragraphId);
    if (!paragraph) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到要翻译的段落',
        life: 3000,
      });
      return;
    }

    // 检查是否有可用的翻译模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('translation');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到可用的翻译模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 添加段落 ID 到正在翻译的集合中
    translatingParagraphIds.value.add(paragraphId);

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();

    try {
      // 调用翻译服务
      await TranslationService.translate([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapterWithContent.value.id,
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onToast: (message) => {
          toast.add(message);
        },
        onTitleTranslation: async (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          await updateTitleTranslation(translation, selectedModel.id);
        },
        onParagraphTranslation: (paragraphTranslations) => {
          // 使用共享函数更新段落翻译
          updateParagraphsFromResults(paragraphTranslations, selectedModel.id);
          // 从正在翻译的集合中移除已完成的段落 ID
          paragraphTranslations.forEach((pt) => {
            translatingParagraphIds.value.delete(pt.id);
          });
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info', withRevert: true });
        },
      });

      toast.add({
        severity: 'success',
        summary: '翻译完成',
        detail: '段落已重新翻译',
        life: 3000,
      });
    } catch (error) {
      console.error('重新翻译段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在翻译的集合中移除段落 ID
      translatingParagraphIds.value.delete(paragraphId);
    }
  };

  // 翻译章节所有段落
  const translateAllParagraphs = async (customInstructions?: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 检查是否有可用的翻译模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('translation');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到可用的翻译模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    isTranslatingChapter.value = true;
    translatingParagraphIds.value.clear();

    // 初始化进度
    translationProgress.value = {
      current: 0,
      total: 0,
      message: '正在初始化翻译...',
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    translationAbortController.value = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const updatedParagraphIds = new Set<string>();

    try {
      const paragraphs = selectedChapterParagraphs.value;

      // 获取章节标题
      const chapterTitle = selectedChapter.value?.title?.original;

      // 调用翻译服务
      const result = await TranslationService.translate(paragraphs, selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapter.value.id,
        ...(chapterTitle ? { chapterTitle } : {}),
        ...(customInstructions?.translationInstructions !== undefined
          ? { customInstructions: customInstructions.translationInstructions }
          : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onProgress: (progress) => {
          translationProgress.value = {
            current: progress.current,
            total: progress.total,
            message: `正在翻译第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在翻译的段落 ID
          if (progress.currentParagraphs) {
            translatingParagraphIds.value = new Set(progress.currentParagraphs);
          }
          console.debug('翻译进度:', progress);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'success', life: 4000, withRevert: true });
        },
        onToast: (message) => {
          // 工具可以直接显示 toast
          toast.add(message);
        },
        onParagraphTranslation: async (translations) => {
          // 立即更新段落翻译（等待完成以确保保存）
          await updateParagraphsIncrementally(translations, selectedModel.id, updatedParagraphIds);
        },
        onTitleTranslation: async (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          await updateTitleTranslation(translation, selectedModel.id);
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphTranslation 回调立即更新）
      const actions = result.actions || [];
      const totalTranslatedCount = updatedParagraphIds.size;
      let messageDetail = `已成功翻译 ${totalTranslatedCount} 个段落`;
      if (actions.length > 0) {
        const { terms: termActions, characters: characterActions } = countUniqueActions(actions);
        const actionDetails: string[] = [];
        if (termActions > 0) {
          actionDetails.push(`${termActions} 个术语操作`);
        }
        if (characterActions > 0) {
          actionDetails.push(`${characterActions} 个角色操作`);
        }
        if (actionDetails.length > 0) {
          messageDetail += `，并执行了 ${actionDetails.join('、')}`;
        }
      }

      toast.add({
        severity: 'success',
        summary: '翻译完成',
        detail: messageDetail,
        life: 3000,
      });
    } catch (error) {
      console.error('翻译失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      isTranslatingChapter.value = false;
      translationAbortController.value = null;
      // 延迟清除进度信息和正在翻译的段落 ID，让用户看到完成状态
      setTimeout(() => {
        translationProgress.value = {
          current: 0,
          total: 0,
          message: '',
        };
        translatingParagraphIds.value.clear();
      }, 1000);
    }
  };

  // 继续翻译（只翻译未翻译的段落）
  const continueTranslation = async (customInstructions?: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 过滤出未翻译的段落（排除空段落）
    const untranslatedParagraphs = selectedChapterParagraphs.value.filter(
      (para) => !isEmptyParagraph(para) && !hasParagraphTranslation(para),
    );

    if (untranslatedParagraphs.length === 0) {
      toast.add({
        severity: 'info',
        summary: '无需翻译',
        detail: '所有段落都已翻译',
        life: 3000,
      });
      return;
    }

    // 检查是否有可用的翻译模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('translation');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到可用的翻译模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    isTranslatingChapter.value = true;
    translatingParagraphIds.value.clear();

    // 初始化进度
    translationProgress.value = {
      current: 0,
      total: 0,
      message: '正在初始化翻译...',
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    translationAbortController.value = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const updatedParagraphIds = new Set<string>();

    try {
      // 获取章节标题
      const chapterTitle = selectedChapter.value?.title?.original;

      // 调用翻译服务，只翻译未翻译的段落
      const result = await TranslationService.translate(untranslatedParagraphs, selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapter.value.id,
        ...(chapterTitle ? { chapterTitle } : {}),
        ...(customInstructions?.translationInstructions !== undefined
          ? { customInstructions: customInstructions.translationInstructions }
          : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onProgress: (progress) => {
          translationProgress.value = {
            current: progress.current,
            total: progress.total,
            message: `正在翻译第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在翻译的段落 ID
          if (progress.currentParagraphs) {
            translatingParagraphIds.value = new Set(progress.currentParagraphs);
          }
          console.debug('翻译进度:', progress);
        },
        onParagraphTranslation: async (translations) => {
          await updateParagraphsIncrementally(translations, selectedModel.id, updatedParagraphIds);
        },
        onTitleTranslation: async (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          await updateTitleTranslation(translation, selectedModel.id);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
      });

      // 所有段落都已通过 onParagraphTranslation 回调立即更新
      const totalTranslatedCount = updatedParagraphIds.size;
      toast.add({
        severity: 'success',
        summary: '翻译完成',
        detail: `已成功翻译 ${totalTranslatedCount} 个段落`,
        life: 3000,
      });
    } catch (error) {
      console.error('翻译失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      isTranslatingChapter.value = false;
      translationAbortController.value = null;
      setTimeout(() => {
        translationProgress.value = {
          current: 0,
          total: 0,
          message: '',
        };
        translatingParagraphIds.value.clear();
      }, 1000);
    }
  };

  // 重新翻译所有段落
  const retranslateAllParagraphs = async () => {
    // 重新翻译就是调用 translateAllParagraphs，它会重新翻译所有段落
    await translateAllParagraphs();
  };

  // 润色章节所有段落
  const polishAllParagraphs = async (customInstructions?: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 检查是否有可用的润色模型（使用校对模型配置）
    const selectedModel = aiModelsStore.getDefaultModelForTask('proofreading');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '润色失败',
        detail: '未找到可用的润色模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = selectedChapterParagraphs.value.filter(
      (para) => !isEmptyParagraph(para) && hasParagraphTranslation(para),
    );

    if (paragraphsWithTranslation.length === 0) {
      toast.add({
        severity: 'error',
        summary: '润色失败',
        detail: '没有可润色的段落，请先翻译章节',
        life: 3000,
      });
      return;
    }

    isPolishingChapter.value = true;
    polishingParagraphIds.value.clear();

    // 初始化进度
    polishProgress.value = {
      current: 0,
      total: 0,
      message: '正在初始化润色...',
    };

    // 创建 AbortController 用于取消润色
    const abortController = new AbortController();
    polishAbortController.value = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const updatedParagraphIds = new Set<string>();

    try {
      // 调用润色服务
      const result = await PolishService.polish(paragraphsWithTranslation, selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapter.value.id,
        ...(customInstructions?.polishInstructions !== undefined
          ? { customInstructions: customInstructions.polishInstructions }
          : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onProgress: (progress) => {
          polishProgress.value = {
            current: progress.current,
            total: progress.total,
            message: `正在润色第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在润色的段落 ID
          if (progress.currentParagraphs) {
            polishingParagraphIds.value = new Set(progress.currentParagraphs);
          }
          console.debug('润色进度:', progress);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphPolish: async (translations) => {
          // 立即更新段落润色
          await updateParagraphsIncrementally(translations, selectedModel.id, updatedParagraphIds);
          // 从正在润色的集合中移除已完成的段落 ID
          translations.forEach((pt) => {
            polishingParagraphIds.value.delete(pt.id);
          });
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphPolish 回调立即更新）
      const actions = result.actions || [];
      const totalPolishedCount = updatedParagraphIds.size;
      let messageDetail = `已成功润色 ${totalPolishedCount} 个段落`;
      if (actions.length > 0) {
        const { terms: termActions, characters: characterActions } = countUniqueActions(actions);
        const actionDetails: string[] = [];
        if (termActions > 0) {
          actionDetails.push(`${termActions} 个术语操作`);
        }
        if (characterActions > 0) {
          actionDetails.push(`${characterActions} 个角色操作`);
        }
        if (actionDetails.length > 0) {
          messageDetail += `，并执行了 ${actionDetails.join('、')}`;
        }
      }

      toast.add({
        severity: 'success',
        summary: '润色完成',
        detail: messageDetail,
        life: 3000,
      });
    } catch (error) {
      console.error('润色失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      isPolishingChapter.value = false;
      polishAbortController.value = null;
      // 延迟清除进度信息和正在润色的段落 ID，让用户看到完成状态
      setTimeout(() => {
        polishProgress.value = {
          current: 0,
          total: 0,
          message: '',
        };
        polishingParagraphIds.value.clear();
      }, 1000);
    }
  };

  // 取消翻译
  const cancelTranslation = () => {
    // 首先取消本地的 abortController（这是最重要的，因为它会真正停止翻译请求）
    if (translationAbortController.value) {
      translationAbortController.value.abort();
      translationAbortController.value = null;
    }

    // 然后取消所有相关的 AI 任务（包括已取消的任务，确保它们的状态正确）
    // 注意：即使任务已经被标记为 cancelled，我们也要确保它们的 abortController 被取消
    const allTasks = aiProcessingStore.activeTasks;
    const translationTasks = allTasks.filter((task) => task.type === 'translation');

    // 取消所有翻译任务（不管状态如何，确保它们的 abortController 被取消）
    for (const task of translationTasks) {
      // 只取消那些还没有完成的任务（包括 thinking、processing、cancelled、error 状态）
      // 注意：即使任务已经被标记为 cancelled，我们也要确保它的 abortController 被取消
      if (task.status !== 'completed') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    isTranslatingChapter.value = false;
    translationProgress.value = {
      current: 0,
      total: 0,
      message: '',
    };
    translatingParagraphIds.value = new Set();
  };

  // 取消润色
  const cancelPolish = () => {
    // 首先取消本地的 abortController
    if (polishAbortController.value) {
      polishAbortController.value.abort();
      polishAbortController.value = null;
    }

    // 然后取消所有相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const polishTasks = allTasks.filter((task) => task.type === 'polish');

    // 取消所有润色任务
    for (const task of polishTasks) {
      if (task.status !== 'completed') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    isPolishingChapter.value = false;
    polishProgress.value = {
      current: 0,
      total: 0,
      message: '',
    };
    polishingParagraphIds.value = new Set();
  };

  // 校对章节所有段落
  const proofreadAllParagraphs = async (customInstructions?: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 检查是否有可用的校对模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('proofreading');
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '校对失败',
        detail: '未找到可用的校对模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = selectedChapterParagraphs.value.filter(
      (para) => !isEmptyParagraph(para) && hasParagraphTranslation(para),
    );

    if (paragraphsWithTranslation.length === 0) {
      toast.add({
        severity: 'error',
        summary: '校对失败',
        detail: '没有可校对的段落，请先翻译章节',
        life: 3000,
      });
      return;
    }

    isProofreadingChapter.value = true;
    proofreadingParagraphIds.value.clear();

    // 初始化进度
    proofreadingProgress.value = {
      current: 0,
      total: 0,
      message: '正在初始化校对...',
    };

    // 创建 AbortController 用于取消校对
    const abortController = new AbortController();
    proofreadingAbortController.value = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const updatedParagraphIds = new Set<string>();

    try {
      // 调用校对服务
      const result = await ProofreadingService.proofread(paragraphsWithTranslation, selectedModel, {
        bookId: book.value.id,
        chapterId: selectedChapter.value.id,
        ...(customInstructions?.proofreadingInstructions !== undefined
          ? { customInstructions: customInstructions.proofreadingInstructions }
          : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onProgress: (progress) => {
          proofreadingProgress.value = {
            current: progress.current,
            total: progress.total,
            message: `正在校对第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在校对的段落 ID
          if (progress.currentParagraphs) {
            proofreadingParagraphIds.value = new Set(progress.currentParagraphs);
          }
          console.debug('校对进度:', progress);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphProofreading: async (translations) => {
          // 立即更新段落校对
          await updateParagraphsIncrementally(translations, selectedModel.id, updatedParagraphIds);
          // 从正在校对的集合中移除已完成的段落 ID
          translations.forEach((pt) => {
            proofreadingParagraphIds.value.delete(pt.id);
          });
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphProofreading 回调立即更新）
      const actions = result.actions || [];
      const totalProofreadCount = updatedParagraphIds.size;
      let messageDetail = `已成功校对 ${totalProofreadCount} 个段落`;
      if (actions.length > 0) {
        const { terms: termActions, characters: characterActions } = countUniqueActions(actions);
        const actionDetails: string[] = [];
        if (termActions > 0) {
          actionDetails.push(`${termActions} 个术语操作`);
        }
        if (characterActions > 0) {
          actionDetails.push(`${characterActions} 个角色操作`);
        }
        if (actionDetails.length > 0) {
          messageDetail += `，并执行了 ${actionDetails.join('、')}`;
        }
      }

      toast.add({
        severity: 'success',
        summary: '校对完成',
        detail: messageDetail,
        life: 3000,
      });
    } catch (error) {
      console.error('校对失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      isProofreadingChapter.value = false;
      proofreadingAbortController.value = null;
      // 延迟清除进度信息和正在校对的段落 ID，让用户看到完成状态
      setTimeout(() => {
        proofreadingProgress.value = {
          current: 0,
          total: 0,
          message: '',
        };
        proofreadingParagraphIds.value.clear();
      }, 1000);
    }
  };

  // 取消校对
  const cancelProofreading = () => {
    // 首先取消本地的 abortController
    if (proofreadingAbortController.value) {
      proofreadingAbortController.value.abort();
      proofreadingAbortController.value = null;
    }

    // 然后取消所有相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const proofreadingTasks = allTasks.filter((task) => task.type === 'proofreading');

    // 取消所有校对任务
    for (const task of proofreadingTasks) {
      if (task.status !== 'completed') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    isProofreadingChapter.value = false;
    proofreadingProgress.value = {
      current: 0,
      total: 0,
      message: '',
    };
    proofreadingParagraphIds.value = new Set();
  };

  // 组件卸载时取消所有任务
  onUnmounted(() => {
    cancelTranslation();
    cancelPolish();
    cancelProofreading();
  });

  // 翻译状态计算属性
  const translationStatus = computed(() => {
    const paragraphs = selectedChapterParagraphs.value;
    if (paragraphs.length === 0) {
      return { hasNone: true, hasPartial: false, hasAll: false };
    }

    // 过滤掉空段落，只统计有内容的段落
    const nonEmptyParagraphs = paragraphs.filter((p) => !isEmptyParagraph(p));

    if (nonEmptyParagraphs.length === 0) {
      // 如果所有段落都是空的，视为无翻译状态
      return { hasNone: true, hasPartial: false, hasAll: false };
    }

    const translatedCount = nonEmptyParagraphs.filter(hasParagraphTranslation).length;
    const totalCount = nonEmptyParagraphs.length;

    if (translatedCount === 0) {
      return { hasNone: true, hasPartial: false, hasAll: false };
    } else if (translatedCount === totalCount) {
      return { hasNone: false, hasPartial: false, hasAll: true };
    } else {
      return { hasNone: false, hasPartial: true, hasAll: false };
    }
  });

  // SplitButton 的标签和菜单项
  const translationButtonLabel = computed(() => {
    if (translationStatus.value.hasNone) {
      return '翻译本章';
    } else if (translationStatus.value.hasPartial) {
      return '继续翻译';
    } else {
      return '润色本章';
    }
  });

  const translationButtonMenuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];

    // 总是显示"重新翻译"
    items.push({
      label: '重新翻译',
      icon: 'pi pi-refresh',
      command: () => {
        void translateAllParagraphs();
      },
    });

    // 如果所有段落都已翻译，显示"校对本章"
    if (translationStatus.value.hasAll) {
      items.push({
        label: '校对本章',
        icon: 'pi pi-check-circle',
        command: () => {
          void proofreadAllParagraphs();
        },
      });
    }

    return items;
  });

  const translationButtonClick = () => {
    if (translationStatus.value.hasNone) {
      void translateAllParagraphs();
    } else if (translationStatus.value.hasPartial) {
      void continueTranslation();
    } else {
      void polishAllParagraphs();
    }
  };

  return {
    // 状态
    isTranslatingChapter,
    translationProgress,
    translatingParagraphIds,
    isPolishingChapter,
    polishProgress,
    polishingParagraphIds,
    isProofreadingChapter,
    proofreadingProgress,
    proofreadingParagraphIds,
    // 函数
    polishParagraph,
    proofreadParagraph,
    retranslateParagraph,
    translateAllParagraphs,
    continueTranslation,
    retranslateAllParagraphs,
    polishAllParagraphs,
    proofreadAllParagraphs,
    cancelTranslation,
    cancelPolish,
    cancelProofreading,
    // 计算属性
    translationStatus,
    translationButtonLabel,
    translationButtonMenuItems,
    translationButtonClick,
  };
}
