import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { TranslationService, PolishService } from 'src/services/ai';
import { ChapterService } from 'src/services/chapter-service';
import { isEmptyParagraph, hasParagraphTranslation } from 'src/utils';
import { generateShortId } from 'src/utils/id-generator';
import { normalizeTranslationQuotes } from 'src/utils';
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
  handleActionInfoToast: (action: ActionInfo, options?: { severity?: 'info' | 'success' | 'warn' | 'error'; life?: number; withRevert?: boolean }) => void,
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
      translation: normalizeTranslationQuotes(translation),
      aiModelId,
    };
  };

  /**
   * 更新章节中的段落翻译并保存
   * @param paragraphUpdates 段落更新映射，key 为段落 ID，value 为翻译文本
   * @param aiModelId AI 模型 ID
   * @param updateSelected 是否更新 selectedChapterWithContent
   */
  const updateParagraphsAndSave = async (
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

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    if (updateSelected) {
      updateSelectedChapterWithContent(updatedVolumes);
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
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphPolish: (paragraphPolishes) => {
          if (!book.value || !selectedChapterWithContent.value) return;

          // 更新段落润色
          const updatedVolumes = book.value.volumes?.map((volume) => {
            if (!volume.chapters) return volume;

            const updatedChapters = volume.chapters.map((chapter) => {
              if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

              // 使用已加载的章节内容
              const content = ChapterService.getChapterContentForUpdate(
                chapter,
                selectedChapterWithContent.value,
              );

              if (!content) return chapter;

              const updatedContent = content.map((para) => {
                const polish = paragraphPolishes.find((pt) => pt.id === para.id);
                if (!polish) return para;

                // 创建新的翻译对象（润色结果）
                const newTranslation = createParagraphTranslation(
                  polish.translation,
                  selectedModel.id,
                );

                // 添加到翻译列表（限制最多5个）
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

          // 更新书籍（后台执行）
          const bookId = book.value?.id;
          if (bookId) {
            void co(function* () {
              try {
                yield booksStore.updateBook(bookId, {
                  volumes: updatedVolumes,
                  lastEdited: new Date(),
                });
                updateSelectedChapterWithContent(updatedVolumes);
              } catch (error) {
                console.error('[useChapterTranslation] 更新书籍失败:', error);
              }
            });
          }
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
      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled - no need to show toast
      } else {
        console.error('润色段落时出错:', error);
        toast.add({
          severity: 'error',
          summary: '润色失败',
          detail: error instanceof Error ? error.message : '润色段落时发生未知错误',
          life: 5000,
        });
      }
    } finally {
      // 从正在润色的集合中移除段落 ID
      polishingParagraphIds.value.delete(paragraphId);
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
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphTranslation: async (paragraphTranslations) => {
          if (!book.value || !selectedChapterWithContent.value) return;

          // 更新段落翻译
          const updatedVolumes = book.value.volumes?.map((volume) => {
            if (!volume.chapters) return volume;

            const updatedChapters = volume.chapters.map((chapter) => {
              if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

              // 使用已加载的章节内容
              const content = ChapterService.getChapterContentForUpdate(
                chapter,
                selectedChapterWithContent.value,
              );

              if (!content) return chapter;

              const updatedContent = content.map((para) => {
                const translation = paragraphTranslations.find((pt) => pt.id === para.id);
                if (!translation) return para;

                // 创建新的翻译对象
                const newTranslation = createParagraphTranslation(
                  translation.translation,
                  selectedModel.id,
                );

                // 添加到翻译列表（限制最多5个）
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

          // 更新书籍（等待完成以确保保存）
          await booksStore.updateBook(book.value.id, {
            volumes: updatedVolumes,
            lastEdited: new Date(),
          });
          updateSelectedChapterWithContent(updatedVolumes);
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
      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled - no need to show toast
      } else {
        console.error('重新翻译段落时出错:', error);
        toast.add({
          severity: 'error',
          summary: '翻译失败',
          detail: error instanceof Error ? error.message : '重新翻译段落时发生未知错误',
          life: 5000,
        });
      }
    } finally {
      // 从正在翻译的集合中移除段落 ID
      translatingParagraphIds.value.delete(paragraphId);
    }
  };

  // 翻译章节所有段落
  const translateAllParagraphs = async () => {
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
        ...(chapterTitle ? { chapterTitle } : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
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
      });

      // 解析翻译结果并更新段落（只处理尚未更新的段落）
      const translationMap = new Map<string, string>();

      // 优先使用结构化的段落翻译结果
      if (result.paragraphTranslations && result.paragraphTranslations.length > 0) {
        result.paragraphTranslations.forEach((pt) => {
          if (pt.id && pt.translation && !updatedParagraphIds.has(pt.id)) {
            translationMap.set(pt.id, pt.translation);
          }
        });
      } else {
        // 如果没有结构化结果，回退到文本解析
        let translatedText = result.text.trim();

        // 尝试提取 JSON 格式的翻译（如果 AI 返回了 JSON）
        try {
          const jsonMatch = translatedText.match(/\{[\s\S]*"translation"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.translation && typeof parsed.translation === 'string') {
              translatedText = parsed.translation.trim();
            }
          }
        } catch {
          // 不是 JSON 格式，继续使用原始文本
        }

        // 尝试按段落ID解析翻译结果
        // 格式可能是: [ID: xxx] 翻译文本\n\n[ID: yyy] 翻译文本...
        const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
        let match;
        while ((match = idPattern.exec(translatedText)) !== null) {
          const paragraphId = match[1]?.trim();
          const translation = match[2]?.trim();
          if (paragraphId && translation) {
            translationMap.set(paragraphId, translation);
          }
        }

        // 如果没有匹配到ID格式，尝试按段落顺序分割
        if (translationMap.size === 0 && translatedText) {
          // 按双换行符分割（段落分隔符），如果段落数匹配则使用
          const translations = translatedText.split(/\n\n+/).filter((t) => t.trim());

          // 只考虑有内容的段落（排除空段落）
          const paragraphsWithContent = paragraphs.filter(
            (p) => p.text && p.text.trim().length > 0,
          );

          // 如果翻译数量与有内容的段落数量匹配，按顺序分配
          if (translations.length === paragraphsWithContent.length) {
            paragraphsWithContent.forEach((para, index) => {
              const translation = translations[index];
              if (translation) {
                translationMap.set(para.id, translation.trim());
              }
            });
          } else if (translations.length > 0) {
            // 如果数量不匹配，尝试按单换行符分割（可能是连续翻译）
            // 或者将整个翻译作为第一个段落的翻译
            // 这里我们采用保守策略：只更新能明确匹配的段落
            const minCount = Math.min(translations.length, paragraphsWithContent.length);
            for (let i = 0; i < minCount; i++) {
              const translation = translations[i];
              const para = paragraphsWithContent[i];
              if (translation && para) {
                translationMap.set(para.id, translation.trim());
              }
            }
          } else {
            // 如果无法分割，将整个翻译文本作为第一个有内容段落的翻译
            const firstPara = paragraphsWithContent[0];
            if (firstPara) {
              translationMap.set(firstPara.id, translatedText);
            }
          }
        }
      }

      // 更新剩余的段落翻译（如果有）和标题翻译
      const hasRemainingParagraphs = translationMap.size > 0;
      const hasTitleTranslation = result.titleTranslation && result.titleTranslation.trim();
      let actuallyUpdatedFromMap = 0;

      if (hasRemainingParagraphs || hasTitleTranslation) {
        const updatedVolumes = book.value.volumes?.map((volume) => {
          if (!volume.chapters) return volume;

          const updatedChapters = volume.chapters.map((chapter) => {
            if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

            // 使用已加载的章节内容
            const content =
              chapter.id === selectedChapterWithContent.value!.id
                ? selectedChapterWithContent.value!.content
                : chapter.content;

            let updatedContent = content;
            if (hasRemainingParagraphs && content) {
              updatedContent = content.map((para) => {
                const translation = translationMap.get(para.id);
                if (!translation) return para;

                // 创建新的翻译对象
                const newTranslation = createParagraphTranslation(translation, selectedModel.id);

                // 添加到翻译列表（限制最多5个）
                const updatedTranslations = ChapterService.addParagraphTranslation(
                  para.translations || [],
                  newTranslation,
                );

                // 计数实际更新的段落
                actuallyUpdatedFromMap++;

                // 只更新翻译相关字段，确保不修改原文（text 字段）
                return {
                  id: para.id,
                  text: para.text, // 明确保留原文，不修改
                  translations: updatedTranslations,
                  selectedTranslationId: newTranslation.id,
                };
              });
            }

            // 如果有标题翻译，更新章节标题
            let updatedTitle = chapter.title;
            if (hasTitleTranslation && result.titleTranslation) {
              const newTitleTranslation = {
                id: generateShortId(),
                translation: normalizeTranslationQuotes(result.titleTranslation.trim()),
                aiModelId: selectedModel.id,
              };
              updatedTitle = {
                original: chapter.title.original,
                translation: newTitleTranslation,
              };
            }

            return {
              ...chapter,
              title: updatedTitle,
              content: updatedContent,
              lastEdited: new Date(),
            };
          });

          return {
            ...volume,
            chapters: updatedChapters,
          };
        });

        // 更新书籍
        await booksStore.updateBook(book.value.id, {
          volumes: updatedVolumes,
          lastEdited: new Date(),
        });

        updateSelectedChapterWithContent(updatedVolumes);
      }

      // 构建成功消息
      const actions = result.actions || [];
      // 计算实际更新的段落数：增量更新的段落 + 从 translationMap 实际更新的段落
      const totalTranslatedCount = updatedParagraphIds.size + actuallyUpdatedFromMap;
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
      // 检查是否为取消错误（可能是 "请求已取消" 或 "翻译已取消"）
      const isCancelled =
        error instanceof Error &&
        (error.message === '请求已取消' ||
          error.message === '翻译已取消' ||
          error.message.includes('取消') ||
          error.message.includes('cancel') ||
          error.message.includes('aborted'));

      if (!isCancelled) {
        toast.add({
          severity: 'error',
          summary: '翻译失败',
          detail: error instanceof Error ? error.message : '翻译时发生未知错误',
          life: 3000,
        });
      }
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
  const continueTranslation = async () => {
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
        ...(chapterTitle ? { chapterTitle } : {}),
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
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
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
      });

      // 处理翻译结果
      const translationMap = new Map<string, string>();

      // 优先使用结构化的段落翻译结果
      if (result.paragraphTranslations && result.paragraphTranslations.length > 0) {
        result.paragraphTranslations.forEach((pt) => {
          if (pt.id && pt.translation && !updatedParagraphIds.has(pt.id)) {
            translationMap.set(pt.id, pt.translation);
          }
        });
      }

      // 更新剩余的段落翻译
      let actuallyUpdatedFromMap = 0;
      if (translationMap.size > 0) {
        const updatedVolumes = book.value.volumes?.map((volume) => {
          if (!volume.chapters) return volume;

          const updatedChapters = volume.chapters.map((chapter) => {
            if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

            const content =
              chapter.id === selectedChapterWithContent.value!.id
                ? selectedChapterWithContent.value!.content
                : chapter.content;

            if (!content) return chapter;

            const updatedContent = content.map((para) => {
              const translation = translationMap.get(para.id);
              if (!translation) return para;

              const newTranslation = createParagraphTranslation(translation, selectedModel.id);

              const updatedTranslations = ChapterService.addParagraphTranslation(
                para.translations || [],
                newTranslation,
              );

              // 计数实际更新的段落
              actuallyUpdatedFromMap++;

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

        await booksStore.updateBook(book.value.id, {
          volumes: updatedVolumes,
          lastEdited: new Date(),
        });

        updateSelectedChapterWithContent(updatedVolumes);
      }

      // 计算实际更新的段落数：增量更新的段落 + 从 translationMap 实际更新的段落
      const totalTranslatedCount = updatedParagraphIds.size + actuallyUpdatedFromMap;
      toast.add({
        severity: 'success',
        summary: '翻译完成',
        detail: `已成功翻译 ${totalTranslatedCount} 个段落`,
        life: 3000,
      });
    } catch (error) {
      console.error('翻译失败:', error);
      const isCancelled =
        error instanceof Error &&
        (error.message === '请求已取消' ||
          error.message === '翻译已取消' ||
          error.message.includes('取消') ||
          error.message.includes('cancel') ||
          error.message.includes('aborted'));

      if (!isCancelled) {
        toast.add({
          severity: 'error',
          summary: '翻译失败',
          detail: error instanceof Error ? error.message : '翻译时发生未知错误',
          life: 3000,
        });
      }
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
  const polishAllParagraphs = async () => {
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
        signal: abortController.signal,
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
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
        onParagraphPolish: (translations) => {
          // 立即更新段落润色（后台执行，不阻塞）
          void co(function* () {
            try {
              yield updateParagraphsIncrementally(translations, selectedModel.id, updatedParagraphIds);
            } catch (error) {
              console.error('[useChapterTranslation] 更新段落润色失败:', error);
            }
          });
        },
      });

      // 解析润色结果并更新段落（只处理尚未更新的段落）
      const polishMap = new Map<string, string>();

      // 优先使用结构化的段落润色结果
      if (result.paragraphTranslations && result.paragraphTranslations.length > 0) {
        result.paragraphTranslations.forEach((pt) => {
          if (pt.id && pt.translation && !updatedParagraphIds.has(pt.id)) {
            polishMap.set(pt.id, pt.translation);
          }
        });
      }

      // 更新剩余的段落润色（如果有）
      let actuallyUpdatedFromMap = 0;
      if (polishMap.size > 0) {
        const updatedVolumes = book.value.volumes?.map((volume) => {
          if (!volume.chapters) return volume;

          const updatedChapters = volume.chapters.map((chapter) => {
            if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

            const content =
              chapter.id === selectedChapterWithContent.value!.id
                ? selectedChapterWithContent.value!.content
                : chapter.content;

            if (!content) return chapter;

            const updatedContent = content.map((para) => {
              const polish = polishMap.get(para.id);
              if (!polish) return para;

              const newTranslation = createParagraphTranslation(polish, selectedModel.id);

              const updatedTranslations = ChapterService.addParagraphTranslation(
                para.translations || [],
                newTranslation,
              );

              // 计数实际更新的段落
              actuallyUpdatedFromMap++;

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

        await booksStore.updateBook(book.value.id, {
          volumes: updatedVolumes,
          lastEdited: new Date(),
        });

        updateSelectedChapterWithContent(updatedVolumes);
      }

      // 构建成功消息
      const actions = result.actions || [];
      // 计算实际更新的段落数：增量更新的段落 + 从 polishMap 实际更新的段落
      const totalPolishedCount = updatedParagraphIds.size + actuallyUpdatedFromMap;
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
      // 检查是否为取消错误
      const isCancelled =
        error instanceof Error &&
        (error.message === '请求已取消' ||
          error.message === '润色已取消' ||
          error.message.includes('取消') ||
          error.message.includes('cancel') ||
          error.message.includes('aborted'));

      if (!isCancelled) {
        toast.add({
          severity: 'error',
          summary: '润色失败',
          detail: error instanceof Error ? error.message : '润色时发生未知错误',
          life: 3000,
        });
      }
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
    translatingParagraphIds.value.clear();
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
    polishingParagraphIds.value.clear();
  };

  // 组件卸载时取消所有任务
  onUnmounted(() => {
    cancelTranslation();
    cancelPolish();
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
        void retranslateAllParagraphs();
      },
    });

    // 如果所有段落都已翻译，显示"校对本章"
    if (translationStatus.value.hasAll) {
      items.push({
        label: '校对本章',
        icon: 'pi pi-check-circle',
        command: () => {
          // TODO: 实现校对功能
          toast.add({
            severity: 'info',
            summary: '功能开发中',
            detail: '校对功能正在开发中',
            life: 3000,
          });
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
    // 函数
    polishParagraph,
    retranslateParagraph,
    translateAllParagraphs,
    continueTranslation,
    retranslateAllParagraphs,
    polishAllParagraphs,
    cancelTranslation,
    cancelPolish,
    // 计算属性
    translationStatus,
    translationButtonLabel,
    translationButtonMenuItems,
    translationButtonClick,
  };
}
