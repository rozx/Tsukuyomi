import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { TranslationService, PolishService, ProofreadingService } from 'src/services/ai';
import { ChapterService } from 'src/services/chapter-service';
import { isEmptyParagraph, hasParagraphTranslation } from 'src/utils';
import { generateShortId } from 'src/utils/id-generator';
import { selectChangedParagraphTranslations } from 'src/utils/translation-updates';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MenuItem } from 'primevue/menuitem';

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
   * 注意：翻译文本会原样保存，不进行任何处理（包括缩进处理）
   * 缩进过滤会在显示和导出时应用
   */
  const createParagraphTranslation = (translation: string, aiModelId: string) => {
    return {
      id: generateShortId(),
      translation: translation,
      aiModelId,
    };
  };

  /**
   * 更新段落翻译的通用辅助函数（立即更新 UI，然后保存）
   */
  const updateParagraphsFromResults = async (
    paragraphResults: { id: string; translation: string }[],
    aiModelId: string,
    targetChapterId: string,
  ): Promise<void> => {
    if (!book.value || paragraphResults.length === 0) return;

    const paragraphUpdates = new Map<string, string>();
    for (const pt of paragraphResults) {
      if (pt?.id && typeof pt.translation === 'string') {
        paragraphUpdates.set(pt.id, pt.translation);
      }
    }

    await updateParagraphsAndSave(paragraphUpdates, aiModelId, targetChapterId, {
      updateSelected: true,
    });
  };

  /**
   * 更新章节中的段落翻译并保存
   * @param paragraphUpdates 段落更新映射，key 为段落 ID，value 为翻译文本
   * @param aiModelId AI 模型 ID
   * @param updateSelected 是否更新 selectedChapterWithContent
   * @param skipSave 是否跳过保存到 IndexedDB（用于批量保存优化）
   * @returns 如果 skipSave=true，返回需要保存的章节对象；否则返回 undefined
   */
  const updateParagraphsAndSave = async (
    paragraphUpdates: Map<string, string>,
    aiModelId: string,
    targetChapterId: string,
    options?: { updateSelected?: boolean; skipSave?: boolean },
  ): Promise<Chapter | undefined> => {
    const updateSelected = options?.updateSelected !== false;
    const skipSave = options?.skipSave === true;
    if (!book.value || !book.value.volumes || paragraphUpdates.size === 0) return undefined;

    const found = ChapterService.findChapterById(book.value, targetChapterId);
    if (!found) {
      console.warn(`[useChapterTranslation] ⚠️ 未找到目标章节: ${targetChapterId}`);
      return undefined;
    }

    // 准备"已加载内容的章节"引用：
    // - 如果目标章节正好是当前 UI 章节，优先用 selectedChapterWithContent（它一定是最新内容）
    // - 否则若 book 中已加载 content，直接用
    // - 否则从独立存储中懒加载（用户切走章节时很可能 content 被卸载）
    let loadedChapter: Chapter | null | undefined = undefined;
    if (
      selectedChapterWithContent.value?.id === targetChapterId &&
      selectedChapterWithContent.value
    ) {
      loadedChapter = selectedChapterWithContent.value;
    } else if (found.chapter.content !== undefined) {
      loadedChapter = found.chapter;
    } else {
      try {
        loadedChapter = await ChapterService.loadChapterContent(found.chapter);
      } catch (error) {
        console.error('[useChapterTranslation] ❌ 加载章节内容失败:', error);
        return undefined;
      }
    }

    const updatedVolumes = ChapterService.updateChapterContentInVolumes(
      book.value.volumes,
      targetChapterId,
      loadedChapter,
      (content) =>
        content.map((para) => {
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
        }),
    );

    // 重要：即使在 skipSave 模式下，我们也必须把更新后的 volumes 写回到 book.value，
    // 否则后续的 batchSaveChapter / updateBook 可能会基于“已卸载 content 的旧 volumes”保存，导致写回丢失。
    // 这里仅更新内存中的 book 引用；真正的持久化仍由 ChapterService.saveChapterContent / booksStore.updateBook 完成。
    book.value.volumes = updatedVolumes;

    // 找到更新后的章节（用于保存 content / 更新 UI）
    const updatedChapter = updatedVolumes
      .flatMap((v) => v.chapters || [])
      .find((c) => c.id === targetChapterId);

    if (!updatedChapter) {
      console.warn(`[useChapterTranslation] ⚠️ 未找到更新后的章节: ${targetChapterId}`);
      return undefined;
    }

    // 仅当"目标章节仍然是当前 UI 章节"时才更新 UI，避免把用户已切换到的章节覆盖掉
    if (
      updateSelected &&
      selectedChapterWithContent.value?.id === targetChapterId &&
      updatedChapter?.content
    ) {
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        content: [...updatedChapter.content],
        lastEdited: updatedChapter.lastEdited,
      };
    }

    // 如果跳过保存，只更新内存中的数据并返回章节对象供后续批量保存
    if (skipSave) {
      return updatedChapter;
    }

    // 保存章节内容到 IndexedDB（必须等待完成，否则切换章节时翻译可能丢失）
    if (updatedChapter?.content) {
      try {
        await ChapterService.saveChapterContent(updatedChapter);
      } catch (error) {
        console.error('[useChapterTranslation] 保存章节内容失败:', error);
      }
    }

    // 保存书籍元数据（卷/章节结构、lastEdited 等）
    try {
      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });
    } catch (error) {
      console.error('[useChapterTranslation] 更新书籍失败:', error);
    }

    return undefined;
  };

  /**
   * 批量保存章节翻译（性能优化：一次保存多个段落）
   * @param chapterToSave 需要保存的章节对象（来自 updateParagraphsAndSave 的 skipSave 模式）
   * @param targetChapterId 目标章节 ID
   */
  const batchSaveChapter = async (
    chapterToSave: Chapter,
    targetChapterId: string,
  ): Promise<void> => {
    if (!book.value || !book.value.volumes) return;

    try {
      // 仅需通过 booksStore.updateBook 触发持久化：
      // - 内部会调用 BookService.saveBook
      // - 章节内容保存启用 skipIfUnchanged（避免重复写入，并能正确处理“同引用就地修改”）
      // 直接调用 ChapterService.saveChapterContent 会绕过该优化，导致重复保存。
      await booksStore.updateBook(book.value.id, {
        volumes: book.value.volumes,
        lastEdited: new Date(),
      });

      console.log(
        `[useChapterTranslation] ✅ 批量保存完成: ${targetChapterId} (${chapterToSave.content?.length || 0} 个段落)`,
      );
    } catch (error) {
      console.error('[useChapterTranslation] 批量保存失败:', error);
      throw error;
    }
  };

  /**
   * 更新章节标题翻译并保存
   * @param translation 标题翻译文本
   * @param aiModelId AI 模型 ID
   */
  const updateTitleTranslation = async (
    translation: string,
    aiModelId: string,
    targetChapterId: string,
  ): Promise<void> => {
    if (!book.value || !book.value.volumes) {
      return;
    }

    const newTitleTranslation = {
      id: generateShortId(),
      translation: translation,
      aiModelId,
    };

    // 仅当目标章节仍然是当前 UI 章节时才更新 UI
    if (selectedChapterWithContent.value?.id === targetChapterId) {
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        title: {
          original:
            typeof selectedChapterWithContent.value.title === 'string'
              ? selectedChapterWithContent.value.title
              : selectedChapterWithContent.value.title.original,
          translation: newTitleTranslation,
        },
        lastEdited: new Date(),
      };
    }

    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== targetChapterId) return chapter;

        return {
          ...chapter,
          title: {
            original: typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
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

    // 保存书籍（必须等待完成，否则切换章节时翻译可能丢失）
    const bookId = book.value?.id;
    if (bookId && updatedVolumes) {
      try {
        await booksStore.updateBook(bookId, {
          volumes: updatedVolumes,
          lastEdited: new Date(),
        });
        // 注意：不再调用 updateSelectedChapterWithContent
        // 因为直接更新 selectedChapterWithContent.value（上面第 253-260 行）已经更新了 UI
        // 调用 updateSelectedChapterWithContent 可能会覆盖数据
        console.log('[useChapterTranslation] ✅ 标题翻译已保存');
      } catch (error) {
        console.error('[useChapterTranslation] ❌ 更新标题翻译失败:', error);
      }
    } else {
      const missingParts: string[] = [];
      if (!bookId) missingParts.push('bookId 缺失');
      if (!updatedVolumes) missingParts.push('updatedVolumes 缺失');
      console.warn(`[useChapterTranslation] ⚠️ 无法保存标题翻译：${missingParts.join('，')}`);
    }
  };

  /**
   * 批量更新段落翻译并保存（用于增量更新）
   * @param paragraphTranslations 段落翻译数组
   * @param aiModelId AI 模型 ID
   * @param lastAppliedTranslations 上一次已应用的段落翻译（用于去重，但允许“内容变化”的覆盖更新）
   * @returns 更新后的段落数量
   */
  const updateParagraphsIncrementally = async (
    paragraphTranslations: { id: string; translation: string }[],
    aiModelId: string,
    targetChapterId: string,
    lastAppliedTranslations: Map<string, string>,
  ): Promise<number> => {
    if (!book.value) return 0;

    // 关键：不能仅用 “段落ID是否出现过” 去重，否则 AI 在 review → working 的纠错/改写会被过滤掉
    // 我们只跳过“完全相同的翻译文本”，允许 last-write-wins 的覆盖更新
    const newTranslations = selectChangedParagraphTranslations(
      paragraphTranslations,
      lastAppliedTranslations,
    );

    if (newTranslations.length === 0) return 0;

    const translationMap = new Map<string, string>();
    newTranslations.forEach((pt) => {
      translationMap.set(pt.id, pt.translation);
    });

    await updateParagraphsAndSave(translationMap, aiModelId, targetChapterId, {
      updateSelected: true,
    });

    // 从正在翻译的集合中移除已完成的段落 ID，使 skeleton 消失并显示翻译
    const state = chapterTranslationStates.value.get(targetChapterId);
    if (state) {
      newTranslations.forEach((pt) => {
        state.translatingParagraphIds.delete(pt.id);
      });
    }

    return newTranslations.length;
  };

  // 章节级别的翻译状态管理（按章节ID分别跟踪）
  type ChapterTranslationState = {
    isTranslating: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    translatingParagraphIds: Set<string>;
  };

  type ChapterPolishState = {
    isPolishing: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    polishingParagraphIds: Set<string>;
  };

  type ChapterProofreadingState = {
    isProofreading: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    proofreadingParagraphIds: Set<string>;
  };

  // 使用 Map 存储每个章节的状态，key 为章节ID
  const chapterTranslationStates = ref<Map<string, ChapterTranslationState>>(new Map());
  const chapterPolishStates = ref<Map<string, ChapterPolishState>>(new Map());
  const chapterProofreadingStates = ref<Map<string, ChapterProofreadingState>>(new Map());

  // 获取当前选中章节的状态
  const currentChapterState = computed(() => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return null;

    const translationState = chapterTranslationStates.value.get(chapterId);
    const polishState = chapterPolishStates.value.get(chapterId);
    const proofreadingState = chapterProofreadingStates.value.get(chapterId);

    return {
      translation: translationState || {
        isTranslating: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        translatingParagraphIds: new Set(),
      },
      polish: polishState || {
        isPolishing: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        polishingParagraphIds: new Set(),
      },
      proofreading: proofreadingState || {
        isProofreading: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        proofreadingParagraphIds: new Set(),
      },
    };
  });

  // 向后兼容的状态变量（供外部组件使用）
  const isTranslatingChapter = computed(
    () => currentChapterState.value?.translation.isTranslating ?? false,
  );
  const translationProgress = computed(
    () => currentChapterState.value?.translation.progress ?? { current: 0, total: 0, message: '' },
  );
  const translatingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.translation.translatingParagraphIds ?? new Set<string>(),
  );
  const translationAbortController = computed(
    () => currentChapterState.value?.translation.abortController ?? null,
  );

  const isPolishingChapter = computed(() => currentChapterState.value?.polish.isPolishing ?? false);
  const polishProgress = computed(
    () => currentChapterState.value?.polish.progress ?? { current: 0, total: 0, message: '' },
  );
  const polishingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.polish.polishingParagraphIds ?? new Set<string>(),
  );
  const polishAbortController = computed(
    () => currentChapterState.value?.polish.abortController ?? null,
  );

  const isProofreadingChapter = computed(
    () => currentChapterState.value?.proofreading.isProofreading ?? false,
  );
  const proofreadingProgress = computed(
    () => currentChapterState.value?.proofreading.progress ?? { current: 0, total: 0, message: '' },
  );
  const proofreadingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.proofreading.proofreadingParagraphIds ?? new Set<string>(),
  );
  const proofreadingAbortController = computed(
    () => currentChapterState.value?.proofreading.abortController ?? null,
  );

  // 辅助函数：获取或创建章节状态
  const getOrCreateTranslationState = (chapterId: string): ChapterTranslationState => {
    if (!chapterTranslationStates.value.has(chapterId)) {
      chapterTranslationStates.value.set(chapterId, {
        isTranslating: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        translatingParagraphIds: new Set(),
      });
    }
    return chapterTranslationStates.value.get(chapterId)!;
  };

  const getOrCreatePolishState = (chapterId: string): ChapterPolishState => {
    if (!chapterPolishStates.value.has(chapterId)) {
      chapterPolishStates.value.set(chapterId, {
        isPolishing: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        polishingParagraphIds: new Set(),
      });
    }
    return chapterPolishStates.value.get(chapterId)!;
  };

  const getOrCreateProofreadingState = (chapterId: string): ChapterProofreadingState => {
    if (!chapterProofreadingStates.value.has(chapterId)) {
      chapterProofreadingStates.value.set(chapterId, {
        isProofreading: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        proofreadingParagraphIds: new Set(),
      });
    }
    return chapterProofreadingStates.value.get(chapterId)!;
  };

  // 润色单个段落
  const polishParagraph = async (paragraphId: string) => {
    if (
      !book.value ||
      !selectedChapterWithContent.value ||
      !selectedChapterWithContent.value.content
    ) {
      return;
    }

    const targetChapterId = selectedChapterWithContent.value.id;

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

    // 获取该章节的状态
    const state = getOrCreatePolishState(targetChapterId);

    // 添加段落 ID 到正在润色的集合中
    state.polishingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消润色
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用润色服务
      await PolishService.polish([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        currentParagraphId: paragraphId,
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
        onParagraphPolish: async (paragraphPolishes) => {
          await updateParagraphsFromResults(paragraphPolishes, selectedModel.id, targetChapterId);
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
      state.polishingParagraphIds.delete(paragraphId);
      state.abortController = null;
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

    const targetChapterId = selectedChapterWithContent.value.id;

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

    // 获取该章节的状态
    const state = getOrCreateProofreadingState(targetChapterId);

    // 添加段落 ID 到正在校对的集合中
    state.proofreadingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消校对
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用校对服务
      await ProofreadingService.proofread([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        currentParagraphId: paragraphId,
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
        onParagraphProofreading: async (paragraphProofreadings) => {
          await updateParagraphsFromResults(
            paragraphProofreadings,
            selectedModel.id,
            targetChapterId,
          );
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
      state.proofreadingParagraphIds.delete(paragraphId);
      state.abortController = null;
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

    const targetChapterId = selectedChapterWithContent.value.id;

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

    // 获取该章节的状态
    const state = getOrCreateTranslationState(targetChapterId);

    // 添加段落 ID 到正在翻译的集合中
    state.translatingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用翻译服务
      await TranslationService.translate([paragraph], selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
          await updateTitleTranslation(translation, selectedModel.id, targetChapterId);
        },
        onParagraphTranslation: async (paragraphTranslations) => {
          // 使用共享函数更新段落翻译
          await updateParagraphsFromResults(
            paragraphTranslations,
            selectedModel.id,
            targetChapterId,
          );
          // 从正在翻译的集合中移除已完成的段落 ID
          paragraphTranslations.forEach((pt) => {
            state.translatingParagraphIds.delete(pt.id);
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
      state.translatingParagraphIds.delete(paragraphId);
      state.abortController = null;
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

    const targetChapterId = selectedChapter.value.id;
    const state = getOrCreateTranslationState(targetChapterId);

    state.isTranslating = true;
    state.translatingParagraphIds.clear();

    const paragraphs = selectedChapterParagraphs.value;
    const nonEmptyParagraphs = paragraphs.filter((para) => !isEmptyParagraph(para));
    const targetParagraphIds = new Set(nonEmptyParagraphs.map((para) => para.id));

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: '正在初始化翻译...',
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    // 用于批量保存：收集最后一个更新后的章节对象
    let latestChapterForBatchSave: Chapter | undefined;
    // 标记本次翻译是否失败/中断（用于 finally 中决定是否提示“已保存部分结果”）
    let translationFailed = false;

    try {
      const paragraphs = nonEmptyParagraphs;

      // 获取章节标题
      const chapterTitle =
        typeof selectedChapter.value?.title === 'string'
          ? selectedChapter.value.title
          : selectedChapter.value?.title?.original;
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;

      // 调用翻译服务
      const result = await TranslationService.translate(paragraphs, selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        ...(chapterTitle ? { chapterTitle } : {}),
        ...(customInstructions?.translationInstructions !== undefined
          ? { customInstructions: customInstructions.translationInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
          state.progress = {
            current: state.progress.current,
            total: state.progress.total,
            message: `正在翻译第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在翻译的段落 ID
          if (progress.currentParagraphs) {
            state.translatingParagraphIds = new Set(progress.currentParagraphs);
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
          // 性能优化：使用 skipSave 模式，只更新内存，不立即保存到 IndexedDB
          // 这样可以避免每个 chunk 都触发一次完整的保存流程
          const chapterToSave = await updateParagraphsAndSave(
            new Map(translations.map((t) => [t.id, t.translation])),
            selectedModel.id,
            targetChapterId,
            {
              updateSelected: true,
              skipSave: true, // 跳过保存，只更新内存
            },
          );

          // 保存最新的章节对象，用于最后的批量保存
          if (chapterToSave) {
            latestChapterForBatchSave = chapterToSave;
          }

          // 记录已应用的翻译
          for (const pt of translations) {
            lastAppliedTranslations.set(pt.id, pt.translation);
            if (targetParagraphIds.has(pt.id)) {
              completedParagraphIds.add(pt.id);
            }
          }

          state.progress = {
            current: completedParagraphIds.size,
            total: targetParagraphIds.size,
            message: state.progress.message,
          };

          // 从正在翻译的集合中移除已完成的段落 ID
          translations.forEach((pt) => {
            state.translatingParagraphIds.delete(pt.id);
          });
        },
        onTitleTranslation: async (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          await updateTitleTranslation(translation, selectedModel.id, targetChapterId);
        },
      });

      // 构建成功消息
      const actions = result.actions || [];
      const totalTranslatedCount = lastAppliedTranslations.size;
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
      translationFailed = true;
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 无论成功或失败：只要流式回调已经把翻译写入内存，就尽力落盘，避免异常中断导致刷新丢失
      if (latestChapterForBatchSave && lastAppliedTranslations.size > 0) {
        try {
          await batchSaveChapter(latestChapterForBatchSave, targetChapterId);

          // 翻译失败/取消时，补充提示“已保存部分结果”，避免用户误以为全部丢失
          if (translationFailed) {
            const wasAborted = abortController.signal.aborted;
            toast.add({
              severity: wasAborted ? 'info' : 'warn',
              summary: wasAborted ? '已取消翻译（已保存部分结果）' : '翻译中断（已保存部分结果）',
              detail: `已保存已翻译的 ${lastAppliedTranslations.size} 个段落`,
              life: 5000,
            });
          }
        } catch (saveError) {
          console.error('[useChapterTranslation] ❌ 批量保存失败:', saveError);
          toast.add({
            severity: 'error',
            summary: '保存失败',
            detail: '翻译已更新到内存，但保存到本地数据库失败；请稍后重试或查看控制台日志',
            life: 6000,
          });
        }
      }

      state.isTranslating = false;
      state.abortController = null;
      // 延迟清除进度信息和正在翻译的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.translatingParagraphIds.clear();
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

    const targetChapterId = selectedChapter.value.id;
    const state = getOrCreateTranslationState(targetChapterId);

    state.isTranslating = true;
    state.translatingParagraphIds.clear();

    const targetParagraphIds = new Set(untranslatedParagraphs.map((para) => para.id));

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: '正在初始化翻译...',
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取章节标题
      const chapterTitle =
        typeof selectedChapter.value?.title === 'string'
          ? selectedChapter.value.title
          : selectedChapter.value?.title?.original;
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;

      // 调用翻译服务，只翻译未翻译的段落
      const result = await TranslationService.translate(untranslatedParagraphs, selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        ...(chapterTitle ? { chapterTitle } : {}),
        ...(customInstructions?.translationInstructions !== undefined
          ? { customInstructions: customInstructions.translationInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
          state.progress = {
            current: state.progress.current,
            total: state.progress.total,
            message: `正在翻译第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在翻译的段落 ID
          if (progress.currentParagraphs) {
            state.translatingParagraphIds = new Set(progress.currentParagraphs);
          }
          console.debug('翻译进度:', progress);
        },
        onParagraphTranslation: async (translations) => {
          await updateParagraphsIncrementally(
            translations,
            selectedModel.id,
            targetChapterId,
            lastAppliedTranslations,
          );

          for (const pt of translations) {
            if (targetParagraphIds.has(pt.id)) {
              completedParagraphIds.add(pt.id);
            }
          }

          state.progress = {
            current: completedParagraphIds.size,
            total: targetParagraphIds.size,
            message: state.progress.message,
          };
        },
        onTitleTranslation: async (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          await updateTitleTranslation(translation, selectedModel.id, targetChapterId);
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
      });

      // 所有段落都已通过 onParagraphTranslation 回调立即更新
      const totalTranslatedCount = lastAppliedTranslations.size;
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
      state.isTranslating = false;
      state.abortController = null;
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.translatingParagraphIds.clear();
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

    const targetChapterId = selectedChapter.value.id;
    const state = getOrCreatePolishState(targetChapterId);

    state.isPolishing = true;
    state.polishingParagraphIds.clear();

    const targetParagraphIds = new Set(paragraphsWithTranslation.map((para) => para.id));

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: '正在初始化润色...',
    };

    // 创建 AbortController 用于取消润色
    const abortController = new AbortController();
    state.abortController = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用润色服务
      const result = await PolishService.polish(paragraphsWithTranslation, selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        ...(customInstructions?.polishInstructions !== undefined
          ? { customInstructions: customInstructions.polishInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
          state.progress = {
            current: state.progress.current,
            total: state.progress.total,
            message: `正在润色第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在润色的段落 ID
          if (progress.currentParagraphs) {
            state.polishingParagraphIds = new Set(progress.currentParagraphs);
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
          await updateParagraphsIncrementally(
            translations,
            selectedModel.id,
            targetChapterId,
            lastAppliedTranslations,
          );

          for (const pt of translations) {
            if (targetParagraphIds.has(pt.id)) {
              completedParagraphIds.add(pt.id);
            }
          }

          state.progress = {
            current: completedParagraphIds.size,
            total: targetParagraphIds.size,
            message: state.progress.message,
          };

          // 从正在润色的集合中移除已完成的段落 ID
          translations.forEach((pt) => {
            state.polishingParagraphIds.delete(pt.id);
          });
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphPolish 回调立即更新）
      const actions = result.actions || [];
      const totalPolishedCount = lastAppliedTranslations.size;
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
      state.isPolishing = false;
      state.abortController = null;
      // 延迟清除进度信息和正在润色的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.polishingParagraphIds.clear();
      }, 1000);
    }
  };

  // 取消翻译
  const cancelTranslation = () => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterTranslationStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController（这是最重要的，因为它会真正停止翻译请求）
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const translationTasks = allTasks.filter(
      (task) => task.type === 'translation' && task.chapterId === chapterId,
    );

    // 取消当前章节的翻译任务
    for (const task of translationTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isTranslating = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.translatingParagraphIds = new Set();
  };

  // 取消润色
  const cancelPolish = () => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterPolishStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const polishTasks = allTasks.filter(
      (task) => task.type === 'polish' && task.chapterId === chapterId,
    );

    // 取消当前章节的润色任务
    for (const task of polishTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isPolishing = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.polishingParagraphIds = new Set();
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

    const targetChapterId = selectedChapter.value.id;
    const state = getOrCreateProofreadingState(targetChapterId);

    state.isProofreading = true;
    state.proofreadingParagraphIds.clear();

    const targetParagraphIds = new Set(paragraphsWithTranslation.map((para) => para.id));

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: '正在初始化校对...',
    };

    // 创建 AbortController 用于取消校对
    const abortController = new AbortController();
    state.abortController = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用校对服务
      const result = await ProofreadingService.proofread(paragraphsWithTranslation, selectedModel, {
        bookId: book.value.id,
        chapterId: targetChapterId,
        ...(customInstructions?.proofreadingInstructions !== undefined
          ? { customInstructions: customInstructions.proofreadingInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
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
          state.progress = {
            current: state.progress.current,
            total: state.progress.total,
            message: `正在校对第 ${progress.current}/${progress.total} 部分...`,
          };
          // 更新正在校对的段落 ID
          if (progress.currentParagraphs) {
            state.proofreadingParagraphIds = new Set(progress.currentParagraphs);
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
          await updateParagraphsIncrementally(
            translations,
            selectedModel.id,
            targetChapterId,
            lastAppliedTranslations,
          );

          for (const pt of translations) {
            if (targetParagraphIds.has(pt.id)) {
              completedParagraphIds.add(pt.id);
            }
          }

          state.progress = {
            current: completedParagraphIds.size,
            total: targetParagraphIds.size,
            message: state.progress.message,
          };

          // 从正在校对的集合中移除已完成的段落 ID
          translations.forEach((pt) => {
            state.proofreadingParagraphIds.delete(pt.id);
          });
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphProofreading 回调立即更新）
      const actions = result.actions || [];
      const totalProofreadCount = lastAppliedTranslations.size;
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
      state.isProofreading = false;
      state.abortController = null;
      // 延迟清除进度信息和正在校对的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.proofreadingParagraphIds.clear();
      }, 1000);
    }
  };

  // 取消校对
  const cancelProofreading = () => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterProofreadingStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const proofreadingTasks = allTasks.filter(
      (task) => task.type === 'proofreading' && task.chapterId === chapterId,
    );

    // 取消当前章节的校对任务
    for (const task of proofreadingTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isProofreading = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.proofreadingParagraphIds = new Set();
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
